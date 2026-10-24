/**
 * Key bindings for the actions added with the flight and weapon systems. Each action
 * lists the `KeyboardEvent.code` values (or `Mouse0`..`Mouse2`) that trigger it.
 *
 * To rebind, store a partial map under `aegis-controls` in localStorage, for example
 *   localStorage.setItem('aegis-controls', JSON.stringify({ missiles: ['KeyM'], laser: ['Digit2'] }))
 * and reload. Unknown actions and malformed values are ignored.
 */
export interface Controls {
  /** Take off; in flight, cut the thrusters and fall; while falling, catch the fall. */
  flight: string[];
  /** Suit up / step out of the armour. */
  suit: string[];
  /** Deploy the shoulder launchers and fire a pair of missiles. */
  missiles: string[];
  /** Cycle missile guidance: soft lock, hard lock, off. */
  guidance: string[];
  /** Hold: repulsor pulses from the palms. */
  repulsor: string[];
  /** Hold: focused beam from the right palm. */
  laser: string[];
}

export const DEFAULT_CONTROLS: Controls = {
  flight: ['KeyE'], suit: ['KeyT'], missiles: ['KeyF'], guidance: ['KeyN'], repulsor: ['KeyZ'], laser: ['KeyL'],
};

export function loadControls(): Controls {
  const controls: Controls = { ...DEFAULT_CONTROLS };
  try {
    const saved = JSON.parse(localStorage.getItem('aegis-controls') ?? '{}') as Record<string, unknown>;
    for (const action of Object.keys(controls) as (keyof Controls)[]) {
      const codes = saved[action];
      if (Array.isArray(codes) && codes.length > 0 && codes.every(code => typeof code === 'string')) controls[action] = codes as string[];
    }
  } catch { /* no saved bindings, or storage unavailable */ }
  return controls;
}
