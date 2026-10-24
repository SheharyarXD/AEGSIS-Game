"""Unsuited pilot build (Blender 4.5, headless).

  blender -b --factory-startup -P art/aegis-hero/build_pilot.py -- [--render] [--source-face]

Takes the static pilot mesh (source/pilot-source.glb, see pilot.provenance.json for
its licence), fits the gameplay skeleton to his proportions, and skins him so he
plays the same 16 clips as the armour:

  1. Normalise the mesh: 1.80 m tall, feet on the ground, one object. Then give him
     a different face (hero/pilot_face.py); --source-face skips that, for comparison.
  2. Re-proportion the skeleton to his joints (T-pose rest, like the armour rig).
  3. He was modelled with arms ~47 degrees down and forearms bent forward. A copy of
     the rig is posed to match, that pose becomes its rest pose, and geometric skin
     weights are solved there. Rotating that copy back to the T-pose and baking the
     deformation yields a T-pose mesh that binds to the real rig with those weights.
  4. Head is weighted rigidly so the face never shears.
  5. Export GLB (rig + clips) for scripts/finalize-hero.mjs aegis-pilot.
"""
from __future__ import annotations

import json
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from hero import rig, skin, motion, pilot_face, blender_io as bio  # noqa: E402

HEIGHT = 1.80
# Skeleton targets (Blender space: x = his left, -y = front, z = up), T-pose rest.
PILOT = {
    'spine': {
        'hips': (0.0, 0.030, 0.950), 'spine1': (0.0, 0.034, 1.035), 'spine2': (0.0, 0.038, 1.125),
        'chest': (0.0, 0.040, 1.230), 'neck': (0.0, 0.042, 1.490),
        'neck.001': (0.0, 0.028, 1.625), 'head.001': (0.0, 0.028, 1.625),
    },
    'left': {
        'shoulder.{s}': (0.030, 0.020, 1.440), 'upper_arm.{s}': (0.170, 0.012, 1.430),
        'shoulderpad.{s}': (0.170, 0.012, 1.430),
        'forearm.{s}': (0.480, 0.012, 1.430), 'forearm.{s}.003': (0.500, 0.012, 1.430),
        'hand.{s}': (0.740, 0.012, 1.430), 'palm.{s}': (0.740, 0.012, 1.430),
        'thigh.{s}': (0.090, 0.020, 0.930), 'knee.{s}': (0.125, 0.020, 0.505), 'shin.{s}': (0.127, 0.020, 0.485),
        'foot.{s}': (0.155, 0.050, 0.080), 'toe.{s}': (0.160, -0.085, 0.020),
    },
    'fingers': {
        'f_index': ((0.835, -0.018, 1.427), (0.038, 0.024, 0.020)),
        'f_middle': ((0.838, 0.002, 1.428), (0.041, 0.026, 0.021)),
        'f_ring': ((0.834, 0.022, 1.426), (0.038, 0.024, 0.020)),
    },
    'thumb': ((0.770, -0.024, 1.418), 0.6),
    'hand_scale': 0.55, 'foot_scale': 0.85,
}
# Where his joints actually are in the source pose (left side; mirrored for the right).
MESH_ELBOW = (0.380, -0.030, 1.204)
MESH_WRIST = (0.554, -0.136, 1.042)
HEAD_RIGID_FROM, HEAD_RIGID_FULL = 1.535, 1.585   # z range over which the head becomes rigid


def log(msg):
    print(f'[pilot] {msg}', flush=True)


def import_mesh(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == 'MESH']
    keep = []
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = Matrix.Identity(4)
        o.data.transform(mw)
        if len(o.data.vertices) >= 10:
            keep.append(o)
    for o in new:
        if o not in keep:
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in keep:
        o.select_set(True)
    bpy.context.view_layer.objects.active = keep[0]
    with bpy.context.temp_override(active_object=keep[0], selected_objects=keep, selected_editable_objects=keep):
        bpy.ops.object.join()
    ob = keep[0]
    ob.name = ob.data.name = 'AEGIS_Pilot'
    co = np.empty(len(ob.data.vertices) * 3, np.float32)
    ob.data.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    zmin, zmax = co[:, 2].min(), co[:, 2].max()
    s = HEIGHT / (zmax - zmin)
    co[:, 2] -= zmin
    co *= s
    co[:, 0] -= (co[:, 0].max() + co[:, 0].min()) * 0.5
    ob.data.vertices.foreach_set('co', co.ravel())
    ob.data.update()
    for slot in ob.material_slots:
        b = slot.material.node_tree.nodes.get('Principled BSDF')
        if b:
            b.inputs['Roughness'].default_value = 0.62 if 'material_0' in slot.material.name else 0.82
            b.inputs['Metallic'].default_value = 0.0
    log(f'mesh: {len(ob.data.vertices):,} verts, scale {s:.4f}')
    return ob


def aim(arig, bone, tip, target_world):
    """Rotate pose bone `bone` about its head so the head->`tip` direction hits target."""
    pb, tb = arig.pose.bones[bone], arig.pose.bones[tip]
    inv = arig.matrix_world.inverted()
    head = pb.head.copy()
    cur = (tb.head - head).normalized()
    want = ((inv @ Vector(target_world)) - head).normalized()
    R = cur.rotation_difference(want).to_matrix().to_4x4()
    pb.matrix = Matrix.Translation(head) @ R @ Matrix.Translation(-head) @ pb.matrix
    bpy.context.view_layer.update()


def bind(arm, mesh):
    # --- A-pose copy of the rig
    arig = arm.copy()
    arig.data = arm.data.copy()
    arig.name = 'PILOT_BindRig'
    arig.animation_data_clear()
    arig.data.pose_position = 'POSE'      # the source rig is parked in REST while binding
    for pb in arig.pose.bones:             # drop the animated pose the importer left behind
        pb.location = (0.0, 0.0, 0.0)
        pb.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
        pb.rotation_euler = (0.0, 0.0, 0.0)
        pb.scale = (1.0, 1.0, 1.0)
    bpy.context.scene.collection.objects.link(arig)
    bpy.context.view_layer.update()
    for side, sx in (('L', 1.0), ('R', -1.0)):
        m = lambda p: (p[0] * sx, p[1], p[2])
        aim(arig, f'upper_arm.{side}', f'forearm.{side}', m(MESH_ELBOW))
        aim(arig, f'forearm.{side}', f'hand.{side}', m(MESH_WRIST))
    bpy.ops.object.select_all(action='DESELECT')
    arig.select_set(True)
    bpy.context.view_layer.objects.active = arig
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode='OBJECT')

    # --- geometric weights in his own pose (bone heat cannot solve layered clothing)
    co = np.empty(len(mesh.data.vertices) * 3, np.float32)
    mesh.data.vertices.foreach_get('co', co)
    names, W = skin.geometric_weights(co.reshape(-1, 3), arig, head_rigid=(HEAD_RIGID_FROM, HEAD_RIGID_FULL))
    skin.assign_weights(mesh, names, W)
    mod = mesh.modifiers.new('Armature', 'ARMATURE')
    mod.object = arig
    log(f'weights: {len(mesh.vertex_groups)} groups')

    # --- un-pose to the T-pose and bake
    for side in 'LR':
        for name in (f'upper_arm.{side}', f'forearm.{side}'):
            arig.pose.bones[name].matrix = arm.data.bones[name].matrix_local.copy()
            bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    baked = bpy.data.meshes.new_from_object(mesh.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    old = mesh.data
    mesh.modifiers.clear()
    mesh.data = baked
    mesh.data.name = 'AEGIS_Pilot'
    bpy.data.meshes.remove(old)
    bpy.data.objects.remove(arig, do_unlink=True)
    mod = mesh.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    mesh.parent = arm
    mesh.matrix_parent_inverse = arm.matrix_world.inverted()


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = motion.FPS
    arm = rig.import_rig(os.path.join(HERE, 'source', 'rig-source.glb'))
    rig.strip_scale_tracks()
    rig.reproportion(arm, PILOT)
    arm.name = 'AEGIS_Rig'
    meta = motion.build_set(arm, 'pilot', os.path.join(HERE, 'source', 'mocap'))
    os.makedirs(os.path.join(HERE, 'export'), exist_ok=True)
    json.dump(meta, open(os.path.join(HERE, 'export', 'aegis-pilot.motion.json'), 'w'), indent=1)
    mesh = import_mesh(os.path.join(HERE, 'source', 'pilot-source.glb'))
    if '--source-face' not in argv:
        pilot_face.repaint(mesh, save_to=os.path.join(HERE, 'export', 'aegis-pilot-skin.png'))
        pilot_face.reshape(mesh)
    arm.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    bind(arm, mesh)
    arm.data.pose_position = 'POSE'

    if '--render' in argv:
        out = os.path.join(HERE, 'renders')
        cam = bio.setup_studio(res=(700, 1000))
        for tag, frame, action in (('rest', 0, None), ('idle', 40, 'aegis_idle'), ('walk', 8, 'aegis_walk'),
                                   ('walk2', 22, 'aegis_walk'), ('run', 6, 'aegis_run'), ('suitup', 5, 'aegis_suitup')):
            if action:
                arm.animation_data.action = bpy.data.actions[action]
                if bpy.data.actions[action].slots:
                    arm.animation_data.action_slot = bpy.data.actions[action].slots[0]
            else:
                arm.data.pose_position = 'REST'
            bpy.context.scene.frame_set(frame)
            for view in ('front', 'side'):
                bio.render_view(view, os.path.join(out, f'pilot_{tag}_{view}.png'), cam)
            arm.data.pose_position = 'POSE'

    glb = os.path.join(HERE, 'export', 'aegis-pilot.glb')
    os.makedirs(os.path.dirname(glb), exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(
        filepath=glb, export_format='GLB', use_selection=True, export_apply=False,
        export_animations=True, export_animation_mode='ACTIONS', export_skins=True, export_all_influences=False,
        export_def_bones=False, export_tangents=False, export_normals=True, export_texcoords=True,
        export_materials='EXPORT', export_yup=True, export_optimize_animation_size=True,
        export_anim_slide_to_zero=False, export_extras=False, export_cameras=False, export_lights=False)
    log(f'wrote {glb} ({os.path.getsize(glb) / 1e6:.1f} MB)')
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'aegis-pilot.blend'), compress=True)


if __name__ == '__main__':
    main()
