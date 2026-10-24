"""Export stage: high-poly parts -> game-ready skinned low-poly + baked maps + GLB.

  1. Per-part collapse decimation to a target edge length (denser on helmet/hands).
  2. Hidden-face culling (faces no ray can see are dropped; saves triangles + texels).
  3. Rigid skin weights per plate; bone-heat weights for the undersuit.
  4. One joined mesh, UV atlas (priority parts get more texels).
  5. Cycles bakes from the high-poly through a smooth cage: tangent normals, ambient
     occlusion, and a wear/roughness variation mask.
  6. Thruster mount nodes, GLB export (rig + clips), textured .blend saved as source.
"""
from __future__ import annotations

import math
import os
import time

import json

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from . import blender_io as bio
from . import parts as P
from . import skin

EDGE_RULES = [  # (name prefix, target edge length in metres)
    ('helmet', 0.0068), ('emblem', 0.0042), ('finger', 0.0040), ('hand', 0.0058), ('palm', 0.0045),
    ('knuckles', 0.0048), ('buckle', 0.0046), ('pack_nozzle', 0.0050), ('pack_core', 0.0050),
    ('pack', 0.0085), ('knee_light', 0.0045), ('undersuit', 0.0200),
]
DEFAULT_EDGE = 0.0140
LIGHT_EDGE = 0.0055
UV_PRIORITY = [('helmet', 1.7), ('emblem', 1.8), ('pec', 1.25), ('sternum', 1.25), ('undersuit', 0.55),
               ('finger', 1.15), ('pack', 1.1)]


def log(msg):
    print(f'[export] {msg}', flush=True)


def edge_for(ob):
    if ob.get('material_class') in ('energy', 'visor'):
        return LIGHT_EDGE
    for prefix, e in EDGE_RULES:
        if ob.name.startswith(prefix):
            return e
    return DEFAULT_EDGE


def make_low(ob, col):
    target = edge_for(ob)
    ratio = min(1.0, (float(ob['voxel']) * 1.02 / target) ** 2)
    low = ob.copy()
    low.data = ob.data.copy()
    low.name = 'L_' + ob.name
    low.animation_data_clear()
    col.objects.link(low)
    low.modifiers.clear()
    low.parent = None
    if ratio < 0.97:
        mod = low.modifiers.new('dec', 'DECIMATE')
        mod.ratio = ratio
        mod.use_collapse_triangulate = True
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(low.evaluated_get(dg))
        low.modifiers.clear()
        old = low.data
        low.data = me
        bpy.data.meshes.remove(old)
    for k in ('bone', 'material_class'):
        low[k] = ob[k]
    # texel-density weight survives the join as a point attribute
    k = next((s for prefix, s in UV_PRIORITY if ob.name.startswith(prefix)), 1.0)
    attr = low.data.attributes.new('uv_scale', 'FLOAT', 'POINT')
    attr.data.foreach_set('value', np.full(len(low.data.vertices), k, np.float32))
    return low


def _cone_dirs():
    """Normal + two rings (35 and 65 degrees): deterministic, so culling is coherent."""
    out = [(0.0, 0.0, 1.0)]
    for tilt, count, phase in ((35.0, 6, 0.0), (65.0, 8, 0.4)):
        st, ct = math.sin(math.radians(tilt)), math.cos(math.radians(tilt))
        for i in range(count):
            phi = phase + 2 * math.pi * i / count
            out.append((st * math.cos(phi), st * math.sin(phi), ct))
    return out


def cull_hidden(lows, reach=0.012, min_island=14, keep_rings=1):
    """Drop buried faces: those whose normal cone is blocked within `reach` in every
    direction (plate interiors against the undersuit, embedded overlay bases, the
    undersuit under plates). Leftover specks smaller than `min_island` go too."""
    verts, polys = [], []
    base = 0
    for ob in lows:
        me = ob.data
        co = np.empty(len(me.vertices) * 3, np.float32)
        me.vertices.foreach_get('co', co)
        verts.append(co.reshape(-1, 3))
        for p in me.polygons:
            polys.append([base + v for v in p.vertices])
        base += len(me.vertices)
    allv = np.concatenate(verts)
    tree = BVHTree.FromPolygons([tuple(v) for v in allv], polys, all_triangles=False)
    dirs = _cone_dirs()
    removed = 0
    for ob in lows:
        me = ob.data
        bm = bmesh.new()
        bm.from_mesh(me)
        bm.faces.ensure_lookup_table()
        total = len(bm.faces)
        dead = []
        for f in bm.faces:
            n = f.normal
            if n.length < 1e-6:
                dead.append(f)
                continue
            c = f.calc_center_median() + n * 0.0012
            t = n.orthogonal().normalized()
            b = n.cross(t)
            for dx, dy, dz in dirs:
                if tree.ray_cast(c, t * dx + b * dy + n * dz, reach)[0] is None:
                    break
            else:
                dead.append(f)
        # keep a ring of buried faces next to visible ones: the cut border then lies
        # well inside the hidden zone and cannot show up as a ragged edge when posed
        dead_set = {f.index for f in dead}
        for _ in range(keep_rings):
            rescued = set()
            for f in dead:
                if f.index in dead_set and any(g.index not in dead_set for v in f.verts for g in v.link_faces):
                    rescued.add(f.index)
            dead_set -= rescued
        dead = [f for f in dead if f.index in dead_set]
        if dead:
            bmesh.ops.delete(bm, geom=dead, context='FACES')
        # remove specks (keep everything on genuinely tiny parts)
        if total > 400:
            bm.faces.ensure_lookup_table()
            seen = set()
            specks = []
            for f0 in bm.faces:
                if f0.index in seen:
                    continue
                comp = [f0]
                seen.add(f0.index)
                i = 0
                while i < len(comp):
                    for e in comp[i].edges:
                        for g in e.link_faces:
                            if g.index not in seen:
                                seen.add(g.index)
                                comp.append(g)
                    i += 1
                if len(comp) < min_island:
                    specks.extend(comp)
            if specks:
                bmesh.ops.delete(bm, geom=specks, context='FACES')
        removed += total - len(bm.faces)
        bm.to_mesh(me)
        bm.free()
        me.update()
    return removed


# Parts that are one piece of geometry but two pieces of choreography: the face section
# of the helmet's inner shell closes with the faceplate, the rest clamps on from behind.
# part -> (group of the front piece, point on the cutting plane, normal towards the front)
FACE_PLANE = ((0.0, -0.022, 1.775), (0.0, -0.94, -0.34))
GROUP_CUTS = {part: ('helmet_face', *FACE_PLANE) for part in (
    'helmet_core', 'helmet_crest', 'helmet_temples', 'helmet_cheeks', 'helmet_sidelight')}


def cut_group(me, source, front, point, normal, attr='_GROUP'):
    """Cut the faces of group `source` along a plane, separate the two sides and move the
    front side to group `front`. Works on a single part or on the joined mesh."""
    bm = bmesh.new()
    bm.from_mesh(me)
    layer = bm.verts.layers.float[attr]
    inside = lambda f: all(v[layer] == source for v in f.verts)
    faces = [f for f in bm.faces if inside(f)]
    geom = faces + list({e for f in faces for e in f.edges}) + list({v for f in faces for v in f.verts})
    cut = bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-6, plane_co=point, plane_no=normal,
                                 clear_inner=False, clear_outer=False)['geom_cut']
    for v in (g for g in cut if isinstance(g, bmesh.types.BMVert)):
        v[layer] = source
    bmesh.ops.split_edges(bm, edges=[g for g in cut if isinstance(g, bmesh.types.BMEdge)])
    point, normal = Vector(point), Vector(normal)
    moved = 0
    for f in bm.faces:
        if inside(f) and (f.calc_center_median() - point).dot(normal) > 0:
            for v in f.verts:
                v.tag = True
    for v in bm.verts:
        if v.tag and v[layer] == source:
            v[layer] = front
            moved += 1
    bm.to_mesh(me)
    bm.free()
    me.update()
    return moved


def group_entry(arm, name, bone, pts):
    """Table row of one group: tracking bone, centre in that bone's space, bounding radius."""
    pts = np.asarray(pts, np.float64)
    centre = pts.mean(axis=0)
    radius = float(np.linalg.norm(pts - centre, axis=1).max())
    local = (arm.matrix_world @ arm.data.bones[bone].matrix_local).inverted() @ Vector(centre)
    return {'name': name, 'bone': bone, 'center': [round(c, 5) for c in local],
            'radius': round(radius, 4), 'body': name.startswith('body_')}


def tag_groups(arm, lows):
    """Write the per-vertex `_GROUP` attribute (assembly group index) and return the
    group table: name, tracking bone, and the group's centre in that bone's space."""
    names, verts_of = [], {}

    def index_of(name):
        if name not in verts_of:
            verts_of[name] = []
            names.append(name)
        return names.index(name)

    def coords(me):
        co = np.empty(len(me.vertices) * 3, np.float32)
        me.vertices.foreach_get('co', co)
        return co.reshape(-1, 3)

    for ob in lows:
        me = ob.data
        n = len(me.vertices)
        co = coords(me)
        ids = np.zeros(n, np.float32)
        part = ob.name[2:]
        auto = ob.get('bone') == 'AUTO'
        if auto:
            gnames = [g.name for g in ob.vertex_groups]
            for v in me.vertices:
                best = max(v.groups, key=lambda g: g.weight, default=None)
                bone = gnames[best.group] if best else 'chest'
                i = index_of(P.body_region(bone))
                ids[v.index] = i
                verts_of[names[i]].append((bone, co[v.index]))
        else:
            base, side, split = P.group_of(part)
            if split:
                for k, name in ((co[:, 0] >= 0, f'{base}.L'), (co[:, 0] < 0, f'{base}.R')):
                    ids[k] = index_of(name)
            else:
                ids[:] = index_of(f'{base}.{side}' if side else base)
        attr = me.attributes.new('_GROUP', 'FLOAT', 'POINT')
        attr.data.foreach_set('value', ids)
        if auto:
            continue
        cut = GROUP_CUTS.get(part[:-2] if part.endswith(('.L', '.R')) else part)
        if cut:
            for source in np.unique(ids):
                cut_group(me, source, index_of(cut[0]), cut[1], cut[2])
            co = coords(me)
            ids = np.empty(len(me.vertices), np.float32)
            me.attributes['_GROUP'].data.foreach_get('value', ids)
        for i in np.unique(ids):
            verts_of[names[int(i)]].extend((ob['bone'], c) for c in co[ids == i])
    table = []
    for name in names:
        entries = verts_of[name]
        bones = {}
        for bone, _ in entries:
            bones[bone] = bones.get(bone, 0) + 1
        table.append(group_entry(arm, name, max(bones, key=bones.get), [c for _, c in entries]))
    return table


def join(objects, name, col):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    with bpy.context.temp_override(active_object=objects[0], selected_objects=objects, selected_editable_objects=objects):
        bpy.ops.object.join()
    ob = objects[0]
    ob.name = name
    ob.data.name = name
    return ob


def unwrap(ob, limit_deg=58.0, min_faces=20):
    """Region-growing planar unwrap.

    Faces are grouped into connected regions whose normals stay within `limit_deg` of
    the region seed, undersized regions are merged into their best neighbour, and each
    region is projected orthographically along its mean normal. Islands are therefore
    always connected patches with uniform texel density (scaled by `uv_scale`).
    """
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    bm.normal_update()
    scale_layer = bm.verts.layers.float.get('uv_scale')
    nf = len(bm.faces)
    region = [-1] * nf
    cos_lim = math.cos(math.radians(limit_deg))
    order = sorted(range(nf), key=lambda i: -bm.faces[i].calc_area())
    count = 0
    sizes = []
    for seed in order:
        if region[seed] != -1:
            continue
        n0 = bm.faces[seed].normal.copy()
        region[seed] = count
        stack = [bm.faces[seed]]
        size = 1
        while stack:
            f = stack.pop()
            for e in f.edges:
                for g in e.link_faces:
                    if region[g.index] == -1 and g.normal.dot(n0) > cos_lim:
                        region[g.index] = count
                        stack.append(g)
                        size += 1
        sizes.append(size)
        count += 1
    # merge undersized regions into the neighbour sharing the most edges
    for _ in range(6):
        changed = False
        members = {}
        for i, r in enumerate(region):
            members.setdefault(r, []).append(i)
        for r, faces in members.items():
            if len(faces) >= min_faces:
                continue
            votes = {}
            for i in faces:
                for e in bm.faces[i].edges:
                    for g in e.link_faces:
                        r2 = region[g.index]
                        if r2 != r and len(members.get(r2, ())) >= len(faces):
                            votes[r2] = votes.get(r2, 0) + 1
            if votes:
                best = max(votes, key=votes.get)
                for i in faces:
                    region[i] = best
                members[best] = members[best] + faces
                members[r] = []
                changed = True
        if not changed:
            break
    members = {}
    for i, r in enumerate(region):
        members.setdefault(r, []).append(i)
    uv = bm.loops.layers.uv.verify()
    for r, faces in members.items():
        n = Vector((0, 0, 0))
        for i in faces:
            f = bm.faces[i]
            n += f.normal * f.calc_area()
        if n.length < 1e-12:
            n = bm.faces[faces[0]].normal.copy()
        n.normalize()
        u = n.orthogonal().normalized()
        v = n.cross(u)
        for i in faces:
            for loop in bm.faces[i].loops:
                k = loop.vert[scale_layer] if scale_layer else 1.0
                loop[uv].uv = (loop.vert.co.dot(u) * k, loop.vert.co.dot(v) * k)
    bm.to_mesh(me)
    bm.free()
    me.update()
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(margin=0.0014, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    return len([1 for f in members.values() if f])


def set_normals(ob, angle=48.0):
    me = ob.data
    me.polygons.foreach_set('use_smooth', np.ones(len(me.polygons), bool))
    me.set_sharp_from_angle(angle=math.radians(angle))
    me.update()


def make_cage(low, extrusion, col):
    cage = low.copy()
    cage.data = low.data.copy()
    cage.name = 'CAGE'
    col.objects.link(cage)
    me = cage.data
    for e in me.edges:
        e.use_edge_sharp = False
    me.update()
    n = len(me.vertices)
    co = np.empty(n * 3, np.float32)
    no = np.empty(n * 3, np.float32)
    me.vertices.foreach_get('co', co)
    me.vertices.foreach_get('normal', no)
    me.vertices.foreach_set('co', co + no * extrusion)
    me.update()
    return cage


def image(name, size, color=(0.5, 0.5, 1.0, 1.0), non_color=True):
    img = bpy.data.images.get(name)
    if img:
        bpy.data.images.remove(img)
    img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=False)
    img.generated_color = color
    if non_color:
        img.colorspace_settings.name = 'Non-Color'
    return img


def set_bake_target(ob, img):
    for slot in ob.material_slots:
        nt = slot.material.node_tree
        node = nt.nodes.get('BAKE') or nt.nodes.new('ShaderNodeTexImage')
        node.name = 'BAKE'
        node.image = img
        nt.nodes.active = node
        node.select = True


def wear_material():
    """Emission = (albedo variation, roughness multiplier, cavity) from curvature + noise."""
    mat = bpy.data.materials.new('BAKE_wear')
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    ramp_edge = nt.nodes.new('ShaderNodeValToRGB')
    ramp_edge.color_ramp.elements[0].position = 0.52
    ramp_edge.color_ramp.elements[1].position = 0.60
    ramp_cav = nt.nodes.new('ShaderNodeValToRGB')
    ramp_cav.color_ramp.elements[0].position = 0.40
    ramp_cav.color_ramp.elements[1].position = 0.50
    nt.links.new(geo.outputs['Pointiness'], ramp_edge.inputs[0])
    nt.links.new(geo.outputs['Pointiness'], ramp_cav.inputs[0])
    coord = nt.nodes.new('ShaderNodeTexCoord')
    n1 = nt.nodes.new('ShaderNodeTexNoise')
    n1.inputs['Scale'].default_value = 38.0
    n1.inputs['Detail'].default_value = 6.0
    n2 = nt.nodes.new('ShaderNodeTexNoise')
    n2.inputs['Scale'].default_value = 260.0
    n2.inputs['Detail'].default_value = 3.0
    # brushed streaks: noise stretched along the vertical axis
    mapn = nt.nodes.new('ShaderNodeMapping')
    mapn.inputs['Scale'].default_value = (900.0, 900.0, 22.0)
    n3 = nt.nodes.new('ShaderNodeTexNoise')
    n3.inputs['Scale'].default_value = 1.0
    nt.links.new(coord.outputs['Object'], n1.inputs['Vector'])
    nt.links.new(coord.outputs['Object'], n2.inputs['Vector'])
    nt.links.new(coord.outputs['Object'], mapn.inputs['Vector'])
    nt.links.new(mapn.outputs[0], n3.inputs['Vector'])

    def math_node(op, a, b):
        m = nt.nodes.new('ShaderNodeMath')
        m.operation = op
        for i, v in enumerate((a, b)):
            if isinstance(v, (int, float)):
                m.inputs[i].default_value = v
            else:
                nt.links.new(v, m.inputs[i])
        return m.outputs[0]
    edge = ramp_edge.outputs[0]
    cav = ramp_cav.outputs[0]
    # R: albedo variation, 0.8 = neutral; edges brighter, cavities/dirt darker
    r = math_node('ADD', 0.80, math_node('MULTIPLY', edge, 0.20))
    r = math_node('ADD', r, math_node('MULTIPLY', math_node('SUBTRACT', n1.outputs['Fac'], 0.5), 0.05))
    r = math_node('MULTIPLY', r, math_node('ADD', 0.72, math_node('MULTIPLY', cav, 0.28)))
    # G: roughness multiplier; polished edges, rougher cavities, brushed streaks
    g = math_node('ADD', 0.88, math_node('MULTIPLY', math_node('SUBTRACT', n3.outputs['Fac'], 0.5), 0.30))
    g = math_node('ADD', g, math_node('MULTIPLY', math_node('SUBTRACT', n2.outputs['Fac'], 0.5), 0.14))
    g = math_node('SUBTRACT', g, math_node('MULTIPLY', edge, 0.30))
    g = math_node('ADD', g, math_node('MULTIPLY', math_node('SUBTRACT', 1.0, cav), 0.12))
    comb = nt.nodes.new('ShaderNodeCombineColor')
    nt.links.new(r, comb.inputs[0])
    nt.links.new(g, comb.inputs[1])
    nt.links.new(cav, comb.inputs[2])
    nt.links.new(comb.outputs[0], em.inputs['Color'])
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    return mat


def bake(low, high, cage, kind, img, samples):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False
    b = sc.render.bake
    b.use_selected_to_active = True
    b.use_cage = True
    b.cage_object = cage
    b.max_ray_distance = 0.0
    b.margin = 12
    b.margin_type = 'EXTEND'
    b.use_clear = True
    set_bake_target(low, img)
    bpy.ops.object.select_all(action='DESELECT')
    high.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    t = time.time()
    if kind == 'NORMAL':
        bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT')
    elif kind == 'AO':
        bpy.ops.object.bake(type='AO')
    else:
        bpy.ops.object.bake(type='EMIT')
    log(f'bake {kind}: {time.time() - t:.1f}s')


def pixels(img):
    a = np.empty(img.size[0] * img.size[1] * 4, np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(img.size[1], img.size[0], 4)


def save_png(arr, path, name, non_color=True):
    h, w = arr.shape[:2]
    img = bpy.data.images.get(name)
    if img:
        bpy.data.images.remove(img)
    img = bpy.data.images.new(name, w, h, alpha=False)
    if non_color:
        img.colorspace_settings.name = 'Non-Color'
    img.pixels.foreach_set(arr.astype(np.float32).ravel())
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    return img


def add_mounts(arm, mounts, col):
    for name, (bone, pos, direction) in mounts.items():
        e = bpy.data.objects.new('MOUNT_' + name.replace('.', '_'), None)
        e.empty_display_size = 0.03
        col.objects.link(e)
        e.parent = arm
        e.parent_type = 'BONE'
        e.parent_bone = bone
        bpy.context.view_layer.update()
        p = Vector((pos[0], -pos[2], pos[1]))
        d = Vector((direction[0], -direction[2], direction[1])).normalized()
        rot = d.to_track_quat('-Z', 'Y').to_matrix().to_4x4()
        rot.translation = p
        e.matrix_world = rot


def run(arm, built, mounts, here, tex=4096, out_name='aegis-hero', ao_samples=48, keep_high=False):
    t_all = time.time()
    arm.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    low_col = bio.collection('LOW')
    lows = [make_low(ob, low_col) for ob in built]
    tri = lambda obs: sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in obs)
    log(f'high {tri(built):,} tris -> low {tri(lows):,} tris')
    removed = cull_hidden(lows)
    lows = [o for o in lows if len(o.data.polygons) > 0]
    log(f'culled {removed:,} hidden faces -> {tri(lows):,} tris')

    # skin weights before joining (vertex groups merge by name)
    skin.bind_rigid(arm, lows)
    groups = tag_groups(arm, lows)
    with open(os.path.join(here, 'export', f'{out_name}.assembly.json'), 'w') as fh:
        json.dump({'groups': groups}, fh, indent=1)
    log(f'{len(groups)} assembly groups')
    low = join(lows, 'AEGIS_Hero', low_col)
    set_normals(low)
    n_islands = unwrap(low)
    low.data.attributes.remove(low.data.attributes['uv_scale'])
    log(f'{n_islands:,} UV islands')
    log(f'unwrapped: {len(low.data.polygons):,} faces')

    # high-poly reference (copies) with the wear shader
    high_col = bio.collection('BAKE_HIGH')
    copies = []
    for ob in built:
        c = ob.copy()
        c.data = ob.data.copy()
        high_col.objects.link(c)
        c.modifiers.clear()
        c.parent = None
        copies.append(c)
    high = join(copies, 'HIGH_REF', high_col)
    wear = wear_material()
    orig_mats = [s.material for s in high.material_slots]
    cage = make_cage(low, 0.0022, high_col)

    tex_dir = os.path.join(here, 'textures')
    os.makedirs(tex_dir, exist_ok=True)
    n_img = image('bake_normal', tex)
    bake(low, high, cage, 'NORMAL', n_img, 1)
    normal = pixels(n_img)[..., :3].copy()
    if bpy.context.scene.world is None:
        bpy.context.scene.world = bpy.data.worlds.new('World')
    bpy.context.scene.world.light_settings.distance = 0.10
    a_img = image('bake_ao', tex, (1, 1, 1, 1))
    bake(low, high, cage, 'AO', a_img, ao_samples)
    ao = pixels(a_img)[..., 0].copy()
    for s in high.material_slots:
        s.material = wear
    w_img = image('bake_wear', tex, (0.5, 0.75, 1, 1))
    bake(low, high, cage, 'EMIT', w_img, 1)
    wearpx = pixels(w_img)[..., :3].copy()
    for s, m in zip(high.material_slots, orig_mats):
        s.material = m

    ones = np.ones_like(ao)
    orm = np.stack([np.clip(ao, 0, 1) ** 1.15, np.clip(wearpx[..., 1], 0.05, 1.0), ones, ones], -1)
    alb = np.clip(wearpx[..., 0], 0, 1)                          # neutral 0.8 (finaliser gain 1.25)
    alb = alb * (0.86 + 0.14 * np.clip(ao, 0, 1))                # light cavity darkening
    albedo = np.stack([alb, alb, alb, ones], -1)
    nrm = np.concatenate([normal, ones[..., None]], -1)
    imgs = {
        'normal': save_png(nrm, os.path.join(tex_dir, f'{out_name}_normal.png'), 'T_normal'),
        'orm': save_png(orm, os.path.join(tex_dir, f'{out_name}_orm.png'), 'T_orm'),
        'albedo': save_png(albedo, os.path.join(tex_dir, f'{out_name}_albedo.png'), 'T_albedo', non_color=False),
    }

    # clean bake nodes; export with factor-only materials (textures are attached by the node finaliser)
    for slot in low.material_slots:
        nt = slot.material.node_tree
        n = nt.nodes.get('BAKE')
        if n:
            nt.nodes.remove(n)
    add_mounts(arm, mounts, low_col)
    for o in list(high_col.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    hide = bpy.data.collections.get('HIGH')
    arm.data.pose_position = 'POSE'
    glb = os.path.join(here, 'export', f'{out_name}.glb')
    os.makedirs(os.path.dirname(glb), exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    low.select_set(True)
    arm.select_set(True)
    for o in low_col.objects:
        if o.type == 'EMPTY':
            o.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(
        filepath=glb, export_format='GLB', use_selection=True, export_apply=False,
        export_animations=True, export_animation_mode='ACTIONS', export_skins=True, export_all_influences=False,
        export_def_bones=False, export_tangents=True, export_normals=True, export_texcoords=True,
        export_attributes=True, export_materials='EXPORT', export_yup=True, export_optimize_animation_size=True,
        export_anim_slide_to_zero=False, export_extras=False, export_cameras=False, export_lights=False)
    log(f'wrote {glb} ({os.path.getsize(glb) / 1e6:.1f} MB)')

    # textured materials for the editable source file
    for slot in low.material_slots:
        nt = slot.material.node_tree
        bsdf = nt.nodes['Principled BSDF']
        tn = nt.nodes.new('ShaderNodeTexImage')
        tn.image = imgs['normal']
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
        to = nt.nodes.new('ShaderNodeTexImage')
        to.image = imgs['orm']
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(to.outputs['Color'], sep.inputs[0])
        mul = nt.nodes.new('ShaderNodeMath')
        mul.operation = 'MULTIPLY'
        mul.inputs[1].default_value = bsdf.inputs['Roughness'].default_value
        nt.links.new(sep.outputs[1], mul.inputs[0])
        nt.links.new(mul.outputs[0], bsdf.inputs['Roughness'])
        ta = nt.nodes.new('ShaderNodeTexImage')
        ta.image = imgs['albedo']
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs[0].default_value = 1.0
        base = list(bsdf.inputs['Base Color'].default_value)
        mix.inputs[6].default_value = [min(1.0, c * 1.25) for c in base[:3]] + [1.0]
        nt.links.new(ta.outputs['Color'], mix.inputs[7])
        nt.links.new(mix.outputs[2], bsdf.inputs['Base Color'])
    # The high-poly parts are regenerated by build.py; leaving them out keeps the
    # source file small enough to version (about 20 MB instead of 150 MB).
    if hide and not keep_high:
        for o in list(hide.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(hide)
        bpy.ops.outliner.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
    elif hide:
        hide.hide_render = True
        hide.hide_viewport = True
    blend = os.path.join(here, f'{out_name}.blend')
    bpy.ops.wm.save_as_mainfile(filepath=blend, compress=True)
    log(f'saved {blend}; total {time.time() - t_all:.1f}s')
    return low
