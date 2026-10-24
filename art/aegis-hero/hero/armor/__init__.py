"""Armour authoring. Each module returns Part definitions (left-authored where mirrored)."""
from __future__ import annotations


def build(L, body):
    out = []
    from . import torso, helmet, arms, legs, back
    for mod in (helmet, torso, arms, legs, back):
        out.extend(mod.build(L, body))
    return out
