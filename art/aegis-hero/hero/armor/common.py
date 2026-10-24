"""Shared hard-surface building blocks for armour plates."""
from __future__ import annotations

import numpy as np

from .. import sdf as S

EYE = np.eye(3)
# front-view projection: outline in (x, y), extruded along z
FRONT = EYE
# side-view projection: outline in (z, y), extruded along x
SIDE = np.array([[0.0, 0.0, 1.0], [0.0, 1.0, 0.0], [1.0, 0.0, 0.0]])
# top-view projection: outline in (x, z), extruded along y
TOP = np.array([[1.0, 0.0, 0.0], [0.0, 0.0, 1.0], [0.0, 1.0, 0.0]])


def mirror_pts(pts):
    """Left-half outline (x >= 0, listed top->bottom along the centre line outward)
    -> full symmetric outline."""
    left = [tuple(p) for p in pts]
    right = [(-x, y) for x, y in reversed(left) if x > 1e-9]
    out = right + left
    dedup = [out[0]]
    for q in out[1:]:
        if abs(q[0] - dedup[-1][0]) > 1e-9 or abs(q[1] - dedup[-1][1]) > 1e-9:
            dedup.append(q)
    if abs(dedup[0][0] - dedup[-1][0]) < 1e-9 and abs(dedup[0][1] - dedup[-1][1]) < 1e-9:
        dedup.pop()
    return dedup


def region(outline, basis=FRONT, origin=(0, 0, 0)) -> S.SDF:
    """Infinite cookie-cutter prism from a 2D outline."""
    return S.prism(origin, basis, outline)


def halfspace(point, normal) -> S.SDF:
    return S.plane(point, normal)


def front_only(z0) -> S.SDF:
    """Keep z > z0 (front half)."""
    return S.plane((0, 0, z0), (0, 0, -1))


def back_only(z0) -> S.SDF:
    return S.plane((0, 0, z0), (0, 0, 1))


def plate(ref: S.SDF, inner: float, outer: float, mask: S.SDF, bevel: float = 0.003,
          facets=(), facet_bevel=None) -> S.SDF:
    """Armour plate: shell of the reference surface between `inner` and `outer`
    offsets, clipped by `mask`, optionally faceted by extra half-spaces, with
    chamfered borders (the bevels catch the specular edge highlights)."""
    sh = S.shell(ref, inner, outer)
    parts = [sh, mask] + list(facets)
    return S.chamfer_intersect(bevel if facet_bevel is None else facet_bevel, *parts) if facets else \
        S.chamfer_intersect(bevel, sh, mask)


def inset_strip(ref: S.SDF, depth_inner: float, depth_outer: float, path: S.SDF, width: float) -> S.SDF:
    """Thin emissive strip sitting inside a channel: between two offsets of `ref`,
    within `width` of the path zero set."""
    return S.intersect(S.shell(ref, depth_inner, depth_outer), lambda p: np.abs(path(p)) - width * 0.5)


def cut_channel(f: S.SDF, path: S.SDF, depth: float, width: float, bevel: float = 0.0015) -> S.SDF:
    """Recessed channel (chamfered walls) along path == 0."""
    cutter = lambda p: np.abs(path(p)) - width * 0.5
    floor_cut = S.chamfer_subtract(bevel, f, S.intersect(cutter, lambda p: -(f(p) + depth)))
    return floor_cut


def bolt(center, normal, r=0.0042, h=0.003) -> S.SDF:
    """Hex-ish fastener head (cylinder with chamfer)."""
    c = np.asarray(center, float)
    n = S.norm(normal)
    return S.chamfer_intersect(0.0012, S.cylinder(c - n * h, c + n * h, r), S.sphere(c, r * 1.6))


class Limb:
    """Cylindrical frame around a limb axis for 'unrolled' plate outlines.

    t  = distance along the axis from `a` (towards `b`)
    s  = arc length at nominal radius R, measured from the `up` direction towards
         `side` (theta * R). The seam (theta = +-pi) is opposite `up`.
    """

    def __init__(self, a, b, up, side=None, R=0.05):
        self.a = np.asarray(a, float)
        b = np.asarray(b, float)
        self.ax = S.norm(b - self.a)
        self.length = float(np.linalg.norm(b - self.a))
        up = np.asarray(up, float)
        self.up = S.norm(up - self.ax * np.dot(up, self.ax))
        self.side = S.norm(np.cross(self.ax, self.up) if side is None else
                           np.asarray(side, float) - self.ax * np.dot(side, self.ax))
        self.R = R

    def coords(self, p):
        q = p - self.a
        t = q @ self.ax
        u = q @ self.up
        v = q @ self.side
        return t, np.arctan2(v, u), np.sqrt(u * u + v * v)

    def region(self, outline_ts_deg):
        """Outline given as (t, theta_degrees) pairs."""
        pts = [(t, np.radians(th) * self.R) for t, th in outline_ts_deg]
        g = S.polygon2d(pts)

        def f(p):
            t, th, _ = self.coords(p)
            return g(np.stack([t, th * self.R], 1))
        return f

    def band(self, t0, t1):
        return lambda p: np.abs(self.coords(p)[0] - (t0 + t1) * 0.5) - (t1 - t0) * 0.5

    def line(self, pts_ts_deg):
        """Unsigned distance to a polyline drawn on the unrolled surface."""
        pts = [(t, np.radians(th) * self.R) for t, th in pts_ts_deg]
        g = S.polyline2d(pts)

        def f(p):
            t, th, _ = self.coords(p)
            return g(np.stack([t, th * self.R], 1))
        return f

    def point(self, t, theta_deg, r):
        th = np.radians(theta_deg)
        return self.a + self.ax * t + (self.up * np.cos(th) + self.side * np.sin(th)) * r
