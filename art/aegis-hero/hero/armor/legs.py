"""Leg armour (left-authored, mirrored): thigh under-shell, ridged steel thigh plate,
outer thigh plate with light channel, hamstring plate, layered knee cap (knee bone =
the half-angle joint), sculpted shin guard, calf shell, armoured boot with toe cap,
ankle discs, rubber sole and sole thrusters.

Unrolled frames: theta = 0 front, +90 lateral (outer), -90 medial, 180 back.
"""
from __future__ import annotations

import numpy as np

from .. import sdf as S
from ..parts import Part
from .common import Limb, SIDE, region

NONE = lambda p: -np.ones(len(p))


def boot_field(L):
    A = L['foot.L']
    T0 = L['toe.L']
    x = A[0]
    parts = [
        S.round_cone(A + (0, 0.115, 0.004), A + (0, 0.010, -0.004), 0.050, 0.047),   # ankle cuff
        S.ellipsoid((x, 0.050, A[2] - 0.040), (0.046, 0.050, 0.052)),               # heel
        S.box((x + 0.002, 0.040, A[2] + 0.075), (0.048, 0.040, 0.078), r=0.030),     # mid foot
        S.box((x + 0.004, 0.030, T0[2] + 0.040), (0.046, 0.030, 0.042), r=0.024),    # toe box
    ]
    f = S.smooth_union(0.03, *parts)
    f = S.intersect(f, lambda p: -p[:, 1])                      # flat sole at y = 0
    f = S.intersect(f, S.plane((x, 0.06, T0[2] + 0.07), (0, 0.55, 0.835)))  # sloped toe top
    return f


def build(L, F):
    G = F.leg
    H, K, Sh, A, T0 = L['thigh.L'], L['knee.L'], L['shin.L'], L['foot.L'], L['toe.L']
    front, lateral = (0, 0, 1), (1, 0, 0)
    TH = Limb(H, K, front, lateral, R=0.085)
    THb = Limb(H, K, (0, 0, -1), lateral, R=0.085)     # back frame (seam at the front)
    SN = Limb(Sh, A, front, lateral, R=0.056)
    SNb = Limb(Sh, A, (0, 0, -1), lateral, R=0.056)
    parts: list[Part] = []
    box_th = ((-0.04, 0.50, -0.16), (0.27, 0.98, 0.17))
    box_sn = ((-0.02, 0.06, -0.14), (0.22, 0.56, 0.13))

    def add(name, f, box, bone, mat, voxel=0.0018, angle=34.0):
        parts.append(Part(name, f, box[0], box[1], voxel, bone, mat, angle, True))

    # ------------------------------------------------------------ thigh
    under = S.chamfer_intersect(0.002, S.shell(G, 0.0015, 0.0095),
                                TH.region([(0.075, -118), (0.372, -118), (0.372, 168), (0.075, 168)]))
    add('thigh_under', under, box_th, 'thigh.L', 'titanium')
    ridge = [S.plane(TH.point(0.2, 0, 0.1300), S.norm((0.30, 0.0, 0.954))),
             S.plane(TH.point(0.2, 0, 0.1300), S.norm((-0.30, 0.0, 0.954))),
             S.plane(TH.point(0.37, 0, 0.100), S.norm((0.0, -0.55, 0.835)))]
    tf_mask = TH.region([(0.120, -62), (0.200, -76), (0.335, -56), (0.372, 0), (0.335, 62), (0.190, 84), (0.110, 58),
                         (0.096, 0)])
    tfront = S.chamfer_intersect(0.0035, S.shell(G, 0.0060, 0.0245), tf_mask, *ridge)
    # panel seam across the plate
    seam = TH.line([(0.235, -70), (0.262, 0), (0.235, 80)])
    tfront = S.chamfer_subtract(0.001, tfront, S.intersect(lambda p: seam(p) - 0.0016, lambda p: -(G(p) - 0.0200)))
    hip_guard = S.chamfer_intersect(0.003, S.shell(G, 0.006, 0.0175),
                                    TH.region([(0.020, 30), (0.100, 22), (0.150, 70), (0.130, 128), (0.030, 120)]),
                                    S.plane(TH.point(0.08, 80, 0.122), S.norm((0.95, 0.0, 0.30))))
    add('hip_guard', hip_guard, box_th, 'thigh.L', 'steel', 0.0016)
    add('thigh_front', tfront, box_th, 'thigh.L', 'steel', 0.0016)
    tout_mask = TH.region([(0.170, 92), (0.325, 70), (0.305, 140), (0.165, 146)])
    tout = S.chamfer_intersect(0.003, S.shell(G, 0.005, 0.0165), tout_mask)
    chan = TH.line([(0.190, 118), (0.295, 104)])
    tout = S.chamfer_subtract(0.0012, tout, S.intersect(lambda p: chan(p) - 0.0034, lambda p: -(G(p) - 0.0135)))
    add('thigh_outer', tout, box_th, 'thigh.L', 'gunmetal')
    add('thigh_light', S.intersect(lambda p: chan(p) - 0.0023, S.shell(G, 0.0085, 0.0125)), box_th, 'thigh.L', 'energy',
        0.0011, 30.0)
    hams = S.chamfer_intersect(0.003, S.shell(G, 0.004, 0.0165),
                               THb.region([(0.120, -50), (0.335, -40), (0.350, 0), (0.335, 38), (0.120, 48)]))
    add('thigh_back', hams, box_th, 'thigh.L', 'titanium')

    # ------------------------------------------------------------ knee (half-angle bone)
    kc = K + np.array((0.0, -0.010, 0.040))
    kd = S.ellipsoid(kc, (0.056, 0.072, 0.050))
    kfac = [S.plane(kc + (0, 0, 0.044), S.norm((0.42, 0.0, 0.91))), S.plane(kc + (0, 0, 0.044), S.norm((-0.42, 0.0, 0.91))),
            S.plane(kc + (0, 0.050, 0.030), S.norm((0, 0.70, 0.71))), S.plane(kc + (0, -0.050, 0.030), S.norm((0, -0.70, 0.71)))]
    kcap = S.chamfer_intersect(0.003, S.shell(kd, -0.012, 0.0), S.plane(kc + (0, 0, -0.016), (0, 0, -1)), *kfac)
    kcap = S.chamfer_subtract(0.001, kcap, S.intersect(
        region([(0.0, 0.024), (0.016, 0.0), (0.0, -0.024), (-0.016, 0.0)], np.eye(3), (kc[0], kc[1], 0)),
        lambda p: -(kd(p) + 0.006)))
    add('knee_cap', kcap, ((0.0, 0.42, -0.04), (0.2, 0.62, 0.13)), 'knee.L', 'steel', 0.0014)
    kgem = S.intersect(region([(0.0, 0.0175), (0.0115, 0.0), (0.0, -0.0175), (-0.0115, 0.0)], np.eye(3), (kc[0], kc[1], 0)),
                       S.shell(kd, -0.0068, -0.0040), S.plane(kc + (0, 0, 0.01), (0, 0, -1)))
    add('knee_light', kgem, ((0.0, 0.42, -0.04), (0.2, 0.62, 0.13)), 'knee.L', 'energy', 0.0010, 30.0)
    kside = S.chamfer_intersect(0.0025, S.shell(G, 0.003, 0.0135), lambda p: np.abs(p[:, 1] - K[1]) - 0.042,
                                lambda p: p[:, 2] - (K[2] + 0.025), lambda p: (K[2] - 0.035) - p[:, 2])
    add('knee_joint', kside, ((-0.02, 0.44, -0.06), (0.22, 0.60, 0.08)), 'knee.L', 'gunmetal', 0.0016)

    # ------------------------------------------------------------ shin
    sridge = [S.plane(SN.point(0.18, 0, 0.066), S.norm((0.34, 0.0, 0.94))),
              S.plane(SN.point(0.18, 0, 0.066), S.norm((-0.34, 0.0, 0.94)))]
    sg_mask = SN.region([(0.020, -62), (0.050, -74), (0.300, -58), (0.345, -20), (0.352, 0), (0.345, 26),
                         (0.300, 66), (0.050, 82), (0.020, 70), (0.004, 0)])
    def shin_shell(p):
        d = G(p)
        t = SN.coords(p)[0]
        outer = 0.0215 - 0.008 * np.clip(t / 0.35, 0, 1)      # tapers towards the ankle
        return np.abs(d - (0.0055 + outer) * 0.5) - (outer - 0.0055) * 0.5
    sguard = S.chamfer_intersect(0.003, shin_shell, sg_mask, *sridge)
    schan = SN.line([(0.070, 64), (0.290, 52)])
    sguard = S.chamfer_subtract(0.0012, sguard, S.intersect(lambda p: schan(p) - 0.0032, lambda p: -(G(p) - 0.0125)))
    add('shin_guard', sguard, box_sn, 'shin.L', 'steel', 0.0016)
    add('shin_light', S.intersect(lambda p: schan(p) - 0.0021, S.shell(G, 0.0085, 0.0118)), box_sn, 'shin.L', 'energy',
        0.0011, 30.0)
    calf = S.chamfer_intersect(0.003, S.shell(G, 0.003, 0.0150),
                               SNb.region([(0.060, -92), (0.300, -84), (0.320, 0), (0.300, 84), (0.060, 92), (0.040, 0)]))
    add('calf', calf, box_sn, 'shin.L', 'titanium')
    calf_plate = S.chamfer_intersect(0.003, S.shell(G, 0.010, 0.0215),
                                     SNb.region([(0.080, -40), (0.230, -32), (0.250, 0), (0.230, 32), (0.080, 40)]))
    add('calf_plate', calf_plate, box_sn, 'shin.L', 'gunmetal')

    # ------------------------------------------------------------ boot (foot / toe)
    Bf = boot_field(L)
    box_b = ((0.02, -0.01, -0.12), (0.19, 0.24, 0.27))
    toe_split = S.plane((0, 0, T0[2] + 0.006), (0, 0, 1))         # keep z < split (foot bone)
    upper = S.chamfer_intersect(0.003, S.shell(Bf, -0.012, 0.0), lambda p: 0.024 - p[:, 1],
                                toe_split, lambda p: p[:, 1] - 0.215)
    add('boot', upper, box_b, 'foot.L', 'titanium', 0.0016)
    toe = S.chamfer_intersect(0.003, S.shell(Bf, -0.012, 0.0), lambda p: 0.024 - p[:, 1],
                              lambda p: -toe_split(p) + 0.003)
    add('boot_toe', toe, box_b, 'toe.L', 'titanium', 0.0016)
    # steel armour over the boot: instep/shin flare and toe cap
    instep = S.chamfer_intersect(0.003, S.shell(Bf, -0.003, 0.0085),
                                 region([(A[2] + 0.030, 0.205), (A[2] + 0.050, 0.120), (T0[2] - 0.004, 0.060),
                                         (T0[2] - 0.004, 0.030), (A[2] + 0.010, 0.030), (A[2] - 0.006, 0.120)], SIDE),
                                 lambda p: np.abs(p[:, 0] - A[0]) - 0.046)
    add('boot_instep', instep, box_b, 'foot.L', 'steel', 0.0016)
    tcap = S.chamfer_intersect(0.003, S.shell(Bf, -0.003, 0.0085), lambda p: (T0[2] + 0.012) - p[:, 2],
                               lambda p: 0.032 - p[:, 1], S.plane((A[0], 0.06, T0[2] + 0.05), (0, 0.6, 0.8)))
    add('boot_toecap', tcap, box_b, 'toe.L', 'steel', 0.0016)
    heel = S.chamfer_intersect(0.003, S.shell(Bf, -0.003, 0.0080), lambda p: p[:, 2] - (A[2] - 0.035),
                               lambda p: p[:, 1] - 0.140, lambda p: 0.030 - p[:, 1])
    add('boot_heel', heel, box_b, 'foot.L', 'gunmetal', 0.0016)
    ankle_c = A + np.array((0.0, 0.0, 0.0))
    disc = S.chamfer_intersect(0.002, S.cylinder(ankle_c - (0.0, 0, 0), ankle_c + (0.09, 0, 0), 0.026),
                               S.shell(Bf, -0.004, 0.0065), lambda p: A[0] - p[:, 0])
    add('ankle_disc', disc, box_b, 'foot.L', 'silver', 0.0012)
    # sole thruster: recessed emitter under the arch
    sc = np.array((A[0], 0.0, A[2] + 0.050))
    rad = lambda p: np.sqrt((p[:, 0] - sc[0]) ** 2 + (p[:, 2] - sc[2]) ** 2)
    sole = S.chamfer_intersect(0.002, S.shell(Bf, -0.010, 0.0015), lambda p: p[:, 1] - 0.022)
    sole = S.chamfer_subtract(0.0012, sole, S.intersect(lambda p: rad(p) - 0.0215, lambda p: p[:, 1] - 0.006))
    add('sole', S.intersect(sole, toe_split), box_b, 'foot.L', 'rubber', 0.0016)
    add('sole_toe', S.intersect(sole, lambda p: -toe_split(p)), box_b, 'toe.L', 'rubber', 0.0016)
    emit = S.intersect(lambda p: rad(p) - 0.0185, lambda p: np.abs(p[:, 1] - 0.0080) - 0.0018)
    add('sole_emitter', emit, box_b, 'foot.L', 'energy', 0.0010, 30.0)
    return parts
