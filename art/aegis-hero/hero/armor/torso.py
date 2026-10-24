"""Front torso armour: pectoral plates, sternum + AEGIS emblem, rib plates, segmented
abdominal plates, obliques, belt, pelvic plate, hip plates, gorget.

Bones: chest (pecs, sternum, emblem, upper ribs, gorget), spine2 (upper abs, lower
ribs), spine1 (lower abs, obliques), hips (belt, pelvis, hip plates).
All outlines are front-view (x, y) polygons; left-authored parts are mirrored.
"""
from __future__ import annotations

import numpy as np

from .. import sdf as S
from ..parts import Part
from .common import mirror_pts, region, front_only

NONE = lambda p: -np.ones(len(p))


def tri(apex, half_w, base_y):
    return [(0.0, apex), (half_w, base_y), (-half_w, base_y)]


def inset_poly(pts, d):
    """Inset a convex polygon (CCW or CW) by distance d (via the polygon SDF)."""
    return pts  # outlines below are authored explicitly


def build(L, F):
    T = F.torso
    parts: list[Part] = []
    box_chest = ((-0.22, 1.18, -0.02), (0.22, 1.56, 0.21))

    def plate(name, mask, inner, outer, bone, mat, bevel=0.003, facets=(), voxel=0.0018,
              lo=box_chest[0], hi=box_chest[1], mirror=False, angle=34.0, ref=T):
        f = S.chamfer_intersect(bevel, S.shell(ref, inner, outer), mask, *facets)
        parts.append(Part(name, f, lo, hi, voxel, bone, mat, angle, mirror))
        return f

    # ------------------------------------------------------------ AEGIS emblem geometry
    APEX, BASE, HW = 1.432, 1.342, 0.046
    emblem_outer = region(tri(APEX, HW, BASE))
    emblem_inner = region(tri(APEX - 0.022, HW - 0.0215, BASE + 0.0105))
    glyph_outer = region(tri(APEX - 0.0085, HW - 0.0085, BASE + 0.004))
    glyph_inner = region(tri(APEX - 0.0255, HW - 0.0245, BASE + 0.0115))
    notch = region([(-0.0085, BASE + 0.016), (0.0085, BASE + 0.016), (0.0085, BASE - 0.01), (-0.0085, BASE - 0.01)])
    crossbar = region([(-0.0105, 1.3735), (0.0105, 1.3735), (0.0125, 1.3665), (-0.0125, 1.3665)])

    # ------------------------------------------------------------ pectorals (steel, chest)
    pec_left = [(0.013, 1.486), (0.120, 1.498), (0.172, 1.474), (0.192, 1.424), (0.184, 1.352),
                (0.150, 1.298), (0.094, 1.282), (0.058, 1.296), (0.0595, 1.346), (0.0185, 1.434)]
    pec_facets = [
        S.plane((0, 1.462, 0.131), (0.0, 0.64, 0.77)),        # upper chest slope
        S.plane((0.070, 1.380, 0.1445), (0.20, 0.04, 0.979)),  # broad front facet
        S.plane((0, 1.318, 0.133), (0.0, -0.56, 0.83)),       # underside bevel
        S.plane((0.176, 1.380, 0.096), (0.80, 0.0, 0.60)),    # outer flank
        S.plane((0.124, 1.470, 0.102), (0.45, 0.62, 0.64)),   # shoulder-side corner
    ]
    pec = plate('pec', S.intersect(region(pec_left), front_only(-0.03),
                                   S.subtract(NONE, S.offset(emblem_outer, 0.012))),
                0.004, 0.037, 'chest', 'steel', 0.0035, pec_facets, mirror=True)
    # panel line from the collar corner down to the flank
    seam = S.stroke((0, 0, 0), np.eye(3), [(0.040, 1.470), (0.104, 1.440), (0.150, 1.386), (0.178, 1.372)], 0.0)
    parts[-1].field = S.chamfer_subtract(0.001, pec, S.intersect(lambda p: seam(p) - 0.0016, front_only(0.0),
                                                                lambda p: -(T(p) - 0.0315)))
    # pec edge trim channel (energy) along the lower edge
    pec_light = S.stroke((0, 0, 0), np.eye(3), [(0.064, 1.300), (0.096, 1.282), (0.150, 1.298), (0.180, 1.352)], 0.0)
    parts.append(Part('pec_light', S.intersect(lambda p: np.abs(pec_light(p)) - 0.0024, S.shell(T, 0.006, 0.012),
                                               front_only(0.0)),
                      box_chest[0], box_chest[1], 0.0012, 'chest', 'energy', 30.0, True))

    # ------------------------------------------------------------ sternum + emblem (chest)
    sternum_left = [(0, 1.506), (0.020, 1.500), (0.024, 1.440), (0.066, 1.352), (0.064, 1.296),
                    (0.034, 1.268), (0, 1.258)]
    sternum = S.chamfer_intersect(0.0025, S.shell(T, 0.003, 0.0145), region(mirror_pts(sternum_left)),
                                  front_only(0.0))
    sternum = S.chamfer_subtract(0.0015, sternum, S.intersect(emblem_inner, lambda p: -(T(p) - 0.0105)))
    parts.append(Part('sternum', sternum, box_chest[0], box_chest[1], 0.0016, 'chest', 'gunmetal', 34.0))
    bezel = S.chamfer_intersect(0.002, S.shell(T, 0.006, 0.0215), emblem_outer,
                                S.subtract(NONE, emblem_inner), front_only(0.0),
                                S.plane((0, 1.39, 0.134), (0, 0.10, 0.995)))
    parts.append(Part('emblem_bezel', bezel, (-0.06, 1.33, 0.06), (0.06, 1.44, 0.17), 0.0011, 'chest', 'silver', 30.0))
    glyph = S.intersect(S.union(S.subtract(glyph_outer, glyph_inner, notch), crossbar),
                        S.shell(T, 0.0085, 0.0125), front_only(0.0))
    parts.append(Part('emblem_glyph', glyph, (-0.06, 1.33, 0.06), (0.06, 1.44, 0.17), 0.0009, 'chest', 'energy', 30.0))
    core = S.intersect(glyph_inner, S.subtract(NONE, crossbar), S.shell(T, 0.0075, 0.0105), front_only(0.0))
    parts.append(Part('emblem_core', core, (-0.06, 1.33, 0.06), (0.06, 1.44, 0.17), 0.0010, 'chest', 'titanium', 30.0))

    # ------------------------------------------------------------ rib plates (gunmetal)
    rib_a = [(0.088, 1.276), (0.150, 1.284), (0.186, 1.336), (0.194, 1.292), (0.182, 1.246), (0.098, 1.252)]
    rib_b = [(0.090, 1.240), (0.180, 1.234), (0.190, 1.200), (0.172, 1.172), (0.100, 1.196)]
    plate('rib_a', S.intersect(region(rib_a), front_only(-0.05)), 0.003, 0.0155, 'chest', 'gunmetal', 0.0028,
          [S.plane((0.15, 1.27, 0.095), (0.55, -0.15, 0.82))], mirror=True)
    plate('rib_b', S.intersect(region(rib_b), front_only(-0.05)), 0.003, 0.0150, 'spine2', 'gunmetal', 0.0028,
          [S.plane((0.15, 1.21, 0.090), (0.55, -0.10, 0.83))], mirror=True,
          lo=(-0.21, 1.10, -0.02), hi=(0.21, 1.30, 0.20))
    rib_light = S.stroke((0, 0, 0), np.eye(3), [(0.098, 1.246), (0.182, 1.240), (0.192, 1.268)], 0.0)
    parts.append(Part('rib_light', S.intersect(lambda p: np.abs(rib_light(p)) - 0.0019, S.shell(T, 0.004, 0.009),
                                               front_only(-0.03)),
                      (-0.21, 1.18, -0.06), (0.21, 1.30, 0.20), 0.0012, 'chest', 'energy', 30.0, True))

    # ------------------------------------------------------------ abdominals (steel), 3 rows
    rows = [
        ('abs_1', 'spine2', [(0.006, 1.268), (0.062, 1.274), (0.088, 1.252), (0.082, 1.218), (0.056, 1.208), (0.006, 1.212)]),
        ('abs_2', 'spine2', [(0.006, 1.202), (0.056, 1.199), (0.080, 1.186), (0.076, 1.154), (0.052, 1.145), (0.006, 1.148)]),
        ('abs_3', 'spine1', [(0.006, 1.138), (0.052, 1.136), (0.072, 1.124), (0.068, 1.092), (0.047, 1.082), (0.006, 1.084)]),
        ('abs_4', 'spine1', [(0.006, 1.074), (0.046, 1.072), (0.060, 1.060), (0.042, 1.044), (0.006, 1.041)]),
    ]
    for name, bone, pts in rows:
        ymid = (max(p[1] for p in pts) + min(p[1] for p in pts)) * 0.5
        plate(name, S.intersect(region(pts), front_only(0.02)), 0.004, 0.0205, bone, 'steel', 0.0035,
              [S.plane((0.03, ymid + 0.012, 0.118), (0.10, 0.45, 0.887)),
               S.plane((0.03, ymid - 0.012, 0.118), (0.10, -0.45, 0.887))],
              lo=(-0.11, 1.02, 0.0), hi=(0.11, 1.29, 0.17), mirror=True)
    # dark abdominal under-layer that shows between the plates
    abd = [(0, 1.278), (0.094, 1.262), (0.092, 1.150), (0.078, 1.072), (0.056, 1.040), (0, 1.036)]
    plate('abdomen', S.intersect(region(mirror_pts(abd)), front_only(0.0)), 0.002, 0.0085, 'spine1', 'titanium', 0.002,
          lo=(-0.12, 1.02, 0.0), hi=(0.12, 1.29, 0.16), voxel=0.002)

    # ------------------------------------------------------------ obliques (titanium, spine1)
    obl = [(0.094, 1.168), (0.150, 1.166), (0.160, 1.110), (0.150, 1.050), (0.090, 1.064)]
    plate('oblique', S.intersect(region(obl), front_only(-0.06)), 0.003, 0.0135, 'spine1', 'titanium', 0.0028,
          [S.plane((0.14, 1.11, 0.07), (0.62, 0.0, 0.78))], lo=(-0.2, 1.0, -0.08), hi=(0.2, 1.2, 0.16), mirror=True)
    obl_light = S.stroke((0, 0, 0), np.eye(3), [(0.098, 1.150), (0.146, 1.150), (0.154, 1.100)], 0.0)
    parts.append(Part('oblique_light', S.intersect(lambda p: np.abs(obl_light(p)) - 0.0016,
                                                   S.shell(T, 0.0125, 0.0150), front_only(-0.04)),
                      (-0.2, 1.05, -0.08), (0.2, 1.2, 0.16), 0.0011, 'spine1', 'energy', 30.0, True))

    # ------------------------------------------------------------ belt + pelvis (hips)
    belt = S.chamfer_intersect(0.0025, S.shell(T, 0.003, 0.0155), lambda p: np.abs(p[:, 1] - 1.012) - 0.024)
    seg = lambda p: np.abs(np.mod(np.arctan2(p[:, 0], p[:, 2]) * 0.16 + 0.02, 0.04) - 0.02) - 0.0016
    belt = S.chamfer_subtract(0.0008, belt, S.intersect(seg, lambda p: -(T(p) - 0.010), lambda p: 0.03 - np.abs(p[:, 0])))
    parts.append(Part('belt', belt, (-0.22, 0.97, -0.15), (0.22, 1.05, 0.15), 0.0018, 'hips', 'gunmetal', 34.0))
    buckle_pts = mirror_pts([(0, 1.040), (0.024, 1.034), (0.032, 1.012), (0.024, 0.990), (0, 0.984)])
    buckle = S.chamfer_intersect(0.002, S.shell(T, 0.010, 0.0235), region(buckle_pts), front_only(0.03))
    buckle = S.chamfer_subtract(0.001, buckle, S.intersect(
        region(mirror_pts([(0, 1.028), (0.012, 1.012), (0, 0.996)])), lambda p: -(T(p) - 0.019)))
    parts.append(Part('buckle', buckle, (-0.05, 0.97, 0.05), (0.05, 1.05, 0.16), 0.0011, 'hips', 'silver', 30.0))
    gem = S.intersect(region(mirror_pts([(0, 1.026), (0.010, 1.012), (0, 0.998)])), S.shell(T, 0.0165, 0.0195), front_only(0.03))
    parts.append(Part('buckle_light', gem, (-0.05, 0.97, 0.05), (0.05, 1.05, 0.16), 0.0009, 'hips', 'energy', 30.0))

    pelvis = mirror_pts([(0, 0.986), (0.078, 0.986), (0.070, 0.944), (0.036, 0.888), (0, 0.868)])
    plate('pelvis', S.intersect(region(pelvis), front_only(0.0)), 0.003, 0.0185, 'hips', 'steel', 0.003,
          [S.plane((0, 0.95, 0.112), (0, -0.25, 0.97)), S.plane((0.04, 0.95, 0.105), (0.40, 0, 0.92)),
           S.plane((-0.04, 0.95, 0.105), (-0.40, 0, 0.92))],
          lo=(-0.1, 0.85, -0.02), hi=(0.1, 1.0, 0.16))
    hip = [(0.112, 0.986), (0.176, 0.986), (0.190, 0.950), (0.176, 0.912), (0.130, 0.930)]
    plate('hip_plate', S.intersect(region(hip), front_only(-0.07)), 0.003, 0.0165, 'hips', 'gunmetal', 0.003,
          [S.plane((0.17, 0.95, 0.05), (0.85, 0.0, 0.53))], lo=(0.0, 0.88, -0.12), hi=(0.24, 1.0, 0.14), mirror=True)

    # ------------------------------------------------------------ gorget (chest)
    gor = S.chamfer_intersect(0.0025, S.shell(T, 0.003, 0.0175), lambda p: np.abs(p[:, 1] - 1.503) - 0.028,
                              lambda p: np.abs(p[:, 0]) - 0.112,
                              S.plane((0, 1.531, 0), (0, 1, 0)))
    ribs = lambda p: np.abs(np.mod(p[:, 1] + 0.006, 0.012) - 0.006) - 0.0014
    gor = S.chamfer_subtract(0.0007, gor, S.intersect(ribs, lambda p: -(T(p) - 0.012)))
    parts.append(Part('gorget', gor, (-0.13, 1.46, -0.12), (0.13, 1.54, 0.12), 0.0016, 'chest', 'titanium', 34.0))
    # tall collar standing off the neck, open in a V under the chin
    def collar_shell(p):
        d = T(p)
        flare = 0.010 * np.clip((p[:, 1] - 1.520) / 0.07, 0.0, 1.0)      # leans outward towards the top
        inner, outer = 0.009 + flare, 0.021 + flare
        return np.abs(d - (inner + outer) * 0.5) - (outer - inner) * 0.5
    collar = S.chamfer_intersect(0.003, collar_shell, lambda p: np.abs(p[:, 1] - 1.548) - 0.036,
                                 lambda p: np.abs(p[:, 0]) - 0.105,
                                 S.plane((0, 1.582, 0.0), S.norm((0, 0.92, 0.39))))    # lower at the front
    collar = S.chamfer_subtract(0.003, collar, S.intersect(
        region([(-0.055, 1.62), (0.055, 1.62), (0.0, 1.520)]), front_only(0.0)))
    parts.append(Part('collar', collar, (-0.14, 1.50, -0.14), (0.14, 1.62, 0.14), 0.0016, 'chest', 'gunmetal', 34.0))
    return parts
