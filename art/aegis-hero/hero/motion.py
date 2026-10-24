"""Motion-capture retargeting onto the gameplay skeleton.

Source: CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu), BVH conversion by
B. Hahne. "This data is free for use in research and commercial projects worldwide."
Created with funding from NSF EIA-0196217. See source/mocap/READMEFIRST.txt.

Method
  * Each mapped bone follows the WORLD direction of its mocap counterpart (the two
    skeletons have different neutral poses, so copying local rotations would import
    the source's splayed legs). Q_target(f) = R_source(f) * A^-1, where A is the
    shortest rotation from the source's neutral bone direction to the target's.
  * The rig's double elbow / knee: the middle bone takes half the bend.
  * Pelvis height is scaled by leg length, then corrected every frame so the lowest
    sole point sits exactly on the ground (no floating, no sinking).
  * Loops are cut between two matching heel strikes and cross-faded; the clip's
    natural ground speed is recorded so the game can play it without foot sliding.
"""
from __future__ import annotations

import math
import os

import bpy
from mathutils import Matrix, Quaternion, Vector

FPS = 30
STEP = 4  # CMU data is 120 fps

# target bone -> (source joint, source child joint or None for the bone's own tail)
MAP = {
    'spine1': ('LowerBack', 'Spine'), 'spine2': ('Spine', 'Spine1'), 'chest': ('Spine1', 'Neck'),
    'neck': ('Neck', 'Neck1'), 'head.001': ('Head', None),
}
for _s, _S in (('L', 'Left'), ('R', 'Right')):
    MAP.update({
        f'shoulder.{_s}': (f'{_S}Shoulder', f'{_S}Arm'), f'upper_arm.{_s}': (f'{_S}Arm', f'{_S}ForeArm'),
        f'forearm.{_s}.003': (f'{_S}ForeArm', f'{_S}Hand'),   # the hand follows the forearm (mocap wrists are noisy)
        f'thigh.{_s}': (f'{_S}UpLeg', f'{_S}Leg'), f'shin.{_s}': (f'{_S}Leg', f'{_S}Foot'),
        f'foot.{_s}': (f'{_S}Foot', f'{_S}ToeBase'),
    })
# target bone -> target bone whose head gives the limb direction (None = world up / bone tail)
TARGET_TIP = {'spine1': 'spine2', 'spine2': 'chest', 'chest': 'neck', 'neck': 'head.001', 'head.001': 'UP'}
for _s in 'LR':
    TARGET_TIP.update({
        f'shoulder.{_s}': f'upper_arm.{_s}', f'upper_arm.{_s}': f'forearm.{_s}', f'forearm.{_s}.003': f'hand.{_s}',
        f'thigh.{_s}': f'knee.{_s}', f'shin.{_s}': f'foot.{_s}',
        f'foot.{_s}': f'toe.{_s}',
    })
# middle bones of the double joints: (bone, parent-side bone, child-side bone)
HALF = [(f'knee.{s}', f'thigh.{s}', f'shin.{s}') for s in 'LR']
HALF += [(f'forearm.{s}', f'upper_arm.{s}', f'forearm.{s}.003') for s in 'LR']
PAD_FOLLOW = 0.3      # how far the pauldron follows the upper arm away from the clavicle
PAD_SAGITTAL = 0.3    # ...and how much of a fore-and-aft arm swing it takes part in at all
PADS = [(f'shoulderpad.{s}', f'shoulder.{s}', f'upper_arm.{s}') for s in 'LR']
FINGERS = [f'{f}.0{i}.{s}' for s in 'LR' for f in ('f_index', 'f_middle', 'f_ring') for i in (1, 2, 3)] + \
          [f'thumb.0{i}.{s}' for s in 'LR' for i in (1, 2, 3)]


def _forward_from_hips(left, right):
    lr = left - right                       # character's right -> left
    return Vector((lr.y, -lr.x, 0.0))       # left x up = forward


def _yaw_to_front(d):
    """Rotation about Z that turns horizontal direction d onto -Y."""
    return Quaternion((0, 0, 1), -math.pi / 2 - math.atan2(d.y, d.x))


class Sample:
    """World-space mocap frames at FPS, heading-normalised so travel is along -Y (front)."""

    def _denoise(self, kernel=(1.0, 4.0, 6.0, 4.0, 1.0)):
        """Low-pass the frames (about 6 Hz at 30 fps). The capture is taken at every
        fourth frame of 120 fps data; unfiltered, its marker jitter aliases into a
        frame-to-frame shake of a degree or so in every limb, which reads as trembling."""
        n, half = len(self.rot), len(kernel) // 2
        rot, pos = [], []
        for i in range(n):
            r, p = {}, {}
            for name in self.rot[i]:
                centre = self.rot[i][name]
                acc_q, acc_p, total = Quaternion((0, 0, 0, 0)), Vector(), 0.0
                for k, w in enumerate(kernel):
                    j = min(max(i + k - half, 0), n - 1)
                    q = self.rot[j][name]
                    acc_q = acc_q + (q if q.dot(centre) >= 0 else -q) * w
                    acc_p += self.pos[j][name] * w
                    total += w
                acc_q.normalize()
                r[name], p[name] = acc_q, acc_p / total
            rot.append(r)
            pos.append(p)
        self.rot, self.pos = rot, pos

    def __init__(self, path):
        before = set(bpy.data.objects)
        acts = set(bpy.data.actions)
        if not hasattr(bpy.ops.import_anim, 'bvh'):
            bpy.ops.preferences.addon_enable(module='io_anim_bvh')
        bpy.ops.import_anim.bvh(filepath=path, global_scale=1.0, frame_start=1, use_fps_scale=False,
                                update_scene_fps=False, update_scene_duration=False, rotate_mode='NATIVE',
                                axis_forward='-Z', axis_up='Y')
        ob = next(o for o in bpy.data.objects if o not in before)
        action = ob.animation_data.action
        f0, f1 = int(action.frame_range[0]), int(action.frame_range[1])
        mw = ob.matrix_world.copy()
        self.names = [b.name for b in ob.data.bones]
        head = {b.name: mw @ b.head_local for b in ob.data.bones}
        tail = {b.name: mw @ b.tail_local for b in ob.data.bones}
        # turn the neutral pose to face -Y (the target's front) before measuring directions
        q0 = _yaw_to_front(_forward_from_hips(head['LeftUpLeg'], head['RightUpLeg']))
        self.rest_head = {n: q0 @ v for n, v in head.items()}
        self.rest_tail = {n: q0 @ v for n, v in tail.items()}
        rest_rot = {b.name: q0 @ (mw @ b.matrix_local).to_quaternion() for b in ob.data.bones}
        self.rot = []   # per frame: {joint: world delta rotation from the neutral pose}
        self.pos = []   # per frame: {joint: world head position}
        sc = bpy.context.scene
        for f in range(f0, f1 + 1, STEP):
            sc.frame_set(f)
            r, p = {}, {}
            for pb in ob.pose.bones:
                m = mw @ pb.matrix
                r[pb.name] = m.to_quaternion() @ rest_rot[pb.name].inverted()
                p[pb.name] = m.translation.copy()
            self.rot.append(r)
            self.pos.append(p)
        self._denoise()
        bpy.data.objects.remove(ob, do_unlink=True)
        for a in [a for a in bpy.data.actions if a not in acts]:
            bpy.data.actions.remove(a)
        self.count = len(self.rot)
        leg = lambda s: (self.rest_head[f'{s}Leg'] - self.rest_head[f'{s}UpLeg']).length + \
            (self.rest_head[f'{s}Foot'] - self.rest_head[f'{s}Leg']).length
        self.leg_length = 0.5 * (leg('Left') + leg('Right'))
        self.ground = min(min(p['LeftFoot'].z, p['RightFoot'].z) for p in self.pos)

    def heading(self, a, b):
        d = self.pos[b]['Hips'] - self.pos[a]['Hips']
        d.z = 0.0
        return d

    def face_front(self, a, b, moving=True):
        """Yaw so travel (or the pelvis, when standing) points along -Y."""
        d = self.heading(a, b) if moving else _forward_from_hips(self.pos[a]['LeftUpLeg'], self.pos[a]['RightUpLeg'])
        q = _yaw_to_front(d)
        origin = self.pos[a]['Hips'].copy()
        for i in range(self.count):
            for k in self.rot[i]:
                self.rot[i][k] = q @ self.rot[i][k]
                self.pos[i][k] = q @ (self.pos[i][k] - origin) + origin
        return q

    def strikes(self, side='Left'):
        """Frames where the foot is furthest ahead of the pelvis (heel strikes)."""
        s = [-(p[f'{side}Foot'].y - p['Hips'].y) for p in self.pos]
        out = []
        for i in range(2, len(s) - 2):
            if s[i] >= s[i - 1] and s[i] > s[i + 1] and s[i] >= s[i - 2] and s[i] > s[i + 2] and s[i] > 0:
                if not out or i - out[-1] > 8:
                    out.append(i)
        return out


def pad_rotation(sv, clavicle, upper, side):
    """World rotation of a pauldron from its collar bone and upper arm.

    The plate follows where the arm *points*, never how it is rolled about its own
    length, and mostly its raising and lowering: a walking arm swings some thirty degrees
    fore and aft, and a plate that took a third of that tipped one shoulder forward and
    the other back on every step, which read as misaligned shoulders from any distance.
    The same rule drives the bone in the game (AegisSuit.drivePads)."""
    rest = sv.tip_direction(f'upper_arm.{side}')
    local = clavicle.inverted() @ (upper @ rest)
    local.y *= PAD_SAGITTAL
    if local.length < 1e-6:
        return clavicle.copy()
    return clavicle @ Quaternion().slerp(rest.rotation_difference(local.normalized()), PAD_FOLLOW)


class Solver:
    """Forward kinematics on the target rig from world-space bone rotations, with the
    pelvis placed from a wanted hip-joint position and the soles planted on z = 0."""

    def __init__(self, arm):
        self.arm = arm
        self.mw = arm.matrix_world.copy()
        self.mw_inv = self.mw.inverted()
        self.mwq = self.mw.to_quaternion()
        self.mwq_inv = self.mwq.inverted()
        self.rest = {b.name: b.matrix_local.copy() for b in arm.data.bones}
        self.rest_q = {n: m.to_quaternion() for n, m in self.rest.items()}
        self.head = {b.name: self.mw @ b.head_local for b in arm.data.bones}
        self.order = []

        def walk(b):
            self.order.append(b)
            for c in b.children:
                walk(c)
        for b in arm.data.bones:
            if b.parent is None:
                walk(b)
        self.rel = {b.name: (self.rest[b.parent.name].inverted() @ self.rest[b.name]) if b.parent else self.rest[b.name]
                    for b in arm.data.bones}
        self.hip_mid_rest = 0.5 * (self.head['thigh.L'] + self.head['thigh.R'])
        self.ankle_rest = 0.5 * (self.head['foot.L'].z + self.head['foot.R'].z)
        self.leg = 0.5 * sum((self.head[f'knee.{s}'] - self.head[f'thigh.{s}']).length +
                             (self.head[f'foot.{s}'] - self.head[f'shin.{s}']).length for s in 'LR')
        # sole contact points as world offsets from the bone head at rest
        self.contacts = []
        for s in 'LR':
            a, t = self.head[f'foot.{s}'], self.head[f'toe.{s}']
            self.contacts.append((f'foot.{s}', Vector((a.x, a.y + 0.062, 0.0)) - a))      # heel
            self.contacts.append((f'foot.{s}', Vector((t.x, t.y, 0.0)) - a))             # ball
            self.contacts.append((f'toe.{s}', Vector((t.x, t.y - 0.085, 0.0)) - t))      # toe tip

    def tip_direction(self, bone):
        tip = TARGET_TIP[bone]
        if tip == 'UP':
            return Vector((0, 0, 1))
        if tip == 'FORWARD':
            return Vector((0, -1, 0))
        return (self.head[tip] - self.head[bone]).normalized()

    def fk(self, world, offset):
        """world: {bone: world delta rotation}; offset: pelvis translation (armature space)."""
        pose, quats = {}, {}
        hips_frame = None
        for b in self.order:
            n = b.name
            m = (pose[b.parent.name] @ self.rel[n]) if b.parent else self.rel[n].copy()
            if n == 'hips':
                hips_frame = m.to_3x3()
            if n in world:
                wanted = (self.mwq_inv @ world[n] @ self.mwq @ self.rest_q[n]).to_matrix().to_4x4()
                wanted.translation = m.translation
                quats[n] = (m.inverted() @ wanted).to_quaternion()
                m = wanted
            if n == 'hips':
                m.translation = m.translation + offset
            pose[n] = m
        return pose, quats, hips_frame.inverted() @ offset

    def lowest(self, pose, side=None):
        low = 1e9
        for bone, off in self.contacts:
            if side and not bone.endswith(side):
                continue
            m = self.mw @ pose[bone]
            q = m.to_quaternion() @ (self.mwq @ self.rest_q[bone]).inverted()
            low = min(low, (m.translation + q @ off).z)
        return low

    def plant(self, world, pose, side, lift):
        """Two-bone leg IK: move the ankle by `lift` (metres up, or a world vector), keeping
        the foot's orientation. Edits `world` in place.

        The knee keeps bending the way it already does, but that direction is taken from
        the knee's offset to the hip-ankle line *plus* the thigh's own forward axis. On a
        nearly straight leg the offset alone is numerical noise; solving from it made the
        bend plane flip from frame to frame, which showed up as trembling legs. The leg is
        also never driven fully straight, where a millimetre of reach swings the knee by
        degrees."""
        hip = (self.mw @ pose[f'thigh.{side}']).translation
        knee = (self.mw @ pose[f'shin.{side}']).translation
        ankle = (self.mw @ pose[f'foot.{side}']).translation
        target = ankle + (lift if isinstance(lift, Vector) else Vector((0.0, 0.0, lift)))
        l1, l2 = (knee - hip).length, (ankle - knee).length
        reach = target - hip
        full, soft = l1 + l2, (l1 + l2) * 0.985
        d = reach.length
        if d > soft:                      # ease into the limit instead of snapping straight
            d = soft + (full - soft) * (1.0 - math.exp(-(d - soft) / (full - soft))) * 0.9
        d = max(d, abs(l1 - l2) + 1e-4)
        along = reach.normalized()
        forward = world[f'thigh.{side}'] @ Vector((0.0, -1.0, 0.0))
        pole = (knee - hip) - along * (knee - hip).dot(along) + (forward - along * forward.dot(along)) * 0.05
        if pole.length < 1e-6:
            pole = forward - along * forward.dot(along)
        pole.normalize()
        foot_of_knee = (l1 * l1 + d * d - l2 * l2) / (2.0 * d)
        bent = hip + along * foot_of_knee + pole * math.sqrt(max(0.0, l1 * l1 - foot_of_knee * foot_of_knee))
        d1 = (knee - hip).rotation_difference(bent - hip)
        d2 = (ankle - knee).rotation_difference(hip + along * d - bent)
        world[f'thigh.{side}'] = d1 @ world[f'thigh.{side}']
        world[f'shin.{side}'] = d2 @ world[f'shin.{side}']
        world[f'knee.{side}'] = world[f'thigh.{side}'].slerp(world[f'shin.{side}'], 0.5)

    def reach(self, world, pose, side, delta):
        """Two-bone arm IK: move the wrist by the world vector `delta`. The elbow keeps
        bending the way it does, biased backwards and down like a real elbow."""
        upper, lower = f'upper_arm.{side}', f'forearm.{side}.003'
        end = f'hand.{side}' if f'hand.{side}' in pose else f'palm.{side}'
        shoulder = (self.mw @ pose[upper]).translation
        elbow = (self.mw @ pose[lower]).translation
        wrist = (self.mw @ pose[end]).translation
        l1, l2 = (elbow - shoulder).length, (wrist - elbow).length
        to = wrist + delta - shoulder
        d = max(abs(l1 - l2) + 1e-4, min(to.length, (l1 + l2) * 0.995))
        along = to.normalized()
        hint = Vector((0.0, 0.8, -0.6))
        pole = (elbow - shoulder) - along * (elbow - shoulder).dot(along) + (hint - along * hint.dot(along)) * 0.05
        pole.normalize()
        foot_of_elbow = (l1 * l1 + d * d - l2 * l2) / (2.0 * d)
        bent = shoulder + along * foot_of_elbow + pole * math.sqrt(max(0.0, l1 * l1 - foot_of_elbow * foot_of_elbow))
        d1 = (elbow - shoulder).rotation_difference(bent - shoulder)
        d2 = (wrist - elbow).rotation_difference(shoulder + along * d - bent)
        world[upper] = d1 @ world[upper]
        world[lower] = d2 @ world[lower]
        world[f'forearm.{side}'] = world[upper].slerp(world[lower], 0.5)
        world[f'palm.{side}'] = world[lower].copy()

    def lock(self, solved, travel, always, loop, ease=2, sides='LR'):
        """Foot lock. While the ball of a foot is on the floor it must not slide: in an
        in-place clip that means it travels straight back at the pace the body covers
        ground (`travel`, metres per frame; 0 when standing). Each contact is moved onto
        that line with leg IK, eased in and out over `ease` frames. A loop (whose last
        frame repeats the first) is treated as a circle, so a contact carries across
        the seam."""
        n = len(solved) - 1 if loop else len(solved)
        for side in sides:
            balls = []
            for world, offset in solved[:n]:
                pose, _, _ = self.fk(world, offset)
                balls.append((self.mw @ pose[f'toe.{side}']).translation.copy())
            floor = min(b.z for b in balls)
            at = (lambda t: t % n) if loop else (lambda t: min(max(t, 0), n - 1))
            # a contact is on the floor AND carried back at ground pace; a swinging foot
            # that merely skims the floor is moving forward
            back = [(balls[at(t + 1)].y - balls[at(t - 1)].y) / 2.0 for t in range(n)]
            # (a brief running contact can sit a centimetre or two above the lowest point of the
            # cycle, so the height test is generous; the direction of travel does the telling apart)
            down = [always or (balls[t].z - floor < 0.03 and back[t] > 0.1 * travel) for t in range(n)]
            down = [down[t] or (down[at(t - 1)] and down[at(t + 1)]) for t in range(n)]
            if all(down):
                runs = [(0, n - 1)]
            else:
                # start scanning just after a frame in the air so no contact is split
                start = down.index(False) if loop else 0
                runs, t = [], start
                while t < start + n:
                    if not down[t % n]:
                        t += 1
                        continue
                    u = t
                    while u + 1 < start + n and down[(u + 1) % n]:
                        u += 1
                    runs.append((t, u))
                    t = u + 1
            for i, j in runs:
                count = j - i + 1
                x = sum(balls[t % n].x for t in range(i, j + 1)) / count
                y = sum(balls[t % n].y - travel * (t - i) for t in range(i, j + 1)) / count
                for t in range(i - ease, j + ease + 1):
                    if (not loop and not 0 <= t < n) or (count >= n and not i <= t <= j):
                        continue
                    u = min(max(t, i), j)
                    w = 1.0 - (i - t if t < i else t - j if t > j else 0) / (ease + 1.0)
                    delta = Vector((x - balls[u % n].x, y + travel * (u - i) - balls[u % n].y, floor - balls[u % n].z)) * w
                    if delta.length > 2e-4:
                        world, offset = solved[t % n]
                        pose, _, _ = self.fk(world, offset)
                        self.plant(world, pose, side, delta)
            # swing clearance: between contacts the ball of the foot arcs clear of the floor
            for (_, j), (i, _) in zip(runs, runs[1:] + ([(runs[0][0] + n, 0)] if loop and runs else [])):
                air = i - j - 1
                for t in range(j + 1, i):
                    if not loop and not 0 <= t < n:
                        continue
                    # a full arc that stays up until the last moment: the foot comes down onto its
                    # contact, it does not skim in along the ground
                    need = floor + 0.045 * math.sin(math.pi * (t - j) / (air + 1.0)) ** 0.55
                    world, offset = solved[t % n]
                    pose, _, _ = self.fk(world, offset)
                    have = (self.mw @ pose[f'toe.{side}']).translation.z
                    if have < need - 2e-4:
                        self.plant(world, pose, side, need - have)
        if loop:
            solved[-1] = solved[0]

    def toes(self, world, offset=None):
        """The capture has no usable toe motion. Toes follow the foot, except against the
        floor: when a foot that is the body's support tips forward onto its ball (heel
        lifting at push-off), they stay flat. The bend is a continuous function of how
        far the foot points down, so there is nothing to snap."""
        for s in 'LR':
            world[f'toe.{s}'] = world[f'foot.{s}'].copy()
        pose, _, _ = self.fk(world, offset if offset is not None else Vector())
        heights = {}
        for bone, off in self.contacts:
            if bone.startswith('foot'):
                m = self.mw @ pose[bone]
                q = m.to_quaternion() @ (self.mwq @ self.rest_q[bone]).inverted()
                heights.setdefault(bone[-1], []).append((m.translation + q @ off).z)       # heel, ball
        # with the solved pelvis position the floor is z = 0; before that, the lowest heel or ball stands in
        floor = 0.0 if offset is not None else min(min(v) for v in heights.values())
        for s in 'LR':
            foot = world[f'foot.{s}']
            down = math.degrees(math.asin(max(-1.0, min(1.0, -(foot @ Vector((0.0, -1.0, 0.0))).z))))
            near = max(0.0, min(1.0, 1.0 - (heights[s][1] - floor - 0.005) / 0.09))      # ball of this foot near the floor
            near = near * near * (3.0 - 2.0 * near)
            bend = max(0.0, min(50.0, down)) * near
            if bend > 0.01:
                world[f'toe.{s}'] = Quaternion(foot @ Vector((1.0, 0.0, 0.0)), math.radians(-bend)) @ foot

    def solve(self, frames, finger_curl=18.0, loop=True, plant='stance', travel=None):
        """frames: list of (world rotations, wanted hip-joint midpoint in world or None).
        Returns [(basis quaternions, pelvis basis location)] with planted feet.

        The pelvis is lowered or raised so the lowest sole point touches z = 0; then
        each foot that is on or near the ground is planted exactly with leg IK
        (plant = 'stance'), or both feet always are (plant = 'always', for standing).
        With `travel` (metres per frame) planted feet are also locked against sliding."""
        offsets, lows = [], []
        for world, want in frames:
            self.toes(world)
            pose, _, _ = self.fk(world, Vector())
            have = 0.5 * ((self.mw @ pose['thigh.L']).translation + (self.mw @ pose['thigh.R']).translation)
            offset = self.mw_inv.to_3x3() @ ((want - have) if want is not None else Vector())
            pose, _, _ = self.fk(world, offset)
            offsets.append(offset)
            lows.append(self.lowest(pose))
        n = len(frames)
        solved = []
        for i, (world, _) in enumerate(frames):
            a, b = (i - 1) % n if loop else max(0, i - 1), (i + 1) % n if loop else min(n - 1, i + 1)
            e = (lows[a] + 2 * lows[i] + lows[b]) / 4.0
            offset = offsets[i] - self.mw_inv.to_3x3() @ Vector((0, 0, e))
            world = dict(world)
            for _ in range(3):
                pose, _, _ = self.fk(world, offset)
                for side in 'LR':
                    low = self.lowest(pose, side)
                    if plant == 'always' or low < 0.0:
                        w = 1.0
                    else:
                        t = max(0.0, min(1.0, (0.045 - low) / 0.03))      # fades out between 1.5 and 4.5 cm
                        w = t * t * (3.0 - 2.0 * t)
                    if abs(low * w) > 2e-4:
                        self.plant(world, pose, side, -low * w)
            solved.append((world, offset))
        if travel is not None:
            self.lock(solved, travel, plant == 'always', loop)
        out = []
        for world, offset in solved:
            self.toes(world, offset)       # final toe bend from the solved foot heights
            _, quats, loc = self.fk(world, offset)
            for name in FINGERS:
                if name in self.rest:
                    curl = finger_curl * (1.0 if '.01.' in name else 1.25) * (0.5 if name.startswith('thumb') else 1.0)
                    quats[name] = Quaternion((1, 0, 0), math.radians(curl))
            out.append((quats, loc))
        return out


def _mean_quat(qs):
    acc = Quaternion((0, 0, 0, 0))
    for q in qs:
        acc = acc + (q if q.dot(qs[0]) >= 0 else -q)
    acc.normalize()
    return acc


def _carry_arms(sv, worlds, carry, pronation):
    """Replace the captured arms with a deliberate, mirrored carriage (degrees).

    The capture's arms are its least reliable part and carry the subject's own habits:
    this one swung his forearms out to the side with the palms turned up. A soldier in
    heavy armour holds them differently, so they are built instead: hung from a level
    shoulder line, swung in time with the opposite leg, fists closed, knuckles forward.

      rest, forward, back   upper-arm angle at mid-swing and the reach either way
      out, converge         how far the arm hangs away from the body, and how much of
                            that closes as the hand comes forward
      elbow, pump, relax    elbow bend, the extra bend at the front of the swing and how
                            far it opens at the back
      twist                 inward roll of the upper arm: turns the elbow out
      follow                0..1, how much of the chest's lean and tilt the arms inherit"""
    def sagittal(world, side):
        d = world[f'thigh.{side}'] @ sv.tip_direction(f'thigh.{side}')
        return math.atan2(-d.y, -d.z)
    for side, sign, other in (('L', 1.0, 'R'), ('R', -1.0, 'L')):
        swing = [sagittal(w, other) for w in worlds]
        mid, reach = 0.5 * (max(swing) + min(swing)), max(1e-6, 0.5 * (max(swing) - min(swing)))
        swing = [(v - mid) / reach for v in swing]
        last = len(swing) - 1
        swing = [0.25 * swing[max(i - 1, 0)] + 0.5 * swing[i] + 0.25 * swing[min(i + 1, last)] for i in range(len(swing))]
        upper_rest, fore_rest = sv.tip_direction(f'upper_arm.{side}'), sv.tip_direction(f'forearm.{side}.003')
        for w, v in zip(worlds, swing):
            chest = w['chest']
            ahead = chest @ Vector((0.0, -1.0, 0.0))
            level = Quaternion((0.0, 0.0, 1.0), math.atan2(ahead.x, -ahead.y))
            base = level.slerp(chest, carry.get('follow', 0.3))
            angle = carry.get('rest', 0.0) + v * (carry['forward'] if v > 0 else carry['back'])
            out = carry['out'] - carry.get('converge', 0.0) * max(v, 0.0)
            bend = carry['elbow'] + carry.get('pump', 0.0) * max(v, 0.0) - carry.get('relax', 0.0) * max(-v, 0.0)
            upper = (base @ Quaternion((1.0, 0.0, 0.0), math.radians(-angle)) @
                     Quaternion((0.0, 1.0, 0.0), math.radians(sign * (90.0 - out))) @
                     Quaternion(upper_rest, math.radians(carry.get('twist', 0.0) * sign)))
            fore = upper @ Quaternion((0.0, 0.0, 1.0), math.radians(-bend * sign)) @ Quaternion(fore_rest, math.radians(pronation * sign))
            w[f'shoulder.{side}'] = chest.copy()
            w[f'upper_arm.{side}'] = upper
            w[f'forearm.{side}.003'] = fore
            w[f'palm.{side}'] = fore.copy()


def _even_gait(data, amount, centre_x):
    """Make a looped gait left-right symmetric (0..1): each side does what the other
    did half a cycle earlier, mirrored, and the spine and pelvis swing equally both ways.
    A captured walk carries its subject's asymmetries - a pelvis held a few degrees to
    one side, one shoulder leading - which on a symmetrical suit of armour read as a
    limp. `data` is the loop from make_loop (its last frame repeats the first)."""
    n = len(data) - 1
    half = n / 2.0
    mirror = lambda q: Quaternion((q.w, q.x, -q.y, -q.z))

    def at(seq, t):
        i, f = int(math.floor(t)) % n, t - math.floor(t)
        return seq[i].slerp(seq[(i + 1) % n], f) if f > 1e-6 else seq[i].copy()
    names = list(data[0][0])
    sided = lambda b: b.endswith('.L') or b.endswith('.R') or '.L.' in b or '.R.' in b
    for bone in names:
        if sided(bone):
            continue
        seq = [data[i][0][bone] for i in range(n)]
        for i in range(n + 1):
            q = seq[i % n]
            data[i][0][bone] = q.slerp(q.slerp(mirror(at(seq, i + half)), 0.5), amount)
    for left in names:
        if not (left.endswith('.L') or '.L.' in left):
            continue
        right = left.replace('.L', '.R')
        if right not in data[0][0]:
            continue
        ls, rs = [data[i][0][left] for i in range(n)], [data[i][0][right] for i in range(n)]
        ideal = [ls[i].slerp(mirror(at(rs, i + half)), 0.5) for i in range(n)]
        for i in range(n + 1):
            data[i][0][left] = ls[i % n].slerp(ideal[i % n], amount)
            data[i][0][right] = rs[i % n].slerp(mirror(at(ideal, i - half)), amount)
    wants = [data[i][1].copy() for i in range(n)]

    def want_at(t):
        i, f = int(math.floor(t)) % n, t - math.floor(t)
        return wants[i].lerp(wants[(i + 1) % n], f)
    for i in range(n + 1):
        a, b = wants[i % n], want_at(i + half)
        ideal = Vector((centre_x + 0.5 * ((a.x - centre_x) - (b.x - centre_x)), 0.5 * (a.y + b.y), 0.5 * (a.z + b.z)))
        data[i] = (data[i][0], a.lerp(ideal, amount))


def retarget(arm, sample: Sample, frames, arm_out=0.0, forearm_in=0.0, finger_curl=26.0, hip_drop=0.0,
             arm_swing=1.0, stance=0.0, loop=True, plant='stance', pronation=-25.0, level=0.0, travel=None, blend=0,
             arm_spread=None, elbow=0.0, elbow_keep=1.0, even_arms=0.0, clavicle=1.0, torso_sway=1.0, lean=0.0, chin=0.0,
             carry=None, even=0.0, posture=None):
    """Mocap frames -> [(basis quaternions, pelvis basis location)], and the length scale.

    arm_out      extra abduction of the arms in degrees (clearance for armour)
    forearm_in   how much of that the forearms give back (elbows out, hands closer)
    arm_swing    scales the arm swing about its mean pose (below 1 = more controlled)
    hip_drop     lowers the pelvis (metres) for a heavier, more bent-knee gait
    stance       widens the feet by rotating the legs outward (degrees)
    pronation    relaxed inward roll of the forearm and hand (degrees)
    level        0..1, how far the average head and upper-spine pose is straightened to
                 the rig's upright rest (the captured subject looks at the floor)
    travel       ground covered per frame in the capture's units; planted feet are locked
                 to it (0 = standing still, None = no foot lock)
    arm_spread   average angle (degrees) the upper arms hang away from the body, whatever
                 the captured subject did; None keeps the capture's (plus arm_out)
    elbow        extra elbow bend in degrees
    elbow_keep   0..1, how much of the captured elbow bend is kept (pumping arms -> hanging arms)
    even_arms    0..1 (loops only): how far the two arms are made mirror images of each
                 other half a cycle apart, the regular contralateral swing of a steady walk
    clavicle     0..1, how much of the captured collar-bone motion is kept; the rest
                 follows the chest, which keeps the shoulders level and paired
    torso_sway   scales the spine's motion about its average pose
    lean         forward lean of the upper body in degrees
    chin         lowers the head by this many degrees (after `level`)
    blend        `frames` start with this many lead-in frames, cross-faded into the tail
                 to close the loop (the result then repeats its first frame at the end)
    carry        authored arm carriage replacing the captured arms (see _carry_arms)
    even         0..1 (loops only): how far the whole gait is made left-right symmetric
    posture      {bone: degrees}: the average forward pitch each trunk bone is given,
                 replacing the captured subject's own carriage (he may lean back, or
                 watch the floor); the motion about that average is kept
    """
    sv = Solver(arm)
    align = {}
    for tgt, (src, child) in MAP.items():
        d_src = ((sample.rest_head[child] if child else sample.rest_tail[src]) - sample.rest_head[src]).normalized()
        align[tgt] = d_src.rotation_difference(sv.tip_direction(tgt)).inverted()
    # Feet: the two skeletons have different ankle heights, so matching the foot bone's
    # direction would tilt the sole. Instead a foot that is flat in the capture must be
    # flat on the rig: align the source's neutral foot to ITS flat-on-floor direction.
    for s, S_ in (('L', 'Left'), ('R', 'Right')):
        # mid-stance: the ankle is low and the foot is under the hip
        low = min(sample.pos[i][f'{S_}Foot'].z for i in frames)
        f = min(frames, key=lambda i: (sample.pos[i][f'{S_}Foot'].z - low) * 4.0 +
                abs(sample.pos[i][f'{S_}Foot'].y - sample.pos[i][f'{S_}UpLeg'].y))
        bone = sample.pos[f][f'{S_}ToeBase'] - sample.pos[f][f'{S_}Foot']
        pitch = math.asin(max(-1.0, min(1.0, -bone.z / bone.length)))
        flat = Vector((0.0, -math.cos(pitch), -math.sin(pitch)))
        d_src = (sample.rest_head[f'{S_}ToeBase'] - sample.rest_head[f'{S_}Foot']).normalized()
        align[f'foot.{s}'] = d_src.rotation_difference(flat).inverted()
    k = sv.leg / sample.leg_length
    worlds = []
    for f in frames:
        R = sample.rot[f]
        world = {tgt: R[src] @ align[tgt] for tgt, (src, _) in MAP.items()}
        world['hips'] = R['Hips'].copy()
        for s, sign in (('L', 1.0), ('R', -1.0)):
            # Forearm roll and wrist are the noisiest channels of the capture and its
            # neutral roll differs from the rig's. Keep only the elbow's swing, then give
            # the hand a relaxed, slightly pronated roll (palm towards the thigh).
            upper, fore = world[f'upper_arm.{s}'], world[f'forearm.{s}.003']
            axis = sv.tip_direction(f'forearm.{s}.003')
            local = upper.inverted() @ fore
            v = Vector((local.x, local.y, local.z))
            twist = Quaternion((local.w, *(axis * v.dot(axis))))
            if twist.magnitude > 1e-9:
                twist.normalize()
                local = local @ twist.conjugated()
            if elbow_keep != 1.0:
                local = Quaternion().slerp(local, elbow_keep)
            fore = upper @ local @ Quaternion(axis, math.radians(pronation * sign))
            world[f'forearm.{s}.003'] = fore
            world[f'palm.{s}'] = fore.copy()
        worlds.append(world)
    if arm_swing != 1.0:
        # scale the shoulder's swing and the elbow's own motion about their average
        # poses; the forearm then hangs from the calmer upper arm
        for side in 'LR':
            upper, fore = f'upper_arm.{side}', f'forearm.{side}.003'
            hinge = [w[upper].inverted() @ w[fore] for w in worlds]
            mean_upper, mean_hinge = _mean_quat([w[upper] for w in worlds]), _mean_quat(hinge)
            for w, h in zip(worlds, hinge):
                w[upper] = mean_upper.slerp(w[upper], arm_swing)
                w[fore] = w[upper] @ mean_hinge.slerp(h, arm_swing)
                w[f'palm.{side}'] = w[fore].copy()
    if torso_sway != 1.0:
        for bone in ('spine1', 'spine2', 'chest'):
            mean = _mean_quat([w[bone] for w in worlds])
            for w in worlds:
                w[bone] = mean.slerp(w[bone], torso_sway)
    if level:
        for bone, amount in (('head.001', level), ('neck', level), ('chest', 0.5 * level), ('spine2', 0.35 * level)):
            mean = _mean_quat([w[bone] for w in worlds])
            fix = Quaternion().slerp(mean, 1.0 - amount) @ mean.inverted()
            for w in worlds:
                w[bone] = fix @ w[bone]
    if posture:
        for bone, pitch in posture.items():
            mean = _mean_quat([w[bone] for w in worlds])
            fix = Quaternion((1, 0, 0), math.radians(pitch)) @ mean.inverted()
            for w in worlds:
                w[bone] = fix @ w[bone]
    if lean or chin:
        forward, nod = Quaternion((1, 0, 0), math.radians(lean)), Quaternion((1, 0, 0), math.radians(lean + chin))
        for w in worlds:
            w['spine2'] = Quaternion((1, 0, 0), math.radians(0.5 * lean)) @ w['spine2']
            w['chest'] = forward @ w['chest']
            for bone in ('neck', 'head.001'):
                w[bone] = nod @ w[bone]
    if carry:
        _carry_arms(sv, worlds, carry, pronation)
    spread = {}
    for s_, sign in (('L', 1.0), ('R', -1.0)):
        for w in worlds:
            if clavicle != 1.0:
                w[f'shoulder.{s_}'] = w['chest'].slerp(w[f'shoulder.{s_}'], clavicle)
            if elbow:
                bend = Quaternion((1, 0, 0), math.radians(-elbow))
                w[f'forearm.{s_}.003'] = bend @ w[f'forearm.{s_}.003']
                w[f'palm.{s_}'] = bend @ w[f'palm.{s_}']
        if arm_spread is not None:
            rest = sv.tip_direction(f'upper_arm.{s_}')
            mean = Vector()
            for w in worlds:
                mean += w[f'upper_arm.{s_}'] @ rest
            spread[s_] = arm_spread - math.degrees(math.atan2(mean.x * sign, -mean.z))
    mid_x = sum(0.5 * (sample.pos[f]['LeftUpLeg'].x + sample.pos[f]['RightUpLeg'].x) for f in frames) / len(frames)
    data = []
    for f, world in zip(frames, worlds):
        P = sample.pos[f]
        for s, sign in (('L', 1.0), ('R', -1.0)):
            out = arm_out + spread.get(s, 0.0)
            if out or forearm_in:
                world[f'upper_arm.{s}'] = Quaternion((0, 1, 0), math.radians(-out * sign)) @ world[f'upper_arm.{s}']
                bend = Quaternion((0, 1, 0), math.radians(-(out - forearm_in) * sign))
                world[f'forearm.{s}.003'] = bend @ world[f'forearm.{s}.003']
                world[f'palm.{s}'] = bend @ world[f'palm.{s}']
            if stance:
                for n in (f'thigh.{s}', f'shin.{s}'):
                    world[n] = Quaternion((0, 1, 0), math.radians(-stance * sign)) @ world[n]
        for s in 'LR':
            world[f'toe.{s}'] = world[f'foot.{s}'].copy()      # bent against the floor by the solver
        hip_src = 0.5 * (P['LeftUpLeg'] + P['RightUpLeg'])
        want = Vector((sv.hip_mid_rest.x + (hip_src.x - mid_x) * k, sv.hip_mid_rest.y,
                       sv.ankle_rest + (hip_src.z - sample.ground) * k - hip_drop))
        data.append((world, want))
    if blend:
        data = make_loop(data, blend)
        if even_arms:
            n = len(data) - 1                                  # the last frame repeats the first
            mirror = lambda q: Quaternion((q.w, q.x, -q.y, -q.z))
            for limb in ('shoulder.{}', 'upper_arm.{}', 'forearm.{}.003', 'palm.{}'):
                left = [data[i][0][limb.format('L')] for i in range(n)]
                right = [data[i][0][limb.format('R')] for i in range(n)]
                half = n // 2
                ideal = [left[i].slerp(mirror(right[(i + half) % n]), 0.5) for i in range(n)]
                for i in range(n + 1):
                    data[i][0][limb.format('L')] = left[i % n].slerp(ideal[i % n], even_arms)
                    data[i][0][limb.format('R')] = right[i % n].slerp(mirror(ideal[(i - half) % n]), even_arms)
        if even:
            _even_gait(data, even, sv.hip_mid_rest.x)
    for world, _ in data:
        for mid, a, b in HALF:
            world[mid] = world[a].slerp(world[b], 0.5)
        for mid, a, b in PADS:
            world[mid] = pad_rotation(sv, world[a], world[b], mid[-1])
    return sv.solve(data, finger_curl, loop, plant, None if travel is None else travel * k), k


def pose_clip(arm, name, directions, seconds=1.0, finger_curl=14.0, lean=0.0):
    """Static authored pose from world limb directions (x = character's left, -y = front,
    z = up), e.g. {'upper_arm.L': (0.5, 0, -0.87)}. Unlisted limbs keep the bind pose,
    except the arms' and legs' right side, which mirror the left when not given."""
    sv = Solver(arm)
    world = {}
    full = dict(directions)
    for bone, d in directions.items():
        if '.L' in bone:
            other = bone.replace('.L', '.R')
            full.setdefault(other, (-d[0], d[1], d[2]))
    for bone, d in full.items():
        world[bone] = sv.tip_direction(bone).rotation_difference(Vector(d).normalized())
    if lean:
        q = Quaternion((1, 0, 0), math.radians(lean))
        for bone in ('spine1', 'spine2', 'chest'):
            world[bone] = q @ world.get(bone, Quaternion())
    for mid, a, b in HALF:
        if a in world or b in world:
            world[mid] = world.get(a, Quaternion()).slerp(world.get(b, Quaternion()), 0.5)
    for mid, a, b in PADS:
        if a in world or b in world:
            world[mid] = pad_rotation(sv, world.get(a, Quaternion()), world.get(b, Quaternion()), mid[-1])
    for s in 'LR':                       # feet stay flat on the ground
        world.setdefault(f'foot.{s}', Quaternion())
        world.setdefault(f'toe.{s}', Quaternion())
    world.setdefault('hips', Quaternion())
    poses = sv.solve([(world, None)], finger_curl, loop=False, plant='always')
    write_action(arm, name, [poses[0]] * (int(seconds * FPS) + 1))
    return {'clip': name, 'source': 'authored pose', 'seconds': seconds, 'speed': 0.0}


def make_loop(frames, blend):
    """Cross-fade the tail of [blend:] into the frames before it so last == first.
    `frames` are (world rotations, wanted hip midpoint) for [f0 - blend, f1]; returns the
    loop f0..f1. Done before the IK, so planting and the foot lock see the final loop."""
    body = frames[blend:]
    pre = frames[:blend + 1]
    n = len(body)
    for i in range(blend + 1):
        w = i / blend
        w = w * w * (3 - 2 * w)
        j = n - 1 - blend + i
        qa, la = body[j]
        qb, lb = pre[i]
        body[j] = ({name: qa[name].slerp(qb[name], w) for name in qa}, la.lerp(lb, w))
    return body


def write_action(arm, name, poses, fps=FPS):
    old = bpy.data.actions.get(name)
    if old:
        bpy.data.actions.remove(old)
    action = bpy.data.actions.new(name)
    if arm.animation_data is None:
        arm.animation_data_create()
    arm.animation_data.action = action
    step = bpy.context.scene.render.fps / fps
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.scale = (1, 1, 1)
    keyed = set()
    for quats, _ in poses:
        keyed.update(quats)
    prev = {}
    for i, (quats, loc) in enumerate(poses):
        frame = i * step
        for bone in keyed:
            pb = arm.pose.bones[bone]
            q = quats.get(bone, Quaternion())
            if bone in prev and prev[bone].dot(q) < 0:
                q = -q
            prev[bone] = q
            pb.rotation_quaternion = q
            pb.keyframe_insert('rotation_quaternion', frame=frame)
        hips = arm.pose.bones['hips']
        hips.location = loc
        hips.keyframe_insert('location', frame=frame)
    # keep it exportable alongside the imported clips
    track = arm.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 0, action)
    track.mute = True
    arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)
    return action


def cycle(sample: Sample, min_len=14, max_len=60, prefer=0.5):
    """Pick the pair of consecutive same-foot heel strikes whose poses match best.
    Returns (start, end, lead) where lead is frames available before start for blending."""
    best = None
    for side in ('Left', 'Right'):
        st = sample.strikes(side)
        for a, b in zip(st, st[1:]):
            if not (min_len <= b - a <= max_len) or a < 2:
                continue
            if sample.heading(a, b).length < 0.7 * sample.leg_length:      # standing fidgets are not a gait
                continue
            err = sum((sample.pos[a][j] - sample.pos[a]['Hips'] - sample.pos[b][j] + sample.pos[b]['Hips']).length
                      for j in ('LeftFoot', 'RightFoot', 'LeftHand', 'RightHand', 'Head'))
            centre = abs((a + b) * 0.5 / sample.count - prefer)
            score = err + centre * sample.leg_length * 0.6
            if best is None or score < best[0]:
                best = (score, a, b)
        if best is not None:      # every loop starts on a left heel strike when the clip allows it
            break
    if best is None:
        raise RuntimeError(f'no gait cycle found (strikes L {sample.strikes("Left")} R {sample.strikes("Right")})')
    return best[1], best[2]


def locomotion(arm, path, name, **opts):
    s = Sample(path)
    s.face_front(0, s.count - 1)          # rough heading so heel strikes can be found
    a, b = cycle(s, **{k: opts.pop(k) for k in ('min_len', 'max_len', 'prefer') if k in opts})
    s.face_front(a, b)                    # exact heading of the chosen cycle
    blend = min(6, a)
    loop, k = retarget(arm, s, list(range(a - blend, b + 1)), travel=s.heading(a, b).length / (b - a), blend=blend, **opts)
    write_action(arm, name, loop)
    print('[motion] twitch', name, {bone: round(v, 1) for bone, v in twitch(loop).items()}, flush=True)
    travel = s.heading(a, b).length * k
    seconds = (b - a) / FPS
    return {'clip': name, 'source': os.path.basename(path), 'seconds': round(seconds, 4),
            'speed': round(travel / seconds, 4), 'stride': round(travel, 4)}


def standing(arm, path, name, start=None, seconds=6.0, blend_seconds=1.0, **opts):
    s = Sample(path)
    n = int(seconds * FPS)
    blend = int(blend_seconds * FPS)
    a = blend + 4 if start is None else max(blend, int(start * FPS))
    b = min(s.count - 1, a + n)
    s.face_front(a, b, moving=False)
    loop, k = retarget(arm, s, list(range(a - blend, b + 1)), plant='always', travel=0.0, blend=blend, **opts)
    write_action(arm, name, loop)
    print('[motion] twitch', name, {bone: round(v, 1) for bone, v in twitch(loop).items()}, flush=True)
    return {'clip': name, 'source': os.path.basename(path), 'seconds': round((b - a) / FPS, 4), 'speed': 0.0}


# clip sets: pace and personality differ per form. `pronation` is calibrated per mesh
# (the two hands are bound with different neutral rolls); `level` lifts the head of the
# captured subject, who watches the floor.
# Pilot: relaxed and upright - arms close to the body, loosely curled hands.
# Armour: heavy and aggressive - fists, elbows flared, shoulders square, head lowered,
# wide stance, short controlled arm swing.
# Upright and squared, the chest a little ahead of the hips, eyes level under a lowered brow.
WALK_POSTURE = {'hips': 2.0, 'spine1': 4.5, 'spine2': 7.0, 'chest': 9.0, 'neck': 7.0, 'head.001': 9.0}
RUN_POSTURE = {'hips': 5.0, 'spine1': 8.0, 'spine2': 11.0, 'chest': 14.0, 'neck': 8.0, 'head.001': 3.0}
WALK_CARRY = {'rest': 0.0, 'forward': 21.0, 'back': 21.0, 'out': 9.0, 'converge': 3.0, 'elbow': 18.0, 'pump': 14.0, 'relax': 8.0,
              'twist': 16.0, 'follow': 0.3}
RUN_CARRY = {'rest': 4.0, 'forward': 34.0, 'back': 30.0, 'out': 10.0, 'converge': 3.0, 'elbow': 74.0, 'pump': 16.0,
             'twist': 12.0, 'follow': 0.4}
SETS = {
    'pilot': [
        ('standing', '77_02', 'aegis_idle', {'level': 0.85, 'finger_curl': 48.0, 'arm_spread': 6.0, 'elbow': 6.0,
                                             'clavicle': 0.3}),
        ('locomotion', '91_22', 'aegis_walk', {'finger_curl': 50.0, 'arm_spread': 6.0, 'elbow_keep': 0.7, 'elbow': 4.0,
                                              'arm_swing': 0.8, 'even_arms': 0.85, 'clavicle': 0.25, 'torso_sway': 0.75,
                                              'stance': 2.0, 'level': 0.6}),
        ('locomotion', '16_55', 'aegis_run', {'finger_curl': 70.0, 'arm_spread': 8.0, 'even_arms': 0.7, 'clavicle': 0.35,
                                             'stance': 1.5}),
    ],
    'armor': [
        ('standing', '77_02', 'aegis_idle', {'finger_curl': 80.0, 'arm_spread': 11.0, 'forearm_in': 4.0, 'elbow': 12.0,
                                             'clavicle': 0.2, 'stance': 2.5, 'pronation': 20.0, 'level': 0.9,
                                             'lean': 1.0, 'chin': 3.0}),
        ('locomotion', '08_05', 'aegis_walk', {'finger_curl': 90.0, 'clavicle': 0.0, 'even': 1.0, 'carry': WALK_CARRY,
                                              'torso_sway': 0.6, 'hip_drop': 0.012, 'stance': 6.0, 'pronation': 20.0,
                                              'posture': WALK_POSTURE}),
        ('locomotion', '09_01', 'aegis_run', {'finger_curl': 92.0, 'clavicle': 0.0, 'even': 1.0, 'carry': RUN_CARRY,
                                             'torso_sway': 0.75, 'stance': 3.0, 'pronation': 20.0, 'posture': RUN_POSTURE}),
    ],
}
# suit-up stance: feet planted, arms held clear of the body so plates can dock
SUITUP = {
    'upper_arm.L': (0.62, 0.02, -0.78), 'forearm.L.003': (0.50, -0.14, -0.85),
    'thigh.L': (0.085, 0.0, -1.0), 'shin.L': (0.085, 0.0, -1.0),
}


LIMB = {'upper_arm': 'upper_arm.{s}', 'forearm': 'forearm.{s}.003', 'thigh': 'thigh.{s}', 'shin': 'shin.{s}', 'foot': 'foot.{s}'}
KNEE_RADIUS = 0.075
FIST_HEIGHT = 0.085


def _turn(pitch, yaw, roll):
    """Degrees -> rotation: + pitch leans forward, + yaw turns left, + roll tilts left."""
    return (Quaternion((0, 0, 1), math.radians(yaw)) @ Quaternion((1, 0, 0), math.radians(pitch)) @
            Quaternion((0, 1, 0), math.radians(roll)))


def _authored(sv, pose):
    """A hero/clips.py pose -> (world delta rotation per bone, scalar channels)."""
    from . import clips
    pose = clips.expand(pose)
    world = {}
    for key, value in pose.items():
        if key[-2:] in ('.L', '.R') and key[:-2] in LIMB:
            bone = LIMB[key[:-2]].format(s=key[-1])
            world[bone] = sv.tip_direction(bone).rotation_difference(Vector(value).normalized())
    hips, chest, head = _turn(*pose.get('hips', (0, 0, 0))), _turn(*pose.get('spine', (0, 0, 0))), _turn(*pose.get('head', (0, 0, 0)))
    world.update({'hips': hips, 'spine1': hips.slerp(chest, 0.3), 'spine2': hips.slerp(chest, 0.65), 'chest': chest,
                  'neck': chest.slerp(head, 0.5), 'head.001': head})
    pair = lambda v: v if isinstance(v, tuple) else (v, v)
    twist, curl, fist = pair(pose.get('twist', 0.0)), pair(pose.get('curl', 30.0)), pose.get('fist', {})
    for i, (side, sign) in enumerate((('L', 1.0), ('R', -1.0))):
        lower = f'forearm.{side}.003'
        world[lower] = world.get(lower, Quaternion()) @ Quaternion(sv.tip_direction(lower), math.radians(twist[i] * sign))
        world[f'shoulder.{side}'] = chest.copy()
        world.setdefault(f'upper_arm.{side}', Quaternion())
        for bone in (f'thigh.{side}', f'shin.{side}', f'foot.{side}'):
            world.setdefault(bone, Quaternion())
    scalars = {'curl.L': curl[0], 'curl.R': curl[1], 'fist.L': fist.get('L', 0.0), 'fist.R': fist.get('R', 0.0),
               'shift.x': pose.get('shift', (0.0, 0.0))[0], 'shift.y': pose.get('shift', (0.0, 0.0))[1]}
    return world, scalars


def key_clip(arm, name, keys, loop=False, grounded=False, lock_feet='LR', free_feet=''):
    """Keyframed authored clip (see hero/clips.py). Keys are eased into one another in
    world space and sampled at FPS. Airborne clips keep the pelvis in place. Grounded
    clips stand on the floor: the pelvis sits where the lowest sole or knee touches,
    feet are planted and locked, and a fist asked onto the floor is put there by arm IK."""
    sv = Solver(arm)
    authored = [(t, *_authored(sv, pose)) for t, pose in keys]
    count = int(round(authored[-1][0] * FPS))
    solved, channels = [], []
    for f in range(count + 1):
        t = min(f / FPS, authored[-1][0])
        k = max(i for i, key in enumerate(authored) if key[0] <= t)
        k = min(k, len(authored) - 2)
        (ta, wa, sa), (tb, wb, sb) = authored[k], authored[k + 1]
        u = max(0.0, min(1.0, (t - ta) / (tb - ta)))
        u = u * u * (3.0 - 2.0 * u)
        world = {bone: wa[bone].slerp(wb[bone], u) for bone in wa}
        ch = {key: sa[key] + (sb[key] - sa[key]) * u for key in sa}
        for mid, a, b in HALF:
            world[mid] = world[a].slerp(world[b], 0.5)
        for mid, a, b in PADS:
            world[mid] = pad_rotation(sv, world[a], world[b], mid[-1])
        for side in 'LR':
            world[f'palm.{side}'] = world[f'forearm.{side}.003'].copy()
            world[f'toe.{side}'] = world[f'foot.{side}'].copy()
        offset = Vector()
        if grounded:
            sv.toes(world)
            pose, _, _ = sv.fk(world, Vector())
            low = min([sv.lowest(pose)] + [(sv.mw @ pose[f'shin.{side}']).translation.z - KNEE_RADIUS for side in 'LR'])
            offset = sv.mw_inv.to_3x3() @ Vector((ch['shift.x'], ch['shift.y'], -low))
            for _ in range(3):
                pose, _, _ = sv.fk(world, offset)
                for side in 'LR':
                    lift = -sv.lowest(pose, side)
                    if abs(lift) > 2e-4 and not (side in free_feet and lift < 0):     # a free foot is only kept out of the floor
                        sv.plant(world, pose, side, lift)
        solved.append((world, offset))
        channels.append(ch)
    if grounded:
        if lock_feet:
            sv.lock(solved, 0.0, True, False, sides=lock_feet)
        for (world, offset), ch in zip(solved, channels):
            for side in 'LR':
                if ch[f'fist.{side}'] > 0.01:
                    for _ in range(2):
                        pose, _, _ = sv.fk(world, offset)
                        end = f'hand.{side}' if f'hand.{side}' in pose else f'palm.{side}'
                        wrist = (sv.mw @ pose[end]).translation
                        sv.reach(world, pose, side, Vector((0.0, 0.0, (FIST_HEIGHT - wrist.z) * ch[f'fist.{side}'])))
    poses = []
    for (world, offset), ch in zip(solved, channels):
        if grounded:
            sv.toes(world, offset)
        _, quats, loc = sv.fk(world, offset)
        for finger in FINGERS:
            if finger in sv.rest:
                curl = ch['curl.' + finger[-1]] * (1.0 if '.01.' in finger else 1.25) * (0.5 if finger.startswith('thumb') else 1.0)
                quats[finger] = Quaternion((1, 0, 0), math.radians(curl))
        poses.append((quats, loc))
    if loop:
        poses[-1] = poses[0]
    write_action(arm, name, poses)
    return {'clip': name, 'source': 'authored', 'seconds': round(count / FPS, 4), 'speed': 0.0}


def twitch(poses):
    """Largest change in a leg bone's turn between successive frame steps, in degrees.
    A smooth gait stays within a few degrees; an IK flip shows as a spike."""
    worst = {}
    for bone in [f'{n}.{s}' for s in 'LR' for n in ('thigh', 'shin', 'foot', 'toe')]:
        steps = [math.degrees(poses[i][0][bone].rotation_difference(poses[i + 1][0][bone]).angle) for i in range(len(poses) - 1)]
        worst[bone] = max((abs(b - a) for a, b in zip(steps, steps[1:])), default=0.0)
    return worst


def build_set(arm, form, mocap_dir, override=None):
    """Create the form's locomotion clips on `arm`. Returns clip metadata.
    `override` replaces retarget options on every clip (used when calibrating)."""
    bpy.context.scene.render.fps = FPS
    meta = []
    for kind, clip, name, opts in SETS[form]:
        path = os.path.join(mocap_dir, clip + '.bvh')
        meta.append((standing if kind == 'standing' else locomotion)(arm, path, name, **{**opts, **(override or {})}))
        print('[motion]', meta[-1], flush=True)
    meta.append(pose_clip(arm, 'aegis_suitup', SUITUP, lean=-1.5))
    from . import clips
    for name, (keys, loop, grounded, forms) in clips.CLIPS.items():
        if form in forms:
            free = clips.FREE_FEET.get(name, '')
            meta.append(key_clip(arm, name, keys, loop, grounded, lock_feet=''.join(x for x in 'LR' if x not in free), free_feet=free))
    if form == 'armor':
        from . import footwork
        meta.extend(footwork.build(arm))
    return meta
