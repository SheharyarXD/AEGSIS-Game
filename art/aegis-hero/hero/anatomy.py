"""Heroic 185 cm male body field in the T-pose bind space.

Authoring space (glTF): x = character's left, y = up, z = forward. Units: metres.
The body is left-half authored and mirrored. It doubles as the undersuit surface and
as the reference surface every armour plate is offset from, so plates follow real
musculature (pecs, lats, deltoids, quads, calves) instead of primitive volumes.
"""
from __future__ import annotations

import numpy as np

from . import sdf as S


class Landmarks:
    """Convenience accessor for bone heads (authoring space)."""

    def __init__(self, raw: dict):
        self.raw = raw

    def __getitem__(self, k):
        return np.asarray(self.raw[k], np.float64)

    def tail(self, k):
        return np.asarray(self.raw[k + ':tail'], np.float64)


def torso_field(L: Landmarks) -> S.SDF:
    E = S.ellipsoid
    k = 0.032
    parts = [
        E((0, 0.952, -0.008), (0.152, 0.100, 0.108)),           # pelvis
        E((0, 1.045, 0.004), (0.120, 0.105, 0.096)),            # lower abdomen
        E((0, 1.125, 0.000), (0.108, 0.085, 0.088)),            # waist
        E((0, 1.290, -0.008), (0.172, 0.190, 0.118)),           # rib cage
        E((0, 1.410, -0.008), (0.192, 0.088, 0.108)),           # upper chest
        E((0.076, 1.372, 0.062), (0.100, 0.072, 0.046), S.frame((0, 0, 1), x_hint=(1, -0.18, 0))),  # pec
        E((0.136, 1.295, -0.034), (0.072, 0.150, 0.090)),       # lat
        E((0.086, 1.372, -0.074), (0.084, 0.108, 0.048)),       # scapula
        E((0.034, 1.120, -0.068), (0.040, 0.150, 0.040)),       # erector
        E((0.070, 0.905, -0.052), (0.078, 0.088, 0.064)),       # glute
        E((0.100, 1.058, 0.002), (0.046, 0.098, 0.076)),        # oblique
        S.round_cone((0.030, 1.530, -0.030), (0.150, 1.478, -0.030), 0.058, 0.050),  # trapezius
        S.round_cone((0, 1.500, -0.010), (0, 1.672, 0.002), 0.069, 0.061),          # neck
        E((0, 1.752, 0.016), (0.084, 0.108, 0.098)),            # head (under helmet)
    ]
    return S.smooth_union(k, *parts)


def arm_field(L: Landmarks) -> S.SDF:
    sh = L['upper_arm.L']
    el = L['forearm.L']
    wr = L['hand.L']
    y, z = sh[1], sh[2]
    E = S.ellipsoid
    parts = [
        E((sh[0] + 0.010, y + 0.018, z + 0.002), (0.100, 0.088, 0.090)),            # deltoid
        S.round_cone(sh, el, 0.062, 0.047),
        E(((sh[0] + el[0]) * 0.5 - 0.005, y - 0.014, z + 0.016), (0.105, 0.056, 0.054)),  # biceps
        E(((sh[0] + el[0]) * 0.5 - 0.015, y + 0.012, z - 0.024), (0.115, 0.054, 0.052)),  # triceps
        S.sphere(el + (0.0, 0.0, -0.004), 0.043),
        S.round_cone(el, wr, 0.052, 0.034),
        E((el[0] + 0.075, y - 0.006, z + 0.006), (0.095, 0.050, 0.056)),            # forearm flexors
    ]
    return S.smooth_union(0.024, *parts)


def hand_field(L: Landmarks) -> S.SDF:
    wr = L['hand.L']
    parts = [S.box((wr[0] + 0.050, wr[1] - 0.002, wr[2] + 0.014), (0.050, 0.016, 0.044), r=0.012)]
    for f in ('f_index', 'f_middle', 'f_ring'):
        for i in (1, 2, 3):
            a = L[f'{f}.0{i}.L']
            b = L.tail(f'{f}.0{i}.L')
            parts.append(S.capsule(a, b, 0.0082 - 0.0006 * i))
    # pinky on the ring chain, offset back (-z) and slightly shorter
    off = np.array((-0.006, -0.002, -0.0235))
    for i in (1, 2, 3):
        a = L[f'f_ring.0{i}.L'] + off * (1 + 0.15 * (i - 1)) + np.array((-0.004 * (i - 1), 0, 0))
        b = L.tail(f'f_ring.0{i}.L') + off * (1 + 0.15 * i) + np.array((-0.004 * i, 0, 0))
        parts.append(S.capsule(a, b, 0.0082 - 0.0006 * i))
    for i in (1, 2, 3):
        a = L[f'thumb.0{i}.L']
        b = L.tail(f'thumb.0{i}.L') if i < 3 else L.tail('thumb.03.L')
        parts.append(S.capsule(a, b, 0.0102 - 0.0006 * i))
    return S.smooth_union(0.008, *parts)


def leg_field(L: Landmarks) -> S.SDF:
    hip = L['thigh.L']
    kn = L['knee.L']
    sh = L['shin.L']
    an = L['foot.L']
    E = S.ellipsoid
    x = kn[0]
    parts = [
        S.round_cone(hip + (0.004, 0, 0), kn, 0.092, 0.060),
        E((x + 0.002, 0.745, 0.032), (0.074, 0.180, 0.076)),  # quadriceps
        E((x, 0.765, -0.036), (0.070, 0.155, 0.068)),          # hamstring
        E((0.058, 0.820, -0.002), (0.050, 0.120, 0.058)),      # adductor
        S.sphere(kn + (0, -0.012, 0.012), 0.052),
        E((x, 0.372, -0.032), (0.058, 0.115, 0.064)),          # calf
        S.round_cone(sh, an, 0.049, 0.035),
        S.sphere(an, 0.037),
    ]
    return S.smooth_union(0.026, *parts)


def body_field(L: Landmarks) -> S.SDF:
    left = S.smooth_union(0.03, torso_field(L), arm_field(L), leg_field(L))
    left = S.smooth_union(0.012, left, hand_field(L))
    return S.mirror_x(left)


class Fields:
    """Region reference fields for armour (cheaper than the whole body)."""

    def __init__(self, L: Landmarks):
        self.torso = S.mirror_x(torso_field(L))
        self.arm = arm_field(L)            # left arm (parts are left-authored and mirrored)
        self.hand = hand_field(L)
        self.leg = leg_field(L)
        self.shoulder = S.mirror_x(S.smooth_union(0.03, torso_field(L), arm_field(L)))
