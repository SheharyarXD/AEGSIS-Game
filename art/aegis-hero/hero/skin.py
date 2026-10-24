"""Skinning: rigid armour plates follow one bone; the undersuit gets smooth weights."""
from __future__ import annotations

import bpy


def _armature_modifier(ob, arm):
    mod = ob.modifiers.get('Armature') or ob.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    ob.parent = arm
    ob.matrix_parent_inverse = arm.matrix_world.inverted()


def bind_rigid(arm, objects):
    for ob in objects:
        bone = ob.get('bone')
        if not bone or bone == 'AUTO':
            continue
        ob.vertex_groups.clear()
        vg = ob.vertex_groups.new(name=bone)
        vg.add(range(len(ob.data.vertices)), 1.0, 'REPLACE')
        _armature_modifier(ob, arm)
    auto = [ob for ob in objects if ob.get('bone') == 'AUTO']
    for ob in auto:
        bind_auto(arm, ob)


def bind_auto(arm, ob):
    """Bone-heat weights restricted to the deform bones."""
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    with bpy.context.temp_override(active_object=arm, selected_objects=[ob, arm], selected_editable_objects=[ob, arm]):
        bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    if len(ob.vertex_groups) == 0:
        raise RuntimeError(f'bone heat failed for {ob.name}')


# --------------------------------------------------------------------------- geometric skinning
# bone -> (tip: bone whose head ends the segment, or an offset in metres; influence radius)
SEGMENTS = {
    'hips': ('spine1', 0.17), 'spine1': ('spine2', 0.16), 'spine2': ('chest', 0.16), 'chest': ('neck', 0.19),
    'neck': ('head.001', 0.07), 'head.001': ((0.0, 0.0, 0.15), 0.12),
}
for _s in 'LR':
    SEGMENTS.update({
        f'shoulder.{_s}': (f'upper_arm.{_s}', 0.085), f'upper_arm.{_s}': (f'forearm.{_s}', 0.055),
        f'forearm.{_s}': (f'forearm.{_s}.003', 0.050), f'forearm.{_s}.003': (f'hand.{_s}', 0.045),
        f'palm.{_s}': (f'f_middle.01.{_s}', 0.040),
        f'thigh.{_s}': (f'knee.{_s}', 0.090), f'knee.{_s}': (f'shin.{_s}', 0.065), f'shin.{_s}': (f'foot.{_s}', 0.060),
        f'foot.{_s}': (f'toe.{_s}', 0.060), f'toe.{_s}': ((0.0, -0.08, 0.0), 0.050),
    })
    for _f in ('f_index', 'f_middle', 'f_ring'):
        SEGMENTS.update({f'{_f}.01.{_s}': (f'{_f}.02.{_s}', 0.011), f'{_f}.02.{_s}': (f'{_f}.03.{_s}', 0.010),
                         f'{_f}.03.{_s}': ('TAIL', 0.010)})
    SEGMENTS.update({f'thumb.01.{_s}': (f'thumb.02.{_s}', 0.014), f'thumb.02.{_s}': (f'thumb.03.{_s}', 0.012),
                     f'thumb.03.{_s}': ('TAIL', 0.011)})


def geometric_weights(points, arm, softness=0.18, max_influences=4, head_rigid=None):
    """Skin weights from radius-normalised distance to bone segments (world space).

    Robust where bone-heat fails (layered clothing, open shells). Left/right bones
    never cross the centre line, and joints blend softly over a few centimetres.
    head_rigid = (z0, z1): above z1 the head bone owns the vertex completely.
    Returns (bone names, weights[N, B]).
    """
    import numpy as np
    mw = arm.matrix_world
    names = list(SEGMENTS)
    P = np.asarray(points, np.float64)
    D = np.empty((len(P), len(names)))
    for j, name in enumerate(names):
        tip, radius = SEGMENTS[name]
        b = arm.data.bones[name]
        a = np.array(mw @ b.head_local)
        if tip == 'TAIL':
            e = np.array(mw @ b.tail_local)
        elif isinstance(tip, str):
            e = np.array(mw @ arm.data.bones[tip].head_local)
        else:
            e = a + np.array(tip)
        ab = e - a
        t = np.clip(((P - a) @ ab) / max(float(ab @ ab), 1e-12), 0.0, 1.0)
        d = np.linalg.norm(P - (a + t[:, None] * ab), axis=1) / radius
        if name.endswith('.L') or '.L.' in name:
            d = np.where(P[:, 0] < -0.012, 1e6, d)
        elif name.endswith('.R') or '.R.' in name:
            d = np.where(P[:, 0] > 0.012, 1e6, d)
        D[:, j] = d
    W = np.exp(-(D - D.min(axis=1, keepdims=True)) / softness)
    order = np.argsort(-W, axis=1)
    W[np.arange(len(P))[:, None], order[:, max_influences:]] = 0.0
    W[W < 0.01] = 0.0
    # Near a ball joint the limb hands part of its weight to the parent, so a shoulder
    # or hip bound in a T-pose folds smoothly instead of swinging as a rigid cap.
    W /= W.sum(axis=1, keepdims=True)
    for side in 'LR':
        for limb, parent, reach, share in ((f'upper_arm.{side}', f'shoulder.{side}', 0.11, 0.62),
                                           (f'thigh.{side}', 'hips', 0.10, 0.45)):
            tip, _ = SEGMENTS[limb]
            a = np.array(mw @ arm.data.bones[limb].head_local)
            e = np.array(mw @ arm.data.bones[tip].head_local)
            axis = (e - a) / np.linalg.norm(e - a)
            along = (P - a) @ axis
            give = np.clip(1.0 - along / reach, 0.0, 1.0) * share
            j, jp = names.index(limb), names.index(parent)
            moved = W[:, j] * give
            W[:, j] -= moved
            W[:, jp] += moved
    if head_rigid is not None:
        z0, z1 = head_rigid
        k = np.clip((P[:, 2] - z0) / (z1 - z0), 0.0, 1.0)[:, None]
        onehot = np.zeros_like(W)
        onehot[:, names.index('head.001')] = 1.0
        W = W / W.sum(axis=1, keepdims=True)
        W = W * (1.0 - k) + onehot * k
    W /= W.sum(axis=1, keepdims=True)
    return names, W


def assign_weights(ob, names, W):
    ob.vertex_groups.clear()
    for j, name in enumerate(names):
        idx = W[:, j].nonzero()[0]
        if len(idx) == 0:
            continue
        g = ob.vertex_groups.new(name=name)
        col = W[:, j]
        for i in idx:
            g.add([int(i)], float(col[i]), 'REPLACE')
