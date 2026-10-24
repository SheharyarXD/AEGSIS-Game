"""Combat footwork for the armour: moving and turning without leaving the fighting stance.

These clips are generated, not captured. Every one starts from the guard pose the
strikes use (clips.GUARD_UP) and only moves the legs and pelvis, so they blend with the
stance, with each other and with the strikes without the upper body changing.

  aegis_combat_f / _b / _l / _r   in-place step cycles for advancing, giving ground and
                                  side-stepping. All four have the same length and the
                                  same foot timing (left foot lifts first), so the game
                                  can blend them by direction on one shared phase.
  aegis_turn_l / _r               a quarter turn on the spot: the foot on the side of the
                                  turn steps round while the other pivots on its ball,
                                  then follows. Authored in the frame of the turning
                                  body: the game turns the root by TURN_DEGREES along
                                  turn_curve() and the feet stay where they are planted.

The feet are placed with the same leg IK as every other clip (motion.Solver.plant).
A planted foot travels straight back at exactly the pace the clip is played at, which
is the speed reported in the clip's metadata.
"""
from __future__ import annotations

import math

from mathutils import Quaternion, Vector

from . import clips, motion

FPS = motion.FPS
FRAMES = 18                 # 0.6 s per cycle, an even number of frames per step
DUTY = 0.64                 # share of the cycle a foot spends on the ground
LIFT = 0.075                # how high the ankle rises in a step (m)
CROUCH = 0.018              # the pelvis rides this much lower than in the standing guard
# name -> (direction in the body's frame (x = his left, -y = ahead), speed in m/s)
MOVES = {
    'aegis_combat_f': ((0.0, -1.0), 1.55),
    'aegis_combat_b': ((0.0, 1.0), 1.25),
    'aegis_combat_l': ((1.0, 0.0), 1.2),
    'aegis_combat_r': ((-1.0, 0.0), 1.2),
}
TURN_DEGREES = 90.0
TURN_FRAMES = 14            # 0.47 s for a quarter turn
TURN_SHARE = 0.6            # the body has finished turning this far through the clip
PIVOT = 0.5                 # how much of the turn the planted foot swivels with on its ball


def turn_curve(phase):
    """Share of the quarter turn completed at `phase` (0..1). The game uses the same curve."""
    t = max(0.0, min(1.0, phase / TURN_SHARE))
    return t * t * (3.0 - 2.0 * t)


def _ease(t):
    return 0.5 - 0.5 * math.cos(math.pi * max(0.0, min(1.0, t)))


class Stance:
    """The guard pose stood on the floor: bone rotations, pelvis offset and where the feet are."""

    def __init__(self, arm):
        self.sv = sv = motion.Solver(arm)
        world, self.scalars = motion._authored(sv, clips.GUARD_UP)
        self.complete(world)
        sv.toes(world)
        pose, _, _ = sv.fk(world, Vector())
        offset = sv.mw_inv.to_3x3() @ Vector((0.0, 0.0, -sv.lowest(pose)))
        for _ in range(3):
            pose, _, _ = sv.fk(world, offset)
            for side in 'LR':
                lift = -sv.lowest(pose, side)
                if abs(lift) > 2e-4:
                    sv.plant(world, pose, side, lift)
        self.world, self.offset = world, offset
        pose, _, _ = sv.fk(world, offset)
        self.ankle = {side: (sv.mw @ pose[f'foot.{side}']).translation.copy() for side in 'LR'}
        self.foot = {side: world[f'foot.{side}'].copy() for side in 'LR'}

    def complete(self, world):
        sv = self.sv
        for mid, a, b in motion.HALF:
            world[mid] = world[a].slerp(world[b], 0.5)
        for mid, a, b in motion.PADS:
            world[mid] = motion.pad_rotation(sv, world[a], world[b], mid[-1])
        for side in 'LR':
            world[f'palm.{side}'] = world[f'forearm.{side}.003'].copy()
            world[f'toe.{side}'] = world[f'foot.{side}'].copy()

    def frame(self, pelvis, feet, trunk=None):
        """One frame: the pelvis moved by `pelvis` (world metres), each foot's ankle at
        feet[side] = (position, rotation about vertical in radians, pitch in radians)."""
        sv = self.sv
        world = {bone: q.copy() for bone, q in self.world.items()}
        if trunk:
            for bone, q in trunk.items():
                world[bone] = q @ world[bone]
        offset = self.offset + sv.mw_inv.to_3x3() @ pelvis
        for side in 'LR':
            place, yaw, pitch = feet[side]
            turn = Quaternion((0.0, 0.0, 1.0), yaw)
            foot = turn @ self.foot[side]
            if pitch:
                foot = Quaternion(foot @ Vector((1.0, 0.0, 0.0)), pitch) @ foot
            world[f'foot.{side}'] = foot
            for _ in range(3):
                pose, _, _ = sv.fk(world, offset)
                ankle = (sv.mw @ pose[f'foot.{side}']).translation
                sv.plant(world, pose, side, place - ankle)
            if yaw:
                # the knee turns with the foot instead of leaving the ankle to take the twist
                pose, _, _ = sv.fk(world, offset)
                hip = (sv.mw @ pose[f'thigh.{side}']).translation
                ankle = (sv.mw @ pose[f'foot.{side}']).translation
                roll = Quaternion((hip - ankle).normalized(), yaw * 0.6)
                for bone in (f'thigh.{side}', f'shin.{side}', f'knee.{side}'):
                    world[bone] = roll @ world[bone]
            # never through the floor, whatever the pitch
            pose, _, _ = sv.fk(world, offset)
            low = sv.lowest(pose, side)
            if low < -2e-4:
                sv.plant(world, pose, side, -low)
        return world, offset

    def poses(self, frames):
        sv, out = self.sv, []
        curl = (self.scalars['curl.L'], self.scalars['curl.R'])
        for world, offset in frames:
            sv.toes(world, offset)
            _, quats, loc = sv.fk(world, offset)
            for finger in motion.FINGERS:
                if finger in sv.rest:
                    amount = curl[0 if finger.endswith('L') else 1] * (1.0 if '.01.' in finger else 1.25) * (0.5 if finger.startswith('thumb') else 1.0)
                    quats[finger] = Quaternion((1, 0, 0), math.radians(amount))
            out.append((quats, loc))
        return out


def move(arm, stance, name, direction, speed):
    d = Vector((direction[0], direction[1], 0.0)).normalized()
    seconds = FRAMES / FPS
    reach = speed * seconds * DUTY * 0.5          # a planted foot travels 2 x reach at exactly `speed`
    frames = []
    for f in range(FRAMES + 1):
        phase = (f % FRAMES) / FRAMES
        feet, air = {}, {}
        for side, lead in (('L', 0.0), ('R', 0.5)):
            u = (phase + DUTY + lead) % 1.0        # the left foot lifts at phase 0, the right half a cycle later
            if u < DUTY:                           # planted: carried back under the body
                air[side], along, up = 0.0, 1.0 - 2.0 * u / DUTY, 0.0
            else:                                  # stepping: forward again, over an arc
                air[side] = t = (u - DUTY) / (1.0 - DUTY)
                along, up = -1.0 + 2.0 * _ease(t), LIFT * math.sin(math.pi * t) ** 0.8
            # toes down as the foot leaves the floor, up as it reaches for it (only when stepping ahead or back)
            pitch = math.radians(16.0) * (-d.y) * math.sin(2.0 * math.pi * air[side])
            feet[side] = (stance.ankle[side] + d * (reach * along) + Vector((0.0, 0.0, up)), 0.0, pitch)
        # the pelvis rides over the planted foot and dips as the weight changes over
        lifted = {side: math.sin(math.pi * air[side]) for side in 'LR'}
        sway = 0.5 * (lifted['R'] - lifted['L'])
        both = 1.0 - max(lifted.values())
        pelvis = Vector((0.028 * sway, 0.0, -CROUCH - 0.016 * both)) + d * (0.012 * (0.5 - both))
        # the hips counter the step a little; the chest and the guard stay on the target
        counter = math.radians(2.2) * sway * (1.0 if abs(d.y) > 0.5 else 0.4)
        turn_hips = Quaternion((0.0, 0.0, 1.0), -counter) @ Quaternion((0.0, 1.0, 0.0), math.radians(1.6) * sway)
        frames.append(stance.frame(pelvis, feet, {'hips': turn_hips, 'spine1': Quaternion((0.0, 0.0, 1.0), -0.5 * counter)}))
    frames[-1] = frames[0]
    motion.write_action(arm, name, stance.poses(frames))
    return {'clip': name, 'source': 'authored footwork', 'seconds': round(seconds, 4), 'speed': round(speed, 4), 'stride': round(speed * seconds, 4)}


def turn(arm, stance, name, degrees):
    total, lead, trail = math.radians(degrees), ('L' if degrees > 0 else 'R'), ('R' if degrees > 0 else 'L')
    spin = lambda angle, v: Quaternion((0.0, 0.0, 1.0), angle) @ v
    frames = []
    for f in range(TURN_FRAMES + 1):
        phase = f / TURN_FRAMES
        body = total * turn_curve(phase)           # how far the root has turned by now
        feet = {}
        # the leading foot steps round to where it stands after the turn
        a = _ease((phase - 0.03) / 0.44)
        air = math.sin(math.pi * max(0.0, min(1.0, (phase - 0.03) / 0.44)))
        world = stance.ankle[lead].lerp(spin(total, stance.ankle[lead]), a) + Vector((0.0, 0.0, LIFT * 0.8 * air ** 0.8))
        feet[lead] = (spin(-body, world), total * a - body, 0.0)
        # the other swivels on its ball as the hips come round, then follows
        b = _ease((phase - 0.5) / 0.46)
        air = math.sin(math.pi * max(0.0, min(1.0, (phase - 0.5) / 0.46)))
        swivel = PIVOT * total * turn_curve(min(phase, 0.5))
        world = stance.ankle[trail].lerp(spin(total, stance.ankle[trail]), b) + Vector((0.0, 0.0, LIFT * 0.8 * air ** 0.8))
        feet[trail] = (spin(-body, world), swivel + (total - swivel) * b - body, 0.0)
        dip = math.sin(math.pi * phase)
        frames.append(stance.frame(Vector((0.0, 0.0, -CROUCH * 0.6 - 0.012 * dip)), feet))
    motion.write_action(arm, name, stance.poses(frames))
    return {'clip': name, 'source': 'authored footwork', 'seconds': round(TURN_FRAMES / FPS, 4), 'speed': 0.0,
            'turn': degrees, 'share': TURN_SHARE}


def build(arm):
    stance = Stance(arm)
    meta = [move(arm, stance, name, direction, speed) for name, (direction, speed) in MOVES.items()]
    meta.append(turn(arm, stance, 'aegis_turn_l', TURN_DEGREES))
    meta.append(turn(arm, stance, 'aegis_turn_r', -TURN_DEGREES))
    for m in meta:
        print('[motion]', m, flush=True)
    return meta
