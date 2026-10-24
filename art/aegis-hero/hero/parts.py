"""Part registry: every mesh of the hero, its field, bounds, voxel size, bone and material."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from . import anatomy
from . import sdf as S
from .sdf import SDF


@dataclass
class Part:
    name: str
    field: SDF
    lo: tuple
    hi: tuple
    voxel: float
    bone: str            # rigid bone, or 'AUTO' for smooth skinning
    material: str
    smooth_angle: float = 38.0
    mirror: bool = False  # authored for the left side; a mirrored copy is made


def mirrored(part: Part) -> list[Part]:
    """Left-authored part -> [left, right] (right evaluates the field at -x)."""
    def flip(f):
        def g(p):
            q = p.copy()
            q[:, 0] = -q[:, 0]
            return f(q)
        return g
    right_bone = part.bone.replace('.L', '.R')
    lo, hi = part.lo, part.hi
    return [
        Part(part.name + '.L', part.field, lo, hi, part.voxel, part.bone, part.material, part.smooth_angle),
        Part(part.name + '.R', flip(part.field), (-hi[0], lo[1], lo[2]), (-lo[0], hi[1], hi[2]),
             part.voxel, right_bone, part.material, part.smooth_angle),
    ]


def build_parts(L: anatomy.Landmarks) -> list[Part]:
    from . import armor
    # undersuit: the body, minus what is permanently sealed inside the helmet and boots
    base = anatomy.body_field(L)

    def ribbed(p):
        # ribs run around the torso/legs (bands in y) and around the arms (bands in x)
        s = np.where(np.abs(p[:, 0]) < 0.21, p[:, 1], np.abs(p[:, 0]))
        return base(p) + 0.0011 * np.sin(s * (2.0 * np.pi / 0.014))
    body = S.intersect(ribbed, lambda p: p[:, 1] - 1.680, lambda p: 0.125 - p[:, 1])
    parts: list[Part] = [
        Part('undersuit', body, (-0.99, 0.10, -0.22), (0.99, 1.72, 0.24), 0.003, 'AUTO', 'carbon', 50.0),
    ]
    for p in armor.build(L, anatomy.Fields(L)):
        parts.extend(mirrored(p) if p.mirror else [p])
    return parts


def mounts(L: anatomy.Landmarks) -> dict:
    """VFX mount points: name -> (bone, exit position, exhaust direction), authoring space."""
    from .armor import back
    out = dict(back.MOUNTS)
    W, A = L['hand.L'], L['foot.L']
    for side, sx in (('L', 1.0), ('R', -1.0)):
        out[f'palm.{side}'] = (f'palm.{side}', (sx * 0.812, W[1] - 0.030, -0.008), (0.0, -1.0, 0.0))
        out[f'foot.{side}'] = (f'foot.{side}', (sx * A[0], 0.004, A[2] + 0.050), (0.0, -1.0, 0.0))
    return out


# ---------------------------------------------------------------------------------------
# Assembly groups: the suit-up sequence moves these as rigid components. First matching
# prefix wins. sided = one group per side (.L / .R); split = a single symmetric mesh that
# is divided by the sign of x.
GROUP_RULES = [
    # (part-name prefix, group, sided, split)
    ('boot_toecap', 'boot_front', True, False), ('boot_toe', 'boot_front', True, False),
    ('boot_instep', 'boot_front', True, False), ('sole_toe', 'boot_front', True, False),
    ('boot', 'boot_rear', True, False), ('ankle_disc', 'boot_rear', True, False), ('sole', 'boot_rear', True, False),
    ('shin_', 'shin', True, False), ('calf', 'calf', True, False), ('knee_', 'knee', True, False),
    ('thigh_front', 'thigh_front', True, False), ('hip_guard', 'thigh_front', True, False),
    ('thigh_', 'thigh_back', True, False),
    ('pelvis', 'pelvis', False, False), ('belt', 'pelvis', False, False), ('buckle', 'pelvis', False, False),
    ('hip_plate', 'pelvis', False, False), ('glute', 'pelvis', False, False),
    ('spine_', 'back', False, False), ('scapula', 'back', False, False), ('lat', 'back', False, False),
    ('lower_back', 'back', False, False),
    ('rib_', 'ribs', True, False), ('oblique', 'ribs', True, False),
    ('abdomen', 'abdomen', False, False), ('abs_', 'abdomen', False, False),
    ('pec', 'chest', False, False), ('sternum', 'chest', False, False), ('emblem', 'emblem', False, False),
    ('gorget', 'collar', False, False), ('collar', 'collar', False, False),
    ('gauntlet', 'forearm', True, False), ('wrist_cuff', 'forearm', True, False), ('elbow', 'elbow', True, False),
    ('deltoid_cap', 'shoulder', True, False), ('shoulder_bridge', 'shoulder', True, False),
    ('arm_', 'upper_arm', True, False), ('bicep', 'upper_arm', True, False), ('tricep', 'upper_arm', True, False),
    ('deltoid_', 'upper_arm', True, False),
    ('finger_index', 'finger_index', True, False), ('finger_middle', 'finger_middle', True, False),
    ('finger_ring', 'finger_ring', True, False), ('finger_pinky', 'finger_pinky', True, False),
    ('finger_thumb', 'finger_thumb', True, False),
    ('hand_', 'hand', True, False), ('palm_', 'hand', True, False), ('knuckles', 'hand', True, False),
    ('missile_cap', 'missile_cap', True, False), ('missile_pod', 'missile_pod', True, False),
    ('pack_base', 'pack_base', False, False), ('pack_', 'pack', True, False),
    ('helmet_visor', 'visor', False, False),
    ('helmet_brow', 'helmet_face', False, False), ('helmet_face', 'helmet_face', False, False),
    ('helmet_mouth', 'helmet_face', False, False),
    ('helmet_temples', 'helmet_side', True, True), ('helmet_cheeks', 'helmet_side', True, True),
    ('helmet_ears', 'helmet_side', True, True), ('helmet_earlight', 'helmet_side', True, True),
    ('helmet_sidelight', 'helmet_side', True, True),
    ('helmet_', 'helmet_shell', False, False),
]
# The undersuit is one skinned skin; it is revealed region by region as plates close.
BODY_REGIONS = [
    ('foot', 'body_leg_lower', True), ('toe', 'body_leg_lower', True), ('shin', 'body_leg_lower', True),
    ('knee', 'body_leg_lower', True), ('thigh', 'body_leg_upper', True), ('hips', 'body_pelvis', False),
    ('spine', 'body_torso', False), ('chest', 'body_torso', False),
    # the liner over the shoulders belongs to the arm: it is only covered once the deltoid armour docks
    ('shoulder', 'body_arm_upper', True), ('upper_arm', 'body_arm_upper', True), ('forearm', 'body_arm_lower', True), ('palm', 'body_hand', True),
    ('f_', 'body_hand', True), ('thumb', 'body_hand', True), ('neck', 'body_neck', False), ('head', 'body_neck', False),
]


def group_of(part_name: str):
    """-> (group base, side or None, split by x)."""
    side = part_name[-1] if part_name.endswith(('.L', '.R')) else None
    base = part_name[:-2] if side else part_name
    for prefix, group, sided, split in GROUP_RULES:
        if base.startswith(prefix):
            return group, (side if sided else None), split
    raise KeyError(f'no assembly group for part {part_name!r}')


def body_region(bone_name: str) -> str:
    side = bone_name[-1] if bone_name.endswith(('.L', '.R')) else ('L' if '.L.' in bone_name else 'R' if '.R.' in bone_name else None)
    for prefix, region, sided in BODY_REGIONS:
        if bone_name.startswith(prefix):
            return f'{region}.{side}' if sided and side else region
    return 'body_torso'
