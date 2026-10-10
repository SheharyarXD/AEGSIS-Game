import {
  AnimationAction, AnimationClip, AnimationMixer, Bone, Box3, CylinderGeometry,
  Euler, Group, LoopOnce, LoopRepeat, MathUtils, Mesh, MeshStandardMaterial, Object3D,
  Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack, SkinnedMesh,
} from 'three';
import { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { FlightState } from './FlightState';

type Pose = { position: Vector3; quaternion: Quaternion; scale: Vector3 };
type Attachment = { object: Group; target: Vector3; release: Vector3; phase: number; rotation: Quaternion };
type KeyPose = Record<string, [number, number, number] | Quaternion>;

/** Licensed, skinned robot adaptation. Provenance: public/assets/asset-manifest.json. */
export class AegisSuit {
  private static source: GLTF | null = null;
  private static pending: Promise<void> | null = null;
  public static assetLoadMilliseconds = 0;
  public static readonly assetBytes = 5_116_176;
  public static loadAssets(progress?: (fraction: number) => void): Promise<void> {
    if (this.source) { progress?.(1); return Promise.resolve(); }
    if (this.pending) return this.pending;
    const start = performance.now();
    this.pending = new Promise<void>((resolve, reject) => {
      new GLTFLoader().load('/assets/aegis-operative.glb', (gltf) => {
        this.source = gltf; this.assetLoadMilliseconds = performance.now() - start;
        progress?.(1); resolve();
      }, (event) => progress?.(Math.min(0.99, event.loaded / (event.total || this.assetBytes))), (error) => {
        this.pending = null;
        reject(new Error(`AEGIS character failed to load. Check local assets/aegis-operative.glb. ${String(error)}`));
      });
    });
    return this.pending;
  }

  public readonly group = new Group();
  public readonly visual = new Group();
  public readonly thrusterMounts: Object3D[] = [];
  /** Original glTF names (thigh.L) and Three names (thighL) alias the same bone. */
  public readonly bones = new Map<string, Bone>();
  public ragdollActive = false;
  public readonly height = 2.15;
  public readonly model: Object3D;
  public readonly mixer: AnimationMixer;
  private readonly actions = new Map<string, AnimationAction>();
  private readonly restPose = new Map<string, Pose>();
  private readonly ownedMaterials: MeshStandardMaterial[] = [];
  private readonly attachments: Attachment[] = [];
  private readonly propulsion: Group[] = [];
  private readonly shell = new MeshStandardMaterial({ color: '#293542', metalness: 0.85, roughness: 0.38 });
  private readonly alloy = new MeshStandardMaterial({ color: '#8899a4', metalness: 0.95, roughness: 0.3 });
  private readonly emitter = new MeshStandardMaterial({ color: '#427783', emissive: '#30bcf4', emissiveIntensity: 1.25, metalness: 0.5, roughness: 0.24 });
  private active: AnimationAction;
  private activeName = 'Idle-cycle';
  private actionRemaining = 0;
  private lastState = FlightState.Ground;
  private assemblyProgress = 1;

  constructor() {
    if (!AegisSuit.source) throw new Error('Await AegisSuit.loadAssets() before creating characters.');
    this.group.name = 'AEGIS / VANGUARD operative';
    this.visual.name = 'AEGIS flight orientation'; this.group.add(this.visual);
    this.model = clone(AegisSuit.source.scene);
    this.model.name = 'Licensed Godot TPS robot / AEGIS adaptation'; this.visual.add(this.model);
    this.model.traverse((object) => {
      if (object instanceof Bone) {
        this.bones.set(object.name, object);
        if (/[LR]$/.test(object.name)) this.bones.set(object.name.replace(/([LR])$/, '.$1'), object);
        if (object.name === 'head001') this.bones.set('head.001', object);
      }
      if (object instanceof Mesh) {
        object.castShadow = true; object.receiveShadow = true;
        object.frustumCulled = false;
        const adapt = (source: MeshStandardMaterial): MeshStandardMaterial => {
          const material = source.clone(); material.envMapIntensity = 1.15;
          this.ownedMaterials.push(material); return material;
        };
        object.material = Array.isArray(object.material)
          ? object.material.map(material => adapt(material as MeshStandardMaterial))
          : adapt(object.material as MeshStandardMaterial);
      }
    });
    this.mixer = new AnimationMixer(this.model);
    for (const clip of AegisSuit.source.animations) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.active = this.actions.get(this.activeName)!;
    this.active.play(); this.mixer.update(0.001); this.model.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(this.model, true);
    const scale = this.height / bounds.getSize(new Vector3()).y;
    this.model.scale.setScalar(scale); this.model.position.y = -bounds.min.y * scale;
    this.model.traverse((object) => {
      if (object instanceof Bone) this.restPose.set(object.name, { position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone() });
    });
    this.createFallbackClips(); this.buildPropulsionAndPlates(); this.group.updateMatrixWorld(true);
  }

  public get clipNames(): string[] { return [...this.actions.keys()]; }
  /** Freeze current pose for physics transfer, without resetting bones. */
  public stopAnimation(): void { this.ragdollActive = true; }
  public restartAnimation(): void {
    this.ragdollActive = false; this.visual.rotation.set(0, 0, 0); this.playAction('recover');
  }

  public animate(delta: number, state: FlightState, movementAmount: number, bank: number, speed: number): void {
    if (this.ragdollActive) return;
    const flying = state !== FlightState.Ground && state !== FlightState.Jump;
    this.actionRemaining = Math.max(0, this.actionRemaining - delta);
    if (state === FlightState.Ground && this.lastState !== FlightState.Ground && this.lastState !== FlightState.Jump) this.playAction('land');
    if (this.actionRemaining <= 0) {
      let clip = 'Idle-cycle';
      if (flying) clip = state === FlightState.Hover || state === FlightState.Brake || state === FlightState.Landing ? 'AEGIS-hover' : 'AEGIS-flight';
      else if (state === FlightState.Jump) clip = 'jump_3_midair-cycle';
      else if (movementAmount > 0.08) clip = speed > 3.8 ? 'running_nogun-cycle' : 'walking_nogun-cycle';
      this.transition(clip, 0.2, false);
      if (clip === 'walking_nogun-cycle') this.active.setEffectiveTimeScale(MathUtils.clamp(speed / 2.2, 0.35, 1.6));
      else if (clip === 'running_nogun-cycle') this.active.setEffectiveTimeScale(MathUtils.clamp(speed / 5.4, 0.7, 1.65));
      else this.active.setEffectiveTimeScale(1);
    }
    this.mixer.update(Math.min(delta, 0.05));
    const pitch = flying ? (state === FlightState.Brake ? -0.18 : MathUtils.lerp(0.05, 0.92, Math.min(1, speed / 48))) : 0;
    this.visual.rotation.x = MathUtils.damp(this.visual.rotation.x, pitch, 7, delta);
    this.visual.rotation.z = MathUtils.damp(this.visual.rotation.z, -bank * (flying ? 0.42 : 0.045), 8, delta);
    for (let i = 0; i < this.propulsion.length; i++) this.propulsion[i].rotation.z = MathUtils.damp(this.propulsion[i].rotation.z, (i === 0 ? -1 : 1) * (flying ? 0.2 : 0.02), 5, delta);
    this.emitter.emissiveIntensity = (state === FlightState.Boost ? 2.9 : flying ? 1.9 : 0.7) * (this.assemblyProgress > 0.78 ? 1 : 0.04);
    this.lastState = state;
  }

  public playAction(name: string): void {
    if (this.ragdollActive) return;
    const aliases: Record<string, string> = {
      light: 'AEGIS-punch', punch: 'AEGIS-punch', heavy: 'AEGIS-heavy', grab: 'AEGIS-grab', throw: 'AEGIS-throw',
      guard: 'AEGIS-guard', block: 'AEGIS-guard', dodge: 'AEGIS-dodge', counter: 'AEGIS-heavy',
      hit: 'flinch1', stagger: 'flinch_heavy', recover: 'jump_5_hardlanding', land: 'jump_5_hardlanding',
      slam: 'AEGIS-heavy', finisher: 'AEGIS-heavy', takeoff: 'jump_1_up', idle: 'Idle-cycle',
    };
    const clip = aliases[name] || name;
    if (!this.actions.has(clip)) return;
    this.transition(clip, 0.09, true);
    this.actionRemaining = Math.max(0.12, this.active.getClip().duration - 0.06);
  }

  /** Supplementary panels dock; source armour remains one continuous skinned asset. */
  public assembly(t: number): void {
    this.assemblyProgress = MathUtils.clamp(t, 0, 1);
    for (const attachment of this.attachments) {
      const amount = MathUtils.smoothstep(t, attachment.phase, attachment.phase + 0.18);
      attachment.object.position.copy(attachment.target).addScaledVector(attachment.release, 1 - amount);
      attachment.object.quaternion.copy(attachment.rotation);
    }
    this.emitter.emissiveIntensity = t > 0.78 ? MathUtils.smoothstep(t, 0.78, 0.88) * 1.25 : 0.02;
  }

  /** 0 = intact, 1 = scorched; authored surface scratches are retained. */
  public damage(value: number): void {
    const amount = MathUtils.clamp(value, 0, 1);
    for (const material of this.ownedMaterials) if (material.name === 'playerobot') {
      material.color.setRGB(0.055, 0.078, 0.1).multiplyScalar(1 - amount * 0.42);
      material.roughness = 0.88 + amount * 0.1;
    }
  }

  public dispose(): void {
    this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.model);
    for (const material of this.ownedMaterials) material.dispose();
    this.shell.dispose(); this.alloy.dispose(); this.emitter.dispose();
    // SkeletonUtils creates private bone textures; they are not part of shared GLB materials.
    const skeletons = new Set<SkinnedMesh['skeleton']>();
    this.model.traverse(object => { if (object instanceof SkinnedMesh) skeletons.add(object.skeleton); });
    for (const skeleton of skeletons) skeleton.dispose();
    for (const attachment of this.attachments) attachment.object.traverse(object => { if (object instanceof Mesh) object.geometry.dispose(); });
    this.group.removeFromParent();
  }

  private transition(name: string, duration: number, once: boolean): void {
    if (name === this.activeName && !once) return;
    const next = this.actions.get(name)!;
    if (next === this.active) next.reset();
    else {
      next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
      this.active.crossFadeTo(next, duration, false);
    }
    next.setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity); next.clampWhenFinished = once;
    this.active = next; this.activeName = name;
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
    const hover: KeyPose = { ...arms([0, 0, 0], [[0.25, -1, -0.1], [0, -1, 0.1]], [[-0.25, -1, -0.1], [0, -1, 0.1]]), thighL: [-0.14, 0, 0], thighR: [0.04, 0, 0], kneeL: [0.17, 0, 0], kneeR: [0.12, 0, 0] };
    register('AEGIS-hover', 2, [{ t: 0, pose: hover }, { t: 1, pose: hover }]);
    const flight: KeyPose = { ...hover, ...arms([-0.1, 0, 0], [[0.15, -1, -0.4], [0, -1, -0.25]], [[-0.15, -1, -0.4], [0, -1, -0.25]]), thighL: [-0.18, 0, 0], thighR: [-0.1, 0, 0] };
    register('AEGIS-flight', 2, [{ t: 0, pose: flight }, { t: 1, pose: flight }]);
  }

  private buildPropulsionAndPlates(): void {
    this.group.updateMatrixWorld(true);
    const attach = (boneName: string, point: Vector3, phase: number, release: Vector3): Group => {
      const object = new Group(); object.position.copy(point); this.group.add(object); this.group.updateMatrixWorld(true);
      const bone = this.bones.get(boneName)!; bone.attach(object);
      const worldRotation = bone.getWorldQuaternion(new Quaternion()).invert();
      this.attachments.push({ object, target: object.position.clone(), release: release.clone().applyQuaternion(worldRotation).divideScalar(this.model.scale.x * 0.804), phase, rotation: object.quaternion.clone() });
      return object;
    };
    const part = (parent: Object3D, shape: RoundedBoxGeometry | CylinderGeometry, material: MeshStandardMaterial, x: number, y: number, z: number): Mesh => {
      const mesh = new Mesh(shape, material); mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh); return mesh;
    };
    for (const side of [-1, 1]) {
      const pack = attach('chest', new Vector3(side * 0.23, 1.39, -0.34), 0.58, new Vector3(0, 0.25, -1.5));
      part(pack, new CylinderGeometry(0.085, 0.11, 0.36, 8), this.shell, 0, 0, 0);
      part(pack, new RoundedBoxGeometry(0.05, 0.3, 0.035, 2, 0.008), this.alloy, 0, 0, -0.095);
      for (const y of [-0.08, 0.08]) part(pack, new CylinderGeometry(0.1, 0.1, 0.025, 12), this.alloy, 0, y, 0);
      const nozzle = new Group(); nozzle.position.set(0, -0.18, 0.01); pack.add(nozzle); this.propulsion.push(nozzle);
      part(nozzle, new CylinderGeometry(0.076, 0.1, 0.12, 12, 1, true), this.alloy, 0, 0, 0);
      part(nozzle, new CylinderGeometry(0.046, 0.072, 0.07, 12), this.emitter, 0, -0.04, 0);
      const mount = new Object3D(); mount.position.set(0, -0.12, 0); nozzle.add(mount); this.thrusterMounts.push(mount);
      const shoulder = attach(side > 0 ? 'upper_armL' : 'upper_armR', new Vector3(side * 0.27, 1.58, 0.035), 0.4, new Vector3(side * 1.1, 0.45, 0));
      part(shoulder, new RoundedBoxGeometry(0.19, 0.075, 0.22, 2, 0.025), this.shell, 0, 0, 0);
      part(shoulder, new RoundedBoxGeometry(0.08, 0.012, 0.13, 1, 0.005), this.alloy, 0, 0.045, 0);
      const shin = attach(side > 0 ? 'shinL' : 'shinR', new Vector3(side * 0.17, 0.39, 0.12), 0.16, new Vector3(side * 0.85, 0, 0.8));
      part(shin, new RoundedBoxGeometry(0.12, 0.21, 0.065, 2, 0.02), this.shell, 0, 0, 0);
    }
    const crest = attach('chest', new Vector3(0, 1.4, 0.22), 0.26, new Vector3(0, 0.1, 1.25));
    part(crest, new RoundedBoxGeometry(0.13, 0.045, 0.03, 1, 0.008), this.alloy, 0, 0, 0);
    part(crest, new RoundedBoxGeometry(0.075, 0.009, 0.009, 1, 0.002), this.emitter, 0, 0, 0.02);
    const brow = attach('head001', new Vector3(0.006, 1.94, 0.22), 0.69, new Vector3(0, 0.22, 0.6));
    part(brow, new RoundedBoxGeometry(0.21, 0.038, 0.065, 2, 0.012), this.shell, 0, 0, 0);
    // Original faceted face shield supplements the real skinned head; the rig remains authored.
    const face = attach('head001', new Vector3(0, 1.94, .22), .7, new Vector3(0,.2,.65));
    const hull = new ConvexGeometry([
      new Vector3(-.18,.1,0),new Vector3(.18,.1,0),new Vector3(-.15,-.13,.035),new Vector3(.15,-.13,.035),
      new Vector3(0,-.21,.07),new Vector3(0,.07,.13),new Vector3(-.14,.02,.095),new Vector3(.14,.02,.095),
    ]);
    const shield = new Mesh(hull,this.shell);shield.castShadow=true;face.add(shield);
    for(const side of [-1,1])part(face,new RoundedBoxGeometry(.08,.012,.016,1,.004),this.emitter,side*.061,.045,.113);
  }
}
