import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, Group, MathUtils, Mesh, Object3D, ShaderMaterial, Vector3,
} from 'three';
import { PhysicsWorld, RAPIER } from '../physics/PhysicsWorld';
import { AegisSuit } from '../player/AegisSuit';
import { ImpactVfx } from '../vfx/ImpactVfx';
import { Projectiles, Shootable } from './Projectiles';

/** Repulsor: seconds between pulses, reactor cost, how long the arm stays up after the last one. */
const REPULSOR = { interval: 0.26, energy: 5, hold: 0.55, ready: 0.6 };
/** Laser: charge time, reactor drain and damage per second, reach and beam half-widths (m). */
const LASER = { charge: 0.3, drain: 17, damage: 62, range: 150, core: 0.022, glow: 0.11, hitRadius: 1.25 };
const UP = new Vector3(0, 1, 0), A = new Vector3(), B = new Vector3(), C = new Vector3();

/**
 * Hand weapons: repulsor pulses from alternating palms and a focused beam from the right
 * palm. The arm that fires is aimed by the suit (see AegisSuit.aimArm) so the palm really
 * faces the target, and nothing leaves the hand until it does.
 */
export class HandWeapons {
  readonly group = new Group();
  shots = 0;
  beamSeconds = 0;
  onShot?: (position: Vector3) => void;
  /** A palm starts charging (repulsor or beam). */
  onCharge?: (position: Vector3) => void;
  /** Something was hit by a pulse or is being burned by the beam. */
  onBurn?: (position: Vector3) => void;
  /** Where the beam ends this step (valid while `firingLaser`). */
  get beamEnd(): Vector3 { return this.end; }
  get beamStart(): Vector3 { return this.muzzle; }
  private readonly palms: Record<'L' | 'R', Object3D | null>;
  private readonly beam: Mesh;
  private readonly beamLook: ShaderMaterial;
  private cooldown = 0;
  private hand: 'L' | 'R' = 'R';
  private raised: Record<'L' | 'R', number> = { L: 0, R: 0 };   // seconds the arm stays aimed
  private charge = 0;
  private sparks = 0;
  private readonly muzzle = new Vector3();
  private readonly end = new Vector3();
  private lasing = false;

  constructor(private readonly physics: PhysicsWorld, private readonly vfx: ImpactVfx, private readonly armor: AegisSuit, private readonly projectiles: Projectiles) {
    const palm = (side: 'L' | 'R'): Object3D | null => armor.thrusterMounts.find(m => m.userData.kind === 'palm' && m.userData.side === side) ?? null;
    this.palms = { L: palm('L'), R: palm('R') };
    // Beam: one quad from palm to hit point, turned to face the camera in the vertex
    // shader. A thin white-hot core inside a soft blue sheath, with a faint running shimmer.
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(12), 3));
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), 2));
    geometry.setIndex([0, 1, 2, 2, 1, 3]);
    this.beamLook = new ShaderMaterial({
      transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
      uniforms: { uFrom: { value: new Vector3() }, uTo: { value: new Vector3() }, uWidth: { value: LASER.glow }, uPower: { value: 0 }, uTime: { value: 0 },
        uCore: { value: new Color('#f2fbff') }, uGlow: { value: new Color('#2f8dff') }, uCoreWidth: { value: LASER.core / LASER.glow } },
      vertexShader: `uniform vec3 uFrom; uniform vec3 uTo; uniform float uWidth; varying vec2 vUv; varying float vLength;
        void main(){ vUv=uv; vec3 axis=uTo-uFrom; vLength=length(axis); vec3 p=mix(uFrom,uTo,uv.y);
          vec3 side=normalize(cross(axis,cameraPosition-p)); p+=side*(uv.x*2.0-1.0)*uWidth; gl_Position=projectionMatrix*viewMatrix*vec4(p,1.0); }`,
      fragmentShader: `uniform float uPower; uniform float uTime; uniform float uCoreWidth; uniform vec3 uCore; uniform vec3 uGlow; varying vec2 vUv; varying float vLength;
        void main(){ float x=abs(vUv.x*2.0-1.0); float along=vUv.y*vLength;
          float core=exp(-pow(x/uCoreWidth,2.0)); float sheath=exp(-x*x*5.5)*(1.0-smoothstep(0.75,1.0,x));
          float shimmer=0.86+0.14*sin(along*9.0-uTime*46.0)*sin(along*2.3+uTime*17.0);
          float ends=smoothstep(0.0,0.25,along)*smoothstep(0.0,0.6,vLength-along);
          vec3 c=uCore*core*1.25+uGlow*sheath*0.55*shimmer; gl_FragColor=vec4(c*uPower*ends,1.0); }`,
    });
    this.beam = new Mesh(geometry, this.beamLook); this.beam.frustumCulled = false; this.beam.visible = false; this.beam.renderOrder = 6;
    this.group.add(this.beam);
  }

  get firingLaser(): boolean { return this.lasing; }

  /**
   * Fixed-step update. `aim` is the world point the player is aiming at; `drain` takes
   * reactor energy and reports whether there was enough.
   */
  update(dt: number, wantRepulsor: boolean, wantLaser: boolean, aim: Vector3, forward: Vector3, targets: Shootable[],
    drain: (energy: number) => boolean, onBurn?: (collider: RAPIER.Collider, point: Vector3, direction: Vector3) => void): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    // too far round to the side or behind: the arm cannot reach, so the weapon holds fire
    const reachable = A.copy(aim).sub(this.armor.group.position).setY(0).normalize().dot(B.copy(forward).setY(0).normalize()) > -0.25;
    if (wantLaser && reachable) this.raised.R = REPULSOR.hold;
    else if (wantRepulsor && reachable) {
      if (this.raised[this.hand] === 0 && this.palms[this.hand]) this.onCharge?.(this.palms[this.hand]!.getWorldPosition(C));
      this.raised[this.hand] = REPULSOR.hold;
    }
    for (const side of ['L', 'R'] as const) {
      this.raised[side] = Math.max(0, this.raised[side] - dt);
      this.armor.aimArm(side, this.raised[side] > 0 ? aim : null);
    }

    // focused beam from the right palm
    this.lasing = false;
    if (wantLaser && reachable && this.palms.R) {
      if (this.charge === 0) this.onCharge?.(this.palms.R.getWorldPosition(C));
      this.charge = Math.min(LASER.charge, this.charge + dt);
      if (this.charge >= LASER.charge && this.armor.aimWeight('R') > REPULSOR.ready && drain(LASER.drain * dt)) {
        this.lasing = true; this.beamSeconds += dt;
        this.palms.R.getWorldPosition(this.muzzle);
        const direction = A.copy(aim).sub(this.muzzle).normalize();
        const wall = this.physics.world.castRayAndGetNormal(new RAPIER.Ray(this.muzzle, direction), LASER.range, true, RAPIER.QueryFilterFlags.ONLY_FIXED);
        let reach = wall ? wall.timeOfImpact : LASER.range, struck: Shootable | null = null;
        for (const target of targets) {
          if (target.health <= 0) continue;
          const centre = B.copy(target.position).add(UP), along = C.copy(centre).sub(this.muzzle).dot(direction);
          if (along > 0 && along < reach && C.copy(this.muzzle).addScaledVector(direction, along).distanceTo(centre) < LASER.hitRadius) { reach = along; struck = target; }
        }
        this.end.copy(this.muzzle).addScaledVector(direction, reach);
        if (struck) struck.hit(LASER.damage * dt, direction);
        else if (wall) onBurn?.(wall.collider, this.end, direction);
        this.sparks -= dt;
        if ((struck || wall) && this.sparks <= 0) { this.sparks = 0.07; this.onBurn?.(this.end); this.vfx.burst(this.end, 0.25, wall && !struck ? C.set(wall.normal.x, wall.normal.y, wall.normal.z) : UP, false); }
      }
    } else this.charge = Math.max(0, this.charge - dt * 2);

    // repulsor pulses, alternating hands, each leaving a palm that is already on target
    if (wantRepulsor && !wantLaser && reachable && this.cooldown === 0) {
      const palm = this.palms[this.hand];
      if (palm && this.armor.aimWeight(this.hand) > REPULSOR.ready && drain(REPULSOR.energy)) {
        palm.getWorldPosition(this.muzzle);
        this.projectiles.spawn(this.muzzle, A.copy(aim).sub(this.muzzle), false);
        this.vfx.burst(this.muzzle, 0.12, A.normalize(), false);
        this.cooldown = REPULSOR.interval; this.shots++; this.armor.kickArm(this.hand); this.onShot?.(this.muzzle);
        this.hand = this.hand === 'R' ? 'L' : 'R';
      }
    }
  }

  /** Per display frame: keep the beam attached to the palm as the hand moves. */
  present(time: number): void {
    const u = this.beamLook.uniforms;
    this.beam.visible = this.lasing || u.uPower.value > 0.02;
    u.uPower.value = MathUtils.lerp(u.uPower.value, this.lasing ? 1 : 0, this.lasing ? 0.5 : 0.3);
    if (!this.beam.visible) return;
    if (this.lasing && this.palms.R) this.palms.R.getWorldPosition(this.muzzle);
    (u.uFrom.value as Vector3).copy(this.muzzle); (u.uTo.value as Vector3).copy(this.end); u.uTime.value = time;
  }

  /** How ready the beam is, 0..1 (drives the palm glow while charging). */
  get charging(): number { return this.charge / LASER.charge; }

  reset(): void { this.cooldown = this.charge = 0; this.raised.L = this.raised.R = 0; this.lasing = false; this.beam.visible = false; this.beamLook.uniforms.uPower.value = 0; this.shots = 0; this.beamSeconds = 0; }
}
