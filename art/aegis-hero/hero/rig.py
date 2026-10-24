"""Rig stage: import the gameplay skeleton + clips and re-proportion it to a 185 cm hero.

Re-proportioning only TRANSLATES bones (head and tail move together), never rotates
them, so every authored rotation keyframe keeps its meaning. Blender actions are
stored relative to the rest pose, so the 16 clips play unchanged on the new
proportions. The robot's double-hinged elbow/knee pairs are pulled together so they
read as single human joints.

Coordinates in this module are Blender's (Z up, character faces -Y).
"""
from __future__ import annotations

import bpy
from mathutils import Vector

# Target bone-head positions for the LEFT side (+X); right side mirrors X.
SPINE = {
    'hips': (0.0, 0.010, 0.975),
    'spine1': (0.0, 0.016, 1.060),
    'spine2': (0.0, 0.020, 1.150),
    'chest': (0.0, 0.024, 1.255),
    'neck': (0.0, 0.028, 1.520),
    'neck.001': (0.0, 0.012, 1.640),
    'head.001': (0.0, 0.012, 1.640),
}
LEFT = {
    'shoulder.{s}': (0.028, 0.000, 1.470),
    'upper_arm.{s}': (0.190, 0.025, 1.475),
    'shoulderpad.{s}': (0.190, 0.025, 1.475),   # pauldron pivot = shoulder joint
    'forearm.{s}': (0.488, 0.028, 1.475),
    'forearm.{s}.003': (0.512, 0.028, 1.475),
    'hand.{s}': (0.760, 0.028, 1.475),
    'palm.{s}': (0.760, 0.028, 1.475),
    'thigh.{s}': (0.095, 0.004, 0.940),
    'knee.{s}': (0.100, 0.000, 0.522),
    'shin.{s}': (0.100, 0.000, 0.497),
    'foot.{s}': (0.104, 0.016, 0.090),
    'toe.{s}': (0.104, -0.118, 0.024),
}
# Finger chains: base (knuckle) position + phalanx lengths, all along +X in T-pose.
# The source rig has three fingers; the pinky is modelled on the ring chain.
FINGERS = {
    'f_index': ((0.862, -0.0135, 1.471), (0.040, 0.026, 0.022)),
    'f_middle': ((0.866, 0.0115, 1.472), (0.043, 0.028, 0.023)),
    'f_ring': ((0.861, 0.0355, 1.470), (0.040, 0.026, 0.022)),
}
THUMB = ((0.790, -0.016, 1.462), 0.6)  # thumb.01 head, scale for the chain
HAND_SCALE = 0.6
FOOT_SCALE = 0.85

DEFORM = [
    'hips', 'spine1', 'spine2', 'chest', 'neck', 'head.001',
] + [n.format(s=s) for s in 'LR' for n in (
    'shoulder.{s}', 'shoulderpad.{s}', 'upper_arm.{s}', 'forearm.{s}', 'forearm.{s}.003', 'palm.{s}',
    'thigh.{s}', 'knee.{s}', 'shin.{s}', 'foot.{s}', 'toe.{s}',
    'thumb.01.{s}', 'thumb.02.{s}', 'thumb.03.{s}',
    'f_index.01.{s}', 'f_index.02.{s}', 'f_index.03.{s}',
    'f_middle.01.{s}', 'f_middle.02.{s}', 'f_middle.03.{s}',
    'f_ring.01.{s}', 'f_ring.02.{s}', 'f_ring.03.{s}',
)]


def _mirror(p, side):
    return Vector((p[0] if side == 'L' else -p[0], p[1], p[2]))


HERO = {'spine': SPINE, 'left': LEFT, 'fingers': FINGERS, 'thumb': THUMB,
        'hand_scale': HAND_SCALE, 'foot_scale': FOOT_SCALE}


def targets(spec=None) -> dict[str, Vector]:
    spec = spec or HERO
    t = {k: Vector(v) for k, v in spec['spine'].items()}
    for side in 'LR':
        for k, v in spec['left'].items():
            t[k.format(s=side)] = _mirror(v, side)
    return t


def import_rig(path: str):
    bpy.ops.import_scene.gltf(filepath=path)
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    for o in [o for o in bpy.data.objects if o.type != 'ARMATURE']:
        bpy.data.objects.remove(o, do_unlink=True)
    arm.name = 'AEGIS_Rig'
    arm.data.name = 'AEGIS_Rig'
    return arm


def strip_scale_tracks():
    """Rigid armour must never stretch: remove every scale channel."""
    for action in bpy.data.actions:
        layers = getattr(action, 'layers', None)
        if layers:
            for layer in layers:
                for strip in layer.strips:
                    for bag in strip.channelbags:
                        for fc in [fc for fc in bag.fcurves if fc.data_path.endswith('.scale')]:
                            bag.fcurves.remove(fc)
        else:
            for fc in [fc for fc in action.fcurves if fc.data_path.endswith('.scale')]:
                action.fcurves.remove(fc)


def reproportion(arm, spec=None) -> dict[str, Vector]:
    """Translate bone subtrees to the target proportions (`spec`, default: the armoured
    hero). Returns final head positions."""
    spec = spec or HERO
    tgt = targets(spec)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.data.edit_bones
    for b in eb:
        b.use_connect = False
    # all maths in world space (the imported armature object carries a scale)
    mw = arm.matrix_world.copy()
    mw_inv = mw.inverted()
    orig_head = {b.name: mw @ b.head for b in eb}
    orig_tail = {b.name: mw @ b.tail for b in eb}
    new_head = {}
    new_tail = {}

    # scaled subtrees: hand (about wrist) and foot (about ankle)
    scale_root = {}
    def collect(bone, root, s):
        for c in bone.children:
            scale_root[c.name] = (root, s)
            collect(c, root, s)
    for side in 'LR':
        collect(eb[f'hand.{side}'], f'hand.{side}', spec['hand_scale'])
        collect(eb[f'foot.{side}'], f'foot.{side}', spec['foot_scale'])

    def place(bone, parent_delta: Vector):
        name = bone.name
        if name in scale_root:
            root, s = scale_root[name]
            rh = orig_head[root]
            h = new_head[root] + (orig_head[name] - rh) * s
            t = new_head[root] + (orig_tail[name] - rh) * s
        else:
            delta = (tgt[name] - orig_head[name]) if name in tgt else parent_delta
            h = orig_head[name] + delta
            t = orig_tail[name] + delta
        new_head[name], new_tail[name] = h, t
        for c in bone.children:
            place(c, h - orig_head[name])

    for root in [b for b in eb if b.parent is None]:
        place(root, Vector())

    # explicit finger chains / thumb (keep each bone's direction, set lengths)
    for side in 'LR':
        sx = 1 if side == 'L' else -1
        for i, (finger, (base, lengths)) in enumerate(spec['fingers'].items()):
            # metacarpal + helper bones translate with the knuckle (orientation kept)
            off = _mirror(base, side) - new_head[f'{finger}.01.{side}']
            for n in (f'palm.0{i + 1}.{side}', f'{finger}1scaler.{side}'):
                new_head[n] = new_head[n] + off
                new_tail[n] = new_tail[n] + off
            p = _mirror(base, side)
            for i, L in enumerate(lengths):
                n = f'{finger}.0{i + 1}.{side}'
                d = (orig_tail[n] - orig_head[n]).normalized()
                new_head[n], new_tail[n] = p.copy(), p + d * L
                p = p + d * L
        base, s = spec['thumb']
        t1 = f'thumb.01.{side}'
        delta = _mirror(base, side) - new_head[t1]
        for n in (t1, f'thumb.02.{side}', f'thumb.03.{side}'):
            new_head[n] = new_head[n] + delta
            new_tail[n] = new_tail[n] + delta

    for b in eb:
        b.head, b.tail = mw_inv @ new_head[b.name], mw_inv @ new_tail[b.name]
    # keep roll: translating does not change it; orientation preserved for all non-finger bones
    bpy.ops.object.mode_set(mode='OBJECT')
    for b in arm.data.bones:
        b.use_deform = b.name in DEFORM
    return {b.name: arm.matrix_world @ b.head_local for b in arm.data.bones}


def landmarks(arm) -> dict[str, tuple[float, float, float]]:
    """Bone heads in glTF/authoring space (x = character left, y = up, z = forward)."""
    out = {}
    for b in arm.data.bones:
        h = arm.matrix_world @ b.head_local
        t = arm.matrix_world @ b.tail_local
        out[b.name] = (h.x, h.z, -h.y)
        out[b.name + ':tail'] = (t.x, t.z, -t.y)
    return out
