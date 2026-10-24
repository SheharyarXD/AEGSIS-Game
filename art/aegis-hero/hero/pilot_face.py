"""Gives the pilot placeholder a different face, on the same mesh.

The source model's head is a photo projected onto a scan. Two scripted steps make it
read as another man without touching source/pilot-source.glb:

  repaint(ob)   edits the skin texture: clean-shaven, lighter hair and brows, a
                different eye colour. Regions are chosen in head space (metres on the
                normalised 1.80 m mesh), not in texture space, through a baked position
                map, so the two overlapping face layers of the scan stay in step.
  reshape(ob)   moves vertices with smooth local warps: face proportions, jaw, nose,
                mouth, brow, ears and a shorter haircut. The texture rides with the
                surface, so the painted features move too.

Both run on the mesh as build_pilot.import_mesh() leaves it (x = his left, -y = front,
z = up, feet at 0). numpy only.
"""
from __future__ import annotations

import os

import bmesh
import bpy
import numpy as np

# The position map stores position + POS_BIAS so every channel is positive on the head.
POS_BIAS = np.array((0.5, 0.5, -1.2), np.float32)
VOXEL = 0.004
GRID_MIN = np.array((-0.12, -0.13, 1.46), np.float32)
GRID_MAX = np.array((0.12, 0.14, 1.82), np.float32)

# Head-space landmarks of the source face.
EYE = (0.0315, -0.078, 1.665)
BROW = (0.034, -0.082, 1.678)
MOUTH = (0.0, -0.088, 1.597)
NOSE_TIP = (0.0, -0.106, 1.628)
CHIN = (0.0, -0.084, 1.560)
SKULL = (0.0, 0.012, 1.70)                               # centre the hair grows around
CROWN = (0.0, 0.045, 1.795)                              # where the hair's flow starts

HAIR_TINT = np.array((1.13, 0.94, 0.70), np.float32)     # dark blond at unit brightness
IRIS_TINT = np.array((0.50, 0.62, 0.70), np.float32)     # grey-blue


def log(msg):
    print(f'[face] {msg}', flush=True)


def smooth(a, b, x):
    """Smoothstep that also accepts a > b (falling edge)."""
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def ellipsoid(p, centre, radii, soft=0.35):
    """1 inside the ellipsoid, falling to 0 over the outer `soft` share of its radius."""
    d = np.sqrt((((p - np.asarray(centre, np.float32)) / np.asarray(radii, np.float32)) ** 2).sum(-1))
    return smooth(1.0, 1.0 - soft, d)


# ---------------------------------------------------------------- texture

def skin_slot(ob):
    """(slot index, base colour image) of the head's material: the one covering the crown."""
    me = ob.data
    best, top = None, -1.0
    for poly in me.polygons:
        z = me.vertices[poly.vertices[0]].co.z
        if z > top:
            top, best = z, poly.material_index
    mat = ob.material_slots[best].material
    for node in mat.node_tree.nodes:
        if node.type == 'TEX_IMAGE' and any(l.to_socket.name == 'Base Color' for o in node.outputs for l in o.links):
            return best, node.image
    raise RuntimeError('pilot skin material has no base colour texture')


def position_map(ob, slot, width, height):
    """Head-space position of every texel of material `slot`, shape (h, w, 3); NaN where unused."""
    sc = bpy.context.scene
    tmp = ob.copy()
    tmp.data = ob.data.copy()
    sc.collection.objects.link(tmp)
    bm = bmesh.new()
    bm.from_mesh(tmp.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index != slot], context='FACES')
    bm.to_mesh(tmp.data)
    bm.free()
    mat = bpy.data.materials.new('_pilot_position')
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    emit = nt.nodes.new('ShaderNodeEmission')
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    add = nt.nodes.new('ShaderNodeVectorMath')
    add.operation = 'ADD'
    add.inputs[1].default_value = tuple(float(v) for v in POS_BIAS)
    nt.links.new(geo.outputs['Position'], add.inputs[0])
    nt.links.new(add.outputs[0], emit.inputs['Color'])
    nt.links.new(emit.outputs[0], out.inputs['Surface'])
    img = bpy.data.images.new('_pilot_position', width, height, alpha=True, float_buffer=True)
    img.colorspace_settings.name = 'Non-Color'
    img.generated_color = (0.0, 0.0, 0.0, 0.0)
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    nt.nodes.active = tex
    tmp.data.materials.clear()
    tmp.data.materials.append(mat)
    engine, samples = sc.render.engine, sc.cycles.samples
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 1
    sc.render.bake.margin = 0
    sc.render.bake.use_clear = True
    bpy.ops.object.select_all(action='DESELECT')
    tmp.select_set(True)
    bpy.context.view_layer.objects.active = tmp
    bpy.ops.object.bake(type='EMIT')
    buf = np.empty(width * height * 4, np.float32)
    img.pixels.foreach_get(buf)
    buf = buf.reshape(height, width, 4)
    pos = buf[..., :3] - POS_BIAS
    pos[buf[..., 2] < 0.05] = np.nan
    sc.render.engine, sc.cycles.samples = engine, samples
    bpy.data.objects.remove(tmp, do_unlink=True)
    bpy.data.images.remove(img)
    bpy.data.materials.remove(mat)
    return pos


def _blur3(a):
    """One [1 2 1] pass along each of the first three axes, edges repeated."""
    for axis in range(3):
        pad = [(0, 0)] * a.ndim
        pad[axis] = (1, 1)
        p = np.pad(a, pad, mode='edge')
        n = a.shape[axis]
        idx = [slice(None)] * a.ndim
        lo, mid, hi = list(idx), list(idx), list(idx)
        lo[axis], mid[axis], hi[axis] = slice(0, n), slice(1, n + 1), slice(2, n + 2)
        a = 0.25 * p[tuple(lo)] + 0.5 * p[tuple(mid)] + 0.25 * p[tuple(hi)]
    return a


def skin_field(points, colours):
    """Smooth skin colour over head space, grown from clean skin samples into the gaps."""
    shape = np.ceil((GRID_MAX - GRID_MIN) / VOXEL).astype(int)
    idx = np.floor((points - GRID_MIN) / VOXEL).astype(int)
    ok = ((idx >= 0) & (idx < shape)).all(1)
    idx, colours = idx[ok], colours[ok]
    flat = np.ravel_multi_index(idx.T, shape)
    count = np.bincount(flat, minlength=shape.prod()).reshape(shape).astype(np.float32)
    total = np.stack([np.bincount(flat, weights=colours[:, c], minlength=shape.prod()).reshape(shape) for c in range(3)], -1).astype(np.float32)
    known = count >= 4
    value = np.where(known[..., None], total / np.maximum(count, 1.0)[..., None], 0.0).astype(np.float32)
    # seed the gaps from the nearest known skin, then relax them to a smooth fill
    v, k = value.copy(), known.astype(np.float32)
    seed, have = value.copy(), known.copy()
    for _ in range(90):
        v, k = _blur3(v), _blur3(k)
        new = (~have) & (k > 1e-4)
        seed[new] = v[new] / k[new][:, None]
        have |= new
    seed[~have] = value[known].mean(0)
    field = seed
    for _ in range(160):
        field = np.where(known[..., None], value, _blur3(field))
    for _ in range(3):
        field = _blur3(field)
    return field


def sample_field(field, points):
    g = (points - GRID_MIN) / VOXEL - 0.5
    hi = np.array(field.shape[:3]) - 2
    i0 = np.clip(np.floor(g).astype(int), 0, hi)
    f = np.clip(g - i0, 0.0, 1.0).astype(np.float32)
    out = np.zeros((len(points), 3), np.float32)
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (f[:, 0] if dx else 1 - f[:, 0]) * (f[:, 1] if dy else 1 - f[:, 1]) * (f[:, 2] if dz else 1 - f[:, 2])
                out += w[:, None] * field[i0[:, 0] + dx, i0[:, 1] + dy, i0[:, 2] + dz]
    return out


def strands(p, rng):
    """Fine streaks running from the crown down over the head, about -1..1.

    The source's hair is a nearly flat dark tone; lightened, it needs the strand
    detail a photo would have had."""
    axis = np.asarray(CROWN, np.float32) - np.asarray(SKULL, np.float32)
    axis /= np.linalg.norm(axis)
    side = np.cross(axis, np.array((0.0, -1.0, 0.0), np.float32))
    side /= np.linalg.norm(side)
    fore = np.cross(side, axis)
    d = p - np.asarray(SKULL, np.float32)
    d /= np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-6)
    around = np.arctan2(d @ side, d @ fore) / (2.0 * np.pi) + 0.5          # 0..1 about the crown
    down = np.arccos(np.clip(d @ axis, -1.0, 1.0)) / np.pi                 # 0 at the crown
    out = np.zeros(len(p), np.float32)
    for count, length, gain in ((70, 3, 0.55), (190, 5, 0.45), (460, 9, 0.3)):
        table = rng.random((count, length + 2)).astype(np.float32) * 2.0 - 1.0
        u = (around + 0.035 * np.sin(down * 9.0 + count)) * count           # a slight wave
        v = down * length
        u0 = np.floor(u).astype(int)
        v0 = np.clip(np.floor(v).astype(int), 0, length)
        fu, fv = (u - u0).astype(np.float32), np.clip(v - v0, 0.0, 1.0).astype(np.float32)
        a, b = u0 % count, (u0 + 1) % count
        row0 = table[a, v0] * (1 - fu) + table[b, v0] * fu
        row1 = table[a, v0 + 1] * (1 - fu) + table[b, v0 + 1] * fu
        out += gain * (row0 * (1 - fv) + row1 * fv)
    return out


def bleed(buf, used, passes=10):
    """Grow the painted colour a few texels past each island so filtering and
    mip-mapping never pull the old colour back in along a seam."""
    rows, cols = np.nonzero(used)
    r0, r1 = max(rows.min() - passes - 1, 0), min(rows.max() + passes + 2, used.shape[0])
    c0, c1 = max(cols.min() - passes - 1, 0), min(cols.max() + passes + 2, used.shape[1])
    colour = buf[r0:r1, c0:c1, :3]
    have = used[r0:r1, c0:c1].copy()
    for _ in range(passes):
        total = np.zeros_like(colour)
        count = np.zeros(have.shape, np.float32)
        src = colour * have[..., None]
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            total += np.roll(src, (dy, dx), (0, 1))
            count += np.roll(have, (dy, dx), (0, 1))
        new = (~have) & (count > 0)
        colour[new] = total[new] / count[new][:, None]
        have |= new


def luminance(c):
    return c[..., 0] * 0.299 + c[..., 1] * 0.587 + c[..., 2] * 0.114


def repaint(ob, save_to=None, debug=None):
    slot, img = skin_slot(ob)
    w, h = img.size
    pos = position_map(ob, slot, w, h)
    buf = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(buf)
    buf = buf.reshape(h, w, 4)
    used = np.isfinite(pos[..., 0])
    rows, cols = np.nonzero(used)
    p = pos[rows, cols]
    c = buf[rows, cols, :3].copy()
    ax = np.abs(p[:, 0])
    x, y, z = p[:, 0], p[:, 1], p[:, 2]
    lum = luminance(c)
    log(f'skin texture {w}x{h}, {len(p):,} texels on the head')

    # --- regions, in head space
    mirror = np.stack([ax, y, z], 1)
    eyes = ellipsoid(mirror, (EYE[0], EYE[1], 1.672), (0.036, 0.05, 0.022), soft=0.3)   # lids, lashes, brows
    lips = ellipsoid(p, (0.0, -0.085, 1.5975), (0.029, 0.05, 0.0088), soft=0.4)
    nostrils = ellipsoid(p, (0.0, -0.095, 1.6245), (0.022, 0.03, 0.0062), soft=0.4)
    front = smooth(0.035, -0.005, y)                                         # the face side of the head
    # where a beard, moustache or stubble can be: below the cheekbones, down onto the neck
    line = 1.628 + 0.42 * np.maximum(ax - 0.035, 0.0)                        # rises toward the ears (sideburns stop here)
    lower = smooth(line + 0.006, line - 0.008, z) * smooth(1.492, 1.515, z) * front
    lower *= 1.0 - np.maximum(lips, nostrils)

    # --- clean skin samples -> a skin colour for every point of the face
    r, g, b = c[:, 0], c[:, 1], c[:, 2]
    clean = (r > 0.50) & (r > g + 0.05) & (g > b + 0.02) & (lum > 0.44) & (eyes < 0.05) & (lips < 0.05) & (nostrils < 0.05) & (z < 1.76) & (z > 1.50)
    clean &= ~((lower > 0.5) & (lum < 0.56))                                 # stubble is never a sample
    log(f'{int(clean.sum()):,} clean skin samples')
    field = skin_field(p[clean], c[clean])
    fill = sample_field(field, p) * np.array((0.965, 0.95, 0.945), np.float32)   # the samples lean to the brightest skin
    rng = np.random.default_rng(7)
    grain = rng.normal(0.0, 0.012, len(p)).astype(np.float32)

    # --- shave: beard, moustache and stubble become skin
    hairy = smooth(0.015, 0.10, luminance(fill) - lum)
    shave = np.clip(lower * (0.8 + hairy), 0.0, 1.0)
    out = c + shave[:, None] * (fill * (1.0 + grain[:, None]) - c)

    # --- hair: recolour everything dark outside the face
    face = front * smooth(1.722, 1.70, z) * smooth(0.068, 0.058, ax)         # brows, eyes, nose, mouth stay out of it
    nape = 1.585 + 0.03 * smooth(0.02, -0.03, y)                             # the hairline drops at the back of the neck
    region = smooth(nape, nape + 0.02, z) * (1.0 - face) * (1.0 - shave)
    dark = smooth(0.46, 0.30, lum)
    hair = region * dark
    tone = np.clip(0.19 + 1.15 * lum, 0.0, 0.74) * (1.0 + 0.24 * strands(p, rng))
    blond = np.clip(HAIR_TINT[None, :] * tone[:, None], 0.0, 1.0)
    out += hair[:, None] * (blond - out)

    # --- brows: lighter and thinner, to match the hair
    brow = ellipsoid(mirror, BROW, (0.030, 0.05, 0.0095), soft=0.5) * front
    brow_dark = smooth(0.52, 0.32, lum)
    thin = smooth(BROW[2] - 0.0035, BROW[2] + 0.0005, z)                      # the lower edge goes back to skin
    out += (brow * brow_dark * (1.0 - thin) * 0.9)[:, None] * (fill - out)
    light = np.clip(HAIR_TINT[None, :] * np.clip(0.24 + 0.9 * lum, 0, 0.7)[:, None], 0.0, 1.0)
    out += (brow * brow_dark * thin * 0.8)[:, None] * (light - out)

    # --- eyes: iris colour
    iris = ellipsoid(mirror, EYE, (0.0062, 0.05, 0.0058), soft=0.5) * front
    iris_tone = np.clip(0.2 + 1.2 * lum, 0.0, 0.8)
    pupil = smooth(0.16, 0.08, lum)
    out += (iris * (1.0 - pupil) * smooth(0.6, 0.42, lum) * 0.6)[:, None] * (IRIS_TINT[None, :] * iris_tone[:, None] / 0.6 - out)

    buf[rows, cols, :3] = np.clip(out, 0.0, 1.0)
    bleed(buf, used)
    # A fresh image, not the imported one: that one keeps the source file packed inside
    # it, and both Image.save() and the glTF exporter would write those original bytes.
    painted = bpy.data.images.new('aegis-pilot-skin', w, h, alpha=True)
    painted.colorspace_settings.name = img.colorspace_settings.name
    painted.pixels.foreach_set(buf.ravel())
    painted.update()
    if save_to:
        os.makedirs(os.path.dirname(save_to), exist_ok=True)
        painted.filepath_raw = save_to
        painted.file_format = 'PNG'
        painted.save()
        log(f'wrote {save_to}')
    else:
        painted.pack()
    for mat in bpy.data.materials:
        if mat.use_nodes:
            for node in mat.node_tree.nodes:
                if node.type == 'TEX_IMAGE' and node.image == img:
                    node.image = painted
    bpy.data.images.remove(img)
    img = painted
    if debug:
        for name, mask in (('lower', lower), ('hair', hair), ('clean', clean.astype(np.float32)), ('eyes', eyes), ('lips', np.maximum(lips, nostrils)), ('brow', brow), ('iris', iris)):
            view = np.zeros((h, w), np.float32)
            view[rows, cols] = mask
            np.save(os.path.join(debug, f'mask_{name}.npy'), view[::2, ::2])
    return img


# ---------------------------------------------------------------- geometry

def warp(co, centre, radii, scale=(1.0, 1.0, 1.0), offset=(0.0, 0.0, 0.0), soft=0.7, mirror=False, pivot=None):
    """Scale about `pivot` (default: `centre`) and shift, inside an ellipsoid with a smooth edge.

    With `mirror`, the warp is applied on both sides of the face (x of centre, pivot and
    offset are given for his left)."""
    for side in ((1.0, -1.0) if mirror else (1.0,)):
        flip = np.array((side, 1.0, 1.0), np.float32)
        c = np.asarray(centre, np.float32) * flip
        o = np.asarray(offset, np.float32) * flip
        about = c if pivot is None else np.asarray(pivot, np.float32) * flip
        wgt = ellipsoid(co, c, radii, soft)[:, None]
        co += wgt * ((co - about) * (np.asarray(scale, np.float32) - 1.0) + o)
    return co


def reshape(ob):
    me = ob.data
    n = len(me.vertices)
    co = np.empty(n * 3, np.float32)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    before = co.copy()
    for step in SHAPE:
        warp(co, **step)
    moved = np.linalg.norm(co - before, axis=1)
    me.vertices.foreach_set('co', co.ravel())
    me.update()
    log(f'reshaped {int((moved > 1e-4).sum()):,} vertices, largest move {moved.max() * 1000:.1f} mm')


# Applied in order. Millimetres matter here: the armour's helmet closes around this head.
SHAPE: list[dict] = [
    # a shorter cut: the swept-up front comes down and the whole mass sits closer to the skull
    dict(centre=(0.0, -0.045, 1.775), radii=(0.10, 0.075, 0.055), offset=(0.0, 0.006, -0.011)),
    dict(centre=(0.0, 0.02, 1.745), radii=(0.15, 0.17, 0.10), scale=(0.965, 0.97, 0.90), pivot=SKULL, soft=0.6),
    # a longer lower face with a broad, square jaw
    dict(centre=CHIN, radii=(0.075, 0.07, 0.05), offset=(0.0, -0.0025, -0.006)),
    dict(centre=(0.056, -0.03, 1.582), radii=(0.042, 0.065, 0.042), offset=(0.0035, 0.0, -0.0025), mirror=True),
    # higher, fuller cheekbones
    dict(centre=(0.058, -0.05, 1.645), radii=(0.03, 0.04, 0.024), offset=(0.003, -0.002, 0.001), mirror=True),
    # a broader, shorter nose with a flatter bridge
    dict(centre=NOSE_TIP, radii=(0.027, 0.032, 0.028), scale=(1.2, 0.9, 0.9), offset=(0.0, 0.0, 0.0015), pivot=(0.0, -0.085, 1.628)),
    dict(centre=(0.0, -0.09, 1.658), radii=(0.016, 0.022, 0.02), scale=(1.15, 1.0, 1.0), offset=(0.0, 0.0025, 0.0)),
    # eyes a little further apart and narrower, under a heavier brow
    dict(centre=EYE, radii=(0.024, 0.03, 0.013), scale=(0.95, 1.0, 0.9), offset=(0.002, 0.0, -0.0005), mirror=True),
    dict(centre=BROW, radii=(0.036, 0.03, 0.011), offset=(0.0, -0.003, -0.0015), mirror=True),
    # a wider mouth with thinner lips, set lower
    dict(centre=MOUTH, radii=(0.042, 0.03, 0.019), scale=(1.07, 1.0, 0.86), offset=(0.0, 0.0, -0.002)),
    # larger ears, standing out slightly
    dict(centre=(0.086, 0.004, 1.655), radii=(0.026, 0.032, 0.046), scale=(1.12, 1.0, 1.06), offset=(0.003, 0.0, 0.0), mirror=True),
]
