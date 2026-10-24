import { MathUtils, Vector3 } from 'three';
import { PhysicsWorld, RAPIER } from '../physics/PhysicsWorld';
import { Shootable } from './Projectiles';

/** One evaluated target, as seen from the player's view this step. */
export interface Contact {
  target: Shootable;
  distance: number;
  /** Distance from the reticle as a fraction of half the screen height (0 = dead centre). */
  offset: number;
  visible: boolean;
  score: number;
}

/**
 * Acquisition envelope. Distances are metres in the city's own scale (cruise is 29 m/s,
 * boost 52 m/s, an avenue is about 30 m wide), so a few seconds of flight is hundreds of metres.
 */
export const ENVELOPE = {
  /** Soft lock picks targets up to here. */
  range: 260,
  /** Soft lock region around the reticle, in half-screen-heights. */
  region: 0.62,
  /** Close targets fill the screen, so the region opens up inside this distance. */
  near: 28,
  nearRegion: 1.25,
  /** A soft lock is only stolen by a clearly better target. */
  stickiness: 0.2,
  /** Seconds a soft lock survives out of the region or out of sight. */
  softGrace: 0.55,
  /** A hard lock holds anywhere in front, further out, and through this much obstruction. */
  hardRange: 320,
  hardGrace: 3,
  /** Seconds between line-of-sight checks per target. */
  sightEvery: 0.1,
};
const UP = new Vector3(0, 1, 0), A = new Vector3(), B = new Vector3();

/**
 * Chooses what the missiles go after. The view ray is the camera's own: what is under
 * the reticle is what is scored, at any distance. Line of sight is checked from the
 * hero, because that is where the missiles leave from.
 */
export class Targeting {
  /** Best target near the reticle right now (soft auto-aim), or null. */
  soft: Shootable | null = null;
  /** Target the player has deliberately locked, or null. */
  hard: Shootable | null = null;
  /** Everything valid this step, best first. */
  contacts: Contact[] = [];
  /** How many missiles are already on their way to a target. */
  assigned: (target: Shootable) => number = () => 0;
  private softLost = 0;
  private hardLost = 0;
  private readonly sight = new Map<Shootable, { at: number; clear: boolean }>();
  private time = 0;

  constructor(private readonly physics: PhysicsWorld) {}

  /** Nothing solid between the hero and the target (cached briefly per target). */
  private clear(from: Vector3, target: Shootable): boolean {
    const known = this.sight.get(target);
    if (known && this.time - known.at < ENVELOPE.sightEvery) return known.clear;
    const to = A.copy(target.position).add(UP).sub(from), distance = to.length();
    const clear = !this.physics.world.castRay(new RAPIER.Ray(from, to.normalize()), Math.max(0, distance - 1.4), true, RAPIER.QueryFilterFlags.ONLY_FIXED);
    this.sight.set(target, { at: this.time, clear });
    return clear;
  }

  /**
   * @param eye      camera position
   * @param forward  camera direction (the reticle)
   * @param halfFov  half the vertical field of view, radians
   * @param hero     where missiles launch from
   */
  update(dt: number, eye: Vector3, forward: Vector3, halfFov: number, hero: Vector3, targets: Shootable[]): void {
    this.time += dt;
    const scale = 1 / Math.tan(halfFov);
    this.contacts.length = 0;
    for (const target of targets) {
      if (target.health <= 0) continue;
      const centre = B.copy(target.position).add(UP), distance = centre.distanceTo(hero);
      if (distance > ENVELOPE.hardRange || distance < 1.5) continue;
      const to = A.copy(centre).sub(eye), depth = to.dot(forward);
      // offset from the reticle on screen; behind the camera counts as far off-screen
      const offset = depth > 0.5 ? Math.sqrt(Math.max(0, to.lengthSq() - depth * depth)) / depth * scale : 9;
      const visible = this.clear(hero, target);
      // centred beats close; a target that already has missiles inbound waits its turn
      const score = offset + (distance / ENVELOPE.range) * 0.35 + this.assigned(target) * 0.3;
      this.contacts.push({ target, distance, offset, visible, score });
    }
    this.contacts.sort((a, b) => a.score - b.score);

    // soft auto-aim: best visible contact in the region, with hysteresis
    const inRegion = (c: Contact): boolean => c.visible && c.distance <= ENVELOPE.range &&
      c.offset <= MathUtils.lerp(ENVELOPE.nearRegion, ENVELOPE.region, MathUtils.smoothstep(c.distance, ENVELOPE.near * 0.5, ENVELOPE.near * 1.6));
    const best = this.contacts.find(inRegion) ?? null;
    const held = this.soft ? this.contacts.find(c => c.target === this.soft) ?? null : null;
    if (held && inRegion(held)) {
      this.softLost = 0;
      if (best && best !== held && best.score < held.score - ENVELOPE.stickiness) this.soft = best.target;
    } else if (held && (this.softLost += dt) < ENVELOPE.softGrace && !best) { /* keep it through a brief loss */ }
    else { this.soft = best ? best.target : null; this.softLost = 0; }

    // hard lock: held until the target is gone, or out of the envelope for a while
    if (this.hard) {
      const lock = this.contacts.find(c => c.target === this.hard);
      if (!lock) this.hard = null;
      else if (lock.visible && lock.offset < 4) this.hardLost = 0;
      else if ((this.hardLost += dt) > ENVELOPE.hardGrace) this.hard = null;
    }
  }

  /** Tab: lock the best target on screen; again steps to the next; past the last releases the lock. */
  cycle(): Shootable | null {
    const choices = this.contacts.filter(c => c.visible && c.offset < 1.6);
    const index = this.hard ? choices.findIndex(c => c.target === this.hard) : -1;
    this.hard = index + 1 < choices.length ? choices[index + 1].target : null;
    this.hardLost = 0;
    return this.hard;
  }

  /** Lock a specific target (scripted encounters). */
  lock(target: Shootable | null): void { this.hard = target; this.hardLost = 0; }

  /**
   * Targets for a salvo of `count` in soft mode: the reticle's choice first, then other
   * visible targets in the region. Missiles are shared out between them, and none is
   * spent on a target that the missiles already on their way will finish (`damage` each).
   */
  distribute(count: number, damage: number): (Shootable | null)[] {
    const pool = this.contacts.filter(c => c.visible && c.distance <= ENVELOPE.range && (c.target === this.soft || c.offset <= ENVELOPE.nearRegion));
    if (this.soft) pool.sort((a, b) => Number(b.target === this.soft) - Number(a.target === this.soft) || a.score - b.score);
    if (pool.length === 0) return new Array<Shootable | null>(count).fill(null);
    const planned = new Map<Shootable, number>(), out: (Shootable | null)[] = [];
    for (let i = 0; i < count; i++) {
      // spread out: the target with the fewest missiles already coming, among those a
      // missile would still be needed for; ties go to the one nearer the reticle
      const load = (c: Contact): number => (planned.get(c.target) ?? 0) + this.assigned(c.target);
      const wanting = pool.filter(c => c.target.health - load(c) * damage > 0), from = wanting.length ? wanting : pool;
      let pick = from[0];
      for (const c of from) if (load(c) < load(pick)) pick = c;
      planned.set(pick.target, (planned.get(pick.target) ?? 0) + 1);
      out.push(pick.target);
    }
    return out;
  }

  contact(target: Shootable | null): Contact | null { return target ? this.contacts.find(c => c.target === target) ?? null : null; }

  reset(): void { this.soft = this.hard = null; this.contacts.length = 0; this.sight.clear(); this.softLost = this.hardLost = 0; }
}
