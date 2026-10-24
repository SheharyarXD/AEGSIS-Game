"""Vectorised signed-distance-field modelling kernel (numpy only).

Every primitive returns a callable f(p) -> d for p of shape (N, 3) (float64),
negative inside. Operators compose these callables. The hard-surface vocabulary
(chamfered intersections, grooves, insets, plane facets) follows the hg_sdf /
Inigo Quilez conventions so plates get bevels and panel lines as real geometry.
"""
from __future__ import annotations

import math
from typing import Callable, Iterable, Sequence

import numpy as np

SDF = Callable[[np.ndarray], np.ndarray]
SQRT_HALF = math.sqrt(0.5)


def vec(v) -> np.ndarray:
    return np.asarray(v, dtype=np.float64)


def norm(v) -> np.ndarray:
    v = vec(v)
    return v / np.linalg.norm(v)


def length(v: np.ndarray) -> np.ndarray:
    return np.sqrt(np.einsum('ij,ij->i', v, v))


def frame(z_axis, up_hint=(0.0, 1.0, 0.0), x_hint=None) -> np.ndarray:
    """Orthonormal basis as columns [x y z] with z along `z_axis`.
    Local coordinates of p are (p - origin) @ basis."""
    z = norm(z_axis)
    if x_hint is not None:
        x = vec(x_hint) - z * np.dot(vec(x_hint), z)
        x = x / np.linalg.norm(x)
        y = np.cross(z, x)
    else:
        y = vec(up_hint) - z * np.dot(vec(up_hint), z)
        if np.linalg.norm(y) < 1e-6:
            y = vec((0.0, 0.0, 1.0)) - z * z[2]
        y = y / np.linalg.norm(y)
        x = np.cross(y, z)
    return np.stack([x, y, z], axis=1)


def rot(axis, degrees) -> np.ndarray:
    a = norm(axis)
    t = math.radians(degrees)
    c, s = math.cos(t), math.sin(t)
    x, y, z = a
    return np.array([
        [c + x * x * (1 - c), x * y * (1 - c) - z * s, x * z * (1 - c) + y * s],
        [y * x * (1 - c) + z * s, c + y * y * (1 - c), y * z * (1 - c) - x * s],
        [z * x * (1 - c) - y * s, z * y * (1 - c) + x * s, c + z * z * (1 - c)],
    ])


# --------------------------------------------------------------------------- primitives
def sphere(c, r) -> SDF:
    c = vec(c)
    return lambda p: length(p - c) - r


def ellipsoid(c, radii, basis=None) -> SDF:
    """IQ bound ellipsoid. `basis` columns are the local axes in world space."""
    c, radii = vec(c), vec(radii)

    def f(p):
        q = p - c
        if basis is not None:
            q = q @ basis
        k0 = length(q / radii)
        k1 = length(q / (radii * radii))
        return k0 * (k0 - 1.0) / np.maximum(k1, 1e-12)
    return f


def round_cone(a, b, ra, rb) -> SDF:
    """Capsule with different end radii (exact, IQ sdRoundCone)."""
    a, b = vec(a), vec(b)
    ba = b - a
    l2 = float(np.dot(ba, ba))
    rr = ra - rb
    a2 = l2 - rr * rr
    il2 = 1.0 / l2

    def f(p):
        pa = p - a
        y = pa @ ba
        z = y - l2
        w = pa * l2 - np.outer(y, ba)
        x2 = np.einsum('ij,ij->i', w, w)
        y2 = y * y * l2
        z2 = z * z * l2
        k = math.copysign(1.0, rr) * rr * rr * x2
        d_b = np.sqrt(x2 + z2) * il2 - rb
        d_a = np.sqrt(x2 + y2) * il2 - ra
        d_s = (np.sqrt(np.maximum(x2 * a2 * il2, 0.0)) + y * rr) * il2 - ra
        return np.where(np.sign(z) * a2 * z2 > k, d_b, np.where(np.sign(y) * a2 * y2 < k, d_a, d_s))
    return f


def capsule(a, b, r) -> SDF:
    a, b = vec(a), vec(b)
    ba = b - a
    bb = float(np.dot(ba, ba))

    def f(p):
        pa = p - a
        h = np.clip((pa @ ba) / bb, 0.0, 1.0)
        return length(pa - np.outer(h, ba)) - r
    return f


def box(c, half, basis=None, r=0.0) -> SDF:
    """Oriented rounded box; `half` are half-extents along basis columns."""
    c, half = vec(c), vec(half)

    def f(p):
        q = p - c
        if basis is not None:
            q = q @ basis
        q = np.abs(q) - (half - r)
        outside = length(np.maximum(q, 0.0))
        inside = np.minimum(np.max(q, axis=1), 0.0)
        return outside + inside - r
    return f


def plane(point, normal) -> SDF:
    """Half-space; positive on the side `normal` points to (outside)."""
    point, n = vec(point), norm(normal)
    off = float(np.dot(point, n))
    return lambda p: p @ n - off


def cylinder(a, b, r) -> SDF:
    a, b = vec(a), vec(b)
    ba = b - a
    L = float(np.linalg.norm(ba))
    axis = ba / L
    mid = (a + b) * 0.5

    def f(p):
        q = p - mid
        h = q @ axis
        radial = length(q - np.outer(h, axis))
        d = np.stack([radial - r, np.abs(h) - L * 0.5], axis=1)
        return np.minimum(np.maximum(d[:, 0], d[:, 1]), 0.0) + length(np.maximum(d, 0.0))
    return f


def torus(c, axis, R, r) -> SDF:
    c, axis = vec(c), norm(axis)

    def f(p):
        q = p - c
        h = q @ axis
        radial = length(q - np.outer(h, axis))
        return np.sqrt((radial - R) ** 2 + h * h) - r
    return f


def polygon2d(points: Sequence[Sequence[float]]):
    """Returns g(xy) -> signed distance to a closed 2D polygon (IQ sdPolygon)."""
    v = np.asarray(points, dtype=np.float64)

    def g(xy):
        d = np.sum((xy - v[0]) ** 2, axis=1)
        s = np.ones(len(xy))
        n = len(v)
        for i in range(n):
            j = i - 1
            e = v[j] - v[i]
            w = xy - v[i]
            t = np.clip((w @ e) / float(e @ e), 0.0, 1.0)
            b = w - np.outer(t, e)
            d = np.minimum(d, np.einsum('ij,ij->i', b, b))
            c1 = xy[:, 1] >= v[i, 1]
            c2 = xy[:, 1] < v[j, 1]
            c3 = e[0] * w[:, 1] > e[1] * w[:, 0]
            flip = (c1 & c2 & c3) | (~c1 & ~c2 & ~c3)
            s = np.where(flip, -s, s)
        return s * np.sqrt(d)
    return g


def polyline2d(points: Sequence[Sequence[float]], closed: bool = False):
    """g(xy) -> unsigned distance to a 2D polyline (for strokes / channels)."""
    v = np.asarray(points, dtype=np.float64)
    segs = list(zip(v[:-1], v[1:])) + ([(v[-1], v[0])] if closed else [])

    def g(xy):
        d = np.full(len(xy), np.inf)
        for a, b in segs:
            e = b - a
            w = xy - a
            t = np.clip((w @ e) / float(e @ e), 0.0, 1.0)
            r = w - np.outer(t, e)
            d = np.minimum(d, np.einsum('ij,ij->i', r, r))
        return np.sqrt(d)
    return g


def stroke(origin, basis, points, width, closed=False) -> SDF:
    """Infinite prism around a 2D polyline (projected along basis z)."""
    origin = vec(origin)
    g = polyline2d(points, closed)
    return lambda p: g(((p - origin) @ basis)[:, :2]) - width * 0.5


def prism(origin, basis, outline, depth=None, chamfer=0.0) -> SDF:
    """Extrude a 2D outline (in basis x/y) along basis z.
    depth=None -> infinite prism (a 'cookie cutter' region mask)."""
    origin = vec(origin)
    g = polygon2d(outline)

    def f(p):
        q = (p - origin) @ basis
        d2 = g(q[:, :2])
        if depth is None:
            return d2
        dz = np.abs(q[:, 2] - (depth[0] + depth[1]) * 0.5) - (depth[1] - depth[0]) * 0.5
        out = np.maximum(d2, dz)
        if chamfer > 0:
            out = np.maximum(out, (d2 + dz + chamfer) * SQRT_HALF)
        return out
    return f


# --------------------------------------------------------------------------- operators
def union(*fs: SDF) -> SDF:
    return lambda p: np.minimum.reduce([f(p) for f in fs])


def intersect(*fs: SDF) -> SDF:
    return lambda p: np.maximum.reduce([f(p) for f in fs])


def subtract(a: SDF, *bs: SDF) -> SDF:
    return lambda p: np.maximum.reduce([a(p)] + [-b(p) for b in bs])


def smin_arr(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b + (a - b) * h - k * h * (1.0 - h)


def smooth_union(k: float, *fs: SDF) -> SDF:
    def f(p):
        d = fs[0](p)
        for g in fs[1:]:
            d = smin_arr(d, g(p), k)
        return d
    return f


def smooth_intersect(k: float, *fs: SDF) -> SDF:
    def f(p):
        d = fs[0](p)
        for g in fs[1:]:
            d = -smin_arr(-d, -g(p), k)
        return d
    return f


def smooth_subtract(k: float, a: SDF, b: SDF) -> SDF:
    return lambda p: -smin_arr(-a(p), b(p), k)


def chamfer_intersect(r: float, *fs: SDF) -> SDF:
    """Intersection with a 45-degree bevel of size r on every crease."""
    def f(p):
        ds = [g(p) for g in fs]
        d = ds[0]
        for e in ds[1:]:
            d = np.maximum(np.maximum(d, e), (d + e + r) * SQRT_HALF)
        return d
    return f


def chamfer_union(r: float, *fs: SDF) -> SDF:
    def f(p):
        ds = [g(p) for g in fs]
        d = ds[0]
        for e in ds[1:]:
            d = np.minimum(np.minimum(d, e), (d - r + e) * SQRT_HALF)
        return d
    return f


def chamfer_subtract(r: float, a: SDF, b: SDF) -> SDF:
    nb = lambda p: -b(p)
    return chamfer_intersect(r, a, nb)


def offset(f: SDF, amount: float) -> SDF:
    return lambda p: f(p) - amount


def shell(f: SDF, inner: float, outer: float) -> SDF:
    """Solid between offset surfaces f=inner and f=outer (inner < outer)."""
    mid, half = (inner + outer) * 0.5, (outer - inner) * 0.5
    return lambda p: np.abs(f(p) - mid) - half


def groove(f: SDF, path: SDF, depth: float, width: float) -> SDF:
    """Cut a panel-line groove of `depth`/`width` where `path` == 0 (hg_sdf opGroove)."""
    return lambda p: (lambda a, b: np.maximum(a, np.minimum(a + depth, width - np.abs(b))))(f(p), path(p))


def tongue(f: SDF, path: SDF, height: float, width: float) -> SDF:
    """Raised ridge along `path` == 0 (hg_sdf opTongue)."""
    return lambda p: (lambda a, b: np.minimum(a, np.maximum(a - height, np.abs(b) - width)))(f(p), path(p))


def mirror_x(f: SDF) -> SDF:
    def g(p):
        q = p.copy()
        q[:, 0] = np.abs(q[:, 0])
        return f(q)
    return g


def flip_x(f: SDF) -> SDF:
    def g(p):
        q = p.copy()
        q[:, 0] = -q[:, 0]
        return f(q)
    return g


def transform(f: SDF, origin, basis) -> SDF:
    """Evaluate f, authored in a local frame, at world points.
    Local = (p - origin) @ basis."""
    origin = vec(origin)
    return lambda p: f((p - origin) @ basis)


def displace(f: SDF, g: Callable[[np.ndarray], np.ndarray]) -> SDF:
    return lambda p: f(p) + g(p)


def bands(axis_value: Callable[[np.ndarray], np.ndarray], spacing: float, width: float) -> SDF:
    """Periodic slabs (for repeated vents / ribs). Zero-set every `spacing`."""
    def f(p):
        v = axis_value(p)
        m = np.mod(v + spacing * 0.5, spacing) - spacing * 0.5
        return np.abs(m) - width
    return f


def chain(*fs: Iterable[SDF]):
    return list(fs)
