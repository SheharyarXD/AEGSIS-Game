import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, Euler, MathUtils, Matrix4, Object3D, Points, Quaternion,
  ShaderMaterial, Vector3,
} from 'three';
import { PartThrusters } from '../vfx/PartThrusters';
import { AegisSuit } from './AegisSuit';
import {
  ARMOR_NECK_AT, ASSEMBLY_PARTS, BODY_HANDOVERS, DEPART_SECONDS, EMBLEM_PULSE, FLIGHT_DISTANCE, FLIGHT_SECONDS, POWER_ON,
  RELEASE_SECONDS, STANCE_SECONDS, SUIT_SECONDS, TIME_SCALE, UNSUIT_RATE, UNSUIT_SECONDS,
} from './assemblyManifest';

export type AssemblyDirection = 'suit' | 'unsuit';
interface Component {
  index: number; stage: number; at: number; duration: number; energyAt: number; spread: number;
  from: Vector3; spin: Quaternion; release: number; emblem: boolean;
  /** Free flight before the approach: its duration, where it starts from (relative to
   * the staging point, character space), the sideways bow of the path, roll, jet size. */
  fly: number; far: Vector3; bow: Vector3; roll: number; nozzle: number;
}
interface Handover { armor: number; pilot: number; armorAt: number; pilotAt: number; release: number }

const STANCE = 'aegis_suitup';
/** Repeatable pseudo-random number in -1..1 for component `i`. */
const scatter = (i: number, salt: number): number => { const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; };
const easeInOut = (x: number): number => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOutBack = (x: number): number => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);

/**
 * The suit-up sequence: every armour group flies in under its own small thruster, brakes
 * at a staging point beside the body, then closes in and docks on the skeleton (see
 * assemblyManifest.ts), while the pilot's body is handed over region by region. Placement
 * is stateless in time, so the same code drives the T-key transformation, its reverse,
 * and the scrubbed intro cinematic; only the smoke trails accumulate.
 */
export class SuitAssembly {
  public active: AssemblyDirection | null = null;
  public time = 0;
  /** Called once per stage as its first component locks (for sound). */
  public onLock?: (stage: number) => void;
  public readonly seconds = { suit: SUIT_SECONDS, unsuit: UNSUIT_SECONDS };
  private readonly components: Component[] = [];
  private readonly handovers: Handover[] = [];
  private readonly glow: Points | null = null;
  private readonly glowPositions = new Float32Array(9);
  private readonly glowLevels = new Float32Array(3);
  private lockedStage = 0;
  private readonly matrix = new Matrix4();
  private readonly shift = new Matrix4();
  private readonly pivot = new Vector3();
  private readonly offset = new Vector3();
  private readonly scale = new Vector3();
  private readonly thrusters: PartThrusters;
  private readonly exhaust = new Vector3();
  private readonly nozzle = new Vector3();
  private readonly rolled = new Quaternion();
  private readonly facing = new Quaternion();
  private readonly turn = new Quaternion();
  private readonly spun = new Quaternion();

  constructor(private readonly armor: AegisSuit, private readonly pilot: AegisSuit | null, root: Object3D) {
    const end = Math.max(...ASSEMBLY_PARTS.map(p => p.at + p.duration + (p.stagger ?? 0))) * TIME_SCALE;
    const release = (suitTime: number): number => (end - suitTime) * UNSUIT_RATE + 0.2;
    for (const part of ASSEMBLY_PARTS) for (const side of part.sided ? ['L', 'R'] : [null]) {
      const index = armor.groupIndex(side ? `${part.group}.${side}` : part.group);
      if (index < 0) continue;
      const mirror = side === 'R' ? -1 : 1;
      const at = (part.at + (side === 'R' ? part.stagger ?? 0 : 0)) * TIME_SCALE, duration = part.duration * TIME_SCALE;
      // free flight: from high and behind, loosely along the side the component docks from
      const n = this.components.length;
      const from = new Vector3(part.from[0] * mirror, part.from[1], part.from[2]);
      const far = from.lengthSq() > 0.01 ? from.clone().normalize().multiplyScalar(0.5) : new Vector3();
      far.add(new Vector3(0.35 * scatter(n, 1) + 0.25 * mirror * (part.sided ? 1 : 0), 0.62, -0.38 + 0.2 * scatter(n, 2))).normalize()
        .multiplyScalar(FLIGHT_DISTANCE * (1 + 0.3 * scatter(n, 3)));
      const bow = new Vector3(0, 1, 0).cross(far).normalize().multiplyScalar(far.length() * 0.1 * scatter(n, 4));
      this.components.push({
        index, stage: part.stage, at, duration, energyAt: (part.energyAt ?? POWER_ON) * TIME_SCALE, spread: part.spread ?? 1,
        from, fly: Math.min(FLIGHT_SECONDS, at - 0.04), far, bow, roll: 1.4 * scatter(n, 5),
        nozzle: MathUtils.clamp(armor.groups[index].radius * 0.5, 0.05, 0.13),
        spin: new Quaternion().setFromEuler(new Euler(MathUtils.degToRad(part.spin[0]), MathUtils.degToRad(part.spin[1] * mirror), MathUtils.degToRad(part.spin[2] * mirror))),
        release: release(at + duration), emblem: part.group === 'emblem',
      });
    }
    for (const handover of BODY_HANDOVERS) for (const side of handover.sided ? ['L', 'R'] : [null]) {
      const name = side ? `${handover.region}.${side}` : handover.region;
      const at = handover.at * TIME_SCALE;
      this.handovers.push({
        armor: armor.groupIndex(name), pilot: pilot ? pilot.groupIndex(name) : -1,
        armorAt: handover.region === 'body_neck' ? ARMOR_NECK_AT * TIME_SCALE : at, pilotAt: at, release: release(at) - 0.05,
      });
    }
    this.thrusters = new PartThrusters(root, this.components.length);
    if (pilot) {
      // stage 1: a soft charge-up at the pilot's chest and wrists
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(this.glowPositions, 3));
      geometry.setAttribute('aLevel', new BufferAttribute(this.glowLevels, 1));
      this.glow = new Points(geometry, new ShaderMaterial({
        transparent: true, depthWrite: false, blending: AdditiveBlending, uniforms: { uColour: { value: new Color('#3aa0ff') } },
        vertexShader: 'attribute float aLevel; varying float vLevel; void main(){ vLevel=aLevel; vec4 mv=viewMatrix*vec4(position,1.0); gl_PointSize=aLevel>0.0?260.0*(0.6+0.4*aLevel)/max(0.1,-mv.z):0.0; gl_Position=projectionMatrix*mv; }',
        fragmentShader: 'uniform vec3 uColour; varying float vLevel; void main(){ float d=length(gl_PointCoord*2.0-1.0); float a=(exp(-d*d*4.5)*0.55+exp(-d*d*40.0)*0.6)*(1.0-smoothstep(0.8,1.0,d))*vLevel; gl_FragColor=vec4(uColour*a,a); }',
      }));
      this.glow.frustumCulled = false; this.glow.visible = false; this.glow.renderOrder = 5; root.add(this.glow);
    }
  }

  public get progress(): number { return this.active ? MathUtils.clamp(this.time / this.seconds[this.active], 0, 1) : 1; }

  public start(direction: AssemblyDirection): void {
    this.active = direction; this.time = 0; this.lockedStage = 0;
    this.armor.hold(STANCE); this.pilot?.hold(STANCE);
    this.apply(direction, 0, 0);
  }

  /** Advance the running sequence. Returns true on the frame it completes. */
  public update(delta: number): boolean {
    if (!this.active) { this.thrusters.update(delta); return false; }     // let the smoke clear
    this.time += delta;
    if (this.time >= this.seconds[this.active]) { this.finish(); this.thrusters.update(delta); return true; }
    this.apply(this.active, this.time, delta);
    this.thrusters.update(delta);
    return false;
  }

  /** Jump straight to the end state of the running sequence (safe to call at any point). */
  public finish(): void {
    if (!this.active) return;
    this.snap(this.active === 'suit' ? 'armor' : 'pilot');
  }

  /** Show one form whole, with no sequence in progress. */
  public snap(form: 'armor' | 'pilot'): void {
    this.active = null; this.time = 0;
    this.armor.hold(null); this.pilot?.hold(null);
    this.armor.resetGroups(true, 1); this.pilot?.resetGroups(true, 1);
    this.armor.setPower(1);
    const armored = form === 'armor' || !this.pilot;
    this.armor.group.visible = armored;
    if (this.pilot) this.pilot.group.visible = !armored;
    if (this.glow) this.glow.visible = false;
    this.thrusters.begin();
  }

  /** Pose the sequence at an absolute time without running it (the intro scrubs this). */
  public seek(direction: AssemblyDirection, time: number): void {
    if (time >= this.seconds[direction]) { this.snap(direction === 'suit' ? 'armor' : 'pilot'); this.thrusters.update(0); return; }
    // scrubbed forward in small steps (the intro), the jets still shed smoke
    const step = this.active === direction ? time - this.time : 0, delta = step > 0 && step < 0.1 ? step : 0;
    this.active = direction; this.time = Math.max(0, time);
    if (this.time < 0.1) this.lockedStage = 0;
    this.armor.hold(STANCE); this.pilot?.hold(STANCE);
    this.apply(direction, this.time, delta);
    this.thrusters.update(delta);
  }

  private apply(direction: AssemblyDirection, time: number, delta: number): void {
    const armor = this.armor, pilot = this.pilot;
    armor.group.visible = true; if (pilot) pilot.group.visible = true;
    armor.group.updateMatrixWorld(true);
    armor.group.getWorldQuaternion(this.facing);
    const suiting = direction === 'suit';
    const power = suiting ? 1 : 1 - MathUtils.smoothstep(time, 0, 0.25);
    this.thrusters.begin();
    for (let n = 0; n < this.components.length; n++) {
      const c = this.components[n];
      // distance/rotation: 1 = at the staging point, 0 = docked. flight: 1 = far away, 0 = at the staging point.
      let distance = 0, rotation = 0, scale = 1, flash = 0, visible = true, energy = power, flight = 0, throttle = 0;
      if (suiting) {
        const u = (time - c.at) / c.duration;
        if (time <= c.at - c.fly) visible = false;
        else if (u <= 0) {
          // free flight under thrust, braking into the staging point
          const tau = 1 - (c.at - time) / c.fly;
          flight = (1 - tau) * (1 - tau); distance = 1; rotation = 1; scale = c.spread * 0.86; throttle = 1;
        } else if (u < 1) {
          if (u < 0.8) {
            // approach with eased acceleration, arriving opened-up and slightly rotated
            const k = easeInOut(u / 0.8);
            distance = MathUtils.lerp(1, 0.07, k); rotation = 1 - k;
            scale = MathUtils.lerp(c.spread, 1, k) * (0.86 + 0.14 * MathUtils.smoothstep(u, 0, 0.12));
            throttle = 1 - MathUtils.smoothstep(u, 0, 0.45);
          } else distance = 0.07 * (1 - easeOutBack((u - 0.8) / 0.2));   // seat, with a small mechanical settle
        }
        const sinceLock = time - (c.at + c.duration * 0.86);
        if (sinceLock > 0) {
          flash = Math.max(0, 1 - sinceLock / 0.2) * 0.22;
          if (c.stage > this.lockedStage) { this.lockedStage = c.stage; this.onLock?.(c.stage); }
        }
        energy = MathUtils.smoothstep(time, c.energyAt, c.energyAt + 0.25);
        if (c.emblem) flash += Math.max(0, 1 - Math.abs(time - EMBLEM_PULSE * TIME_SCALE) / 0.26) * 0.55;
      } else {
        const v = (time - c.release) / RELEASE_SECONDS, w = (time - c.release - RELEASE_SECONDS) / DEPART_SECONDS;
        if (w >= 1) visible = false;
        else if (w > 0) {
          // thruster lit: accelerate away along the path it arrived on
          flight = w * w; distance = 1; rotation = 1; throttle = 1;
          scale = 1.08 * (1 - MathUtils.smoothstep(w, 0.7, 1));
        } else if (v > 0) {
          // release: pop open and back off to the staging point
          scale = MathUtils.lerp(1, 1.08, Math.min(1, v / 0.25));
          distance = rotation = easeInOut(v);
          flash = Math.max(0, 1 - v / 0.3) * 0.16; throttle = MathUtils.smoothstep(v, 0.35, 0.9);
        }
      }
      if (!visible) { armor.setGroupTransform(c.index, null); armor.setGroupFx(c.index, 0, 0, false); continue; }
      if (distance === 0 && rotation === 0 && scale === 1) armor.setGroupTransform(c.index, null);
      else {
        armor.groupPivot(c.index, this.pivot);
        this.offset.copy(c.from).multiplyScalar(distance);
        if (flight > 0) this.offset.addScaledVector(c.far, flight).addScaledVector(c.bow, Math.sin(Math.PI * flight));
        this.offset.applyQuaternion(this.facing);
        // the spin is authored in character space
        this.spun.copy(this.facing).multiply(c.spin).multiply(this.turn.copy(this.facing).invert());
        this.turn.identity().slerp(this.spun, rotation);
        // exhaust leaves along the way the component came from
        this.exhaust.copy(flight > 0 || c.from.lengthSq() < 0.01 ? c.far : c.from).applyQuaternion(this.facing).normalize();
        if (flight > 0) this.turn.premultiply(this.rolled.setFromAxisAngle(this.exhaust, c.roll * flight));
        this.matrix.compose(this.offset.add(this.pivot), this.turn, this.scale.setScalar(scale));
        if (throttle > 0) this.thrusters.jet(n, this.nozzle.copy(this.offset).addScaledVector(this.exhaust, c.nozzle * 1.6), this.exhaust, throttle, c.nozzle, delta);
        this.matrix.multiply(this.shift.makeTranslation(-this.pivot.x, -this.pivot.y, -this.pivot.z));
        armor.setGroupTransform(c.index, this.matrix);
      }
      armor.setGroupFx(c.index, energy, flash, true);
    }
    for (const h of this.handovers) {
      const armored = suiting ? time >= h.armorAt : time < h.release;
      const covered = suiting ? time >= h.pilotAt : time < h.release;
      if (h.armor >= 0) armor.setGroupFx(h.armor, 1, 0, armored);
      if (pilot && h.pilot >= 0) pilot.setGroupFx(h.pilot, 1, 0, !covered);
    }
    this.updateGlow(suiting, time);
  }

  private updateGlow(suiting: boolean, time: number): void {
    if (!this.glow || !this.pilot) return;
    const rise = MathUtils.smoothstep(time, 0.05, STANCE_SECONDS * TIME_SCALE);
    const chest = suiting ? rise * (1 - MathUtils.smoothstep(time, 2.5 * TIME_SCALE, 2.95 * TIME_SCALE)) : 0;
    const wrists = suiting ? rise * (1 - MathUtils.smoothstep(time, 3.2 * TIME_SCALE, 3.7 * TIME_SCALE)) : 0;
    this.glow.visible = chest > 0.01 || wrists > 0.01;
    if (!this.glow.visible) return;
    this.pilot.group.updateMatrixWorld(true);
    const bones = ['chest', 'palmL', 'palmR'];
    for (let i = 0; i < 3; i++) {
      const bone = this.pilot.bones.get(bones[i]);
      if (bone) bone.getWorldPosition(this.pivot); else this.pilot.group.getWorldPosition(this.pivot);
      if (i === 0) this.pivot.add(this.offset.set(0, 0.16, 0.13).applyQuaternion(this.facing));
      this.pivot.toArray(this.glowPositions, i * 3);
      this.glowLevels[i] = (i === 0 ? chest : wrists) * (0.85 + 0.15 * Math.sin(time * 14 + i));
    }
    (this.glow.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (this.glow.geometry.getAttribute('aLevel') as BufferAttribute).needsUpdate = true;
  }
}
