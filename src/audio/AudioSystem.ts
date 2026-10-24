/**
 * AEGIS sound. Everything is synthesised here from oscillators and filtered noise: there
 * are no sampled or downloaded sounds, so there is nothing to license. Sound starts only
 * after a user gesture.
 *
 * The identity is one family: clean sine and triangle tones over short noise transients,
 * with pitch falling for mass (impacts, launches) and rising for energy (charges, locks).
 */
export type Cue =
  | 'impact' | 'lock' | 'shot' | 'dock' | 'alarm'                                   // original set
  | 'lockLost' | 'podUnlock' | 'podServo' | 'podLatch' | 'missileIgnite' | 'missileHit'
  | 'repulsorCharge' | 'repulsor' | 'energyHit' | 'laserStart' | 'laserStop'
  | 'step' | 'punch' | 'punchHeavy' | 'whoosh' | 'block' | 'thrusterStart' | 'boost' | 'brake' | 'landing' | 'servo';
/** Where a sound is relative to the listener: metres away and -1 (left) .. 1 (right). */
export interface Place { distance: number; pan: number }

type Tone = { wave: OscillatorType; from: number; to: number; seconds: number; gain: number; delay?: number };
type Noise = { seconds: number; gain: number; from: number; to: number; q?: number; type?: BiquadFilterType; delay?: number };
const RECIPES: Record<Cue, { tones?: Tone[]; noise?: Noise[]; limit?: number }> = {
  impact: { tones: [{ wave: 'triangle', from: 80, to: 30, seconds: 0.22, gain: 0.9 }], noise: [{ seconds: 0.12, gain: 0.5, from: 900, to: 160 }] },
  lock: { tones: [{ wave: 'sine', from: 620, to: 980, seconds: 0.08, gain: 0.5 }, { wave: 'sine', from: 980, to: 1240, seconds: 0.07, gain: 0.45, delay: 0.09 }] },
  lockLost: { tones: [{ wave: 'sine', from: 760, to: 420, seconds: 0.16, gain: 0.4 }] },
  shot: { tones: [{ wave: 'triangle', from: 260, to: 65, seconds: 0.13, gain: 0.7 }] },
  dock: { tones: [{ wave: 'triangle', from: 160, to: 60, seconds: 0.12, gain: 0.7 }], noise: [{ seconds: 0.05, gain: 0.35, from: 2400, to: 700 }] },
  alarm: { tones: [{ wave: 'triangle', from: 540, to: 420, seconds: 0.25, gain: 0.7 }] },
  // shoulder launcher: a latch releasing, a short servo run, a solid lock
  podUnlock: { noise: [{ seconds: 0.045, gain: 0.6, from: 3200, to: 1100, q: 2 }], tones: [{ wave: 'square', from: 190, to: 120, seconds: 0.05, gain: 0.22 }] },
  podServo: { tones: [{ wave: 'sawtooth', from: 150, to: 310, seconds: 0.24, gain: 0.16 }], noise: [{ seconds: 0.24, gain: 0.12, from: 1500, to: 2600, q: 5, type: 'bandpass' }] },
  podLatch: { noise: [{ seconds: 0.05, gain: 0.7, from: 2200, to: 500, q: 1.5 }], tones: [{ wave: 'triangle', from: 130, to: 70, seconds: 0.09, gain: 0.5 }] },
  servo: { tones: [{ wave: 'sawtooth', from: 240, to: 130, seconds: 0.2, gain: 0.13 }] },
  // missile: a sharp crack of ignition over a rising rush, and a heavy low burst at the far end
  missileIgnite: { limit: 4, noise: [{ seconds: 0.07, gain: 0.8, from: 5200, to: 900 }, { seconds: 0.5, gain: 0.45, from: 500, to: 2400, q: 1.2, type: 'bandpass', delay: 0.03 }],
    tones: [{ wave: 'sawtooth', from: 90, to: 240, seconds: 0.4, gain: 0.3 }] },
  missileHit: { limit: 4, tones: [{ wave: 'triangle', from: 110, to: 26, seconds: 0.5, gain: 1.0 }], noise: [{ seconds: 0.4, gain: 0.8, from: 2600, to: 120 }, { seconds: 0.05, gain: 0.7, from: 6000, to: 2000 }] },
  // repulsor: a very short rising charge, a clean hard transient, a brief ringing decay
  repulsorCharge: { limit: 2, tones: [{ wave: 'sine', from: 320, to: 1150, seconds: 0.1, gain: 0.3 }] },
  repulsor: { limit: 4, tones: [{ wave: 'triangle', from: 880, to: 150, seconds: 0.16, gain: 0.75 }, { wave: 'sine', from: 1500, to: 620, seconds: 0.26, gain: 0.22, delay: 0.02 }],
    noise: [{ seconds: 0.04, gain: 0.55, from: 5200, to: 1500 }] },
  energyHit: { limit: 4, noise: [{ seconds: 0.09, gain: 0.5, from: 3800, to: 500 }], tones: [{ wave: 'sine', from: 420, to: 140, seconds: 0.12, gain: 0.4 }] },
  laserStart: { tones: [{ wave: 'sine', from: 260, to: 1650, seconds: 0.28, gain: 0.35 }], noise: [{ seconds: 0.2, gain: 0.15, from: 1200, to: 5200, q: 3, type: 'bandpass' }] },
  laserStop: { tones: [{ wave: 'sine', from: 1500, to: 240, seconds: 0.18, gain: 0.3 }] },
  // the body: weight on the ground, fists, guard
  step: { limit: 3, tones: [{ wave: 'sine', from: 85, to: 42, seconds: 0.11, gain: 0.55 }], noise: [{ seconds: 0.05, gain: 0.3, from: 1200, to: 260 }] },
  whoosh: { limit: 3, noise: [{ seconds: 0.16, gain: 0.3, from: 500, to: 2200, q: 1.5, type: 'bandpass' }] },
  punch: { limit: 3, tones: [{ wave: 'triangle', from: 170, to: 55, seconds: 0.12, gain: 0.8 }], noise: [{ seconds: 0.05, gain: 0.6, from: 2600, to: 400 }] },
  punchHeavy: { limit: 2, tones: [{ wave: 'triangle', from: 120, to: 30, seconds: 0.3, gain: 1.0 }], noise: [{ seconds: 0.14, gain: 0.8, from: 3000, to: 200 }] },
  block: { limit: 3, tones: [{ wave: 'square', from: 520, to: 260, seconds: 0.07, gain: 0.25 }, { wave: 'triangle', from: 140, to: 70, seconds: 0.12, gain: 0.6 }], noise: [{ seconds: 0.04, gain: 0.6, from: 4200, to: 1200 }] },
  thrusterStart: { noise: [{ seconds: 0.35, gain: 0.45, from: 300, to: 2600, q: 1, type: 'bandpass' }], tones: [{ wave: 'sawtooth', from: 60, to: 150, seconds: 0.3, gain: 0.3 }] },
  boost: { noise: [{ seconds: 0.5, gain: 0.55, from: 500, to: 3600, q: 1, type: 'bandpass' }], tones: [{ wave: 'sawtooth', from: 80, to: 230, seconds: 0.4, gain: 0.32 }] },
  brake: { noise: [{ seconds: 0.4, gain: 0.45, from: 2600, to: 400, q: 1, type: 'bandpass' }] },
  landing: { tones: [{ wave: 'sine', from: 95, to: 28, seconds: 0.45, gain: 1.0 }], noise: [{ seconds: 0.3, gain: 0.7, from: 1800, to: 120 }] },
};
const MASTER = 0.26;

export class AudioSystem {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private engine: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private readonly voices = new Map<Cue, number>();
  private beam: { tone: OscillatorNode; hum: OscillatorNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private beamOn = false;
  /** Counters for tests: cues played, and whether the beam loop is sounding. */
  readonly played: Partial<Record<Cue, number>> = {};
  beamStarts = 0;
  enabled = true;
  volume = 1;

  /** The beam loop is running (whether or not the device can be heard). */
  get beamActive(): boolean { return this.beamOn; }

  async start(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext(); this.master = this.context.createGain(); this.master.gain.value = MASTER * this.volume;
      // a gentle limiter so stacked explosions and launches never clip
      const limiter = this.context.createDynamicsCompressor(); limiter.threshold.value = -14; limiter.knee.value = 10; limiter.ratio.value = 8; limiter.attack.value = 0.003; limiter.release.value = 0.18;
      this.master.connect(limiter).connect(this.context.destination);
      this.engine = this.context.createOscillator(); this.engine.type = 'sawtooth';
      const filter = this.context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 190;
      this.engineGain = this.context.createGain(); this.engineGain.gain.value = 0;
      this.engine.connect(filter).connect(this.engineGain).connect(this.master); this.engine.start();
      const length = this.context.sampleRate, buffer = this.context.createBuffer(1, length, length), data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buffer;
    }
    await this.context.resume();
  }

  /**
   * Play a one-shot. `strength` scales loudness; `place` attenuates and pans a sound
   * that happens out in the world. Each cue has a voice limit, so a burst of identical
   * events does not stack into noise.
   */
  cue(kind: Cue, strength = 1, place?: Place): void {
    this.played[kind] = (this.played[kind] ?? 0) + 1;
    if (!this.context || !this.master || !this.enabled) return;
    const recipe = RECIPES[kind], limit = recipe.limit ?? 6, active = this.voices.get(kind) ?? 0;
    if (active >= limit) return;
    const now = this.context.currentTime;
    // inverse-distance falloff from 12 m, never silent inside 250 m
    const level = Math.min(1.6, strength) * (place ? Math.max(0.06, 12 / Math.max(12, place.distance)) : 1);
    const out = this.context.createGain(); out.gain.value = level;
    let last: AudioNode = out;
    if (place) { const pan = this.context.createStereoPanner(); pan.pan.value = Math.max(-1, Math.min(1, place.pan)); out.connect(pan); last = pan; }
    last.connect(this.master);
    let longest = 0;
    for (const tone of recipe.tones ?? []) {
      const at = now + (tone.delay ?? 0), o = this.context.createOscillator(), g = this.context.createGain();
      o.type = tone.wave; o.frequency.setValueAtTime(tone.from, at); o.frequency.exponentialRampToValueAtTime(Math.max(1, tone.to), at + tone.seconds);
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(tone.gain * 0.3, at + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, at + tone.seconds);
      o.connect(g).connect(out); o.start(at); o.stop(at + tone.seconds + 0.02);
      longest = Math.max(longest, (tone.delay ?? 0) + tone.seconds);
    }
    for (const noise of recipe.noise ?? []) {
      if (!this.noiseBuffer) break;
      const at = now + (noise.delay ?? 0), source = this.context.createBufferSource(), filter = this.context.createBiquadFilter(), g = this.context.createGain();
      source.buffer = this.noiseBuffer; source.loop = true;
      filter.type = noise.type ?? 'lowpass'; filter.Q.value = noise.q ?? 0.7;
      filter.frequency.setValueAtTime(noise.from, at); filter.frequency.exponentialRampToValueAtTime(Math.max(20, noise.to), at + noise.seconds);
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(noise.gain * 0.3, at + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, at + noise.seconds);
      source.connect(filter).connect(g).connect(out); source.start(at, Math.random() * 0.5); source.stop(at + noise.seconds + 0.02);
      longest = Math.max(longest, (noise.delay ?? 0) + noise.seconds);
    }
    this.voices.set(kind, active + 1);
    window.setTimeout(() => { this.voices.set(kind, Math.max(0, (this.voices.get(kind) ?? 1) - 1)); out.disconnect(); last.disconnect(); }, (longest + 0.08) * 1000);
  }

  /**
   * The focused beam's sustained tone. Call every frame with whether the beam is burning
   * and how hard (0..1); the loop is created once, follows `intensity`, and is torn down
   * the moment `on` goes false.
   */
  laser(on: boolean, intensity = 1): void {
    if (on && !this.beamOn) {
      this.beamOn = true; this.beamStarts++;
      this.cue('laserStart');
      if (this.context && this.master && this.enabled) {
        const tone = this.context.createOscillator(), hum = this.context.createOscillator(), filter = this.context.createBiquadFilter(), gain = this.context.createGain();
        tone.type = 'sawtooth'; tone.frequency.value = 1320; hum.type = 'sine'; hum.frequency.value = 164;
        filter.type = 'bandpass'; filter.frequency.value = 1900; filter.Q.value = 3.5;
        gain.gain.value = 0.0001; gain.gain.exponentialRampToValueAtTime(0.11, this.context.currentTime + 0.12);
        tone.connect(filter).connect(gain); hum.connect(gain); gain.connect(this.master); tone.start(); hum.start();
        this.beam = { tone, hum, gain, filter };
      }
    } else if (!on && this.beamOn) {
      this.beamOn = false;
      if (this.beam && this.context) {
        const { tone, hum, gain } = this.beam, now = this.context.currentTime;
        gain.gain.cancelScheduledValues(now); gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now); gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
        tone.stop(now + 0.06); hum.stop(now + 0.06); window.setTimeout(() => gain.disconnect(), 120);
      }
      this.beam = null; this.cue('laserStop');
    } else if (on && this.beam && this.context) {
      // the tone tightens and brightens as the beam bites
      this.beam.tone.frequency.setTargetAtTime(1240 + 260 * intensity, this.context.currentTime, 0.08);
      this.beam.filter.frequency.setTargetAtTime(1600 + 1400 * intensity, this.context.currentTime, 0.08);
    }
  }

  update(speed: number, flying: boolean): void {
    if (!this.context || !this.engine || !this.engineGain) return;
    this.engine.frequency.setTargetAtTime(45 + speed * 1.4, this.context.currentTime, 0.15);
    this.engineGain.gain.setTargetAtTime(this.enabled && flying ? 0.05 + speed * 0.001 : 0, this.context.currentTime, 0.12);
  }

  /** 0..1 master level on top of the built-in mix. */
  setVolume(volume: number): void { this.volume = Math.max(0, Math.min(1, volume)); this.mute(false); }
  mute(muted: boolean): void {
    if (muted) this.laser(false);
    if (this.master && this.context) this.master.gain.setTargetAtTime(muted || !this.enabled ? 0 : MASTER * this.volume, this.context.currentTime, 0.08);
  }
}
