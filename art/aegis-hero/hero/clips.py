"""Authored clips: flight, free fall and landings.

Each clip is a list of keys `(seconds, pose)`. A pose gives limb directions in the
character's upright frame (x = his left, -y = front, z = up) for the left side; the
right side mirrors it unless given. Flight poses are authored upright: the game pitches
the whole body by its real velocity, so "arms back along the body" here is arms down.

Pose entries
  upper_arm.L / forearm.L / thigh.L / shin.L / foot.L   limb direction (and .R)
  spine  (pitch, yaw, roll) of the chest in degrees: + leans forward, turns left, tilts left
  hips   (pitch, yaw, roll) of the pelvis
  head   (pitch, yaw, roll) of the head relative to upright
  curl   finger curl in degrees, or (left, right)
  twist  forearm roll in degrees, or (left, right): turns the palm
  fist   0..1 per side, e.g. {'R': 1}: that fist is pressed onto the floor (ground clips)
  shift  (x, y) pelvis offset in metres (ground clips)
"""

# ------------------------------------------------------------------ flight (armour)
# Arms and legs open out when he has speed to spare and draw in as he goes faster:
# spread and steady in the hover, a delta in the cruise, a dart at full boost.
HOVER_A = {
    'upper_arm.L': (0.62, -0.02, -0.78), 'forearm.L': (0.70, -0.16, -0.70),
    'thigh.L': (0.13, -0.20, -0.97), 'shin.L': (0.09, 0.24, -0.97), 'foot.L': (0.06, -0.72, -0.69),
    'spine': (4, 0, 0), 'head': (-2, 0, 0), 'curl': 26, 'twist': 62,
}
HOVER_B = {**HOVER_A, 'upper_arm.L': (0.65, 0.0, -0.76), 'forearm.L': (0.73, -0.12, -0.67),
           'upper_arm.R': (-0.59, -0.04, -0.80), 'forearm.R': (-0.67, -0.20, -0.72),
           'thigh.L': (0.13, -0.23, -0.96), 'thigh.R': (-0.13, -0.17, -0.98), 'spine': (5, 0, 1)}
CRUISE_A = {
    'upper_arm.L': (0.58, 0.14, -0.80), 'forearm.L': (0.64, 0.06, -0.77),
    'thigh.L': (0.12, 0.05, -0.99), 'shin.L': (0.10, 0.10, -0.99), 'foot.L': (0.03, -0.22, -0.97),
    'spine': (-7, 0, 0), 'head': (-36, 0, 0), 'curl': 34, 'twist': 30,
}
CRUISE_B = {**CRUISE_A, 'upper_arm.L': (0.60, 0.12, -0.79), 'upper_arm.R': (-0.56, 0.16, -0.81),
            'thigh.L': (0.12, 0.07, -0.99), 'thigh.R': (-0.12, 0.03, -0.99)}
BOOST_A = {
    'upper_arm.L': (0.15, 0.30, -0.94), 'forearm.L': (0.11, 0.27, -0.96),
    'thigh.L': (0.028, 0.08, -1.0), 'shin.L': (0.024, 0.12, -0.99), 'foot.L': (0.01, -0.12, -0.99),
    'spine': (-10, 0, 0), 'head': (-44, 0, 0), 'curl': 86, 'twist': 20,
}
BOOST_B = {**BOOST_A, 'upper_arm.L': (0.16, 0.32, -0.93), 'upper_arm.R': (-0.14, 0.28, -0.95)}
BRAKE = {
    'upper_arm.L': (0.52, -0.56, -0.65), 'forearm.L': (0.36, -0.86, -0.36),
    'thigh.L': (0.15, -0.60, -0.79), 'shin.L': (0.11, -0.12, -0.99), 'foot.L': (0.04, -0.93, 0.36),
    'spine': (10, 0, 0), 'head': (4, 0, 0), 'curl': 18, 'twist': 100,
}
# turning left: chest and head lead into the turn, the inside arm draws in, the outside arm reaches wide
BANK_L = {
    'upper_arm.L': (0.34, 0.22, -0.91), 'forearm.L': (0.36, 0.14, -0.92),
    'upper_arm.R': (-0.84, 0.04, -0.54), 'forearm.R': (-0.90, -0.06, -0.43),
    'thigh.L': (0.06, 0.12, -0.99), 'shin.L': (0.05, 0.20, -0.98), 'foot.L': (0.02, -0.22, -0.97),
    'thigh.R': (-0.17, -0.02, -0.98), 'shin.R': (-0.12, 0.08, -0.99), 'foot.R': (-0.03, -0.22, -0.97),
    'spine': (-7, 22, 10), 'hips': (0, 7, 4), 'head': (-36, 32, 9), 'curl': 34, 'twist': 30,
}
TAKEOFF = [
    (0.00, {'upper_arm.L': (0.34, 0.10, -0.93), 'forearm.L': (0.28, -0.10, -0.95), 'thigh.L': (0.14, -0.42, -0.90),
            'shin.L': (0.10, 0.36, -0.93), 'foot.L': (0.04, -1.0, 0.0), 'spine': (16, 0, 0), 'head': (-10, 0, 0),
            'curl': 60, 'twist': 30}),
    (0.16, {'upper_arm.L': (0.40, 0.22, -0.89), 'forearm.L': (0.40, 0.05, -0.92), 'thigh.L': (0.16, -0.62, -0.77),
            'shin.L': (0.10, 0.52, -0.85), 'foot.L': (0.04, -1.0, 0.0), 'spine': (24, 0, 0), 'head': (-16, 0, 0),
            'curl': 70, 'twist': 40}),
    (0.38, {'upper_arm.L': (0.44, 0.02, -0.90), 'forearm.L': (0.50, -0.08, -0.86), 'thigh.L': (0.07, -0.04, -1.0),
            'shin.L': (0.05, 0.06, -1.0), 'foot.L': (0.03, -0.45, -0.89), 'spine': (-4, 0, 0), 'head': (-12, 0, 0),
            'curl': 30, 'twist': 60}),
    (0.75, HOVER_A),
]

# ------------------------------------------------------------------ free fall (both forms)
FALL_A = {
    'upper_arm.L': (0.88, -0.22, -0.30), 'forearm.L': (0.72, -0.46, 0.16),
    'thigh.L': (0.18, -0.42, -0.89), 'shin.L': (0.10, 0.48, -0.87), 'foot.L': (0.05, -0.62, -0.78),
    'spine': (8, 0, 0), 'head': (14, 0, 0), 'curl': 30, 'twist': 20,
}
FALL_B = {**FALL_A, 'upper_arm.L': (0.85, -0.30, -0.20), 'forearm.L': (0.66, -0.52, 0.28),
          'upper_arm.R': (-0.90, -0.16, -0.38), 'forearm.R': (-0.76, -0.40, 0.06),
          'thigh.L': (0.18, -0.50, -0.85), 'thigh.R': (-0.18, -0.34, -0.92),
          'shin.L': (0.10, 0.38, -0.92), 'shin.R': (-0.10, 0.58, -0.81), 'spine': (10, 0, 2)}
FALL_FAST_A = {
    'upper_arm.L': (0.92, 0.26, 0.10), 'forearm.L': (0.30, 0.16, 0.94),
    'thigh.L': (0.30, 0.24, -0.92), 'shin.L': (0.22, 0.78, -0.59), 'foot.L': (0.06, 0.10, -0.99),
    'spine': (-14, 0, 0), 'head': (-28, 0, 0), 'curl': 24, 'twist': 0,
}
FALL_FAST_B = {**FALL_FAST_A, 'upper_arm.L': (0.90, 0.30, 0.16), 'upper_arm.R': (-0.94, 0.22, 0.04),
               'shin.L': (0.22, 0.72, -0.66), 'shin.R': (-0.22, 0.83, -0.51), 'spine': (-15, 0, 2)}
LAND_PREP = {
    'upper_arm.L': (0.62, -0.06, -0.78), 'forearm.L': (0.56, -0.26, -0.79),
    'thigh.L': (0.13, -0.30, -0.94), 'shin.L': (0.10, 0.08, -0.99), 'foot.L': (0.04, -0.96, 0.18),
    'spine': (10, 0, 0), 'head': (14, 0, 0), 'curl': 40, 'twist': 40,
}

# ------------------------------------------------------------------ landings (planted)
STAND = {
    'upper_arm.L': (0.24, 0.02, -0.97), 'forearm.L': (0.20, -0.10, -0.97),
    'thigh.L': (0.085, 0.0, -1.0), 'shin.L': (0.085, 0.02, -1.0), 'foot.L': (0.10, -1.0, 0.0),
    'spine': (2, 0, 0), 'head': (2, 0, 0), 'curl': 70, 'twist': 20,
}
LAND_SOFT = [
    (0.00, {**STAND, 'thigh.L': (0.12, -0.30, -0.95), 'shin.L': (0.10, 0.26, -0.96), 'spine': (9, 0, 0),
            'upper_arm.L': (0.40, -0.04, -0.91), 'forearm.L': (0.36, -0.22, -0.90), 'head': (8, 0, 0)}),
    (0.10, {**STAND, 'thigh.L': (0.13, -0.42, -0.90), 'shin.L': (0.10, 0.36, -0.93), 'spine': (13, 0, 0),
            'upper_arm.L': (0.42, -0.06, -0.90), 'forearm.L': (0.38, -0.26, -0.88), 'head': (10, 0, 0)}),
    (0.50, STAND),
]
CROUCH = {
    'upper_arm.L': (0.50, -0.42, -0.76), 'forearm.L': (0.34, -0.74, -0.58),
    'thigh.L': (0.26, -0.80, -0.54), 'shin.L': (0.10, 0.50, -0.86), 'foot.L': (0.16, -0.99, 0.0),
    'spine': (30, 0, 0), 'head': (-8, 0, 0), 'curl': 55, 'twist': 50,
}
LAND_MEDIUM = [
    (0.00, {**CROUCH, 'thigh.L': (0.22, -0.62, -0.75), 'shin.L': (0.10, 0.42, -0.90), 'spine': (20, 0, 0), 'head': (10, 0, 0)}),
    (0.12, {**CROUCH, 'thigh.L': (0.28, -0.88, -0.38), 'shin.L': (0.10, 0.56, -0.82), 'spine': (36, 0, 0), 'head': (4, 0, 0)}),
    (0.34, CROUCH),
    (0.90, STAND),
]
# three-point landing: left foot planted ahead, right knee down, right fist on the ground
THREE_POINT = {
    'thigh.L': (0.24, -0.90, -0.36), 'shin.L': (0.04, -0.06, -1.0), 'foot.L': (0.10, -1.0, 0.0),
    'thigh.R': (-0.16, 0.40, -0.90), 'shin.R': (-0.06, 0.97, -0.22), 'foot.R': (-0.02, 0.22, -0.97),
    'upper_arm.R': (-0.12, -0.30, -0.95), 'forearm.R': (-0.04, -0.34, -0.94),
    'upper_arm.L': (0.66, 0.52, -0.54), 'forearm.L': (0.58, 0.68, -0.44),
    'spine': (74, -10, 0), 'hips': (40, -6, 0), 'head': (-2, 8, 0), 'curl': 88, 'twist': (10, 70),
    'fist': {'R': 1.0}, 'shift': (0.0, 0.10),
}
LAND_HEAVY = [
    (0.00, {**THREE_POINT, 'spine': (56, -8, 0), 'hips': (28, -6, 0), 'head': (34, 0, 0), 'thigh.L': (0.24, -0.84, -0.48),
            'fist': {'R': 0.5}}),
    (0.09, {**THREE_POINT, 'spine': (82, -10, 0), 'hips': (46, -6, 0), 'head': (48, 0, 0), 'thigh.L': (0.24, -0.94, -0.24)}),   # compression
    (0.26, {**THREE_POINT, 'head': (24, 4, 0)}),
    (0.62, THREE_POINT),                                                                                                      # looks up
    (1.02, {**STAND, 'thigh.L': (0.12, -0.46, -0.88), 'shin.L': (0.09, 0.20, -0.97),
            'thigh.R': (-0.11, -0.06, -0.99), 'shin.R': (-0.09, 0.42, -0.90), 'foot.R': (-0.08, -0.80, -0.60),
            'upper_arm.R': (-0.30, -0.18, -0.93), 'forearm.R': (-0.22, -0.34, -0.91), 'upper_arm.L': (0.36, 0.14, -0.92),
            'forearm.L': (0.30, 0.06, -0.95), 'spine': (20, -3, 0), 'head': (-6, 0, 0), 'fist': {'R': 0.0}, 'shift': (0.0, 0.04)}),
    (1.50, STAND),
]


def mirrored(pose):
    """The same pose turned the other way (left <-> right)."""
    out = {}
    for key, value in pose.items():
        if key.endswith('.L') or key.endswith('.R'):
            other = key[:-1] + ('R' if key.endswith('L') else 'L')
            out[other] = (-value[0], value[1], value[2])
        elif key in ('spine', 'hips', 'head'):
            out[key] = (value[0], -value[1], -value[2])
        elif key in ('curl', 'twist') and isinstance(value, tuple):
            out[key] = (value[1], value[0])
        elif key == 'fist':
            out[key] = {('R' if side == 'L' else 'L'): w for side, w in value.items()}
        elif key == 'shift':
            out[key] = (-value[0], value[1])
        else:
            out[key] = value
    return out


def expand(pose):
    """Fill in the right side from the left where it is not given."""
    full = dict(pose)
    for key, value in pose.items():
        if key.endswith('.L'):
            full.setdefault(key[:-1] + 'R', (-value[0], value[1], value[2]))
    return full


# A kneeling leg is not pulled down to stand on its foot: clip -> sides left free
FREE_FEET = {'aegis_land_heavy': 'R'}

# name -> (keys, loop, grounded, forms)
CLIPS = {
    'aegis_takeoff': (TAKEOFF, False, False, ('armor',)),
    'aegis_hover': ([(0.0, HOVER_A), (1.6, HOVER_B), (3.2, HOVER_A)], True, False, ('armor',)),
    'aegis_cruise': ([(0.0, CRUISE_A), (1.2, CRUISE_B), (2.4, CRUISE_A)], True, False, ('armor',)),
    'aegis_boost': ([(0.0, BOOST_A), (0.5, BOOST_B), (1.0, BOOST_A)], True, False, ('armor',)),
    'aegis_brake': ([(0.0, BRAKE), (1.0, BRAKE)], True, False, ('armor',)),
    'aegis_bank_l': ([(0.0, BANK_L), (1.0, BANK_L)], True, False, ('armor',)),
    'aegis_bank_r': ([(0.0, mirrored(BANK_L)), (1.0, mirrored(BANK_L))], True, False, ('armor',)),
    'aegis_fall': ([(0.0, FALL_A), (0.55, FALL_B), (1.1, FALL_A)], True, False, ('armor', 'pilot')),
    'aegis_fall_fast': ([(0.0, FALL_FAST_A), (0.4, FALL_FAST_B), (0.8, FALL_FAST_A)], True, False, ('armor', 'pilot')),
    'aegis_land_prep': ([(0.0, LAND_PREP), (1.0, LAND_PREP)], True, False, ('armor', 'pilot')),
    'aegis_land_soft': (LAND_SOFT, False, True, ('armor', 'pilot')),
    'aegis_land_medium': (LAND_MEDIUM, False, True, ('armor', 'pilot')),
    'aegis_land_heavy': (LAND_HEAVY, False, True, ('armor',)),
}


# ------------------------------------------------------------------ combat (armour, planted)
# A bladed stance: left side leading, weight low and centred, hands up. Every strike turns
# the hips and shoulders through the target and comes back to this.
GUARD_UP = {
    'thigh.L': (0.10, -0.42, -0.90), 'shin.L': (0.05, 0.16, -0.99), 'foot.L': (0.12, -1.0, 0.0),
    'thigh.R': (-0.20, 0.26, -0.94), 'shin.R': (-0.10, 0.36, -0.93), 'foot.R': (-0.58, -0.81, 0.0),
    'upper_arm.L': (0.28, -0.52, -0.81), 'forearm.L': (0.02, -0.66, 0.75),
    'upper_arm.R': (-0.40, -0.10, -0.91), 'forearm.R': (-0.02, -0.52, 0.85),
    'hips': (2, -20, 0), 'spine': (9, -30, 0), 'head': (5, 0, 0), 'curl': 92, 'twist': (40, 40),
}
STANCE_B = {**GUARD_UP, 'spine': (10, -28, 1), 'upper_arm.L': (0.29, -0.50, -0.82), 'forearm.L': (0.03, -0.64, 0.77)}
JAB_OUT = {**GUARD_UP, 'upper_arm.L': (0.10, -0.98, -0.04), 'forearm.L': (0.03, -1.0, 0.02), 'hips': (3, -12, 0), 'spine': (11, -12, 0),
           'thigh.L': (0.10, -0.48, -0.87), 'shift': (0.0, -0.05), 'twist': (95, 40)}
CROSS_LOAD = {**GUARD_UP, 'hips': (2, -30, 0), 'spine': (9, -42, 0), 'upper_arm.R': (-0.48, 0.10, -0.87), 'forearm.R': (-0.10, -0.46, 0.88)}
CROSS_OUT = {**GUARD_UP, 'upper_arm.R': (-0.04, -0.99, -0.03), 'forearm.R': (-0.01, -1.0, 0.0), 'upper_arm.L': (0.36, -0.30, -0.88),
             'forearm.L': (0.10, -0.48, 0.87), 'hips': (5, 20, 0), 'spine': (14, 38, 0), 'thigh.R': (-0.16, 0.36, -0.92),
             'shin.R': (-0.10, 0.52, -0.85), 'foot.R': (-0.30, -0.78, -0.55), 'shift': (0.0, -0.10), 'twist': (40, 95)}
HOOK_LOAD = {**GUARD_UP, 'hips': (4, 16, 0), 'spine': (12, 32, 0), 'upper_arm.L': (0.86, -0.22, -0.20), 'forearm.L': (-0.30, -0.93, 0.18),
             'upper_arm.R': (-0.36, -0.22, -0.90), 'forearm.R': (0.02, -0.50, 0.86)}
HOOK_OUT = {**GUARD_UP, 'hips': (4, -40, 0), 'spine': (12, -56, 0), 'upper_arm.L': (0.34, -0.93, -0.06), 'forearm.L': (-0.93, -0.36, 0.04),
            'upper_arm.R': (-0.36, -0.22, -0.90), 'forearm.R': (0.02, -0.50, 0.86), 'thigh.L': (0.14, -0.44, -0.89),
            'foot.L': (0.45, -0.89, 0.0), 'shift': (0.0, -0.06), 'twist': (95, 40)}
HEAVY_COIL = {**GUARD_UP, 'hips': (2, -44, 0), 'spine': (6, -66, 0), 'upper_arm.R': (-0.62, 0.50, -0.60), 'forearm.R': (-0.22, -0.56, 0.80),
              'upper_arm.L': (0.30, -0.72, -0.62), 'forearm.L': (0.10, -0.80, 0.59), 'thigh.R': (-0.20, 0.34, -0.92),
              'shin.R': (-0.10, 0.50, -0.86), 'shift': (0.0, 0.08), 'head': (6, 6, 0)}
HEAVY_OUT = {**GUARD_UP, 'hips': (10, 34, 0), 'spine': (26, 56, 0), 'upper_arm.R': (-0.02, -0.99, -0.12), 'forearm.R': (0.0, -0.99, -0.10),
             'upper_arm.L': (0.52, 0.30, -0.80), 'forearm.L': (0.40, 0.10, -0.91), 'thigh.L': (0.12, -0.66, -0.74),
             'shin.L': (0.05, 0.22, -0.97), 'thigh.R': (-0.16, 0.50, -0.85), 'shin.R': (-0.10, 0.58, -0.81),
             'foot.R': (-0.25, -0.70, -0.67), 'shift': (0.0, -0.24), 'head': (10, 0, 0), 'twist': (40, 100)}
BLOCK = {**GUARD_UP, 'thigh.L': (0.10, -0.50, -0.86), 'shin.L': (0.05, 0.22, -0.97), 'thigh.R': (-0.20, 0.32, -0.92), 'shin.R': (-0.10, 0.46, -0.88),
         'upper_arm.L': (0.22, -0.74, -0.63), 'forearm.L': (-0.30, -0.30, 0.90), 'upper_arm.R': (-0.22, -0.74, -0.63),
         'forearm.R': (0.30, -0.30, 0.90), 'hips': (6, -8, 0), 'spine': (18, -10, 0), 'head': (12, 0, 0), 'twist': (60, 60)}
SLIP_L = {**GUARD_UP, 'hips': (6, -14, 12), 'spine': (20, -20, 30), 'head': (8, 0, 16), 'thigh.L': (0.26, -0.50, -0.83), 'shin.L': (-0.02, 0.24, -0.97),
          'thigh.R': (-0.10, 0.30, -0.95), 'shin.R': (-0.16, 0.50, -0.85), 'shift': (0.16, 0.0)}
SLIP_R = {**GUARD_UP, 'hips': (6, -26, -12), 'spine': (20, -40, -30), 'head': (8, 0, -16), 'thigh.R': (-0.32, 0.20, -0.93), 'shin.R': (-0.02, 0.44, -0.90),
          'thigh.L': (0.04, -0.46, -0.89), 'shift': (-0.16, 0.0)}
LEAN_BACK = {**GUARD_UP, 'hips': (-6, -18, 0), 'spine': (-16, -26, 0), 'head': (-4, 0, 0), 'thigh.L': (0.10, -0.30, -0.95), 'shin.L': (0.05, -0.06, -1.0),
             'thigh.R': (-0.20, 0.36, -0.91), 'shin.R': (-0.10, 0.56, -0.82), 'shift': (0.0, 0.14)}
AIR_COIL = {**HOVER_A, 'upper_arm.R': (-0.60, 0.40, -0.69), 'forearm.R': (-0.20, -0.50, 0.84), 'upper_arm.L': (0.34, -0.66, -0.67), 'forearm.L': (0.12, -0.82, 0.56),
            'spine': (8, -46, 0), 'hips': (0, -24, 0), 'thigh.L': (0.14, -0.50, -0.85), 'shin.L': (0.08, 0.40, -0.91), 'thigh.R': (-0.14, 0.10, -0.99),
            'shin.R': (-0.08, 0.50, -0.86), 'curl': 92, 'head': (4, 0, 0)}
AIR_OUT = {**AIR_COIL, 'upper_arm.R': (-0.04, -0.97, -0.24), 'forearm.R': (0.0, -0.97, -0.24), 'upper_arm.L': (0.56, 0.32, -0.76), 'forearm.L': (0.46, 0.16, -0.87),
           'spine': (28, 48, 0), 'hips': (10, 26, 0), 'thigh.L': (0.12, -0.20, -0.97), 'shin.L': (0.06, 0.52, -0.85), 'thigh.R': (-0.12, 0.40, -0.91),
           'shin.R': (-0.06, 0.70, -0.71), 'head': (12, 0, 0), 'twist': (40, 100)}

CLIPS.update({
    'aegis_stance': ([(0.0, GUARD_UP), (1.4, STANCE_B), (2.8, GUARD_UP)], True, True, ('armor',)),
    'aegis_jab': ([(0.00, GUARD_UP), (0.10, JAB_OUT), (0.17, JAB_OUT), (0.36, GUARD_UP)], False, True, ('armor',)),
    'aegis_cross': ([(0.00, GUARD_UP), (0.07, CROSS_LOAD), (0.17, CROSS_OUT), (0.27, CROSS_OUT), (0.46, GUARD_UP)], False, True, ('armor',)),
    'aegis_hook': ([(0.00, GUARD_UP), (0.11, HOOK_LOAD), (0.22, HOOK_OUT), (0.34, HOOK_OUT), (0.60, GUARD_UP)], False, True, ('armor',)),
    'aegis_heavy': ([(0.00, GUARD_UP), (0.26, HEAVY_COIL), (0.40, HEAVY_OUT), (0.56, HEAVY_OUT), (0.90, GUARD_UP)], False, True, ('armor',)),
    'aegis_guard': ([(0.0, BLOCK), (1.0, BLOCK)], True, True, ('armor',)),
    'aegis_counter': ([(0.00, BLOCK), (0.09, CROSS_OUT), (0.20, CROSS_OUT), (0.36, GUARD_UP)], False, True, ('armor',)),
    'aegis_dodge_l': ([(0.00, GUARD_UP), (0.12, SLIP_L), (0.22, SLIP_L), (0.36, GUARD_UP)], False, True, ('armor',)),
    'aegis_dodge_r': ([(0.00, GUARD_UP), (0.12, SLIP_R), (0.22, SLIP_R), (0.36, GUARD_UP)], False, True, ('armor',)),
    'aegis_dodge_back': ([(0.00, GUARD_UP), (0.12, LEAN_BACK), (0.22, LEAN_BACK), (0.36, GUARD_UP)], False, True, ('armor',)),
    'aegis_air_strike': ([(0.00, AIR_COIL), (0.12, AIR_COIL), (0.22, AIR_OUT), (0.36, AIR_OUT), (0.60, HOVER_A)], False, False, ('armor',)),
})
