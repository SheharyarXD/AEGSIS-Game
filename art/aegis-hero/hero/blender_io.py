"""Blender-side helpers: mesh objects from numpy, PBR material library, studio renders."""
from __future__ import annotations

import math
import os

import bpy
import numpy as np
from mathutils import Vector


def to_blender(v: np.ndarray) -> np.ndarray:
    """authoring (x left, y up, z fwd) -> Blender (x, -fwd, up)."""
    return np.stack([v[:, 0], -v[:, 2], v[:, 1]], 1)


def collection(name: str, parent=None):
    col = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if col.name not in [c.name for c in (parent or bpy.context.scene.collection).children]:
        (parent or bpy.context.scene.collection).children.link(col)
    return col


def make_mesh(name: str, verts: np.ndarray, faces: np.ndarray, col, material=None, smooth_angle=38.0):
    old = bpy.data.objects.get(name)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    me = bpy.data.meshes.new(name)
    v = to_blender(verts).astype(np.float32)
    me.vertices.add(len(v))
    me.vertices.foreach_set('co', v.ravel())
    nf = len(faces)
    me.loops.add(nf * 4)
    me.loops.foreach_set('vertex_index', faces.astype(np.int32).ravel())
    me.polygons.add(nf)
    me.polygons.foreach_set('loop_start', np.arange(0, nf * 4, 4, dtype=np.int32))
    me.update(calc_edges=True)
    me.validate(clean_customdata=False)
    me.polygons.foreach_set('use_smooth', np.ones(len(me.polygons), bool))
    if smooth_angle:
        me.set_sharp_from_angle(angle=math.radians(smooth_angle))
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    if material:
        me.materials.append(material)
    return ob


# --------------------------------------------------------------------------- materials
PALETTE = {
    # name: (base color linear-ish sRGB hex, metallic, roughness, extra)
    'titanium': ('#2c2f35', 1.0, 0.48),   # primary titanium black
    'gunmetal': ('#6d737c', 1.0, 0.44),   # secondary brushed gunmetal
    'silver': ('#e6e9ee', 1.0, 0.26),     # polished silver trim
    'steel': ('#c4cad2', 1.0, 0.38),      # cool steel major plates
    'carbon': ('#16181c', 0.0, 0.92),     # carbon composite / undersuit
    'rubber': ('#0d0e10', 0.0, 0.95),
    'energy': ('#06203c', 0.0, 0.25),     # electric blue emitter (colour comes from emission)
    'visor': ('#061c38', 0.2, 0.06),
}
EMISSION = {'energy': ('#1486ff', 2.4), 'visor': ('#1f8fff', 2.2)}


def hex_rgb(h: str):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


def material(name: str):
    key = name
    mat = bpy.data.materials.get('M_' + key)
    if mat:
        return mat
    color, metal, rough = PALETTE[key]
    mat = bpy.data.materials.new('M_' + key)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*hex_rgb(color), 1)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    if key in EMISSION:
        ec, strength = EMISSION[key]
        bsdf.inputs['Emission Color'].default_value = (*hex_rgb(ec), 1)
        bsdf.inputs['Emission Strength'].default_value = strength
    return mat


def clay(name: str):
    """Neutral form-review material (emitters keep a flat tint so they stay legible)."""
    key = 'clay_' + ('glow' if name in EMISSION else 'dark' if name in ('titanium', 'carbon', 'rubber') else 'light')
    mat = bpy.data.materials.get(key)
    if mat:
        return mat
    mat = bpy.data.materials.new(key)
    mat.use_nodes = True
    b = mat.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = {'clay_glow': (0.1, 0.45, 1, 1), 'clay_dark': (0.08, 0.08, 0.09, 1),
                                            'clay_light': (0.30, 0.30, 0.32, 1)}[key]
    b.inputs['Roughness'].default_value = 0.55
    if key == 'clay_glow':
        b.inputs['Emission Color'].default_value = (0.1, 0.45, 1, 1)
        b.inputs['Emission Strength'].default_value = 2.0
    return mat


# --------------------------------------------------------------------------- studio
VIEWS = {
    # name: (azimuth deg from front, elevation deg, distance, target (height or bone name), lens)
    'front': (0, 4, 3.5, 0.98, 50),
    'threequarter': (35, 8, 3.5, 0.98, 50),
    'side': (90, 4, 3.5, 0.98, 50),
    'back': (180, 6, 3.5, 0.98, 50),
    'backquarter': (215, 8, 3.5, 0.98, 50),
    'helmet': (24, 6, 0.95, 'head.001', 70),
    'helmet_front': (0, 2, 0.85, 'head.001', 70),
    'helmet_side': (90, 2, 0.85, 'head.001', 70),
    'helmet_back': (180, 4, 0.85, 'head.001', 70),
    'chest': (16, 6, 1.35, 'chest', 60),
    'shoulder': (40, 12, 1.15, 'upper_arm.L', 60),
    'hands': (55, 15, 0.75, 'palm.L', 60),
    'hand_palm': (110, -25, 0.7, 'palm.L', 60),
    'legs': (28, 6, 2.1, 0.5, 55),
    'boots': (35, 10, 1.2, 'foot.L', 55),
    'thrusters': (160, 10, 1.6, 'chest', 55),
}

# head-of-bone offsets so close-ups frame the interesting part
TARGET_OFFSET = {'head.001': (0, 0, 0.085), 'chest': (0, 0, 0.08), 'palm.L': (0, 0, 0), 'foot.L': (0, -0.03, -0.03),
                 'upper_arm.L': (0, 0, -0.06)}


def setup_studio(engine='BLENDER_EEVEE_NEXT', res=(900, 1200)):
    sc = bpy.context.scene
    sc.render.engine = engine
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.film_transparent = False
    try:
        sc.view_settings.view_transform = 'AgX'
        sc.view_settings.look = 'AgX - Medium High Contrast'
    except Exception:
        pass
    if engine.startswith('BLENDER_EEVEE'):
        e = sc.eevee
        e.taa_render_samples = 48
        for attr, val in (('use_raytracing', True), ('use_shadows', True), ('use_gtao', True)):
            if hasattr(e, attr):
                setattr(e, attr, val)
    else:
        sc.cycles.samples = 64
        sc.cycles.use_denoising = True
    world = bpy.data.worlds.get('Studio') or bpy.data.worlds.new('Studio')
    sc.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld')
    bg = nt.nodes.new('ShaderNodeBackground')
    sky = nt.nodes.new('ShaderNodeTexGradient')
    coord = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    nt.links.new(coord.outputs['Generated'], sep.inputs[0])
    nt.links.new(coord.outputs['Generated'], sky.inputs[0])
    # simple studio gradient: dark floor, softer overhead
    ramp.color_ramp.elements[0].color = (0.004, 0.005, 0.007, 1)
    ramp.color_ramp.elements[1].color = (0.09, 0.10, 0.12, 1)
    nt.links.new(sep.outputs['Z'], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], bg.inputs[0])
    bg.inputs[1].default_value = 1.0
    nt.links.new(bg.outputs[0], out.inputs[0])
    lights = collection('Studio')
    def area(name, loc, rot_target, energy, size, color):
        l = bpy.data.objects.get(name)
        if not l:
            ld = bpy.data.lights.new(name, 'AREA')
            l = bpy.data.objects.new(name, ld)
            lights.objects.link(l)
        l.data.energy, l.data.size, l.data.color = energy, size, color
        l.location = loc
        d = Vector(rot_target) - Vector(loc)
        l.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    area('Key', (2.6, -3.2, 3.2), (0, 0, 1.1), 420, 2.0, (1.0, 0.96, 0.9))
    area('Fill', (-3.0, -2.2, 1.6), (0, 0, 1.0), 110, 3.0, (0.75, 0.85, 1.0))
    area('RimL', (-2.2, 2.8, 2.6), (0, 0, 1.2), 380, 1.2, (0.55, 0.75, 1.0))
    area('RimR', (2.4, 2.6, 2.2), (0, 0, 1.2), 260, 1.2, (0.7, 0.85, 1.0))
    area('Top', (0, 0, 4.2), (0, 0, 0), 120, 3.0, (1, 1, 1))
    floor = bpy.data.objects.get('Floor')
    if not floor:
        bpy.ops.mesh.primitive_plane_add(size=30)
        floor = bpy.context.active_object
        floor.name = 'Floor'
        for c in floor.users_collection:
            c.objects.unlink(floor)
        lights.objects.link(floor)
        fm = bpy.data.materials.new('M_floor')
        fm.use_nodes = True
        b = fm.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (0.018, 0.02, 0.024, 1)
        b.inputs['Roughness'].default_value = 0.55
        floor.data.materials.append(fm)
    cam = bpy.data.objects.get('Cam')
    if not cam:
        cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
        lights.objects.link(cam)
    sc.camera = cam
    return cam


def view_target(target):
    if isinstance(target, str):
        arm = bpy.data.objects.get('AEGIS_Rig')
        pb = arm.pose.bones[target]
        return arm.matrix_world @ pb.head + Vector(TARGET_OFFSET.get(target, (0, 0, 0)))
    return Vector((0, 0, target))


def render_view(view: str, path: str, cam=None):
    az, el, dist, tgt, lens = VIEWS[view]
    cam = cam or bpy.data.objects['Cam']
    cam.data.lens = lens
    a, e = math.radians(az), math.radians(el)
    target = view_target(tgt)
    # front of character is -Y
    cam.location = target + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
