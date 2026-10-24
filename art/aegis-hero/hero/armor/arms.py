"""Arm armour (left-authored, mirrored): layered deltoid armour, shoulder bridge, sleeve,
bicep/tricep plates, elbow cop, flared gauntlet with light channel, wrist cuff,
armoured hand with palm thruster, four segmented fingers and thumb.

T-pose: the arm runs along +x, palm down. In the unrolled limb frames theta = 0 is
the top of the arm (lateral when hanging), +90 the front, -90 the back, 180 the
underside (medial when hanging; left open for mobility).
"""
from __future__ import annotations

import numpy as np

from .. import sdf as S
from ..parts import Part
from .common import Limb, TOP, region

NONE = lambda p: -np.ones(len(p))


def build(L, F):
    A = F.arm
    J, E, E2, W = L['upper_arm.L'], L['forearm.L'], L['forearm.L.003'], L['hand.L']
    up = (0, 1, 0)
    UA = Limb(J, E, up, R=0.058)
    FA = Limb(E, W, up, R=0.050)
    parts: list[Part] = []
    box_sh = ((0.08, 1.33, -0.18), (0.42, 1.64, 0.14))
    box_ua = ((0.22, 1.36, -0.14), (0.53, 1.59, 0.09))
    box_fa = ((0.45, 1.37, -0.13), (0.79, 1.58, 0.09))

    def add(name, f, box, bone, mat, voxel=0.0018, angle=34.0):
        parts.append(Part(name, f, box[0], box[1], voxel, bone, mat, angle, True))

    # ------------------------------------------------------------ deltoid armour
    # Three overlapping lames that follow the deltoid and run into the upper arm (not a
    # ball joint): a broad cap whose point drops down the outside of the arm, a second
    # lame under it, and the bicep/tricep plates below.
    SH = F.shoulder
    DL = Limb(J, E, up, R=0.085)
    cap_mask = DL.region([(-0.055, -72), (-0.055, 72), (0.020, 112), (0.085, 92), (0.118, 0), (0.085, -92), (0.020, -112)])
    cap = S.chamfer_intersect(0.004, S.shell(SH, 0.010, 0.033), cap_mask,
                              S.plane(J + (0.045, 0.118, 0.0), S.norm((0.16, 0.987, 0.0))))      # flattened crown
    for sign in (1, -1):
        seam = DL.line([(-0.045, 34 * sign), (0.078, 50 * sign)])
        cap = S.chamfer_subtract(0.001, cap, S.intersect(lambda p, seam=seam: seam(p) - 0.0017,
                                                         lambda p: -(SH(p) - 0.0285)))
    add('deltoid_cap', cap, box_sh, 'shoulderpad.L', 'steel', 0.0016)
    mid_mask = DL.region([(0.060, -86), (0.060, 86), (0.132, 72), (0.178, 0), (0.132, -72)])
    mid = S.chamfer_intersect(0.0035, S.shell(SH, 0.006, 0.0215), mid_mask)
    add('deltoid_lame', mid, box_sh, 'upper_arm.L', 'gunmetal', 0.0016)
    edge = DL.line([(0.104, 60), (0.1265, 0), (0.104, -60)])
    add('deltoid_light', S.intersect(lambda p: edge(p) - 0.0020, S.shell(SH, 0.0195, 0.0232)), box_sh,
        'upper_arm.L', 'energy', 0.0011, 30.0)

    # ------------------------------------------------------------ shoulder bridge (clavicle)
    bridge = S.chamfer_intersect(0.0028, S.shell(F.shoulder, 0.003, 0.0155),
                                 region([(0.084, 0.074), (0.158, 0.080), (0.170, -0.086), (0.084, -0.090)], TOP),
                                 lambda p: 1.462 - p[:, 1],
                                 S.plane((0.12, 1.522, 0), (0.42, 0.91, 0)))
    add('shoulder_bridge', bridge, ((0.06, 1.42, -0.13), (0.2, 1.6, 0.12)), 'shoulder.L', 'titanium')

    # ------------------------------------------------------------ upper arm
    sleeve = S.chamfer_intersect(0.002, S.shell(A, 0.0015, 0.0090),
                                 UA.region([(0.090, -148), (0.272, -148), (0.272, 148), (0.090, 148)]))
    add('arm_sleeve', sleeve, box_ua, 'upper_arm.L', 'titanium')
    bicep = S.chamfer_intersect(0.003, S.shell(A, 0.0065, 0.0185),
                                UA.region([(0.168, -58), (0.250, -46), (0.272, 4), (0.250, 92), (0.126, 108), (0.126, 82), (0.168, 62)]),
                                S.plane(UA.point(0.18, 30, 0.072), (0.0, 0.62, 0.78)))
    add('bicep_plate', bicep, box_ua, 'upper_arm.L', 'steel')
    tricep = S.chamfer_intersect(0.003, S.shell(A, 0.005, 0.0160),
                                 UA.region([(0.136, -134), (0.258, -126), (0.262, -70), (0.136, -78)]))
    add('tricep_plate', tricep, box_ua, 'upper_arm.L', 'gunmetal')
    ua_light = S.intersect(lambda p: UA.line([(0.190, -62), (0.250, -56)])(p) - 0.0019, S.shell(A, 0.010, 0.0145))
    add('arm_light', ua_light, box_ua, 'upper_arm.L', 'energy', 0.0011, 30.0)

    # ------------------------------------------------------------ elbow
    cop_c = E + np.array((0.012, 0.0, -0.020))
    cop_d = S.ellipsoid(cop_c, (0.050, 0.054, 0.046))
    cop = S.chamfer_intersect(0.003, S.shell(cop_d, -0.011, 0.0), S.plane(cop_c + (0, 0, 0.012), (0, 0, 1)),
                              S.plane(cop_c + (0, 0, -0.042), (0, 0.0, -1)),
                              S.plane(cop_c + (0.0, 0.0, -0.030), (0.0, 0.62, -0.78)),
                              S.plane(cop_c + (0.0, 0.0, -0.030), (0.0, -0.62, -0.78)))
    add('elbow_cop', cop, ((0.42, 1.40, -0.10), (0.57, 1.55, 0.02)), 'forearm.L', 'steel', 0.0014)
    ring = S.chamfer_intersect(0.002, S.shell(A, 0.0015, 0.0085), lambda p: np.abs(p[:, 0] - (E[0] + 0.012)) - 0.026,
                               lambda p: p[:, 2] - (E[2] + 0.004))
    add('elbow_joint', ring, ((0.42, 1.40, -0.10), (0.57, 1.55, 0.04)), 'forearm.L', 'carbon', 0.0016)

    # ------------------------------------------------------------ gauntlet (forearm.003)
    def flare_shell(p):
        d = A(p)
        outer = 0.0115 + 0.0115 * np.clip((E[0] + 0.115 - p[:, 0]) / 0.085, 0.0, 1.0)
        inner = 0.0015
        return np.abs(d - (inner + outer) * 0.5) - (outer - inner) * 0.5
    g_base = S.chamfer_intersect(0.0028, flare_shell, FA.region([(0.030, -162), (0.252, -162), (0.252, 162), (0.030, 162)]))
    add('gauntlet', g_base, box_fa, 'forearm.L.003', 'titanium')

    def flare_outer(add_in, add_out):
        def f(p):
            d = A(p)
            base = 0.0115 * np.clip((E[0] + 0.115 - p[:, 0]) / 0.085, 0.0, 1.0)
            inner, outer = 0.0095 + base + add_in, 0.0195 + base + add_out
            return np.abs(d - (inner + outer) * 0.5) - (outer - inner) * 0.5
        return f
    g_top_mask = FA.region([(0.040, -54), (0.226, -40), (0.240, 0), (0.226, 40), (0.040, 54), (0.026, 0)])
    g_top = S.chamfer_intersect(0.003, flare_outer(0, 0), g_top_mask)
    chan = FA.line([(0.070, 0), (0.205, 0)])
    g_top = S.chamfer_subtract(0.0012, g_top, S.intersect(lambda p: chan(p) - 0.0035,
                                                          lambda p: -(flare_outer(0, 0)(p) + 0.0)))
    add('gauntlet_top', g_top, box_fa, 'forearm.L.003', 'steel')
    g_light = S.intersect(lambda p: chan(p) - 0.0024, flare_outer(0.0035, -0.0055))
    add('gauntlet_light', g_light, box_fa, 'forearm.L.003', 'energy', 0.0011, 30.0)
    g_front = S.chamfer_intersect(0.003, flare_outer(-0.002, -0.002),
                                  FA.region([(0.056, 64), (0.214, 70), (0.214, 124), (0.056, 130)]))
    add('gauntlet_front', g_front, box_fa, 'forearm.L.003', 'steel')
    g_back = S.chamfer_intersect(0.003, flare_outer(-0.002, -0.003),
                                 FA.region([(0.056, -130), (0.214, -124), (0.214, -70), (0.056, -64)]))
    add('gauntlet_back', g_back, box_fa, 'forearm.L.003', 'gunmetal')
    cuff = S.chamfer_intersect(0.002, S.shell(A, 0.0015, 0.0125), FA.band(0.232, 0.258))
    cuff = S.chamfer_subtract(0.0007, cuff, S.intersect(lambda p: np.abs(FA.coords(p)[0] - 0.245) - 0.0012,
                                                        lambda p: -(A(p) - 0.009)))
    add('wrist_cuff', cuff, ((0.70, 1.42, -0.08), (0.78, 1.53, 0.03)), 'forearm.L.003', 'gunmetal', 0.0013)

    # ------------------------------------------------------------ hand (palm.L)
    H = F.hand
    box_h = ((0.74, 1.43, -0.08), (0.89, 1.52, 0.06))
    back_poly = [(0.770, 0.034), (0.850, 0.040), (0.858, -0.062), (0.774, -0.054)]
    hb = S.chamfer_intersect(0.0022, S.shell(H, 0.0025, 0.0110), region(back_poly, TOP), lambda p: (W[1] - 0.004) - p[:, 1],
                             S.plane((0.81, W[1] + 0.024, 0), (0.22, 0.97, 0)))
    add('hand_back', hb, box_h, 'palm.L', 'steel', 0.0012)
    pc = np.array((0.812, 0.0, -0.008))
    radial = lambda p: np.sqrt((p[:, 0] - pc[0]) ** 2 + (p[:, 2] - pc[2]) ** 2)
    hp = S.chamfer_intersect(0.0018, S.shell(H, 0.0015, 0.0075), region(back_poly, TOP), lambda p: p[:, 1] - (W[1] - 0.004),
                             lambda p: 0.0225 - radial(p))
    add('hand_palm', hp, box_h, 'palm.L', 'titanium', 0.0012)
    housing = S.chamfer_intersect(0.0012, S.shell(H, 0.0015, 0.0105), lambda p: np.abs(radial(p) - 0.0188) - 0.0037,
                                  lambda p: p[:, 1] - (W[1] - 0.006))
    add('palm_housing', housing, box_h, 'palm.L', 'gunmetal', 0.0010)
    emitter = S.intersect(S.shell(H, 0.0020, 0.0060), lambda p: radial(p) - 0.0152, lambda p: p[:, 1] - (W[1] - 0.006))
    add('palm_emitter', emitter, box_h, 'palm.L', 'energy', 0.0010, 30.0)
    knuck = S.chamfer_intersect(0.0018, S.shell(H, 0.0040, 0.0125), lambda p: np.abs(p[:, 0] - 0.861) - 0.0105,
                                lambda p: (W[1] - 0.002) - p[:, 1], lambda p: np.abs(p[:, 2] + 0.011) - 0.050)
    add('knuckles', knuck, box_h, 'palm.L', 'gunmetal', 0.0011)

    # ------------------------------------------------------------ fingers + thumb
    # sideways only: the pinky shares the ring finger's bones, so its knuckles must lie
    # on the same hinge lines or the segments separate when the hand makes a fist
    pinky = np.array((0.0, 0.0, -0.0235))
    chains = [('index', 'f_index', None), ('middle', 'f_middle', None), ('ring', 'f_ring', None),
              ('pinky', 'f_ring', pinky), ('thumb', 'thumb', None)]
    for label, bone_base, off in chains:
        for i in (1, 2, 3):
            bone = f'{bone_base}.0{i}.L'
            a, b = L[bone], L.tail(bone)
            if off is not None:
                a = a + off * (1 + 0.15 * (i - 1)) + np.array((-0.004 * (i - 1), 0, 0))
                b = b + off * (1 + 0.15 * i) + np.array((-0.004 * i, 0, 0))
            r = (0.0102 if label == 'thumb' else 0.0082) - 0.0006 * i
            seg = S.capsule(a, b, r)
            ax = S.norm(b - a)
            ln = float(np.linalg.norm(b - a))
            t = lambda p, a=a, ax=ax: (p - a) @ ax
            band = lambda p, t=t, ln=ln: np.abs(t(p) - ln * 0.5) - (ln * 0.5 - 0.0012)
            shellf = S.chamfer_intersect(0.0012, S.shell(seg, 0.0010, 0.0034), band)
            lo = np.minimum(a, b) - 0.02
            hi = np.maximum(a, b) + 0.02
            add(f'finger_{label}_{i}', shellf, (tuple(lo), tuple(hi)), bone, 'titanium', 0.0007)
            if i < 3:
                top = ((lambda p, a=a: (a[2] + 0.004) - p[:, 2]) if label == 'thumb' else
                       (lambda p, a=a: (a[1] - 0.001) - p[:, 1]))
                topf = S.chamfer_intersect(0.0010, S.shell(seg, 0.0028, 0.0052), band, top)
                add(f'finger_{label}_{i}_plate', topf, (tuple(lo), tuple(hi)), bone, 'gunmetal', 0.0007)
    return parts
