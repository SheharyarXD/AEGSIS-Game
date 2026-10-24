"""Narrow-band Surface Nets mesher for numpy SDFs.

Only blocks whose centre lies within the band are evaluated at full resolution,
so a 2 mm plate costs about a million evaluations instead of hundreds of millions. Vertices are
projected onto the zero set with Newton steps along the field gradient, which keeps
bevels and creases accurate to well under a voxel.
"""
from __future__ import annotations

import numpy as np

from .sdf import SDF


def _eval_chunked(f: SDF, pts: np.ndarray, chunk: int = 400_000) -> np.ndarray:
    out = np.empty(len(pts), dtype=np.float64)
    for s in range(0, len(pts), chunk):
        out[s:s + chunk] = f(pts[s:s + chunk])
    return out


def sample_grid(f: SDF, lo, hi, h: float, block: int = 12, margin: float = 1.5):
    lo = np.asarray(lo, np.float64)
    hi = np.asarray(hi, np.float64)
    n = np.ceil((hi - lo) / h).astype(int) + 1
    nb = np.maximum(1, np.ceil((n - 1) / block).astype(int))
    bi = np.stack(np.meshgrid(*[np.arange(k) for k in nb], indexing='ij'), -1).reshape(-1, 3)
    centers = lo + (bi + 0.5) * block * h
    dc = _eval_chunked(f, centers)
    half_diag = 0.5 * block * h * np.sqrt(3.0)
    active = np.abs(dc) < half_diag * margin
    # inactive blocks: constant fill with the (sign-correct) centre value
    full = dc.reshape(tuple(nb)).astype(np.float32)
    D = np.repeat(np.repeat(np.repeat(full, block, 0), block, 1), block, 2)
    pad = nb * block + 1 - D.shape
    D = np.pad(D, [(0, int(pad[0])), (0, int(pad[1])), (0, int(pad[2]))], mode='edge')
    D = np.ascontiguousarray(D[:n[0], :n[1], :n[2]])
    off = np.stack(np.meshgrid(*[np.arange(block + 1)] * 3, indexing='ij'), -1).reshape(-1, 3)
    act = bi[active]
    per = max(1, 300_000 // len(off))
    for s in range(0, len(act), per):
        idx = (act[s:s + per, None, :] * block + off[None]).reshape(-1, 3)
        keep = np.all(idx < n, axis=1)
        idx = idx[keep]
        D[idx[:, 0], idx[:, 1], idx[:, 2]] = _eval_chunked(f, lo + idx * h)
    return D, lo, n


def gradient(f: SDF, p: np.ndarray, e: float) -> np.ndarray:
    g = np.empty_like(p)
    for a in range(3):
        d = np.zeros(3)
        d[a] = e
        g[:, a] = f(p + d) - f(p - d)
    return g / (2 * e)


def surface_nets(D: np.ndarray, lo: np.ndarray, h: float):
    n = np.array(D.shape)
    inside = D < 0
    cell_dims = n - 1
    sums = []
    keys = []
    quads = []
    flips = []
    for axis in range(3):
        sl0 = [slice(None)] * 3
        sl1 = [slice(None)] * 3
        sl0[axis] = slice(0, -1)
        sl1[axis] = slice(1, None)
        cross = inside[tuple(sl0)] != inside[tuple(sl1)]
        ijk = np.argwhere(cross)
        if len(ijk) == 0:
            continue
        d0 = D[tuple(sl0)][cross].astype(np.float64)
        d1 = D[tuple(sl1)][cross].astype(np.float64)
        t = np.clip(d0 / (d0 - d1), 0.0, 1.0)
        pos = ijk.astype(np.float64)
        pos[:, axis] += t
        pos = lo + pos * h
        a1, a2 = [a for a in range(3) if a != axis]
        cells = []
        for da, db in ((0, 0), (-1, 0), (-1, -1), (0, -1)):
            c = ijk.copy()
            c[:, a1] += da
            c[:, a2] += db
            cells.append(c)
        valid = np.ones(len(ijk), bool)
        for c in cells:
            valid &= np.all((c >= 0) & (c < cell_dims), axis=1)
            lin = np.ravel_multi_index(np.clip(c, 0, cell_dims - 1).T, cell_dims)
            m = np.all((c >= 0) & (c < cell_dims), axis=1)
            keys.append(lin[m])
            sums.append(pos[m])
        lin_cells = np.stack([np.ravel_multi_index(np.clip(c, 0, cell_dims - 1).T, cell_dims) for c in cells], 1)
        quads.append(lin_cells[valid])
        # inside at the low end -> outward normal along +axis
        flips.append((d0[valid] < 0, axis))
    if not keys:
        return np.zeros((0, 3)), np.zeros((0, 4), int)
    keys = np.concatenate(keys)
    sums = np.concatenate(sums)
    uniq, inv = np.unique(keys, return_inverse=True)
    cnt = np.bincount(inv)
    verts = np.stack([np.bincount(inv, weights=sums[:, a]) for a in range(3)], 1) / cnt[:, None]
    faces = []
    for q, (low_inside, axis) in zip(quads, flips):
        f = np.searchsorted(uniq, q)
        # orient: cross product of diagonals vs expected normal sign
        p = verts[f]
        nrm = np.cross(p[:, 2] - p[:, 0], p[:, 3] - p[:, 1])
        want = np.where(low_inside, 1.0, -1.0)
        bad = np.sign(nrm[:, axis]) != want
        f[bad] = f[bad][:, ::-1]
        faces.append(f)
    return verts, np.concatenate(faces) if faces else np.zeros((0, 4), int)


def project(f: SDF, verts: np.ndarray, h: float, steps: int = 2) -> np.ndarray:
    v = verts.copy()
    for _ in range(steps):
        d = f(v)
        g = gradient(f, v, h * 0.25)
        gg = np.maximum(np.einsum('ij,ij->i', g, g), 1e-12)
        step = (d / gg)[:, None] * g
        # never move further than a voxel (protects thin features / creases)
        sl = np.linalg.norm(step, axis=1)
        step *= np.minimum(1.0, 0.6 * h / np.maximum(sl, 1e-12))[:, None]
        v -= step
    return v


def drop_small_islands(verts, faces, min_faces=24):
    """Remove floating specks (union-find over shared vertices)."""
    lab = np.arange(len(verts))
    a = np.concatenate([faces[:, 0], faces[:, 1], faces[:, 2]])
    b = np.concatenate([faces[:, 1], faces[:, 2], faces[:, 3]])
    while True:
        m = np.minimum(lab[a], lab[b])
        new = lab.copy()
        np.minimum.at(new, a, m)
        np.minimum.at(new, b, m)
        new = new[new]
        if np.array_equal(new, lab):
            break
        lab = new
    froot = lab[faces[:, 0]]
    uniq, inv, cnt = np.unique(froot, return_inverse=True, return_counts=True)
    keep = cnt[inv] >= min_faces
    faces = faces[keep]
    used = np.unique(faces)
    remap = -np.ones(len(verts), int)
    remap[used] = np.arange(len(used))
    return verts[used], remap[faces]


def mesh_sdf(f: SDF, lo, hi, h: float, project_steps: int = 2, min_island: int = 24):
    D, lo_, _ = sample_grid(f, lo, hi, h)
    verts, faces = surface_nets(D, lo_, h)
    if len(faces) == 0:
        return verts, faces
    if project_steps:
        verts = project(f, verts, h, project_steps)
    if min_island:
        verts, faces = drop_small_islands(verts, faces, min_island)
    return verts, faces
