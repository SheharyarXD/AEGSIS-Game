"""AEGIS helmet.

Construction (authoring space, metres):
  core      titanium-black skull. A flat-sided rounded box/ellipsoid blend cut by facet
            planes into an aggressive wedge: vertical central prow, brow sloping back
            above the visor, face sloping back below it (beak profile), jaw tapering
            to a narrow chin, angular crown and rear ridge, open neck.
  visor     shallow chevron slit wrapping to the temples, glass recessed 6.5 mm.
  overlays  layered plates: steel brow, steel face plates either side of a black nose
            ridge, silver mouth guard with slats, steel crest fin, gunmetal temple /
            cheek / rear shells, comm modules with energy rings, side light channels.
"""
from __future__ import annotations

import numpy as np

from .. import sdf as S
from ..parts import Part
from .common import FRONT, SIDE, TOP, mirror_pts, region, front_only, back_only

C = np.array((0.0, 1.752, 0.016))
BONE = 'head.001'
HELMET_DROP = 0.025
NONE = lambda p: -np.ones(len(p))


def P(x, y, z):
    return C + np.array((x, y, z))


def _planes(spec):
    out = []
    for point, n in spec:
        point, n = np.asarray(point, float), np.asarray(n, float)
        out.append(S.plane(point, n))
        if abs(n[0]) > 1e-9 or abs(point[0]) > 1e-9:
            out.append(S.plane(point * (-1, 1, 1), n * (-1, 1, 1)))
    return out


FACETS = _planes([
    (P(0, 0, 0.122), (0.45, 0.0, 0.893)),          # central prow
    (P(0, 0.030, 0.118), (0.0, 0.55, 0.835)),      # brow slopes back above the visor
    (P(0, 0.0, 0.122), (0.0, -0.42, 0.907)),       # face slopes back below the visor
    (P(0.100, -0.010, 0.0), (0.80, -0.52, 0.30)),  # jaw taper (narrow chin, wide nape)
    (P(0, -0.118, 0.060), (0.0, -0.80, 0.60)),     # chin underside
    (P(0, -0.122, 0.0), (0.0, -1.0, 0.0)),         # floor
    (P(0.070, 0.124, 0.0), (0.55, 0.835, 0.0)),    # crown corners
    (P(0, 0.112, 0.070), (0.0, 0.72, 0.69)),       # crown front bevel
    (P(0, 0.020, -0.112), (0.42, 0.30, -0.857)),   # rear ridge (upper)
    (P(0, -0.060, -0.104), (0.30, -0.45, -0.842)),  # nape sweeps under
    (P(0.072, -0.040, 0.075), (0.78, -0.18, 0.60)),  # cheek facet
])

# Two slanted lenses joined by a thin bridge: thin at the nose, tall at the outer corner.
VISOR_LEFT = [(0.0, 1.7585), (0.020, 1.7600), (0.050, 1.7740), (0.078, 1.7900), (0.090, 1.7935),
              (0.098, 1.7860), (0.094, 1.7700), (0.070, 1.7600), (0.040, 1.7525), (0.018, 1.7500), (0.0, 1.7500)]
# a line running through the middle of the visor; brow/face outlines end on it and are
# then trimmed back by `visor_clear`, which leaves an even gap around the lens
VISOR_MID = [(0.020, 1.7550), (0.050, 1.7630), (0.080, 1.7760), (0.097, 1.7800)]


def skull_ref() -> S.SDF:
    base = S.smooth_intersect(
        0.02,
        S.ellipsoid(P(0, 0.004, -0.004), (0.118, 0.136, 0.132)),
        S.box(P(0, 0.002, 0.010), (0.101, 0.124, 0.110), r=0.05),
        S.ellipsoid(P(0, 0.010, 0.012), (0.112, 0.130, 0.128)))
    return S.chamfer_intersect(0.003, base, *FACETS)


def visor_mask() -> S.SDF:
    return S.intersect(region(mirror_pts(VISOR_LEFT)), front_only(C[2] + 0.02))


def side_path() -> S.SDF:
    """Light channel from the visor tip back to the comm module (side view: (z, y))."""
    return S.stroke((0, 0, 0), SIDE, [(0.056, 1.7840), (0.020, 1.7760), (-0.006, 1.7620)], 0.0)


def build(L, body):
    ref = skull_ref()
    vm = visor_mask()
    shell = lambda a, b: S.shell(ref, a, b)

    # ---------------------------------------------------------------- core
    core = S.chamfer_subtract(0.0018, ref, lambda p: np.maximum(vm(p), -(ref(p) + 0.0065)))
    core = S.subtract(core, S.round_cone((0, 1.570, 0.004), (0, 1.700, 0.010), 0.071, 0.064))
    core = S.subtract(core, S.intersect(S.offset(ref, -0.010), lambda p: 1.70 - p[:, 1]))
    sp = side_path()
    side_band = S.intersect(lambda p: np.abs(sp(p)) - 0.0028, lambda p: 0.07 - np.abs(p[:, 0]))
    core = S.chamfer_subtract(0.001, core, S.intersect(side_band, lambda p: -(ref(p) + 0.0035)))
    # rear vents between the rear shells
    vents = S.intersect(lambda p: np.abs(np.mod(p[:, 1] + 0.0045, 0.009) - 0.0045) - 0.0017,
                        lambda p: np.abs(p[:, 0]) - 0.013, lambda p: p[:, 1] - 1.83, lambda p: 1.68 - p[:, 1],
                        back_only(C[2] - 0.06))
    core = S.chamfer_subtract(0.0008, core, S.intersect(vents, lambda p: -(ref(p) + 0.003)))
    parts = [Part('helmet_core', core, (-0.12, 1.60, -0.13), (0.12, 1.90, 0.15), 0.0014, BONE, 'titanium', 32.0)]

    # ---------------------------------------------------------------- emitters
    glass = S.intersect(S.offset(vm, 0.0012), shell(-0.0095, -0.0058))
    parts.append(Part('helmet_visor', glass, (-0.11, 1.74, 0.0), (0.11, 1.81, 0.15), 0.0010, BONE, 'visor', 30.0))
    strip = S.intersect(lambda p: np.abs(sp(p)) - 0.0017, lambda p: 0.07 - np.abs(p[:, 0]), shell(-0.0045, -0.002))
    parts.append(Part('helmet_sidelight', strip, (-0.12, 1.74, -0.04), (0.12, 1.80, 0.10), 0.0010, BONE, 'energy', 30.0))

    # ---------------------------------------------------------------- overlays
    visor_clear = S.subtract(NONE, S.offset(vm, 0.0025))
    brow_left = [(0, 1.7545)] + VISOR_MID + [(0.108, 1.800), (0.106, 1.814), (0.080, 1.826), (0.040, 1.830), (0, 1.834)]
    brow = S.chamfer_intersect(0.002, shell(-0.004, 0.0042), region(mirror_pts(brow_left)),
                               front_only(C[2] - 0.005), visor_clear)
    parts.append(Part('helmet_brow', brow, (-0.12, 1.76, -0.02), (0.12, 1.85, 0.15), 0.0014, BONE, 'steel', 32.0))

    face_left = [(0.011, 1.7545)] + VISOR_MID + [(0.101, 1.7650), (0.098, 1.7450), (0.078, 1.7080), (0.040, 1.7000),
                                                 (0.020, 1.7080), (0.011, 1.7180)]
    face = S.mirror_x(S.chamfer_intersect(0.0022, shell(-0.004, 0.0055), region(face_left), front_only(C[2] + 0.02),
                                          visor_clear))
    parts.append(Part('helmet_face', face, (-0.11, 1.69, 0.02), (0.11, 1.78, 0.15), 0.0014, BONE, 'steel', 32.0))

    mouth_left = [(0, 1.7360), (0.008, 1.7330), (0.030, 1.7040), (0.026, 1.6720), (0.010, 1.6420), (0, 1.6380)]
    mouth = S.chamfer_intersect(0.0018, shell(-0.004, 0.0060), region(mirror_pts(mouth_left)), front_only(C[2] + 0.04))
    slats = S.intersect(lambda p: np.abs(np.mod(p[:, 1] + 0.0035, 0.0072) - 0.0036) - 0.0012,
                        lambda p: np.abs(p[:, 0]) - 0.019, lambda p: p[:, 1] - 1.700, lambda p: 1.652 - p[:, 1])
    mouth = S.chamfer_subtract(0.0006, mouth, S.intersect(slats, lambda p: -(ref(p) - 0.003)))
    parts.append(Part('helmet_mouth', mouth, (-0.04, 1.62, 0.04), (0.04, 1.75, 0.16), 0.0010, BONE, 'silver', 32.0))

    crest = S.chamfer_intersect(
        0.002, shell(-0.004, 0.0065),
        region([(-0.011, 0.118), (0.011, 0.118), (0.015, -0.02), (0.008, -0.112), (-0.008, -0.112), (-0.015, -0.02)], TOP),
        lambda p: 1.832 - p[:, 1], lambda p: -0.085 - p[:, 2])
    parts.append(Part('helmet_crest', crest, (-0.03, 1.80, -0.12), (0.03, 1.90, 0.14), 0.0012, BONE, 'steel', 32.0))

    temple_side = [(0.050, 1.836), (0.072, 1.800), (0.030, 1.783), (-0.025, 1.772), (-0.078, 1.796),
                   (-0.074, 1.846), (0.000, 1.866)]
    temple = S.chamfer_intersect(0.0022, shell(-0.004, 0.0045), region(temple_side, SIDE),
                                 lambda p: 0.052 - np.abs(p[:, 0]), visor_clear)
    parts.append(Part('helmet_temples', temple, (-0.12, 1.76, -0.10), (0.12, 1.88, 0.10), 0.0014, BONE, 'gunmetal', 32.0))

    cheek_side = [(0.070, 1.772), (0.022, 1.760), (-0.034, 1.738), (-0.044, 1.690), (-0.010, 1.662),
                  (0.040, 1.672), (0.074, 1.725)]
    cheek = S.chamfer_intersect(0.0022, shell(-0.004, 0.0032), region(cheek_side, SIDE),
                                lambda p: 0.045 - np.abs(p[:, 0]), visor_clear)
    parts.append(Part('helmet_cheeks', cheek, (-0.12, 1.62, -0.06), (0.12, 1.78, 0.12), 0.0014, BONE, 'gunmetal', 32.0))

    rear_side = [(-0.030, 1.868), (-0.094, 1.832), (-0.122, 1.760), (-0.116, 1.690), (-0.080, 1.648),
                 (-0.056, 1.700), (-0.050, 1.790)]
    rear = S.chamfer_intersect(0.0022, shell(-0.004, 0.0048), region(rear_side, SIDE),
                               lambda p: 0.017 - np.abs(p[:, 0]))
    parts.append(Part('helmet_rear', rear, (-0.12, 1.62, -0.14), (0.12, 1.88, 0.0), 0.0014, BONE, 'gunmetal', 32.0))

    # comm modules (left/right) with energy rings
    ey, ez = 1.742, -0.022
    disc = S.mirror_x(S.cylinder((0.06, ey, ez), (0.13, ey, ez), 0.021))
    ring_d = lambda p: np.abs(np.sqrt((p[:, 1] - ey) ** 2 + (p[:, 2] - ez) ** 2) - 0.0135)
    ear = S.chamfer_intersect(0.002, disc, shell(-0.004, 0.0055))
    ear = S.chamfer_subtract(0.001, ear, lambda p: np.maximum(ring_d(p) - 0.0021, -(ref(p) - 0.0026)))
    parts.append(Part('helmet_ears', ear, (-0.12, 1.71, -0.055), (0.12, 1.775, 0.01), 0.0010, BONE, 'gunmetal', 32.0))
    ring = S.intersect(lambda p: ring_d(p) - 0.0014, disc, shell(0.0012, 0.0034))
    parts.append(Part('helmet_earlight', ring, (-0.12, 1.71, -0.055), (0.12, 1.775, 0.01), 0.0010, BONE, 'energy', 30.0))
    # the helmet is authored around a head centre at y = 1.752; the rig carries the
    # head HELMET_DROP lower (shorter neck), so every part is shifted as one piece
    dropped = []
    for part in parts:
        f = part.field
        dropped.append(Part(part.name, (lambda f: lambda p: f(p + (0.0, HELMET_DROP, 0.0)))(f),
                            (part.lo[0], part.lo[1] - HELMET_DROP, part.lo[2]),
                            (part.hi[0], part.hi[1] - HELMET_DROP, part.hi[2]),
                            part.voxel, part.bone, part.material, part.smooth_angle, part.mirror))
    return dropped
