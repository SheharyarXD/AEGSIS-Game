"""Back armour + propulsion.

Plates: scapula shells (steel), segmented spine column (titanium, three bones), lat
plates (gunmetal), lower-back plates (steel), glute plates (titanium), lower-back
light bars. Propulsion (chest bone): mounting base, two integrated thruster housings
with vertical light slots, louvred side vents, heat-shield caps and bell nozzles with
glowing cores. Nozzle exits are published as VFX mount points (see MOUNTS).
"""
from __future__ import annotations

import numpy as np

from .. import sdf as S
from ..parts import Part
from .common import mirror_pts, region, back_only

NONE = lambda p: -np.ones(len(p))

# housing geometry shared with the mount export
HOUSING_C = np.array((0.074, 1.352, -0.166))
HOUSING_H = np.array((0.031, 0.100, 0.028))
TILT = 7.0  # degrees outward at the bottom
NOZZLE_Y = (1.236, 1.200)
# Shoulder missile pod, modelled where it stands when deployed. The game keeps it sunk
# behind the shoulder blade and hidden under its cap until it is called up.
POD_C = np.array((0.150, 1.585, -0.150))
POD_H = np.array((0.050, 0.048, 0.060))
POD_TUBES = [(0.127, 1.562), (0.173, 1.562), (0.127, 1.608), (0.173, 1.608)]
MOUNTS = {
    # name: (bone, position, direction)  position = nozzle exit, direction = exhaust
    'back.L': ('chest', (0.080, 1.198, -0.170), (0.10, -1.0, -0.12)),
    'back.R': ('chest', (-0.080, 1.198, -0.170), (-0.10, -1.0, -0.12)),
    # missile launch: centre of the pod's front face, direction = along the tubes
    'missile.L': ('chest', (0.150, 1.585, -0.088), (0.07, 0.10, 1.0)),
    'missile.R': ('chest', (-0.150, 1.585, -0.088), (-0.07, 0.10, 1.0)),
}


def housing_basis():
    return S.rot((0, 0, 1), -TILT) @ S.rot((1, 0, 0), -5.0)


def build(L, F):
    T = F.torso
    parts: list[Part] = []
    box = ((-0.22, 0.84, -0.26), (0.22, 1.56, 0.02))

    def add(name, f, bone, mat, voxel=0.0018, mirror=False, angle=34.0, lo=box[0], hi=box[1]):
        parts.append(Part(name, f, lo, hi, voxel, bone, mat, angle, mirror))

    def plate(name, outline, inner, outer, bone, mat, facets=(), mirror=True, bevel=0.003, z0=0.0):
        f = S.chamfer_intersect(bevel, S.shell(T, inner, outer), region(outline), back_only(z0), *facets)
        add(name, f, bone, mat, mirror=mirror)
        return f

    # ------------------------------------------------------------ plates
    plate('scapula', [(0.040, 1.490), (0.142, 1.494), (0.180, 1.442), (0.172, 1.362), (0.132, 1.300),
                      (0.064, 1.292), (0.044, 1.330)], 0.004, 0.0215, 'chest', 'steel',
          [S.plane((0.10, 1.40, -0.139), S.norm((0.18, 0.22, -0.958))),
           S.plane((0.10, 1.47, -0.110), S.norm((0.10, 0.70, -0.70)))])
    plate('lat', [(0.118, 1.292), (0.170, 1.340), (0.192, 1.270), (0.176, 1.196), (0.120, 1.212)], 0.003, 0.0145,
          'chest', 'gunmetal', z0=0.03)
    plate('lower_back', [(0.034, 1.174), (0.122, 1.182), (0.142, 1.104), (0.122, 1.052), (0.034, 1.062)],
          0.004, 0.0185, 'spine1', 'steel', [S.plane((0.08, 1.11, -0.112), S.norm((0.15, -0.10, -0.98)))])
    plate('glute', [(0.030, 0.976), (0.150, 0.976), (0.164, 0.920), (0.124, 0.872), (0.040, 0.884)],
          0.003, 0.0150, 'hips', 'titanium')

    seg = lambda p: np.abs(np.mod(p[:, 1] + 0.011, 0.022) - 0.011) - 0.0016
    for name, bone, y0, y1 in (('spine_upper', 'chest', 1.272, 1.492), ('spine_mid', 'spine2', 1.184, 1.262),
                               ('spine_low', 'spine1', 1.070, 1.174)):
        f = S.chamfer_intersect(0.0025, S.shell(T, 0.004, 0.0175), lambda p: np.abs(p[:, 0]) - 0.030,
                                lambda p, y0=y0, y1=y1: np.abs(p[:, 1] - (y0 + y1) * 0.5) - (y1 - y0) * 0.5,
                                back_only(-0.03))
        f = S.chamfer_subtract(0.0008, f, S.intersect(seg, lambda p: -(T(p) - 0.0135)))
        add(name, f, bone, 'titanium')
    bars = S.intersect(lambda p: np.abs(np.mod(p[:, 1] - 1.096, 0.016) - 0.008) - 0.0022,
                       lambda p: np.abs(p[:, 1] - 1.120) - 0.026, lambda p: np.abs(p[:, 0]) - 0.022,
                       S.shell(T, 0.0165, 0.0195), back_only(-0.03))
    add('spine_light', bars, 'spine1', 'energy', 0.0011, angle=30.0)

    # ------------------------------------------------------------ thruster pack (chest)
    base = S.chamfer_intersect(0.003, S.shell(T, 0.012, 0.030),
                               region(mirror_pts([(0, 1.478), (0.060, 1.472), (0.112, 1.420), (0.112, 1.300),
                                                  (0.062, 1.262), (0, 1.256)])), back_only(-0.05),
                               S.plane((0, 1.38, -0.152), (0, 0.0, -1)))
    add('pack_base', base, 'chest', 'titanium', 0.0016)

    B = housing_basis()
    hc, hh = HOUSING_C, HOUSING_H
    hous = S.box(hc, hh, B, r=0.010)
    edge = [S.plane(hc + B @ np.array((0.0, 0, -hh[2])), B @ S.norm((0.62, 0, -0.78))),
            S.plane(hc + B @ np.array((0.0, 0, -hh[2])), B @ S.norm((-0.62, 0, -0.78))),
            S.plane(hc + B @ np.array((0, hh[1], 0)), B @ S.norm((0, 0.80, -0.60)))]
    hous = S.chamfer_intersect(0.003, hous, *edge)
    loc = lambda p: (p - hc) @ B
    slots = lambda p: np.maximum(np.abs(np.abs(loc(p)[:, 0]) - 0.0115) - 0.0026, np.abs(loc(p)[:, 1] + 0.004) - 0.066)
    hous = S.chamfer_subtract(0.0012, hous, S.intersect(slots, lambda p: loc(p)[:, 2] + hh[2] - 0.0055))
    louv = lambda p: np.maximum(np.abs(np.mod(loc(p)[:, 1] + 0.005, 0.010) - 0.005) - 0.0018,
                                np.abs(loc(p)[:, 1] + 0.010) - 0.060)
    hous = S.chamfer_subtract(0.0008, hous, S.intersect(louv, lambda p: hh[0] - 0.004 - loc(p)[:, 0],
                                                        lambda p: np.abs(loc(p)[:, 2]) - 0.016))
    add('pack_housing', hous, 'chest', 'gunmetal', 0.0012, mirror=True)
    glow = S.intersect(lambda p: np.abs(np.abs(loc(p)[:, 0]) - 0.0115) - 0.0018,
                       lambda p: np.abs(loc(p)[:, 1] + 0.004) - 0.062,
                       lambda p: np.abs(loc(p)[:, 2] + hh[2] - 0.0068) - 0.0018)
    add('pack_light', glow, 'chest', 'energy', 0.0010, mirror=True, angle=30.0)
    cap_c = hc + B @ np.array((0, hh[1] - 0.004, -0.004))
    cap = S.chamfer_intersect(0.002, S.box(cap_c, (hh[0] + 0.006, 0.016, hh[2] + 0.006), B, r=0.004),
                              S.plane(cap_c + B @ np.array((0, 0.006, 0)), B @ S.norm((0, 0.85, -0.53))))
    add('pack_cap', cap, 'chest', 'steel', 0.0012, mirror=True)
    # bell nozzle: outer flare, hollow throat, glowing core
    axis_top = hc + B @ np.array((0, -hh[1] + 0.004, 0.0))
    axis_bot = axis_top + B @ np.array((0, -0.040, -0.006))
    outer = S.round_cone(axis_top, axis_bot, 0.020, 0.026)
    inner = S.round_cone(axis_top + B @ np.array((0, -0.006, 0)), axis_bot + B @ np.array((0, -0.01, 0)), 0.013, 0.021)
    nozzle = S.chamfer_subtract(0.0012, S.intersect(outer, S.plane(axis_bot, B @ (0, -1, 0))), inner)
    rings = lambda p: np.abs(np.mod(loc(p)[:, 1] + 0.004, 0.008) - 0.004) - 0.0010
    nozzle = S.chamfer_subtract(0.0006, nozzle, S.intersect(rings, lambda p: -outer(p) - 0.0018,
                                                            lambda p: loc(p)[:, 1] + hh[1] + 0.012))
    add('pack_nozzle', nozzle, 'chest', 'silver', 0.0010, mirror=True)
    core = S.intersect(S.round_cone(axis_top + B @ np.array((0, -0.004, 0)), axis_top + B @ np.array((0, -0.012, 0)),
                                    0.0125, 0.0125), S.plane(axis_top + B @ np.array((0, -0.009, 0)), B @ (0, 1, 0)))
    add('pack_core', core, 'chest', 'energy', 0.0010, mirror=True, angle=30.0)

    # ------------------------------------------------------------ shoulder missile launchers (chest)
    # armoured cap over the bay, lying on the upper shoulder blade
    cap = S.chamfer_intersect(0.003, S.shell(T, 0.0215, 0.0335),
                              region([(0.092, 1.512), (0.196, 1.516), (0.208, 1.468), (0.196, 1.428), (0.100, 1.424)]),
                              back_only(-0.04))
    cap = S.chamfer_subtract(0.0008, cap, S.intersect(lambda p: np.abs(p[:, 1] - 1.470) - 0.0014,
                                                      lambda p: -(T(p) - 0.0300)))
    add('missile_cap', cap, 'chest', 'steel', 0.0014, mirror=True)
    # the pod: a chamfered block with four launch tubes bored into its front face
    pod = S.box(POD_C, POD_H, r=0.006)
    pod = S.chamfer_intersect(0.004, pod, S.plane(POD_C + np.array((0, POD_H[1], -POD_H[2])), S.norm((0, 0.62, -0.78))),
                              S.plane(POD_C + np.array((POD_H[0], 0, -POD_H[2])), S.norm((0.62, 0, -0.78))))
    for tx, ty in POD_TUBES:
        front = np.array((tx, ty, POD_C[2] + POD_H[2] + 0.01))
        pod = S.chamfer_subtract(0.0012, pod, S.cylinder(front, front + np.array((0, 0, -0.082)), 0.0165))
    ribs = lambda p: np.abs(np.mod(p[:, 2] + 0.150 + 0.008, 0.016) - 0.008) - 0.0016
    pod = S.chamfer_subtract(0.0008, pod, S.intersect(ribs, lambda p: POD_C[0] + POD_H[0] - 0.003 - p[:, 0],
                                                      lambda p: np.abs(p[:, 1] - POD_C[1]) - 0.030,
                                                      lambda p: np.abs(p[:, 2] - POD_C[2] + 0.012) - 0.034))
    add('missile_pod', pod, 'chest', 'gunmetal', 0.0012, mirror=True, lo=(0.08, 1.50, -0.24), hi=(0.22, 1.66, -0.06))
    # status strip along the outer top edge, and the warheads seated in the tubes
    strip = S.box(POD_C + np.array((0.0, POD_H[1] - 0.0005, -0.012)), (0.030, 0.0022, 0.0032), r=0.001)
    add('missile_pod_light', strip, 'chest', 'energy', 0.0010, mirror=True, angle=30.0,
        lo=(0.08, 1.50, -0.24), hi=(0.22, 1.66, -0.06))
    tips = S.union(*[S.round_cone(np.array((tx, ty, POD_C[2] + POD_H[2] - 0.050)),
                                  np.array((tx, ty, POD_C[2] + POD_H[2] - 0.012)), 0.0125, 0.0040) for tx, ty in POD_TUBES])
    add('missile_pod_tips', tips, 'chest', 'silver', 0.0010, mirror=True, angle=30.0,
        lo=(0.08, 1.50, -0.24), hi=(0.22, 1.66, -0.06))
    return parts
