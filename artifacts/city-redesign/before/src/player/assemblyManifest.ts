/**
 * Authored suit-up choreography.
 *
 * Each entry moves one rigid armour group (tagged in Blender, see art/aegis-hero
 * `GROUP_RULES`) from a source placement to its docked position on the skeleton.
 * Offsets are in character space: x = his left, y = up, z = forward, in metres.
 * Sided entries are authored for the left; the right side mirrors x and the y/z spin.
 */
export interface AssemblyPart {
  /** Group name without side suffix. */
  group: string;
  /** Stage of the sequence (2 boots/legs .. 7 helmet); used for lock sounds. */
  stage: number;
  /** Activation time in seconds (left side). */
  at: number;
  /** Travel time in seconds. */
  duration: number;
  /** Where the component starts, relative to where it docks. */
  from: [number, number, number];
  /** Start orientation as XYZ Euler degrees, relative to docked. */
  spin: [number, number, number];
  /** Start scale: wrap-around shells arrive opened up and clamp shut. */
  spread?: number;
  /** One instance per side; the right starts `stagger` seconds later. */
  sided?: boolean;
  stagger?: number;
  /** When this group's emitters switch on (default: with the whole suit at POWER_ON). */
  energyAt?: number;
}
/** When a body region changes hands: the pilot's is covered, the suit's liner appears. */
export interface BodyHandover { region: string; at: number; sided?: boolean }

export const ASSEMBLY_PARTS: AssemblyPart[] = [
  // -- stage 2: boots and lower legs ------------------------------------------------
  { group: 'boot_rear', stage: 2, at: 0.45, duration: 0.50, from: [0.0, 0.04, -0.75], spin: [0, 40, 0], spread: 1.18, sided: true, stagger: 0.12 },
  { group: 'boot_front', stage: 2, at: 0.56, duration: 0.50, from: [0.0, 0.10, 0.80], spin: [-35, 0, 0], sided: true, stagger: 0.12 },
  { group: 'shin', stage: 2, at: 0.82, duration: 0.45, from: [0.05, 0.10, 0.70], spin: [-25, 30, 0], sided: true, stagger: 0.10 },
  { group: 'calf', stage: 2, at: 0.90, duration: 0.45, from: [0.05, 0.05, -0.70], spin: [20, -30, 0], spread: 1.15, sided: true, stagger: 0.10 },
  { group: 'knee', stage: 2, at: 1.12, duration: 0.36, from: [0.10, 0.0, 0.55], spin: [0, 0, 60], sided: true, stagger: 0.08 },
  // -- stage 3: thighs and pelvis ---------------------------------------------------
  { group: 'thigh_back', stage: 3, at: 1.36, duration: 0.48, from: [0.45, 0.05, -0.50], spin: [0, -70, 10], spread: 1.2, sided: true, stagger: 0.10 },
  { group: 'thigh_front', stage: 3, at: 1.50, duration: 0.48, from: [0.30, 0.05, 0.65], spin: [10, 60, 0], sided: true, stagger: 0.10 },
  { group: 'pelvis', stage: 3, at: 1.78, duration: 0.50, from: [0, -0.04, 0], spin: [0, 100, 0], spread: 1.5 },
  // -- stage 4: torso (back first, emblem last) -------------------------------------
  { group: 'back', stage: 4, at: 2.12, duration: 0.50, from: [0, 0.10, -0.85], spin: [-20, 0, 0] },
  { group: 'ribs', stage: 4, at: 2.42, duration: 0.42, from: [0.60, 0.0, 0.10], spin: [0, 0, -40], spread: 1.1, sided: true, stagger: 0.08 },
  { group: 'abdomen', stage: 4, at: 2.60, duration: 0.42, from: [0, -0.05, 0.70], spin: [25, 0, 0] },
  { group: 'chest', stage: 4, at: 2.76, duration: 0.48, from: [0, 0.12, 0.85], spin: [-30, 0, 0] },
  { group: 'emblem', stage: 4, at: 3.06, duration: 0.34, from: [0, 0, 0.50], spin: [0, 0, 180], energyAt: 3.46 },
  // -- stage 5: arms ----------------------------------------------------------------
  { group: 'forearm', stage: 5, at: 3.22, duration: 0.50, from: [0.30, -0.50, -0.05], spin: [0, 0, 90], spread: 1.25, sided: true, stagger: 0.08 },
  { group: 'elbow', stage: 5, at: 3.44, duration: 0.34, from: [0.25, 0.05, -0.45], spin: [60, 0, 0], sided: true, stagger: 0.08 },
  { group: 'upper_arm', stage: 5, at: 3.52, duration: 0.46, from: [0.55, 0.15, -0.15], spin: [0, 0, -50], spread: 1.25, sided: true, stagger: 0.08 },
  { group: 'shoulder', stage: 5, at: 3.74, duration: 0.46, from: [0.35, 0.55, -0.10], spin: [0, 0, -70], sided: true, stagger: 0.08 },
  { group: 'hand', stage: 5, at: 3.92, duration: 0.36, from: [0.22, -0.38, 0.05], spin: [0, 90, 0], spread: 1.2, sided: true, stagger: 0.06 },
  { group: 'finger_index', stage: 5, at: 4.04, duration: 0.26, from: [0.10, -0.20, 0.06], spin: [0, 0, 120], spread: 1.3, sided: true, stagger: 0.04 },
  { group: 'finger_middle', stage: 5, at: 4.07, duration: 0.26, from: [0.10, -0.21, 0.03], spin: [0, 0, 120], spread: 1.3, sided: true, stagger: 0.04 },
  { group: 'finger_ring', stage: 5, at: 4.10, duration: 0.26, from: [0.10, -0.21, 0.0], spin: [0, 0, 120], spread: 1.3, sided: true, stagger: 0.04 },
  { group: 'finger_pinky', stage: 5, at: 4.13, duration: 0.26, from: [0.10, -0.20, -0.03], spin: [0, 0, 120], spread: 1.3, sided: true, stagger: 0.04 },
  { group: 'finger_thumb', stage: 5, at: 4.16, duration: 0.26, from: [0.06, -0.14, 0.14], spin: [0, 120, 0], spread: 1.3, sided: true, stagger: 0.04 },
  // -- stage 6: propulsion ----------------------------------------------------------
  { group: 'pack_base', stage: 6, at: 4.28, duration: 0.40, from: [0, 0.05, -0.80], spin: [30, 0, 0] },
  { group: 'missile_cap', stage: 6, at: 4.40, duration: 0.40, from: [0.30, 0.28, -0.70], spin: [20, -60, 30], sided: true, stagger: 0.08 },
  { group: 'pack', stage: 6, at: 4.46, duration: 0.46, from: [0.35, 0.30, -0.75], spin: [0, -90, 40], sided: true, stagger: 0.10, energyAt: 4.98 },
  // -- stage 7: helmet (collar, shell, sides, faceplate, visor) ----------------------
  { group: 'collar', stage: 7, at: 4.92, duration: 0.40, from: [0, -0.05, 0], spin: [0, 120, 0], spread: 1.5 },
  { group: 'helmet_shell', stage: 7, at: 5.12, duration: 0.50, from: [0, 0.16, -0.55], spin: [-28, 0, 0], spread: 1.08 },
  { group: 'helmet_side', stage: 7, at: 5.40, duration: 0.36, from: [0.42, 0.05, 0.0], spin: [0, -50, 0], sided: true, stagger: 0.06 },
  { group: 'helmet_face', stage: 7, at: 5.64, duration: 0.42, from: [0, 0.20, 0.46], spin: [-48, 0, 0] },
  { group: 'visor', stage: 7, at: 5.64, duration: 0.42, from: [0, 0.20, 0.46], spin: [-48, 0, 0], energyAt: 6.14 },
];

export const BODY_HANDOVERS: BodyHandover[] = [
  { region: 'body_leg_lower', at: 1.02, sided: true }, { region: 'body_leg_upper', at: 1.78, sided: true },
  { region: 'body_pelvis', at: 2.10 }, { region: 'body_torso', at: 2.92 },
  { region: 'body_arm_lower', at: 3.56, sided: true }, { region: 'body_arm_upper', at: 3.88, sided: true },
  { region: 'body_hand', at: 4.14, sided: true },
  // the pilot's head stays visible until the faceplate is almost shut
  { region: 'body_neck', at: 5.96 },
];
/** The suit's own neck and head liner replaces the pilot's head only once the faceplate
 * is nearly shut; any earlier and it shows through his face. */
export const ARMOR_NECK_AT = 5.96;
/** Stage 1: the pilot settles into the stance before the first component moves. */
export const STANCE_SECONDS = 0.45;
/** Stage 8: every remaining energy channel comes up, then the emblem pulses once. */
export const POWER_ON = 6.16;
export const EMBLEM_PULSE = 6.34;
/** Authored times are played back slightly faster; the whole sequence lasts about 5.8 s. */
export const TIME_SCALE = 0.88;
export const SUIT_SECONDS = 6.62 * TIME_SCALE;
/** Before its activation time each component is in free flight under its own thruster:
 * for this long (seconds), starting about this far away (metres). */
export const FLIGHT_SECONDS = 0.62;
export const FLIGHT_DISTANCE = 7;
/** Stepping out is quicker: components release in reverse order, back off, light their
 * thrusters and fly away. */
export const UNSUIT_RATE = 0.52;
export const RELEASE_SECONDS = 0.34;
export const DEPART_SECONDS = 0.5;
export const UNSUIT_SECONDS = SUIT_SECONDS * UNSUIT_RATE + 0.42;
