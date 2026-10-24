"""AEGIS hero build driver (Blender 4.5, headless).

  blender -b --factory-startup -P art/aegis-hero/build.py -- [options]

Options:
  --quality draft|final   voxel size multiplier (draft = 2x coarser)
  --only a,b              build only parts whose name starts with one of these
  --render v1,v2          studio renders into art/aegis-hero/renders/
  --pose FRAME:ACTION,..  pose the rig before rendering (e.g. 40:aegis_idle,8:aegis_walk)
  --export                decimate, UV, bake, skin, export GLB + save .blend
  --keep-high             keep the 8M-triangle high-poly in the .blend (150 MB)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from hero import rig, motion, blender_io as bio  # noqa: E402
from hero.anatomy import Landmarks  # noqa: E402
from hero import parts as P  # noqa: E402
from hero.mesher import mesh_sdf  # noqa: E402


def args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--quality', default='draft')
    ap.add_argument('--only', default='')
    ap.add_argument('--render', default='')
    ap.add_argument('--pose', default='')
    ap.add_argument('--export', action='store_true')
    ap.add_argument('--tag', default='')
    ap.add_argument('--clay', action='store_true')
    ap.add_argument('--tex', type=int, default=4096)
    ap.add_argument('--keep-high', action='store_true', help='keep the high-poly parts in the saved .blend')
    return ap.parse_args(argv)


def main():
    a = args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = motion.FPS
    arm = rig.import_rig(os.path.join(HERE, 'source', 'rig-source.glb'))
    rig.strip_scale_tracks()
    rig.reproportion(arm)
    meta = motion.build_set(arm, 'armor', os.path.join(HERE, 'source', 'mocap'))
    os.makedirs(os.path.join(HERE, 'export'), exist_ok=True)
    json.dump(meta, open(os.path.join(HERE, 'export', 'aegis-hero.motion.json'), 'w'), indent=1)
    L = Landmarks(rig.landmarks(arm))
    json.dump(L.raw, open(os.path.join(HERE, 'source', 'landmarks.json'), 'w'), indent=1)

    scale = {'draft': 2.0, 'final': 1.0}.get(a.quality) or float(a.quality)
    high = bio.collection('HIGH')
    only = [s for s in a.only.split(',') if s]
    t0 = time.time()
    built = []
    for part in P.build_parts(L):
        if only and not any(part.name.startswith(o) for o in only):
            continue
        t = time.time()
        verts, faces = mesh_sdf(part.field, part.lo, part.hi, part.voxel * scale)
        if len(faces) == 0:
            print(f'[part] {part.name}: EMPTY')
            continue
        mat = bio.clay(part.material) if a.clay else bio.material(part.material)
        ob = bio.make_mesh(part.name, verts, faces, high, mat, part.smooth_angle)
        ob['bone'] = part.bone
        ob['material_class'] = part.material
        ob['voxel'] = part.voxel * scale
        built.append(ob)
        print(f'[part] {part.name:28s} {len(faces):8d} quads  {time.time() - t:6.1f}s  -> {part.bone}')
    print(f'[parts] {len(built)} parts in {time.time() - t0:.1f}s')

    poses = [p.split(':') for p in a.pose.split(',') if p]
    if poses:
        from hero import skin
        skin.bind_rigid(arm, built)
    if a.render:
        cam = bio.setup_studio()
        out = os.path.join(HERE, 'renders')
        os.makedirs(out, exist_ok=True)
        for frame, action in poses or [(None, None)]:
            if action:
                arm.animation_data.action = bpy.data.actions[action]
                if bpy.data.actions[action].slots:
                    arm.animation_data.action_slot = bpy.data.actions[action].slots[0]
                bpy.context.scene.frame_set(int(frame))
            suffix = f'{action}{frame}_' if action and len(poses) > 1 else ''
            for v in a.render.split(','):
                bio.render_view(v, os.path.join(out, f'{a.tag}{suffix}{v}.png'), cam)

    if a.export:
        from hero import export
        export.run(arm, built, P.mounts(L), HERE, tex=a.tex, keep_high=a.keep_high)


if __name__ == '__main__':
    main()
