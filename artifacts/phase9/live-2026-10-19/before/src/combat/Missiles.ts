import {
  AdditiveBlending, BoxGeometry, ConeGeometry, CylinderGeometry, Group, MathUtils, Matrix4, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, Object3D, Quaternion, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PhysicsWorld, RAPIER } from '../physics/PhysicsWorld';
import { AegisSuit } from '../player/AegisSuit';
import { ImpactVfx } from '../vfx/ImpactVfx';
import { PartThrusters } from '../vfx/PartThrusters';
import { TITAN_CONFIG, DemolitionMode } from '../world/titan/TitanConfig';
import { Shootable } from './Projectiles';

/** OFF: fly where the player aims. SOFT: the targeting system's pick near the reticle. HARD: the locked target only. */
export type GuidanceMode = 'OFF' | 'SOFT' | 'HARD';
export const GUIDANCE: GuidanceMode[] = ['SOFT', 'HARD', 'OFF'];
/** Moments of the launch sequence, for sound and feedback. */
export type LauncherEvent = 'unlock' | 'deploy' | 'ready' | 'ignite' | 'retract' | 'closed';

interface Missile {
  mesh: Group; flame: Mesh; position: Vector3; direction: Vector3; speed: number; top: number; age: number; life: number;
  target: Shootable | null; aim: Vector3; attackMode:DemolitionMode;
  breach?:BarrageShot;
}
export interface BarrageShot {token:number;wave:number;target:()=>Vector3;}
interface Pod { cap: number; pod: number; mount: Object3D | null; tilt: Quaternion }

/**
 * Launcher sequence as fractions of `open` seconds: the cap pops off its seat, swings
 * back, and the pod rises and locks. Closing runs the same motion backwards.
 */
const LAUNCHER = { open: 0.55, close: 0.5, pop: [0, 0.16], swing: [0.12, 0.6], rise: [0.42, 1], linger: 0.85, gap: 0.16, cooldown: TITAN_CONFIG.missiles.standard.cooldown, travel: 0.175, traverse: 1.9 };
/** Missile flight: m, m/s, m/s², rad/s. */
const FLIGHT = { muzzle: 18, thrust: 110, top: 85, clear: 0.15, turn: 3.6, life: 6, proximity: 1.5, damage: 38, splash: 14, splashRadius: 3.5 };
const MAGAZINE = 8, RELOAD_SECONDS = 1.6, ENERGY_PER_SHOT = TITAN_CONFIG.missiles.standard.energy;
export const MISSILE_DAMAGE = FLIGHT.damage;
const UP = new Vector3(0, 1, 0), FORWARD = new Vector3(0, 0, 1);
const A = new Vector3(), B = new Vector3(), C = new Vector3(), Q = new Quaternion(), Q2 = new Quaternion();
const M = new Matrix4(), SHIFT = new Matrix4(), ONE = new Vector3(1, 1, 1);
const ramp = (x: number, [from, to]: number[]): number => MathUtils.smoothstep(x, from, to);

/**
 * Shoulder missile system. The launchers are part of the armour model: a cap on each
 * shoulder blade and a four-tube pod stowed beneath it. Firing pops and swings the caps
 * back, raises the pods, turns them onto the line of fire and launches from the tube
 * mouths; then everything stows again.
 *
 * A missile leaves with the hero's own velocity plus its muzzle speed, flies straight
 * until it is clear of the housing, then steers at a bounded rate toward a lead point on
 * its target (or toward the aim point when it has none), accelerating all the way.
 */
export class Missiles {
  readonly group = new Group();
  mode: GuidanceMode = 'SOFT';
  demolition=false;private demolitionCooldown=0;private salvoDemolition=false;
  get demolitionReady(){return this.demolitionCooldown<=0;}
  get demolitionRemaining(){return this.demolitionCooldown;}
  ammo = MAGAZINE;
  launches = 0;private clock=0;readonly launchLog:{time:number;mode:DemolitionMode;wave?:number;token?:number;position:number[];aim:number[]}[]=[];
  hits = 0;
  /** Where the most recent missile left from, and which way (for tests and effects). */
  readonly lastMuzzle = new Vector3();
  readonly lastDirection = new Vector3();
  onImpact?: (position: Vector3, strength: number, struck: boolean,mode?:DemolitionMode,normal?:Vector3) => void;
  onEvent?: (event: LauncherEvent, position: Vector3) => void;
  onBarrageImpact?:(point:Vector3,normal:Vector3,shot:BarrageShot,collider?:RAPIER.Collider)=>void;
  private barrageQueue:BarrageShot[]=[];private barrageLock=false;barrageRounds=0;
  get barrageBusy(){return this.barrageQueue.length>0||this.pool.some(m=>m.life>0&&m.breach);}
  get barrageActive(){return this.barrageLock;}
  get barrageAim(){return this.barrageQueue[0]?.target()??this.pool.find(m=>m.life>0&&m.breach)?.aim??this.salvoAim;}
  get barrageAvailable(){return !this.barrageLock&&this.airborne<=MAGAZINE-4&&this.queue.length===0;}
  beginBarrage(aim?:Vector3,deploy=true){if(!this.barrageAvailable||!this.available)return false;this.barrageLock=true;this.barrageRounds=8;if(aim)this.salvoAim.copy(aim);this.linger=10;if(deploy)this.deployBarrage();return true;}
  deployBarrage(){if(this.barrageLock){this.phase='opening';this.emit('unlock');}}
  barrageWave(shots:BarrageShot[]){if(!this.barrageLock||this.barrageBusy)return false;this.barrageQueue=shots.slice(0,this.barrageRounds);this.gap=.08;this.phase=this.deploy>=.99?'ready':'opening';this.linger=10;return true;}
  endBarrage(){this.barrageRounds=0;this.barrageLock=false;this.barrageQueue=[];this.linger=.45;}
  private readonly pool: Missile[] = [];
  private readonly pods: Pod[] = [];
  private readonly tracks = new Map<Shootable, { position: Vector3; velocity: Vector3 }>();
  private readonly exhaust: PartThrusters;
  private phase: 'stowed' | 'opening' | 'ready' | 'closing' = 'stowed';
  private deploy = 0;            // 0 stowed .. 1 raised and locked
  private queue: (Shootable | null)[] = [];
  private gap = 0;
  private linger = 0;
  private cooldown = 0;
  private reload = 0;
  private side = 0;
  private shown = false;
  private readonly salvoAim = new Vector3();
  private readonly line = new Vector3(0, 0, 1);      // direction the pods are trained on

  constructor(private readonly physics: PhysicsWorld, private readonly vfx: ImpactVfx, private readonly armor: AegisSuit) {
    // one missile shape, shared: ogive nose, armoured body, four fins, a recessed nozzle
    const body = new CylinderGeometry(0.03, 0.03, 0.26, 10).rotateX(Math.PI / 2);
    const nose = new ConeGeometry(0.03, 0.1, 10).rotateX(Math.PI / 2).translate(0, 0, 0.18);
    const tail = new CylinderGeometry(0.03, 0.022, 0.04, 10).rotateX(Math.PI / 2).translate(0, 0, -0.15);
    const fins = [0, 1, 2, 3].map(i => new BoxGeometry(0.004, 0.055, 0.07).translate(0, 0.045, -0.1).rotateZ(i * Math.PI / 2 + Math.PI / 4));
    const shape = mergeGeometries([body, nose, tail, ...fins])!;
    const metal = new MeshStandardMaterial({ color: '#aab3c0', metalness: 0.9, roughness: 0.36 });
    const flameShape = new ConeGeometry(0.024, 0.2, 8).rotateX(-Math.PI / 2).translate(0, 0, -0.27);
    const flameLook = new MeshBasicMaterial({ color: '#cfeaff', transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false });
    for (let i = 0; i < MAGAZINE; i++) {
      const mesh = new Group(), flame = new Mesh(flameShape, flameLook);
      mesh.add(new Mesh(shape, metal), flame); mesh.visible = false; this.group.add(mesh);
      this.pool.push({ mesh, flame, position: new Vector3(), direction: new Vector3(0, 0, 1), speed: 0, top: FLIGHT.top, age: 0, life: 0, target: null, aim: new Vector3(),attackMode:'standard' });
    }
    // motor glow and smoke trail: the pooled jet effect the suit components use
    this.exhaust = new PartThrusters(this.group, MAGAZINE, 360);
    for (const side of ['L', 'R']) {
      const cap = armor.groupIndex(`missile_cap.${side}`), pod = armor.groupIndex(`missile_pod.${side}`);
      if (cap >= 0 && pod >= 0) this.pods.push({ cap, pod, mount: armor.missileMounts.find(m => m.userData.side === (side === 'L' ? 1 : -1)) ?? null, tilt: new Quaternion() });
    }
  }

  get available(): boolean { return this.pods.length > 0; }
  get deployed(): number { return this.deploy; }
  get airborne(): number { return this.pool.filter(m => m.life > 0).length; }
  /** Missiles in the air or queued for a target. */
  assignedTo(target: Shootable): number { return this.pool.filter(m => m.life > 0 && m.target === target).length + this.queue.filter(t => t === target).length; }
  /** Live missiles: position, heading and target, for tests and the HUD. */
  get flights(): { position: Vector3; direction: Vector3; speed: number; target: Shootable | null; age: number }[] { return this.pool.filter(m => m.life > 0); }

  cycleMode(): GuidanceMode { this.mode = GUIDANCE[(GUIDANCE.indexOf(this.mode) + 1) % GUIDANCE.length]; return this.mode; }

  /**
   * Ask for a salvo: one missile per entry of `targets` (null = unguided, toward
   * `aimPoint`). Returns false if the launchers cannot fire right now.
   */
  fire(targets: (Shootable | null)[], aimPoint: Vector3): boolean {
    if(this.barrageLock)return false;
    if(this.demolition&&this.demolitionCooldown>0)return false;
    if (!this.available || this.cooldown > 0 || this.queue.length > 0 || this.ammo <= 0) return false;
    this.salvoDemolition=this.demolition;if(this.salvoDemolition)this.demolitionCooldown=TITAN_CONFIG.missiles.demolition.cooldown;
    this.queue = targets.slice(0, this.ammo); this.gap = 0.08; this.cooldown = LAUNCHER.cooldown; this.salvoAim.copy(aimPoint);
    if (this.phase === 'stowed' || this.phase === 'closing') { if (this.phase === 'stowed') this.emit('unlock'); this.phase = 'opening'; }
    this.linger = LAUNCHER.linger;
    return true;
  }

  private emit(event: LauncherEvent): void { this.onEvent?.(event, this.armor.group.getWorldPosition(A).add(B.set(0, 1.5, 0))); }

  /** Fixed-step update: launcher state, launches and missile flight. `drain` charges the reactor per shot. */
  update(dt: number, targets: Shootable[], playerVelocity: Vector3, aimPoint: Vector3, drain: (energy: number) => boolean): void {
    this.clock+=dt;this.cooldown = Math.max(0, this.cooldown - dt);this.demolitionCooldown=Math.max(0,this.demolitionCooldown-dt);
    const before = this.deploy;
    if (this.phase === 'opening') {
      this.deploy = Math.min(1, this.deploy + dt / LAUNCHER.open);
      if (before < LAUNCHER.rise[0] && this.deploy >= LAUNCHER.rise[0]) this.emit('deploy');
      if (this.deploy >= 1) { this.phase = 'ready'; this.emit('ready'); }
    } else if (this.phase === 'closing') {
      this.deploy = Math.max(0, this.deploy - dt / LAUNCHER.close);
      if (this.deploy <= 0) { this.phase = 'stowed'; this.emit('closed'); }
    } else if (this.phase === 'ready') {
      if(this.barrageQueue.length){this.gap-=dt;if(this.gap<=0){const shot=this.barrageQueue.shift()!;this.launch(null,playerVelocity,shot);this.gap=.24;}}
      else if (this.queue.length > 0) {
        this.gap -= dt;
        if (this.gap <= 0) {
          const target = this.queue.shift()!;
          if (drain(this.salvoDemolition?TITAN_CONFIG.missiles.demolition.energy:ENERGY_PER_SHOT)) this.launch(target, playerVelocity); else this.queue.length = 0;
          this.gap = LAUNCHER.gap;
        }
      } else if(!this.barrageLock){ this.linger -= dt; if (this.linger <= 0) { this.phase = 'closing'; this.emit('retract'); } }
    } else if (this.ammo < MAGAZINE) { this.reload += dt; if (this.reload >= RELOAD_SECONDS) { this.reload = 0; this.ammo++; } }

    // the pods train on the line of fire while they are up
    if (this.deploy > 0) {
      const wanted = A.copy(this.barrageQueue[0]?.target()??(this.queue[0] ? B.copy(this.queue[0].position).add(UP) : this.queue.length ? this.salvoAim : aimPoint)).sub(this.armor.group.getWorldPosition(C).add(B.set(0, 1.5, 0)));
      if (wanted.lengthSq() > 1) {
        wanted.normalize();
        const angle = this.line.angleTo(wanted), most = LAUNCHER.traverse * dt * 4;
        if (angle > 1e-4) this.line.applyQuaternion(Q.setFromUnitVectors(this.line, wanted).slerp(Q2.identity(), 1 - Math.min(1, most / angle))).normalize();
      }
    }

    for (const target of targets) {
      const track = this.tracks.get(target);
      if (!track) this.tracks.set(target, { position: target.position.clone(), velocity: new Vector3() });
      else { track.velocity.lerp(A.copy(target.position).sub(track.position).divideScalar(dt), 0.25); track.position.copy(target.position); }
    }
    for (let i = 0; i < this.pool.length; i++) if (this.pool[i].life > 0) this.fly(this.pool[i], i, dt, targets);
  }

  /** Where a pod's tubes point and where their mouth is, with the pod trained on the line of fire. */
  private muzzle(pod: Pod, position: Vector3, direction: Vector3): void {
    const mount = pod.mount!;
    mount.updateWorldMatrix(true, false);
    const e = mount.matrixWorld.elements;
    direction.set(-e[4], -e[5], -e[6]).normalize();
    // the pod can only swing so far off its own axis: beyond that the tubes would point into the armour
    const off = direction.angleTo(this.line), reach = Math.min(off, LAUNCHER.traverse);
    pod.tilt.setFromUnitVectors(direction, this.line);
    if (off > 1e-4) pod.tilt.slerp(Q2.identity(), 1 - reach / off);
    this.armor.groupPivot(pod.pod, C);
    position.setFromMatrixPosition(mount.matrixWorld).sub(C).applyQuaternion(pod.tilt).add(C);
    direction.applyQuaternion(pod.tilt).normalize();
  }

  private launch(target: Shootable | null, playerVelocity: Vector3,breach?:BarrageShot): void {
    const missile = this.pool.find(m => m.life <= 0), pod = this.pods[this.side++ % this.pods.length];
    if (!missile || !pod.mount) return;
    this.muzzle(pod, missile.position, missile.direction);
    // each shot leaves from a different tube of the 2 x 2 block
    const tube = this.launches % 4, across = A.crossVectors(missile.direction, UP).normalize(), over = B.crossVectors(across, missile.direction).normalize();
    missile.position.addScaledVector(across, tube % 2 ? 0.023 : -0.023).addScaledVector(over, tube > 1 ? 0.023 : -0.023);
    // it carries the hero's own speed along its axis, so a launch at boost still pulls ahead
    const carried = Math.max(0, playerVelocity.dot(missile.direction));
    missile.speed = FLIGHT.muzzle + carried; missile.top = FLIGHT.top + carried * 0.6;
    missile.breach=breach;missile.attackMode=!breach&&this.salvoDemolition?'demolition':'standard';missile.age = 0; missile.life = FLIGHT.life; missile.target = target; missile.aim.copy(breach?breach.target():target ? A.copy(target.position).add(UP) : this.salvoAim);
    missile.mesh.visible = true; missile.mesh.position.copy(missile.position); this.orient(missile);
    this.lastMuzzle.copy(missile.position); this.lastDirection.copy(missile.direction);
    if(breach)this.barrageRounds--;else this.ammo--;this.launches++;this.launchLog.push({time:this.clock,mode:missile.attackMode,wave:breach?.wave,token:breach?.token,position:missile.position.toArray(),aim:missile.aim.toArray()});if(this.launchLog.length>128)this.launchLog.shift();
    this.vfx.burst(missile.position, 0.3, missile.direction, false);       // ignition at the tube mouth
    this.onEvent?.('ignite', missile.position);
  }

  private fly(missile: Missile, index: number, dt: number, targets: Shootable[]): void {
    missile.age += dt; missile.life -= dt;
    missile.speed = Math.min(missile.top, missile.speed + FLIGHT.thrust * dt);
    if (missile.age > FLIGHT.clear) {
      // steer toward where the target will be, never faster than the airframe can turn
      if (missile.target && missile.target.health <= 0) missile.target = this.reacquire(missile, targets);
      const target = missile.target;
      if (target) {
        const track = this.tracks.get(target), distance = A.copy(target.position).add(UP).sub(missile.position).length();
        missile.aim.copy(target.position).add(UP);
        if (track) missile.aim.addScaledVector(track.velocity, Math.min(1.2, distance / Math.max(20, missile.speed)));
      }
      const wanted = A.copy(missile.aim).sub(missile.position);
      if (wanted.lengthSq() > 1) {
        wanted.normalize();
        const angle = missile.direction.angleTo(wanted), most = FLIGHT.turn * MathUtils.clamp(missile.age / 0.45, 0.25, 1) * dt;
        if (angle > 1e-4) missile.direction.applyQuaternion(Q.setFromUnitVectors(missile.direction, wanted).slerp(Q2.identity(), 1 - Math.min(1, most / angle))).normalize();
      }
    }
    const step = missile.speed * dt;
    let wall = this.physics.world.castRayAndGetNormal(new RAPIER.Ray(missile.position, missile.direction), step, true, RAPIER.QueryFilterFlags.ONLY_FIXED);
    // Structural warheads punch through loose fragments; intact architecture,
    // falling structural masses and major ruin hulls still stop the real ray.
    if(wall&&missile.attackMode==='demolition'&&this.physics.surfaces.get(wall.collider.handle)?.kind==='debris'){
      this.vfx.burst(missile.position.clone().addScaledVector(missile.direction,wall.timeOfImpact),.5,new Vector3(wall.normal.x,wall.normal.y,wall.normal.z),true);
      wall=this.physics.world.castRayAndGetNormal(new RAPIER.Ray(missile.position,missile.direction),step,true,RAPIER.QueryFilterFlags.ONLY_FIXED,undefined,undefined,undefined,c=>this.physics.surfaces.get(c.handle)?.kind!=='debris');
    }
    const travelled = wall ? wall.timeOfImpact : step;
    const from = B.copy(missile.position);
    missile.position.addScaledVector(missile.direction, travelled);
    let struck: Shootable | null = null;
    for (const target of targets) {
      if (target.health <= 0) continue;
      // closest approach of this step's path to the target
      const centre = C.copy(target.position).add(UP), along = MathUtils.clamp(A.copy(centre).sub(from).dot(missile.direction), 0, travelled);
      if (A.copy(from).addScaledVector(missile.direction, along).distanceTo(centre) < FLIGHT.proximity) { struck = target; missile.position.copy(from).addScaledVector(missile.direction, along); break; }
    }
    missile.mesh.position.copy(missile.position); this.orient(missile);
    missile.flame.scale.set(1, 1, 0.7 + Math.random() * 0.6);
    this.exhaust.jet(index, A.copy(missile.position).addScaledVector(missile.direction, -0.19), B.copy(missile.direction).negate(), 1, 0.045, dt);
    const arrived=!!missile.breach&&missile.position.distanceToSquared(missile.aim)<Math.max(.7,step*1.1)**2;
    if (struck || wall || arrived || missile.life <= 0) this.detonate(missile, struck, targets, wall ? new Vector3(wall.normal.x, wall.normal.y, wall.normal.z) : missile.direction.clone().negate(),wall?.collider);
  }

  /** The target is gone: take another one that is roughly ahead, or fly on unguided. */
  private reacquire(missile: Missile, targets: Shootable[]): Shootable | null {
    let best: Shootable | null = null, bestAngle = 0.7;
    for (const target of targets) {
      if (target.health <= 0) continue;
      const angle = missile.direction.angleTo(A.copy(target.position).add(UP).sub(missile.position));
      if (angle < bestAngle) { bestAngle = angle; best = target; }
    }
    return best;
  }

  private detonate(missile: Missile, struck: Shootable | null, targets: Shootable[], normal: Vector3,collider?:RAPIER.Collider): void {
    missile.life = 0; missile.mesh.visible = false;
    this.vfx.burst(missile.position, 2.4, normal, false); this.vfx.burst(missile.position, 1.5, normal, true);
    this.vfx.shockwave(A.copy(missile.position).setY(Math.max(0.05, missile.position.y - 1)), 2.6, 0.35);
    if (struck) { struck.hit(FLIGHT.damage, missile.direction); this.hits++; }
    for (const target of targets) if (target !== struck && target.health > 0 && target.position.distanceTo(missile.position) < FLIGHT.splashRadius) target.hit(FLIGHT.splash, A.copy(target.position).sub(missile.position).normalize());
    if(missile.breach)this.onBarrageImpact?.(missile.position,normal,missile.breach,collider);
    else this.onImpact?.(missile.position, 70, struck !== null,missile.attackMode,normal);
  }

  private orient(missile: Missile): void { missile.mesh.quaternion.setFromUnitVectors(FORWARD, missile.direction); }

  /**
   * Pose the launchers on the armour for this display frame and age the smoke. Stowed,
   * the pods are hidden and sunk behind the shoulder blades under closed caps. `enabled`
   * is false while the suit is being assembled or is not worn, when the assembly owns
   * those components.
   */
  present(enabled: boolean, delta: number): void {
    this.exhaust.update(delta); this.exhaust.begin();
    if (!this.available) return;
    if (!enabled) {
      // hand the components back once, closed and stowed, then leave them alone
      if (this.shown) { this.shown = false; for (const pod of this.pods) { this.armor.setGroupFx(pod.pod, 1, 0, false); this.armor.setGroupTransform(pod.pod, null); this.armor.setGroupTransform(pod.cap, null); } }
      this.phase = 'stowed'; this.deploy = 0; this.queue.length = 0;
      return;
    }
    this.shown = true;
    const open = this.deploy, pop = ramp(open, LAUNCHER.pop), swing = ramp(open, LAUNCHER.swing), rise = ramp(open, LAUNCHER.rise);
    this.armor.visual.getWorldQuaternion(Q);
    for (const pod of this.pods) {
      if (rise <= 0 || !pod.mount) { this.armor.setGroupFx(pod.pod, 1, 0, false); this.armor.setGroupTransform(pod.pod, null); }
      else {
        // modelled raised: stowing slides it straight down into the back; raised, it turns onto the line of fire
        this.muzzle(pod, A, B);
        this.armor.groupPivot(pod.pod, A);
        M.compose(B.set(0, -LAUNCHER.travel * (1 - rise), 0).applyQuaternion(Q).add(A), Q2.identity().slerp(pod.tilt, rise), ONE).multiply(SHIFT.makeTranslation(-A.x, -A.y, -A.z));
        this.armor.setGroupTransform(pod.pod, M); this.armor.setGroupFx(pod.pod, 0.4 + 0.6 * rise, 0, true);
      }
      if (pop <= 0) this.armor.setGroupTransform(pod.cap, null);
      else {
        // the cap lifts off its seat, then hinges back and down out of the pod's way
        this.armor.groupPivot(pod.cap, A);
        Q2.setFromAxisAngle(B.set(1, 0, 0).applyQuaternion(Q).normalize(), -1.2 * swing);
        M.compose(C.set(0, 0.012 * pop - 0.05 * swing, -0.018 * pop - 0.05 * swing).applyQuaternion(Q).add(A), Q2, ONE).multiply(SHIFT.makeTranslation(-A.x, -A.y, -A.z));
        this.armor.setGroupTransform(pod.cap, M);
      }
      this.armor.setGroupFx(pod.cap, 1, pop > 0 && swing < 0.3 ? 0.35 * (1 - swing / 0.3) : 0, true);
    }
  }

  reset(): void {this.demolition=false;this.demolitionCooldown=0;this.salvoDemolition=false;
    this.barrageQueue=[];this.barrageLock=false;this.barrageRounds=0;
    for (const missile of this.pool) { missile.life = 0; missile.mesh.visible = false; }
    this.phase = 'stowed'; this.deploy = this.cooldown = this.reload = this.linger = 0; this.queue.length = 0; this.ammo = MAGAZINE;
    this.clock=0;this.launchLog.length=0;this.launches = this.hits = 0; this.tracks.clear(); this.line.set(0, 0, 1);
  }
}
