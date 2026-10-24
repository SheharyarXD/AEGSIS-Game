import { Vector3 } from 'three';
import { PlayerController } from '../player/PlayerController';
import { Boss } from './Boss';
import { Enemy } from './Enemy';

export type MoveName = 'jab' | 'cross' | 'hook' | 'heavy' | 'counter' | 'dash' | 'air' | 'airHeavy';
/**
 * One attack. Times are seconds into the clip. A move only hurts during `active`, and
 * only what the striking fist actually reaches; `chain` is when a buffered light press
 * may cut the recovery short and start `next`.
 */
export interface Move {
  clip: string; seconds: number; active: [number, number]; hand: 'L' | 'R'; damage: number; heavy: boolean;
  chain?: [number, number]; next?: MoveName;
  /** Carry the body toward the target: metres per second during the window. */
  lunge?: { window: [number, number]; speed: number; reach: number };
  energy?: number; airborne?: boolean;
}
export const MOVES: Record<MoveName, Move> = {
  // the combination: lead hand, cross with the hips behind it, hook to finish
  jab: { clip: 'aegis_jab', seconds: 0.36, active: [0.07, 0.19], hand: 'L', damage: 14, heavy: false, chain: [0.15, 0.36], next: 'cross', lunge: { window: [0, 0.13], speed: 14, reach: 1.2 } },
  cross: { clip: 'aegis_cross', seconds: 0.46, active: [0.13, 0.27], hand: 'R', damage: 20, heavy: false, chain: [0.24, 0.46], next: 'hook', lunge: { window: [0.04, 0.16], speed: 4, reach: 1.2 } },
  hook: { clip: 'aegis_hook', seconds: 0.6, active: [0.17, 0.33], hand: 'L', damage: 30, heavy: true, lunge: { window: [0.08, 0.2], speed: 3.5, reach: 1.1 } },
  // committed: a long coil, the whole body behind the right hand, a slow recovery
  heavy: { clip: 'aegis_heavy', seconds: 0.9, active: [0.35, 0.55], hand: 'R', damage: 42, heavy: true, energy: 10, lunge: { window: [0.26, 0.42], speed: 6, reach: 1.3 } },
  // out of a block: no wind-up at all
  counter: { clip: 'aegis_counter', seconds: 0.36, active: [0.06, 0.2], hand: 'R', damage: 34, heavy: true, lunge: { window: [0, 0.1], speed: 4, reach: 1.2 } },
  // thrusters close the distance during the coil, then the same strike lands with the speed behind it
  dash: { clip: 'aegis_heavy', seconds: 0.9, active: [0.33, 0.55], hand: 'R', damage: 54, heavy: true, energy: 18, lunge: { window: [0.03, 0.36], speed: 27, reach: 1.4 } },
  // in the air: fly at the target and hit it on the way through
  air: { clip: 'aegis_air_strike', seconds: 0.6, active: [0.18, 0.5], hand: 'R', damage: 30, heavy: true, airborne: true, lunge: { window: [0, 0.42], speed: 30, reach: 1.1 } },
  airHeavy: { clip: 'aegis_air_strike', seconds: 0.6, active: [0.18, 0.5], hand: 'R', damage: 46, heavy: true, airborne: true, energy: 10, lunge: { window: [0, 0.42], speed: 36, reach: 1.1 } },
};
/** A press is remembered this long, so it can be made a little early. */
const BUFFER_SECONDS = 0.28;
/** Fist and body radii for contact (m). */
const FIST = 0.42, BODY = 0.5;
const A = new Vector3(), B = new Vector3(), C = new Vector3();

export interface MeleeScene { enemies: Enemy[]; boss: Boss | null; held: Enemy | null; sprint: boolean }

/**
 * Close combat. Presses are buffered; a combination advances only inside the previous
 * move's chain window; damage is dealt when the striking fist reaches a body during the
 * move's active frames, once per target per move.
 */
export class Melee {
  move: MoveName | null = null;
  time = 0;
  /** Position in the light combination: 0 none, 1 jab, 2 cross, 3 hook. */
  combo = 0;
  hitsLanded = 0;
  swings = 0;
  onSwing?: (move: MoveName) => void;
  onHit?: (point: Vector3, move: MoveName, target: Enemy | Boss) => void;
  /** Heavy strikes also try the scenery in front of the fist. */
  onReach?: (point: Vector3, direction: Vector3, heavy: boolean) => void;
  private buffered: { kind: 'light' | 'heavy'; age: number } | null = null;
  private readonly struck = new Set<object>();
  private reached = false;
  private focus: Enemy | Boss | null = null;

  constructor(private readonly player: PlayerController) {}

  get busy(): boolean { return this.move !== null; }
  /** The move's active (damaging) frames are playing. */
  get striking(): boolean { const m = this.move ? MOVES[this.move] : null; return !!m && this.time >= m.active[0] && this.time <= m.active[1]; }

  press(kind: 'light' | 'heavy'): void { this.buffered = { kind, age: 0 }; }

  /** Abandon the current move at once (thrown into a ragdoll, form change). */
  cancel(): void { this.move = null; this.time = 0; this.combo = 0; this.buffered = null; this.struck.clear(); this.player.strikeHeading = null; }

  update(dt: number, scene: MeleeScene): void {
    const player = this.player;
    if (this.buffered && (this.buffered.age += dt) > BUFFER_SECONDS) this.buffered = null;
    if (player.ragdoll.active || !player.suited || player.changingForm || player.health <= 0) { if (this.move) this.cancel(); return; }
    const current = this.move ? MOVES[this.move] : null;
    if (current) {
      this.time += dt;
      player.attackTime = Math.max(0.02, current.seconds - this.time);
      this.carry(current, dt);
      if (this.time >= current.active[0] && this.time <= current.active[1]) this.contact(current, scene);
      // a buffered light press inside the chain window cuts the recovery and continues the combination
      if (current.chain && current.next && this.buffered?.kind === 'light' && this.time >= current.chain[0] && this.time <= current.chain[1]) { this.buffered = null; this.start(current.next, scene); return; }
      if (this.time >= current.seconds) { this.move = null; this.time = 0; this.combo = 0; player.attackTime = 0; player.strikeHeading = null; }
      return;
    }
    if (!this.buffered || player.dodgeTime > 0.08 || player.recovering > 0 || scene.held) return;
    const { kind } = this.buffered; this.buffered = null;
    const flying = player.powered, grounded = !player.isFlying && player.body.grounded;
    if (!flying && !grounded) return;
    let next: MoveName;
    if (flying) next = kind === 'heavy' ? 'airHeavy' : 'air';
    else if (kind === 'heavy') next = scene.sprint ? 'dash' : 'heavy';
    else next = player.counterWindow > 0 ? 'counter' : 'jab';
    const cost = MOVES[next].energy ?? 0;
    if (player.energy < cost) return;
    player.energy -= cost;
    this.start(next, scene);
  }

  private start(name: MoveName, scene: MeleeScene): void {
    const player = this.player, move = MOVES[name];
    this.move = name; this.time = 0; this.struck.clear(); this.reached = false; this.swings++;
    this.combo = name === 'jab' ? 1 : name === 'cross' ? 2 : name === 'hook' ? 3 : 0;
    if (name === 'counter') player.counterWindow = 0;
    // square up to the nearest threat within reach of the move
    this.focus = this.nearest(scene, move.airborne ? 14 : name === 'dash' ? 11 : 5.5);
    if (this.focus) { const to = A.copy(this.focus.position).sub(player.position); if (move.airborne) player.strikeHeading = Math.atan2(to.x, to.z); else player.object.rotation.y = Math.atan2(to.x, to.z); }
    player.suit.playAction(move.clip);
    player.attackTime = move.seconds;
    this.onSwing?.(name);
  }

  private nearest(scene: MeleeScene, range: number): Enemy | Boss | null {
    let best: Enemy | Boss | null = null, bestDistance = range;
    for (const enemy of scene.enemies) {
      if (enemy.health <= 0 || enemy === scene.held) continue;
      const d = enemy.position.distanceTo(this.player.position);
      if (d < bestDistance) { bestDistance = d; best = enemy; }
    }
    if (scene.boss && scene.boss.health > 0 && scene.boss.position.distanceTo(this.player.position) < range + 5) best ??= scene.boss;
    return best;
  }

  /** Step, lunge or fly in so the strike lands at arm's length rather than in empty air. */
  private carry(move: Move, dt: number): void {
    const lunge = move.lunge, player = this.player;
    if (!lunge || this.time < lunge.window[0] || this.time > lunge.window[1]) return;
    const to = this.focus && this.focus.health > 0 ? A.copy(this.focus.position).sub(player.position) : A.copy(player.forward).multiplyScalar(lunge.reach + 2);
    if (!move.airborne) to.y = 0;
    else { to.y += 0.9 - 1.0; player.strikeHeading = Math.atan2(to.x, to.z); }      // fly at the chest (his own is about a metre above his origin), facing it
    const gap = to.length() - lunge.reach;
    if (gap <= 0.02) { if (!move.airborne) { player.velocity.x *= 0.5; player.velocity.z *= 0.5; } return; }
    // never overshoot the spot the strike is thrown from
    const speed = Math.min(lunge.speed, gap / Math.max(dt, 1e-3));
    to.normalize();
    player.velocity.x = to.x * speed; player.velocity.z = to.z * speed;
    if (move.airborne) player.velocity.y = to.y * speed;
  }

  /** The striking fist against every body it could reach this step. */
  private contact(move: Move, scene: MeleeScene): void {
    const player = this.player, fist = player.armor.bones.get(`palm${move.hand}`);
    if (!fist) return;
    fist.getWorldPosition(A);
    const direction = B.copy(player.forward);
    for (const enemy of scene.enemies) {
      if (enemy.health <= 0 || enemy === scene.held || this.struck.has(enemy)) continue;
      // distance from the fist to the body's axis, from the knees to the head
      const base = enemy.position, height = Math.min(1.85, Math.max(0.35, A.y - base.y));
      if (Math.hypot(A.x - base.x, A.z - base.z, A.y - (base.y + height)) > FIST + BODY) continue;
      this.struck.add(enemy); this.hitsLanded++;
      enemy.hit(move.damage, direction, move.heavy, C.copy(player.velocity).multiplyScalar(0.25));
      this.onHit?.(A, this.move!, enemy);
    }
    const boss = scene.boss;
    if (boss && boss.health > 0 && !this.struck.has(boss) && A.distanceTo(boss.position) < 5.5) { this.struck.add(boss); this.hitsLanded++; boss.hit(move.damage * 1.2, direction); this.onHit?.(A, this.move!, boss); }
    if (!this.reached) { this.reached = true; this.onReach?.(A, direction, move.heavy); }
  }

  reset(): void { this.cancel(); this.hitsLanded = this.swings = 0; this.focus = null; }
}
