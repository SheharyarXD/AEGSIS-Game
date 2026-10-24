import {
  AnimationAction, AnimationClip, AnimationMixer, AnimationUtils, Bone, Box3, BufferAttribute, Color, ColorRepresentation,
  Euler, Group, LoopOnce, LoopRepeat, MathUtils, Matrix4, Mesh, MeshDepthMaterial, MeshStandardMaterial, Object3D,
  Quaternion, QuaternionKeyframeTrack, RGBADepthPacking, Vector3, Vector4, VectorKeyframeTrack, SkinnedMesh,
} from 'three';
import type { Material, WebGLProgramParametersWithUniforms } from 'three';
import { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { FlightState } from './FlightState';

type Pose = { position: Vector3; quaternion: Quaternion; scale: Vector3 };
type KeyPose = Record<string, [number, number, number] | Quaternion>;
export type SuitVariant = 'armor' | 'pilot';
export interface SuitOptions {
  variant?: SuitVariant;
  energy?: ColorRepresentation;
  /** Use the reduced crowd mesh (armour only). The hero keeps the full model. */
  lod?: boolean;
}
/** A rigid armour component (or a body region) the suit-up sequence can move or hide. */
export interface SuitGroup { name: string; bone: string; center: [number, number, number]; radius: number; body: boolean }
interface MotionInfo { clip: string; seconds: number; speed: number; stride?: number; share?: number }
interface AssetTables { groups: SuitGroup[]; motion: MotionInfo[] }
/** What the body is doing beyond its state and speed; drives the flight and fall blends. */
export interface MotionCues {
  vertical?: number; boost?: boolean;
  /** Angle of the flight path above the horizon, radians. */
  climb?: number;
  /** Fighting on foot: which way he is stepping in his own frame (to his left, ahead), about unit length. */
  step?: { left: number; ahead: number };
}

const LOD_URL = '/assets/aegis-hero-lod.glb';
const ASSETS: Record<SuitVariant, { url: string; bytes: number; height: number }> = {
  armor: { url: '/assets/aegis-hero.glb', bytes: 11_000_000, height: 2.15 },
  pilot: { url: '/assets/aegis-pilot.glb', bytes: 6_000_000, height: 2.06 },
};
/** Emissive surfaces of the armour (energy channels, emblem, thruster cores, visor). */
const EMITTERS = new Set(['M_energy', 'M_visor']);
const MOUNT_ORDER = ['MOUNT_back_L', 'MOUNT_back_R', 'MOUNT_palm_L', 'MOUNT_palm_R', 'MOUNT_foot_L', 'MOUNT_foot_R'];
/** Uniform array size of the assembly shader; the hero uses 67 groups. */
const GROUP_MAX = 72;
const IDLE = 'aegis_idle', WALK = 'aegis_walk', RUN = 'aegis_run';
const HOVER = 'aegis_hover', CRUISE = 'aegis_cruise', BOOST = 'aegis_boost', BRAKE = 'aegis_brake';
const FALL = 'aegis_fall', FALL_FAST = 'aegis_fall_fast', LAND_PREP = 'aegis_land_prep';
/** Turning poses, layered additively over whatever the body is doing in flight. */
const BANKS = ['aegis_bank_l', 'aegis_bank_r'] as const;
/** The body pitches and rolls about its middle, not its feet. */
const PIVOT = new Vector3(0, 1.05, 0);
const AIM_A = new Vector3(), AIM_B = new Vector3(), AIM_C = new Vector3();
/**
 * The pauldron follows where the upper arm points by this share, and takes part in a
 * fore-and-aft swing by only this much of that (the same rule as hero/motion.py pad_rotation).
 */
const PAD_FOLLOW = 0.3, PAD_SAGITTAL = 0.3;
const STANCE = 'aegis_stance';
/** Fighting footwork: one step cycle per direction, all on the same phase. */
const STEPS = ['aegis_combat_f', 'aegis_combat_b', 'aegis_combat_l', 'aegis_combat_r'] as const;
const TURNS = ['aegis_turn_l', 'aegis_turn_r'] as const;
/** How the aim's turn is shared up the spine (pelvis end first); the head takes the rest by looking. */
const TORSO = [['spine1', 0.24], ['spine2', 0.3], ['chest', 0.46]] as const;
/** Most the trunk twists or bows toward an aim, radians: beyond this the feet have to move. */
export const TORSO_LIMIT = { yaw: 0.82, pitch: 0.42 };
/** A firing arm is held this far short of straight. */
const ARM_EXTENSION = 0.9;
const UP = new Vector3(0, 1, 0);
/** Skin weight on the trunk above which the pilot's clothing counts as torso. */
const TRUNK_BONE = /^(spine|chest|shoulder)/;
const TRUNK_SHARE = 0.2;
/** Pilot body regions by skin bone (the armour's come tagged from Blender). */
const BODY_REGIONS: [RegExp, string, boolean][] = [
  [/^(foot|toe|shin|knee)/, 'body_leg_lower', true], [/^thigh/, 'body_leg_upper', true], [/^hips/, 'body_pelvis', false],
  [/^(spine|chest|shoulder)/, 'body_torso', false], [/^upper_arm/, 'body_arm_upper', true], [/^forearm/, 'body_arm_lower', true],
  [/^(palm|f_|thumb)/, 'body_hand', true], [/^(neck|head)/, 'body_neck', false],
];

const ASSEMBLY_PARS_VERTEX = /* glsl */`
  attribute float _group;
  uniform vec4 uGRot[${GROUP_MAX}];
  uniform vec4 uGPos[${GROUP_MAX}];
  uniform vec4 uGFx[${GROUP_MAX}];
  varying vec3 vGFx;
  vec3 aegisRotate(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
`;
const SCRATCH_M = new Matrix4();
const SCRATCH_V = new Vector3();
const SCRATCH_S = new Vector3();
const SCRATCH_Q = new Quaternion();
const SCRATCH_Q2 = new Quaternion();
const SCRATCH_Q3 = new Quaternion();
const SCRATCH_Q4 = new Quaternion();
const IDENTITY = new Quaternion();
const AIM_D = new Vector3(), AIM_E = new Vector3(), AIM_F = new Vector3();

/**
 * AEGIS hero character: original armour (art/aegis-hero) or the unsuited pilot, both
 * skinned to the same gameplay skeleton. Locomotion is retargeted motion capture.
 * Provenance: public/assets/aegis-hero-manifest.json, aegis-pilot-manifest.json.
 */
export class AegisSuit {
  private static sources: Partial<Record<SuitVariant, GLTF>> = {};
  /** Geometry-only crowd mesh; borrows the hero's materials and clips. */
  private static lodSource: GLTF | null = null;
  private static heroMaterials = new Map<string, MeshStandardMaterial>();
  private static pending: Promise<void> | null = null;
  private static readonly additive = new Map<AnimationClip, AnimationClip>();
  /** `clip` as an offset from the first frame of `reference`, so it can be layered on other motion. */
  private static asAdditive(clip: AnimationClip, reference: AnimationClip): AnimationClip {
    let made = this.additive.get(clip);
    if (!made) { made = AnimationUtils.makeClipAdditive(clip.clone(), 0, reference); made.name = `${clip.name}:layer`; this.additive.set(clip, made); }
    return made;
  }
  public static assetLoadMilliseconds = 0;
  public static readonly assetBytes = ASSETS.armor.bytes;
  public static get hasPilot(): boolean { return Boolean(this.sources.pilot); }
  public static loadAssets(progress?: (fraction: number) => void): Promise<void> {
    if (this.sources.armor) { progress?.(1); return Promise.resolve(); }
    if (this.pending) return this.pending;
    const start = performance.now();
    const loader = new GLTFLoader();
    const armor = new Promise<void>((resolve, reject) => {
      loader.load(ASSETS.armor.url, (gltf) => { this.sources.armor = gltf; resolve(); },
        (event) => progress?.(Math.min(0.99, event.loaded / (event.total || ASSETS.armor.bytes))), (error) => {
          this.pending = null;
          reject(new Error(`AEGIS character failed to load. Check local assets/aegis-hero.glb. ${String(error)}`));
        });
    });
    // The pilot and the crowd LOD are optional: without them the game simply stays armoured / full detail.
    const optional = (url: string, store: (gltf: GLTF) => void): Promise<void> => new Promise<void>((resolve) => {
      loader.load(url, (gltf) => { store(gltf); resolve(); }, undefined, () => resolve());
    });
    this.pending = Promise.all([armor, optional(ASSETS.pilot.url, g => { this.sources.pilot = g; }), optional(LOD_URL, g => { this.lodSource = g; })]).then(() => {
      this.sources.armor!.scene.traverse((object) => {
        if (object instanceof Mesh) this.heroMaterials.set((object.material as MeshStandardMaterial).name, object.material as MeshStandardMaterial);
      });
      this.assetLoadMilliseconds = performance.now() - start; progress?.(1);
    });
    return this.pending;
  }

  public readonly group = new Group();
  public readonly visual = new Group();
  public readonly thrusterMounts: Object3D[] = [];
  /** Tube mouths of the shoulder launchers (`userData.side`: 1 left, -1 right); exhaust axis convention as above. */
  public readonly missileMounts: Object3D[] = [];
  /** Original glTF names (thigh.L) and Three names (thighL) alias the same bone. */
  public readonly bones = new Map<string, Bone>();
  public ragdollActive = false;
  public readonly variant: SuitVariant;
  public readonly height: number;
  public readonly model: Object3D;
  public readonly mixer: AnimationMixer;
  /** Ground speeds (world units / s) at which the walk and run clips play without foot sliding. */
  public readonly walkSpeed: number;
  public readonly runSpeed: number;
  /** Rigid armour components and body regions; empty on the crowd LOD. */
  public readonly groups: SuitGroup[] = [];
  private readonly actions = new Map<string, AnimationAction>();
  private readonly restPose = new Map<string, Pose>();
  private readonly ownedMaterials: Material[] = [];
  private readonly emitters: MeshStandardMaterial[] = [];
  private readonly baseColors = new Map<MeshStandardMaterial, Color>();
  private readonly skinned: SkinnedMesh[] = [];
  private readonly weights = new Map<AnimationAction, number>();
  private readonly bankLayers: AnimationAction[] = [];
  private readonly aims: Record<'L' | 'R', { target: Vector3; wanted: boolean; weight: number; kick: number; upper: Bone | null; elbow: Bone | null; fore: Bone | null; palm: Bone | null; mount: Object3D | null; fingers: [Bone, Quaternion][] }> = {
    L: { target: new Vector3(), wanted: false, weight: 0, kick: 0, upper: null, elbow: null, fore: null, palm: null, mount: null, fingers: [] },
    R: { target: new Vector3(), wanted: false, weight: 0, kick: 0, upper: null, elbow: null, fore: null, palm: null, mount: null, fingers: [] },
  };
  /** The trunk's turn and bow toward the aim: what is asked for and what is applied (radians). */
  private readonly torso = { wantYaw: 0, wantPitch: 0, yaw: 0, pitch: 0, bones: [] as [Bone, number][] };
  /** Fighting footwork clips and the ground each covers per cycle (world units); null without them. */
  private footwork: { steps: AnimationAction[]; strides: number[]; turns: AnimationAction[]; stance: AnimationAction } | null = null;
  /** Pace of the fighting steps, world units per second. */
  public readonly combatSpeed = { ahead: 1.6, back: 1.3, side: 1.25 };
  /** Share of a turn-on-the-spot clip by which the body has finished turning. */
  private turnShare = 0.6;
  private readonly turning = { direction: 0, amount: 0, phase: 0 };
  private readonly exact = new Set<AnimationAction>();
  /** 0 at ease .. 1 in the fighting stance. */
  private fight = 0;
  private stepPhase = 0;
  /** Equipment that stays sunk into the armour and hidden until it is called up (missile pods). */
  private stowed: number[] = [];
  private readonly bankWeights = [0, 0];
  private readonly flightClips: boolean;
  private readonly fallClips: boolean;
  private readonly groupRot: Vector4[] = [];
  private readonly groupPos: Vector4[] = [];
  private readonly groupFx: Vector4[] = [];
  private readonly groupBones: (Bone | null)[] = [];
  private readonly pads: { pad: Bone; clavicle: Bone; upper: Bone; padBind: Quaternion; clavicleBind: Quaternion; upperBind: Quaternion; rest: Vector3; fore: Vector3 }[] = [];
  private readonly locomotion: boolean;
  /** Advance the gait by time instead of distance (a character walking on the spot, as in the studio). */
  public treadmill = false;
  /** A threat is close: stand in the fighting stance instead of at ease. */
  public combatReady = false;
  /** A foot comes down (walking or running), for sound. */
  public onStep?: (running: boolean) => void;
  private spinTime = -1;
  private spinDirection = 1;
  private phase = 0;
  private gait = 0;
  private readonly lastPlace = new Vector3(Infinity, 0, 0);
  private oneShot: AnimationAction | null = null;
  private get softLanding(): AnimationAction | null { return this.actions.get('aegis_land_soft') ?? null; }
  private held: string | null = null;
  private actionRemaining = 0;
  private lastState = FlightState.Ground;
  private lastSpeed = 0;
  private lean = 0;
  private pitchNow = 0;
  private rollNow = 0;
  private climbNow = 0;
  private readonly look = { target: new Vector3(), wanted: false, weight: 0, head: null as Bone | null, nose: new Vector3(0, 0, 1) };
  private energy = 1;

  constructor(options: SuitOptions = {}) {
    this.variant = options.variant ?? 'armor';
    const source = AegisSuit.sources[this.variant];
    if (!source) throw new Error('Await AegisSuit.loadAssets() before creating characters.');
    this.height = ASSETS[this.variant].height;
    this.group.name = this.variant === 'armor' ? 'AEGIS armour' : 'AEGIS pilot';
    this.visual.name = 'AEGIS flight orientation'; this.group.add(this.visual);
    const useLod = this.variant === 'armor' && options.lod === true && AegisSuit.lodSource !== null;
    this.model = clone(useLod ? AegisSuit.lodSource!.scene : source.scene);
    this.model.name = `AEGIS ${this.variant} model`; this.visual.add(this.model);
    const tables = (source.userData.aegis ?? { groups: [], motion: [] }) as AssetTables;
    for (let i = 0; i < GROUP_MAX; i++) { this.groupRot.push(new Vector4(0, 0, 0, 1)); this.groupPos.push(new Vector4(0, 0, 0, 1)); this.groupFx.push(new Vector4(1, 0, 1, 0)); }

    const adapted = new Map<MeshStandardMaterial, MeshStandardMaterial>();
    const adapt = (own: MeshStandardMaterial): MeshStandardMaterial => {
      const shared = (useLod && AegisSuit.heroMaterials.get(own.name)) || own;
      let material = adapted.get(shared);
      if (!material) {
        // the hero's metal picks up more of the sky so he does not go black on his shadow side
        material = shared.clone(); material.envMapIntensity = useLod ? 1.2 : 2.3;
        if (EMITTERS.has(shared.name)) {
          if (options.energy !== undefined) material.emissive.set(options.energy);
          // dark base: the emission alone sets the colour, so it stays saturated
          material.color.copy(material.emissive).multiplyScalar(0.05); material.metalness = 0; material.roughness = 0.35;
          this.emitters.push(material);
        } else this.baseColors.set(material, material.color.clone());
        if (!useLod) this.installAssembly(material);
        adapted.set(shared, material); this.ownedMaterials.push(material);
      }
      return material;
    };
    const mounts = new Map<string, Object3D>();
    this.model.traverse((object) => {
      if (object.name.startsWith('MOUNT_')) mounts.set(object.name, object);
      if (object instanceof Bone) {
        this.bones.set(object.name, object);
        if (/[LR]$/.test(object.name)) this.bones.set(object.name.replace(/([LR])$/, '.$1'), object);
        if (object.name === 'head001') this.bones.set('head.001', object);
      }
      if (object instanceof Mesh) {
        object.castShadow = true; object.receiveShadow = true;
        object.frustumCulled = false;
        if (object instanceof SkinnedMesh) this.skinned.push(object);
        object.material = Array.isArray(object.material)
          ? object.material.map(material => adapt(material as MeshStandardMaterial))
          : adapt(object.material as MeshStandardMaterial);
      }
    });
    if (!useLod) this.setupGroups(tables.groups);
    for (const name of MOUNT_ORDER) {
      const mount = mounts.get(name);
      if (!mount) continue;
      const [, kind, side] = name.split('_');
      mount.userData.kind = kind; mount.userData.side = side;
      this.thrusterMounts.push(mount);
    }
    for (const [name, side] of [['MOUNT_missile_L', 1], ['MOUNT_missile_R', -1]] as const) {
      const mount = this.model.getObjectByName(name);
      if (mount) { mount.userData.side = side; this.missileMounts.push(mount); }
    }
    this.setupPads();
    this.setupAim();

    this.mixer = new AnimationMixer(this.model);
    // Clips always come from the full asset; the crowd LOD shares the skeleton.
    for (const clip of source.animations) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.locomotion = this.actions.has(IDLE) && this.actions.has(WALK) && this.actions.has(RUN);
    this.flightClips = [HOVER, CRUISE, BOOST, BRAKE].every(name => this.actions.has(name));
    this.fallClips = [FALL, FALL_FAST, LAND_PREP].every(name => this.actions.has(name));
    const cruise = source.animations.find(clip => clip.name === CRUISE);
    for (const name of BANKS) {
      const clip = source.animations.find(c => c.name === name);
      if (clip && cruise) this.bankLayers.push(this.mixer.clipAction(AegisSuit.asAdditive(clip, cruise)));
    }
    const idle = this.actions.get(this.locomotion ? IDLE : 'Idle-cycle')!;
    idle.play(); this.mixer.update(0.001); this.model.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(this.model, true);
    const scale = this.height / bounds.getSize(new Vector3()).y;
    this.model.scale.setScalar(scale); this.model.position.y = -bounds.min.y * scale;
    const speedOf = (name: string, fallback: number): number => (tables.motion.find(m => m.clip === name)?.speed ?? fallback) * scale;
    this.walkSpeed = speedOf(WALK, 1.5); this.runSpeed = speedOf(RUN, 3.5);
    if (this.variant === 'armor' && [STANCE, ...STEPS, ...TURNS].every(name => this.actions.has(name))) {
      const info = (name: string): MotionInfo | undefined => tables.motion.find(m => m.clip === name);
      this.footwork = {
        steps: STEPS.map(name => this.actions.get(name)!), turns: TURNS.map(name => this.actions.get(name)!), stance: this.actions.get(STANCE)!,
        strides: STEPS.map(name => (info(name)?.stride ?? 0.8) * scale),
      };
      this.combatSpeed.ahead = speedOf(STEPS[0], 1.55); this.combatSpeed.back = speedOf(STEPS[1], 1.25); this.combatSpeed.side = speedOf(STEPS[2], 1.2);
      this.turnShare = info(TURNS[0])?.share ?? 0.6;
    }
    this.model.traverse((object) => {
      if (object instanceof Bone) this.restPose.set(object.name, { position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone() });
    });
    idle.stop();
    this.createFallbackClips(); this.animate(0, FlightState.Ground, 0, 0, 0); this.group.updateMatrixWorld(true);
  }

  public get clipNames(): string[] { return [...this.actions.keys()]; }
  /** Freeze current pose for physics transfer, without resetting bones. */
  public stopAnimation(): void { this.ragdollActive = true; }
  public restartAnimation(): void {
    this.ragdollActive = false; this.visual.rotation.set(0, 0, 0); this.pitchNow = this.rollNow = this.climbNow = 0; this.playAction('recover');
  }

  public animate(delta: number, state: FlightState, movementAmount: number, bank: number, speed: number, cues: MotionCues = {}): void {
    if (this.ragdollActive) return;
    const falling = state === FlightState.Fall || state === FlightState.Landing;
    const flying = state !== FlightState.Ground && state !== FlightState.Jump && !falling;
    const descent = Math.max(0, -(cues.vertical ?? 0));
    this.actionRemaining = Math.max(0, this.actionRemaining - delta);
    // a caller that grades the touchdown starts its own landing; otherwise any return to the ground gets one
    if (state === FlightState.Ground && this.lastState !== FlightState.Ground && this.lastState !== FlightState.Jump && !this.oneShot) this.playAction('land');
    if (this.oneShot === this.softLanding && movementAmount > 0.25) this.actionRemaining = 0;      // a light landing does not hold him up
    if (this.actionRemaining <= 0) this.oneShot = null;

    // pick what should be playing; everything else fades out
    const targets = new Map<AnimationAction, number>();
    let fade = 7, cruising = 0, boosting = 0, diving = 0;
    if (this.oneShot) { targets.set(this.oneShot, 1); fade = 14; }
    else if (this.held && this.actions.has(this.held)) { targets.set(this.actions.get(this.held)!, 1); fade = 5; }
    else if (falling && this.fallClips) {
      // free fall: limbs out to steady a slow drop, a spread arch at speed, legs down to meet the ground
      diving = MathUtils.smoothstep(descent, 16, 34);
      if (state === FlightState.Landing) { targets.set(this.actions.get(LAND_PREP)!, 1); fade = 11; diving = 0; }
      else { targets.set(this.actions.get(FALL)!, 1 - diving); targets.set(this.actions.get(FALL_FAST)!, diving); fade = 5; }
    } else if (flying && this.flightClips) {
      // the faster he goes, the more he draws in: arms to his sides and feet together at full boost
      cruising = MathUtils.smoothstep(speed, 5, 22);
      boosting = Math.max(MathUtils.smoothstep(speed, 22, 50), cues.boost ? MathUtils.smoothstep(speed, 26, 42) : 0);
      if (state === FlightState.Brake) { targets.set(this.actions.get(BRAKE)!, 1); fade = 6; cruising = boosting = 0; }
      else {
        targets.set(this.actions.get(HOVER)!, 1 - cruising);
        targets.set(this.actions.get(CRUISE)!, cruising * (1 - boosting));
        targets.set(this.actions.get(BOOST)!, cruising * boosting);
        fade = 4.5;
      }
    } else if (flying || falling) targets.set(this.actions.get(state === FlightState.Hover || state === FlightState.Brake || falling ? 'AEGIS-hover' : 'AEGIS-flight')!, 1);
    else if (state === FlightState.Jump) targets.set(this.actions.get('jump_3_midair-cycle')!, 1);
    else if (this.locomotion) this.blendLocomotion(delta, speed, targets, cues);
    else {
      const clip = movementAmount > 0.08 ? (speed > 3.8 ? 'running_nogun-cycle' : 'walking_nogun-cycle') : 'Idle-cycle';
      const action = this.actions.get(clip)!; targets.set(action, 1);
      action.setEffectiveTimeScale(clip === 'Idle-cycle' ? 1 : MathUtils.clamp(speed / (clip.startsWith('run') ? 5.4 : 2.2), 0.4, 1.6));
    }
    this.chaseWeights(targets, delta, fade);
    // turning: the chest and head lead, the inside arm tucks, the outside arm reaches
    for (let i = 0; i < this.bankLayers.length; i++) {
      const layer = this.bankLayers[i], lean = flying && !this.oneShot && state !== FlightState.Brake ? MathUtils.clamp(i === 0 ? bank : -bank, 0, 1) * (0.4 + 0.6 * cruising) : 0;
      const weight = this.bankWeights[i] = MathUtils.damp(this.bankWeights[i], lean, 5, delta);
      if (weight > 0.004) { if (!layer.isRunning()) layer.play(); layer.setEffectiveWeight(weight); } else if (layer.isRunning()) layer.stop();
    }
    // Layers, in the order they own the bones:
    //   1. base      the mixer: locomotion or flight, fighting footwork, strikes and one-shots
    //   2. direction the trunk turns and bows toward the aim (applyTorso), within TORSO_LIMIT
    //   3. aim       the head looks, the firing arm reaches and its palm faces the target (applyAim)
    //   4. additive  recoil, inside the arm's reach; the flight bank layers ride in the mixer
    //   5. driven    the pauldrons, solved last from the final collar bone and arm (drivePads)
    // A ragdoll or the transformation returns before any of it. Nothing writes a bone out of turn.
    this.mixer.update(Math.min(delta, 0.05));
    this.applyTorso(delta, flying ? 1 - cruising : falling || this.oneShot ? 0 : 1);
    this.applyAim(delta);
    this.drivePads();

    // The whole body follows what it is really doing: it leans into acceleration on the
    // ground, lies along its path in flight, rears up to brake and falls belly-down.
    const acceleration = delta > 0 ? (speed - this.lastSpeed) / delta : 0; this.lastSpeed = speed;
    this.lean = MathUtils.damp(this.lean, flying || falling ? 0 : MathUtils.clamp(acceleration * 0.012, -0.07, 0.09), 6, delta);
    let pitch = this.lean;
    // in forward flight the body lies along its actual path: nose up in a climb, down in a dive
    this.climbNow = MathUtils.damp(this.climbNow, flying && this.flightClips && !this.oneShot ? MathUtils.clamp(cues.climb ?? 0, -1.3, 1.3) * cruising : 0, 4.5, delta);
    if (this.oneShot && (flying || falling)) pitch = 0.04;
    else if (state === FlightState.Brake) pitch = -0.3;
    else if (flying) pitch = this.flightClips ? MathUtils.lerp(0.06, 1.18, cruising) + 0.14 * boosting - this.climbNow : MathUtils.lerp(0.05, 0.92, Math.min(1, speed / 48));
    else if (falling) pitch = state === FlightState.Landing ? 0.06 : 0.1 + diving * 1.1;
    const airborne = flying || falling;
    this.pitchNow = MathUtils.damp(this.pitchNow, pitch, state === FlightState.Landing ? 9 : falling ? 3.2 : 6, delta);
    // the roll into a turn grows with speed: in the hover he only tips a little
    this.rollNow = MathUtils.damp(this.rollNow, -bank * (flying ? 0.86 * (0.22 + 0.78 * cruising) : falling ? 0.2 : 0.07), flying ? 6 : 8, delta);
    // Roll is about the line of flight and pitch about the shoulders, composed as rotations,
    // so a banked climb or dive turns the way an aircraft does at any attitude.
    let roll = this.rollNow;
    if (this.spinTime >= 0) {
      this.spinTime += delta; const t = Math.min(1, this.spinTime / 0.45), eased = t * t * (3 - 2 * t);
      roll -= this.spinDirection * eased * Math.PI * 2; if (t >= 1) this.spinTime = -1;
    }
    this.visual.quaternion.setFromAxisAngle(SCRATCH_V.set(0, Math.sin(this.climbNow), Math.cos(this.climbNow)), roll)
      .multiply(SCRATCH_Q.setFromAxisAngle(AIM_A.set(1, 0, 0), this.pitchNow));
    this.visual.position.copy(PIVOT).sub(SCRATCH_V.copy(PIVOT).applyQuaternion(this.visual.quaternion));
    this.setEnergy(state === FlightState.Boost ? 2.6 : airborne && !falling ? 1.8 : 1);
    this.lastState = state;
  }

  public playAction(name: string): void {
    if (this.ragdollActive) return;
    const has = (clip: string, fallback: string): string => (this.actions.has(clip) ? clip : fallback);
    const aliases: Record<string, string> = {
      grab: 'AEGIS-grab', throw: 'AEGIS-throw',
      
      hit: 'flinch1', stagger: 'flinch_heavy', recover: 'jump_5_hardlanding',
      slam: 'AEGIS-heavy', finisher: 'AEGIS-heavy', jump: 'jump_1_up', takeoff: has('aegis_takeoff', 'jump_1_up'),
      guard: has('aegis_guard', 'AEGIS-guard'), block: has('aegis_guard', 'AEGIS-guard'), dodge: has('aegis_dodge_back', 'AEGIS-dodge'),
      dodge_l: has('aegis_dodge_l', 'AEGIS-dodge'), dodge_r: has('aegis_dodge_r', 'AEGIS-dodge'), dodge_back: has('aegis_dodge_back', 'AEGIS-dodge'),
      punch: has('aegis_jab', 'AEGIS-punch'), light: has('aegis_jab', 'AEGIS-punch'), heavy: has('aegis_heavy', 'AEGIS-heavy'), counter: has('aegis_counter', 'AEGIS-heavy'),
      land: has('aegis_land_soft', 'jump_5_hardlanding'), land_soft: has('aegis_land_soft', 'jump_5_hardlanding'),
      land_medium: has('aegis_land_medium', 'jump_5_hardlanding'),
      land_heavy: has('aegis_land_heavy', has('aegis_land_medium', 'jump_5_hardlanding')),
    };
    if (name === 'idle') { this.oneShot = null; this.actionRemaining = 0; return; }
    const action = this.actions.get(aliases[name] || name);
    if (!action) return;
    action.reset().setLoop(LoopOnce, 1); action.clampWhenFinished = true; action.setEffectiveTimeScale(1).play();
    this.oneShot = action;
    this.actionRemaining = Math.max(0.12, action.getClip().duration - 0.06);
  }

  /** Hold a looping clip (e.g. the suit-up stance) until released with null. */
  public hold(name: string | null): void { this.held = name; }

  /** Overall brightness of the energy channels and visor (1 = normal). */
  public setPower(level: number): void { this.energy = level; }

  /** 0 = intact, 1 = scorched. */
  public damage(value: number): void {
    const amount = MathUtils.clamp(value, 0, 1);
    for (const [material, base] of this.baseColors) material.color.copy(base).multiplyScalar(1 - amount * 0.45);
  }

  // ------------------------------------------------------------------ assembly groups
  public groupIndex(name: string): number { return this.groups.findIndex(g => g.name === name); }

  /** World position of a group's centre in the current pose. */
  public groupPivot(index: number, target: Vector3): Vector3 {
    const bone = this.groupBones[index];
    return bone ? target.fromArray(this.groups[index].center).applyMatrix4(bone.matrixWorld) : this.group.getWorldPosition(target);
  }

  /** Move a group rigidly: `world` maps its docked placement to where it should be drawn (null = docked). */
  public setGroupTransform(index: number, world: Matrix4 | null): void {
    if (index < 0 || index >= GROUP_MAX) return;
    if (!world || this.skinned.length === 0) { this.groupRot[index].set(0, 0, 0, 1); this.groupPos[index].set(0, 0, 0, 1); return; }
    // the shader works in the skinned mesh's local frame
    const frame = this.skinned[0].matrixWorld;
    const local = SCRATCH_M.copy(frame).invert().multiply(world).multiply(frame);
    local.decompose(SCRATCH_V, SCRATCH_Q, SCRATCH_S);
    this.groupRot[index].set(SCRATCH_Q.x, SCRATCH_Q.y, SCRATCH_Q.z, SCRATCH_Q.w);
    this.groupPos[index].set(SCRATCH_V.x, SCRATCH_V.y, SCRATCH_V.z, SCRATCH_S.x);
  }

  /** energy scales the group's emitters, flash adds a lock pulse, visible hides it entirely. */
  public setGroupFx(index: number, energy: number, flash: number, visible: boolean): void {
    if (index >= 0 && index < GROUP_MAX) this.groupFx[index].set(energy, flash, visible ? 1 : 0, 0);
  }

  public resetGroups(visible = true, energy = 1): void {
    for (let i = 0; i < GROUP_MAX; i++) { this.groupRot[i].set(0, 0, 0, 1); this.groupPos[i].set(0, 0, 0, 1); this.groupFx[i].set(energy, 0, visible ? 1 : 0, 0); }
    for (const i of this.stowed) this.groupFx[i].z = 0;
  }

  public dispose(): void {
    this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.model);
    for (const material of this.ownedMaterials) material.dispose();
    // SkeletonUtils creates private bone textures; they are not part of shared GLB materials.
    const skeletons = new Set<SkinnedMesh['skeleton']>();
    this.model.traverse(object => { if (object instanceof SkinnedMesh) skeletons.add(object.skeleton); });
    for (const skeleton of skeletons) skeleton.dispose();
    this.group.removeFromParent();
  }

  private setEnergy(level: number): void {
    for (const material of this.emitters) material.emissiveIntensity = (material.name === 'M_visor' ? 1.25 : 1.35) * level * this.energy;
  }

  /**
   * Ground locomotion. At ease: idle, walk and run blended by speed on one gait phase.
   * Fighting: the guard stance, four step cycles blended by the direction he is moving in
   * his own frame, and the turn on the spot. Every cycle advances with the ground actually
   * covered, so a planted foot stays where it was put down at any frame rate or speed.
   */
  private blendLocomotion(delta: number, speed: number, targets: Map<AnimationAction, number>, cues: MotionCues): void {
    const idle = this.actions.get(IDLE)!, walk = this.actions.get(WALK)!, run = this.actions.get(RUN)!;
    const place = this.group.position;
    let covered = Math.hypot(place.x - this.lastPlace.x, place.z - this.lastPlace.z);
    if (!(covered < 1.5)) covered = 0;                          // first frame or a teleport
    this.lastPlace.copy(place);
    if (this.treadmill) covered = speed * delta;
    const work = this.footwork;
    this.fight = MathUtils.damp(this.fight, this.combatReady && work ? 1 : 0, 7, delta);
    const fight = this.fight < 0.002 ? 0 : this.fight > 0.998 ? 1 : this.fight, ease = 1 - fight;
    this.exact.clear();

    const moving = MathUtils.smoothstep(speed, this.walkSpeed * 0.04, this.walkSpeed * 0.5);
    const running = MathUtils.smoothstep(speed, this.walkSpeed * 1.12, this.runSpeed * 0.9);
    this.gait = MathUtils.damp(this.gait, running, 6, delta);
    const walkCycle = walk.getClip().duration, runCycle = run.getClip().duration;
    const stride = MathUtils.lerp(this.walkSpeed * walkCycle, this.runSpeed * runCycle, this.gait);
    const before = this.phase;
    this.phase = (this.phase + covered / stride) % 1;
    // each foot comes down once per cycle, half a cycle apart
    if (ease > 0.5 && moving > 0.6 && (this.phase < before || (before < 0.5 && this.phase >= 0.5))) this.onStep?.(this.gait > 0.5);
    walk.time = this.phase * walkCycle; run.time = this.phase * runCycle;
    walk.setEffectiveTimeScale(0); run.setEffectiveTimeScale(0); idle.setEffectiveTimeScale(1);
    if (!work) {
      const stance = this.combatReady ? this.actions.get(STANCE) : undefined;
      targets.set(stance ?? idle, 1 - moving); targets.set(walk, moving * (1 - this.gait)); targets.set(run, moving * this.gait);
      return;
    }
    targets.set(idle, (1 - moving) * ease); targets.set(walk, moving * (1 - this.gait) * ease); targets.set(run, moving * this.gait * ease);
    if (fight === 0) { this.stepPhase = 0; return; }

    const step = cues.step, ahead = step?.ahead ?? 0, left = step?.left ?? 0;
    const stepping = MathUtils.smoothstep(speed, this.combatSpeed.side * 0.06, this.combatSpeed.side * 0.45);
    const share = [Math.max(0, ahead), Math.max(0, -ahead), Math.max(0, left), Math.max(0, -left)];
    const total = share[0] + share[1] + share[2] + share[3] || 1;
    let ground = 0;
    for (let i = 0; i < 4; i++) { share[i] /= total; ground += share[i] * work.strides[i]; }
    const last = this.stepPhase;
    this.stepPhase = stepping > 0.02 ? (this.stepPhase + covered / Math.max(ground, 0.2)) % 1 : 0;
    if (fight > 0.5 && stepping > 0.6 && (this.stepPhase < last || (last < 0.5 && this.stepPhase >= 0.5))) this.onStep?.(false);
    for (let i = 0; i < 4; i++) {
      const action = work.steps[i];
      action.time = this.stepPhase * action.getClip().duration; action.setEffectiveTimeScale(0);
      targets.set(action, fight * stepping * share[i]);
    }
    // turning on the spot: the clip is weighted by how far this turn goes and scrubbed by the caller
    const turn = this.turning, amount = turn.direction === 0 ? 0 : turn.amount * (1 - stepping);
    for (let i = 0; i < 2; i++) {
      const action = work.turns[i], mine = turn.direction === (i === 0 ? 1 : -1);
      if (mine) { action.time = MathUtils.clamp(turn.phase, 0, 0.999) * action.getClip().duration; action.setEffectiveTimeScale(0); }
      targets.set(action, mine ? fight * amount : 0);
      // his feet are being placed against the turning body: the weights must be exact, not eased
      if (amount > 0 || (this.weights.get(action) ?? 0) > 0) { this.exact.add(action); this.exact.add(work.stance); }
    }
    targets.set(work.stance, fight * (1 - stepping) * (1 - amount));
  }

  /** Every action's weight chases its target; anything silent is stopped. */
  private chaseWeights(targets: Map<AnimationAction, number>, delta: number, rate: number): void {
    const first = this.weights.size === 0;
    for (const action of targets.keys()) if (!this.weights.has(action)) this.weights.set(action, 0);
    for (const [action, weight] of this.weights) {
      const target = targets.get(action) ?? 0;
      const next = first || (this.exact.has(action) && this.fight > 0.98) ? target : MathUtils.damp(weight, target, rate, delta);
      if (next < 0.002 && target === 0) { action.stop(); this.weights.delete(action); continue; }
      if (!action.isRunning()) {
        if (action !== this.oneShot) action.setLoop(LoopRepeat, Infinity);
        action.play();
      }
      action.setEffectiveWeight(next); this.weights.set(action, next);
    }
  }

  /**
   * The pauldron bone is driven: it sits on the collar bone and tips toward where the
   * upper arm points, so it lifts clear of a raised arm. It ignores the arm's roll about
   * its own length and most of a fore-and-aft swing; following those is what used to tip
   * one shoulder plate forward and the other back on every step.
   */
  private setupPads(): void {
    const skeleton = this.skinned[0]?.skeleton;
    if (!skeleton) return;
    const bindMatrix = (bone: Bone): Matrix4 => new Matrix4().copy(skeleton.boneInverses[skeleton.bones.indexOf(bone)]).invert();
    const worldBind = (bone: Bone): Quaternion => { const q = new Quaternion(); bindMatrix(bone).decompose(new Vector3(), q, new Vector3()); return q; };
    const bind = (bone: Bone): Quaternion => worldBind(bone.parent as Bone).invert().multiply(worldBind(bone));
    for (const side of ['L', 'R']) {
      const pad = this.bones.get(`shoulderpad${side}`), clavicle = this.bones.get(`shoulder${side}`), upper = this.bones.get(`upper_arm${side}`), elbow = this.bones.get(`forearm${side}`);
      if (!pad || !clavicle || !upper || !elbow || pad.parent !== clavicle.parent) continue;
      if ([pad, clavicle, upper, elbow, pad.parent as Bone].some(bone => skeleton.bones.indexOf(bone) < 0)) continue;
      const clavicleBind = bind(clavicle), chest = worldBind(pad.parent as Bone).invert();
      // where the arm points and which way is ahead, both in the chest's frame at the bind pose
      const rest = new Vector3().setFromMatrixPosition(bindMatrix(elbow)).sub(new Vector3().setFromMatrixPosition(bindMatrix(upper))).normalize().applyQuaternion(chest);
      this.pads.push({ pad, clavicle, upper, padBind: bind(pad), clavicleBind, upperBind: clavicleBind.clone().multiply(bind(upper)), rest, fore: new Vector3(0, 0, 1).applyQuaternion(chest) });
    }
  }

  // ------------------------------------------------------------------ arm aiming
  /** Point a palm at a world position (null lowers the arm). Layered over whatever the body is playing. */
  public aimArm(side: 'L' | 'R', point: Vector3 | null): void { const aim = this.aims[side]; aim.wanted = point !== null; if (point) aim.target.copy(point); }
  /** Turn the head toward a world position (null looks ahead again). */
  public lookAt(point: Vector3 | null): void { this.look.wanted = point !== null; if (point) this.look.target.copy(point); }
  /** A firing arm kicks: 0..1, decays by itself. */
  public kickArm(side: 'L' | 'R', amount = 1): void { this.aims[side].kick = Math.min(1.5, this.aims[side].kick + amount); }
  /** One full roll about the line of flight: the aerial evade. `direction` 1 = to the left. */
  public spin(direction: number): void { this.spinTime = 0; this.spinDirection = direction >= 0 ? 1 : -1; }
  /** Shove the whole body back a little (a launch, a hit taken): radians of pitch, decays by itself. */
  public jolt(radians: number): void { this.pitchNow -= radians; }
  /** 0 = arm at rest, 1 = palm on target. */
  public aimWeight(side: 'L' | 'R'): number { return this.aims[side].weight; }
  /**
   * Turn and bow the trunk toward the aim: `yaw` to his left and `pitch` upward, radians
   * from where the pelvis faces. Clamped to what a spine allows; the caller turns the feet.
   */
  public aimTorso(yaw: number, pitch: number): void {
    this.torso.wantYaw = MathUtils.clamp(yaw, -TORSO_LIMIT.yaw, TORSO_LIMIT.yaw); this.torso.wantPitch = MathUtils.clamp(pitch, -TORSO_LIMIT.pitch, TORSO_LIMIT.pitch);
  }
  /** How far the trunk is turned toward the aim right now, radians. */
  public get torsoYaw(): number { return this.torso.yaw; }
  /**
   * Turning on the spot in the fighting stance. `direction` 1 = to his left, -1 = right,
   * 0 = not turning; `amount` 0..1 is this turn as a share of a quarter turn; `phase` 0..1
   * scrubs the step. The caller turns the root by turnCurve(phase) of the turn.
   */
  public turnStep(direction: number, amount = 0, phase = 0): void { this.turning.direction = Math.sign(direction); this.turning.amount = MathUtils.clamp(amount, 0, 1); this.turning.phase = phase; }
  /** Share of a turn on the spot the body has completed at `phase` (as authored in hero/footwork.py). */
  public turnCurve(phase: number): number { return MathUtils.smoothstep(phase / this.turnShare, 0, 1); }
  public get hasFootwork(): boolean { return this.footwork !== null; }
  /** 0 at ease .. 1 in the fighting stance. */
  public get fighting(): number { return this.fight; }

  private setupAim(): void {
    const skin = this.skinned[0]?.skeleton;
    for (const side of ['L', 'R'] as const) {
      const aim = this.aims[side];
      aim.upper = this.bones.get(`upper_arm${side}`) ?? null; aim.palm = this.bones.get(`palm${side}`) ?? null;
      aim.elbow = this.bones.get(`forearm${side}`) ?? null; aim.fore = this.bones.get(`forearm${side}003`) ?? null;
      aim.mount = this.thrusterMounts.find(m => m.userData.kind === 'palm' && m.userData.side === side) ?? null;
      if (side === 'L') for (const [name, share] of TORSO) { const bone = this.bones.get(name); if (bone) this.torso.bones.push([bone, share]); }
      if (skin && side === 'L') {
        // which way the face points in the head bone's own frame, from the bind pose
        const head = this.bones.get('head.001') ?? this.bones.get('head001') ?? null, index = head ? skin.bones.indexOf(head) : -1;
        if (head && index >= 0) { this.look.head = head; this.look.nose.set(0, 0, 1).applyQuaternion(new Quaternion().setFromRotationMatrix(skin.boneInverses[index])); }
      }
      if (!skin) continue;
      // an open hand is the fingers' bind pose: recover each finger's local rest rotation from the skin
      skin.bones.forEach((bone, i) => {
        if (!/^(f_|thumb)/.test(bone.name) || !bone.name.includes(side) || !(bone.parent instanceof Bone)) return;
        const parent = skin.bones.indexOf(bone.parent);
        if (parent < 0) return;
        const rest = new Matrix4().copy(skin.boneInverses[parent]).multiply(new Matrix4().copy(skin.boneInverses[i]).invert());
        aim.fingers.push([bone, new Quaternion().setFromRotationMatrix(rest)]);
      });
    }
  }

  /** Turn `bone` by a world-space rotation, blended in by `weight`. */
  private turn(bone: Bone, world: Quaternion, weight: number): void {
    bone.getWorldQuaternion(SCRATCH_Q2); bone.parent!.getWorldQuaternion(SCRATCH_Q3);
    bone.quaternion.slerp(SCRATCH_Q3.invert().multiply(world.multiply(SCRATCH_Q2)), weight); bone.updateWorldMatrix(false, true);
  }

  /** The trunk turns toward the aim from the pelvis up, each joint taking its share. */
  private applyTorso(delta: number, allowed: number): void {
    const torso = this.torso;
    torso.yaw = MathUtils.damp(torso.yaw, torso.wantYaw * allowed, 9, delta); torso.pitch = MathUtils.damp(torso.pitch, torso.wantPitch * allowed, 9, delta);
    if (Math.abs(torso.yaw) < 1e-3 && Math.abs(torso.pitch) < 1e-3) return;
    this.group.updateWorldMatrix(true, true);
    // about the body's own up and across axes, wherever it is standing or hovering
    const up = AIM_D.copy(UP).applyQuaternion(this.visual.getWorldQuaternion(SCRATCH_Q)), across = AIM_E.set(1, 0, 0).applyQuaternion(SCRATCH_Q);
    for (const [bone, share] of torso.bones) {
      this.turn(bone, SCRATCH_Q.setFromAxisAngle(up, torso.yaw * share), 1);
      if (Math.abs(torso.pitch) > 1e-3) this.turn(bone, SCRATCH_Q.setFromAxisAngle(AIM_F.copy(across).applyAxisAngle(up, torso.yaw * share), -torso.pitch * share), 1);
    }
  }

  private applyAim(delta: number): void {
    let fresh = false;
    // the head leads: it turns to the threat or the target, within what a neck allows
    const look = this.look;
    look.weight = MathUtils.damp(look.weight, look.wanted ? 1 : 0, look.wanted ? 9 : 5, delta);
    if (look.weight > 0.01 && look.head) {
      this.group.updateWorldMatrix(true, true); fresh = true;
      const nose = AIM_A.copy(look.nose).applyQuaternion(look.head.getWorldQuaternion(SCRATCH_Q)).normalize();
      const to = AIM_C.copy(look.target).sub(look.head.getWorldPosition(AIM_B)).normalize(), angle = nose.angleTo(to);
      if (angle > 1e-3 && angle < 2.2) this.turn(look.head, SCRATCH_Q.setFromUnitVectors(nose, to), look.weight * Math.min(1, 1.0 / angle));
    }
    for (const side of ['L', 'R'] as const) {
      const aim = this.aims[side];
      aim.weight = MathUtils.damp(aim.weight, aim.wanted ? 1 : 0, aim.wanted ? 13 : 7, delta);
      if (aim.weight < 0.01 || !aim.upper || !aim.elbow || !aim.fore || !aim.palm || !aim.mount) { if (aim.weight < 0.01) aim.weight = aim.wanted ? aim.weight : 0; continue; }
      if (!fresh) { this.group.updateWorldMatrix(true, true); fresh = true; }
      aim.kick *= Math.exp(-delta * 13);
      // The arm reaches for the target from the shoulder: nearly straight, the elbow low and a
      // little outside the line, as an arm braced against a recoil is held. (A shot throws
      // the hand up and back for an instant.)
      const shoulder = aim.upper.getWorldPosition(AIM_A), elbow = aim.fore.getWorldPosition(AIM_B), wrist = aim.palm.getWorldPosition(AIM_C);
      const upperLength = shoulder.distanceTo(elbow), foreLength = elbow.distanceTo(wrist);
      const line = AIM_D.copy(aim.target).sub(shoulder).normalize(); line.y += aim.kick * 0.2; line.normalize();
      const reach = (upperLength + foreLength) * (ARM_EXTENSION - 0.1 * Math.min(1, aim.kick));
      const out = AIM_E.set(side === 'L' ? 1 : -1, 0, 0).applyQuaternion(this.group.getWorldQuaternion(SCRATCH_Q));
      const pole = out.multiplyScalar(0.55).addScaledVector(UP, -0.8); pole.addScaledVector(line, -pole.dot(line)).normalize();
      const along = (upperLength * upperLength + reach * reach - foreLength * foreLength) / (2 * reach);
      const bend = AIM_F.copy(shoulder).addScaledVector(line, along).addScaledVector(pole, Math.sqrt(Math.max(0, upperLength * upperLength - along * along)));
      const hand = pole.copy(shoulder).addScaledVector(line, reach);                  // (pole is finished with)
      this.turn(aim.upper, SCRATCH_Q.setFromUnitVectors(elbow.sub(shoulder).normalize(), bend.sub(shoulder).normalize()), aim.weight);
      // the elbow guard takes half the bend and the forearm the rest, as in the authored clips
      for (const [bone, share] of [[aim.elbow, 0.5], [aim.fore, 1]] as const) {
        const from = aim.fore.getWorldPosition(AIM_B), to = AIM_F.copy(hand).sub(from).normalize();
        this.turn(bone, SCRATCH_Q.setFromUnitVectors(aim.palm.getWorldPosition(AIM_C).sub(from).normalize(), to), aim.weight * share);
      }
      // then the wrist bends until the palm itself faces the target
      const e = aim.mount.matrixWorld.elements, normal = AIM_A.set(-e[4], -e[5], -e[6]).normalize();
      this.turn(aim.palm, SCRATCH_Q.setFromUnitVectors(normal, AIM_C.copy(aim.target).sub(aim.palm.getWorldPosition(AIM_B)).normalize()), aim.weight);
      for (const [finger, open] of aim.fingers) finger.quaternion.slerp(open, aim.weight * 0.85);
    }
  }

  private drivePads(): void {
    for (const { pad, clavicle, upper, padBind, clavicleBind, upperBind, rest, fore } of this.pads) {
      // all in the chest's frame: how far each bone has turned from the bind pose
      const a = SCRATCH_Q.copy(clavicle.quaternion).multiply(SCRATCH_Q2.copy(clavicleBind).invert());
      const b = SCRATCH_Q3.copy(clavicle.quaternion).multiply(upper.quaternion).multiply(SCRATCH_Q2.copy(upperBind).invert());
      // where the arm points, seen from the collar bone, with most of its fore-and-aft part taken out
      const points = AIM_D.copy(rest).applyQuaternion(b).applyQuaternion(SCRATCH_Q2.copy(a).invert());
      points.addScaledVector(fore, -(1 - PAD_SAGITTAL) * points.dot(fore));
      if (points.lengthSq() < 1e-8) { pad.quaternion.copy(a).multiply(padBind); continue; }
      const swing = SCRATCH_Q4.setFromUnitVectors(rest, points.normalize());
      pad.quaternion.copy(a).multiply(SCRATCH_Q2.copy(IDENTITY).slerp(swing, PAD_FOLLOW)).multiply(padBind);
    }
  }

  /** Per-vertex group ids drive a rigid transform, an energy gain and a visibility flag. */
  private setupGroups(table: SuitGroup[]): void {
    if (this.variant === 'armor') {
      this.groups.push(...table.slice(0, GROUP_MAX));
      this.stowed = this.groups.map((g, i) => (/^missile_pod/.test(g.name) ? i : -1)).filter(i => i >= 0);
      for (const i of this.stowed) this.groupFx[i].z = 0;
    }
    else {
      // the pilot's regions are derived from each vertex's dominant skin bone
      const index = (name: string): number => {
        let i = this.groups.findIndex(g => g.name === name);
        if (i < 0) { i = this.groups.length; this.groups.push({ name, bone: 'hips', center: [0, 0, 0], radius: 0, body: true }); }
        return i;
      };
      for (const mesh of this.skinned) {
        const joints = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight');
        const ids = new Float32Array(joints.count);
        for (let v = 0; v < joints.count; v++) {
          let best = 0;
          for (let c = 1; c < 4; c++) if (weights.getComponent(v, c) > weights.getComponent(v, best)) best = c;
          const bone = mesh.skeleton.bones[joints.getComponent(v, best)].name;
          const side = /([LR])(\d{3})?$/.exec(bone)?.[1];
          const rule = BODY_REGIONS.find(([pattern]) => pattern.test(bone));
          // clothing that hangs off the trunk (jacket shoulders, lapels, collar base) leaves
          // with the torso even where an arm or the neck has the larger weight
          let trunk = 0;
          for (let c = 0; c < 4; c++) if (TRUNK_BONE.test(mesh.skeleton.bones[joints.getComponent(v, c)].name)) trunk += weights.getComponent(v, c);
          const hangs = rule && (rule[1] === 'body_arm_upper' || rule[1] === 'body_neck') && trunk >= TRUNK_SHARE;
          ids[v] = index(rule && !hangs ? (rule[2] && side ? `${rule[1]}.${side}` : rule[1]) : 'body_torso');
        }
        mesh.geometry = mesh.geometry.clone(); mesh.geometry.setAttribute('_group', new BufferAttribute(ids, 1));
      }
    }
    for (const group of this.groups) this.groupBones.push(this.bones.get(group.bone) ?? this.bones.get(group.bone.replace(/\./g, '')) ?? null);
    const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
    this.installAssembly(depth); this.ownedMaterials.push(depth);
    for (const mesh of this.skinned) if (mesh.geometry.getAttribute('_group')) mesh.customDepthMaterial = depth;
  }

  private installAssembly(material: Material): void {
    material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms): void => {
      shader.uniforms.uGRot = { value: this.groupRot }; shader.uniforms.uGPos = { value: this.groupPos }; shader.uniforms.uGFx = { value: this.groupFx };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${ASSEMBLY_PARS_VERTEX}`)
        .replace('#include <skinnormal_vertex>', `#include <skinnormal_vertex>
          objectNormal = aegisRotate(uGRot[int(_group + 0.5)], objectNormal);
          #ifdef USE_TANGENT
            objectTangent = aegisRotate(uGRot[int(_group + 0.5)], objectTangent);
          #endif`)
        .replace('#include <skinning_vertex>', `#include <skinning_vertex>
          int aegisG = int(_group + 0.5);
          transformed = aegisRotate(uGRot[aegisG], transformed) * uGPos[aegisG].w + uGPos[aegisG].xyz;
          vGFx = uGFx[aegisG].xyz;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGFx;')
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vGFx.z < 0.5) discard;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance = totalEmissiveRadiance * vGFx.x + vec3(0.22, 0.6, 1.0) * vGFx.y;');
    };
    material.customProgramCacheKey = (): string => 'aegis-assembly';
  }

  /** Hand-authored fallback keyframe clips; these are not motion capture. */
  private createFallbackClips(): void {
    const register = (name: string, duration: number, frames: { t: number; pose: KeyPose }[]): void => {
      const times = frames.map(frame => frame.t * duration); const tracks = [];
      for (const [bone, rest] of this.restPose) {
        const rotations: number[] = [];
        for (const frame of frames) {
          const offset = frame.pose[bone] || [0, 0, 0];
          const rotation = offset instanceof Quaternion ? offset : new Quaternion().setFromEuler(new Euler(...offset));
          rotations.push(...rest.quaternion.clone().multiply(rotation).toArray());
        }
        tracks.push(new QuaternionKeyframeTrack(`${bone}.quaternion`, times, rotations));
        tracks.push(new VectorKeyframeTrack(`${bone}.position`, [0, duration], [...rest.position.toArray(), ...rest.position.toArray()]));
        tracks.push(new VectorKeyframeTrack(`${bone}.scale`, [0, duration], [...rest.scale.toArray(), ...rest.scale.toArray()]));
      }
      this.actions.set(name, this.mixer.clipAction(new AnimationClip(name, duration, tracks)));
    };
    // Resolve world-space arm directions once into local keyframes. The source rig's
    // asymmetric mechanical bone axes make arbitrary Euler rotations inappropriate.
    const arms = (chest: [number, number, number], left: number[][], right: number[][]): KeyPose => {
      for (const [name, pose] of this.restPose) this.bones.get(name)!.quaternion.copy(pose.quaternion);
      this.bones.get('chest')!.quaternion.multiply(new Quaternion().setFromEuler(new Euler(...chest)));
      this.group.updateMatrixWorld(true);
      for (const [side, directions] of [['L', left], ['R', right]] as const) {
        for (let index = 0; index < 2; index++) {
          const bone = this.bones.get((index === 0 ? 'upper_arm' : 'forearm') + side)!;
          const tip = this.bones.get((index === 0 ? 'forearm' : 'hand') + side)!;
          const direction = tip.getWorldPosition(new Vector3()).sub(bone.getWorldPosition(new Vector3())).normalize();
          const target = new Vector3().fromArray(directions[index]).normalize();
          const world = new Quaternion().setFromUnitVectors(direction, target).multiply(bone.getWorldQuaternion(new Quaternion()));
          bone.quaternion.copy(bone.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(world));
          this.group.updateMatrixWorld(true);
        }
      }
      const result: KeyPose = {};
      for (const name of ['chest', 'upper_armL', 'forearmL', 'upper_armR', 'forearmR']) result[name] = this.restPose.get(name)!.quaternion.clone().invert().multiply(this.bones.get(name)!.quaternion);
      for (const [name, pose] of this.restPose) this.bones.get(name)!.quaternion.copy(pose.quaternion);
      this.group.updateMatrixWorld(true);
      return result;
    };
    const leftGuard = [[0.1, -0.5, 0.5], [-0.05, 0.7, 0.4]];
    const rightGuard = [[-0.1, -0.5, 0.5], [0.05, 0.7, 0.4]];
    const guard = arms([0.04, 0.02, 0], leftGuard, rightGuard);
    const windup = arms([0.02, -0.4, 0.04], leftGuard, [[-0.5, -0.25, -0.35], [0.1, 0.3, 0.7]]);
    const punch = arms([0.08, 0.38, -0.06], leftGuard, [[-0.02, 0.03, 1], [0, 0, 1]]);
    register('AEGIS-punch', 0.46, [{ t: 0, pose: guard }, { t: 0.25, pose: windup }, { t: 0.43, pose: punch }, { t: 0.57, pose: punch }, { t: 1, pose: {} }]);
    register('AEGIS-heavy', 0.9, [{ t: 0, pose: guard }, { t: 0.4, pose: windup }, { t: 0.58, pose: punch }, { t: 0.7, pose: punch }, { t: 1, pose: {} }]);
    const reach = arms([0.1, 0, 0], [[0.12, -0.2, 0.9], [-0.07, 0.1, 1]], [[-0.12, -0.2, 0.9], [0.07, 0.1, 1]]);
    register('AEGIS-grab', 0.5, [{ t: 0, pose: guard }, { t: 0.45, pose: reach }, { t: 1, pose: reach }]);
    register('AEGIS-throw', 0.72, [{ t: 0, pose: reach }, { t: 0.3, pose: { ...reach, chest: [-0.25, -0.4, 0] } }, { t: 0.56, pose: { ...punch, chest: [0.27, 0.45, 0] } }, { t: 1, pose: {} }]);
    register('AEGIS-guard', 0.65, [{ t: 0, pose: guard }, { t: 1, pose: guard }]);
    register('AEGIS-dodge', 0.5, [{ t: 0, pose: {} }, { t: 0.35, pose: { chest: [0.3, 0.15, 0.35], thighL: [0.18, 0, 0], thighR: [0.22, 0, 0] } }, { t: 1, pose: {} }]);
    // Hover: arms a little out with the palms down for balance, legs together and slightly trailing.
    const hover: KeyPose = { ...arms([0.02, 0, 0], [[0.42, -1, 0.06], [0.30, -1, 0.16]], [[-0.42, -1, 0.06], [-0.30, -1, 0.16]]), thighL: [-0.10, 0, 0], thighR: [0.05, 0, 0], kneeL: [0.14, 0, 0], kneeR: [0.10, 0, 0] };
    const hoverSway: KeyPose = { ...arms([0.03, 0.02, 0.012], [[0.46, -1, 0.02], [0.33, -1, 0.14]], [[-0.39, -1, 0.09], [-0.28, -1, 0.18]]), thighL: [-0.07, 0, 0], thighR: [0.07, 0, 0], kneeL: [0.11, 0, 0], kneeR: [0.13, 0, 0] };
    register('AEGIS-hover', 3.2, [{ t: 0, pose: hover }, { t: 0.5, pose: hoverSway }, { t: 1, pose: hover }]);
    // Flight: arms swept back along the body, legs together.
    const flight: KeyPose = { ...arms([-0.1, 0, 0], [[0.17, -1, -0.34], [0.05, -1, -0.22]], [[-0.17, -1, -0.34], [-0.05, -1, -0.22]]), thighL: [-0.16, 0, 0], thighR: [-0.10, 0, 0], kneeL: [0.10, 0, 0], kneeR: [0.08, 0, 0] };
    register('AEGIS-flight', 2, [{ t: 0, pose: flight }, { t: 1, pose: flight }]);
  }
}
