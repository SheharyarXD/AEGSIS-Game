import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Camera,
  Color,
  DynamicDrawUsage,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  Object3D,
  PointLight,
  Points,
  ShaderMaterial,
  Vector3,
  Vector4,
  MathUtils,
} from 'three';
import { FlightState } from '../player/FlightState';
import type { QualityLevel } from '../config';

/** Extra flight data the jets react to. All optional so simple callers still work. */
export interface ThrustInput {
  /** World-space velocity of the character. */
  velocity?: Vector3;
  /** Turn amount, -1 (left) .. 1 (right). */
  bank?: number;
}

type JetKind = 'back' | 'palm' | 'foot';
interface Jet {
  mount: Object3D;
  kind: JetKind;
  side: number;        // +1 left, -1 right
  power: number;       // smoothed 0..~1.7
  seed: number;
}
interface QualityPlan { octaves: number; shock: number; lights: number; wisps: number; envelope: number }

const PLAN: Record<QualityLevel, QualityPlan> = {
  LOW: { octaves: 1, shock: 0, lights: 0, wisps: 0, envelope: 0.85 },
  MEDIUM: { octaves: 2, shock: 0.6, lights: 1, wisps: 14, envelope: 1 },
  HIGH: { octaves: 2, shock: 1, lights: 2, wisps: 28, envelope: 1 },
  ULTRA: { octaves: 3, shock: 1, lights: 2, wisps: 48, envelope: 1.1 },
};
/**
 * Plume length and nozzle radius (m) per thruster kind. The plume keeps this size at every
 * throttle setting: more thrust shows as a hotter, denser, faster-churning jet, not a longer one.
 */
const SHAPE: Record<JetKind, { length: number; radius: number }> = {
  back: { length: 0.46, radius: 0.07 }, foot: { length: 0.34, radius: 0.058 }, palm: { length: 0.2, radius: 0.04 },
};
const MAX_JETS = 6;

const VERTEX = /* glsl */`
  uniform vec3 uOrigin[${MAX_JETS}];
  uniform vec3 uAxis[${MAX_JETS}];
  uniform vec4 uParams[${MAX_JETS}];   // length, radius, power, seed
  attribute float aJet;
  attribute float aKind;                // 0 = plume ribbon, 1 = nozzle flare
  varying vec2 vUv;
  varying vec4 vParams;
  varying float vKind;
  void main() {
    int j = int(aJet + 0.5);
    vec3 origin = uOrigin[j];
    vec3 axis = uAxis[j];
    vec4 params = uParams[j];
    vUv = uv; vParams = params; vKind = aKind;
    vec3 world;
    if (aKind < 0.5) {
      // Ribbon along the exhaust axis, turned about that axis to face the camera.
      float len = params.x;
      vec3 centre = origin + axis * (len * 0.5);
      vec3 side = cross(axis, normalize(cameraPosition - centre));
      float sl = length(side);
      side = sl > 1e-4 ? side / sl : vec3(1.0, 0.0, 0.0);
      float halfWidth = params.y * 2.1;
      world = origin + axis * (uv.y * len - params.y * 0.35) + side * ((uv.x * 2.0 - 1.0) * halfWidth);
    } else {
      // Camera-facing flare at the nozzle so the jet also reads when seen end-on.
      vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
      vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
      float size = params.y * (1.3 + min(params.z, 1.6) * 0.16);
      world = origin + axis * (params.y * 0.25) + (right * (uv.x * 2.0 - 1.0) + up * (uv.y * 2.0 - 1.0)) * size;
    }
    if (params.z < 0.004) world = origin;      // off: collapse, costs no fill
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const FRAGMENT = /* glsl */`
  uniform float uTime;
  uniform float uShock;
  uniform float uEnvelope;
  uniform vec3 uCore;
  uniform vec3 uBlue;
  uniform vec3 uDeep;
  varying vec2 vUv;
  varying vec4 vParams;
  varying float vKind;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float turbulence(vec2 p) {
    float n = noise(p);
    #if OCTAVES > 1
      n = n * 0.62 + noise(p * 2.3 + 7.1) * 0.38;
    #endif
    #if OCTAVES > 2
      n = n * 0.8 + noise(p * 5.1 + 3.7) * 0.2;
    #endif
    return n;
  }
  void main() {
    float power = vParams.z, seed = vParams.w;
    vec3 colour; float alpha;
    // thrust above idle: drives brightness, density and how fast the exhaust churns
    float drive = clamp(power, 0.0, 2.0);
    if (vKind < 0.5) {
      float y = vUv.y;                               // 0 at the nozzle, 1 at the tip
      float x = vUv.x * 2.0 - 1.0;
      // exhaust scrolls away from the nozzle; turbulence grows downstream
      float n = turbulence(vec2(x * 2.2 + seed * 9.0, y * 4.6 - uTime * (6.0 + drive * 9.0)));
      float wobble = (n - 0.5) * (0.08 + 0.30 * y);
      float r = abs(x + wobble * 0.55);
      float coreWidth = mix(0.36, 0.07, pow(y, 0.72));
      float core = exp(-pow(r / coreWidth, 2.0) * 1.9) * (1.0 - smoothstep(0.42, 0.98, y));
      float envWidth = mix(0.68, 0.36, y) * (0.85 + 0.3 * n);
      float env = exp(-pow(r / envWidth, 2.0) * 2.4) * pow(1.0 - y, 1.35) * uEnvelope;
      // fine, fast structure inside the jet; there is more of it the harder it burns
      #if OCTAVES > 1
        float grain = noise(vec2(x * 7.0 + seed * 3.0, y * 11.0 - uTime * (15.0 + drive * 12.0)));
        core *= 1.0 + (grain - 0.5) * (0.22 + 0.34 * drive);
        env *= 1.0 + (grain - 0.5) * 0.3 * drive;
      #endif
      // standing shock pattern close to the nozzle at high thrust
      float shock = 0.0;
      #if SHOCK
        float cells = y * 5.2;
        shock = pow(0.5 + 0.5 * cos(cells * 6.2832 - uTime * 2.0), 6.0) * exp(-y * 3.0) * smoothstep(1.05, 1.5, power) * uShock;
        shock *= exp(-pow(r / (coreWidth * 1.9), 2.0));
      #endif
      float start = smoothstep(0.0, 0.05, y);
      float flicker = 0.92 + 0.08 * sin(uTime * (27.0 + drive * 16.0) + seed * 40.0);
      float heat = clamp(core * (0.72 + 0.5 * drive) + shock * 0.8, 0.0, 1.6);
      colour = mix(uDeep, uBlue, clamp(env * 1.6 + heat, 0.0, 1.0));
      colour = mix(colour, uCore, clamp(heat * heat * (0.75 + 0.25 * drive), 0.0, 1.0));
      alpha = (env * (0.30 + 0.20 * drive) + heat * 0.8) * start * flicker * smoothstep(0.0, 0.12, power);
    } else {
      // the recessed nozzle: a small hot disc that brightens with thrust but does not grow
      float d = length(vUv * 2.0 - 1.0);
      float glow = exp(-d * d * 7.5) * 0.42 + exp(-d * d * 46.0) * 1.0;
      glow *= 1.0 - smoothstep(0.82, 1.0, d);
      colour = mix(uBlue, uCore, clamp(exp(-d * d * 30.0) * (1.0 + 0.3 * drive), 0.0, 1.0));
      alpha = glow * (0.22 + 0.2 * drive) * smoothstep(0.0, 0.12, power);
    }
    alpha = min(alpha, 1.35);
    gl_FragColor = vec4(colour * alpha, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const WISP_VERTEX = /* glsl */`
  attribute float aLife;
  varying float vLife;
  uniform float uScale;
  void main() {
    vLife = aLife;
    vec4 mv = viewMatrix * vec4(position, 1.0);
    gl_PointSize = aLife > 0.0 ? uScale * (0.05 + 0.11 * (1.0 - aLife)) / max(0.1, -mv.z) : 0.0;
    gl_Position = projectionMatrix * mv;
  }
`;
const WISP_FRAGMENT = /* glsl */`
  varying float vLife;
  uniform vec3 uBlue;
  void main() {
    float d = length(gl_PointCoord * 2.0 - 1.0);
    float a = exp(-d * d * 3.2) * (1.0 - smoothstep(0.75, 1.0, d)) * vLife * vLife * 0.5;
    gl_FragColor = vec4(uBlue * a, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * Propulsion visuals: six shader jets in one draw call, optional wisps and at most two
 * lights. No per-frame allocation; everything scales with the quality level.
 */
export class FlightVfx {
  private readonly jets: Jet[] = [];
  private readonly origins: Vector3[] = [];
  private readonly axes: Vector3[] = [];
  private readonly params: Vector4[] = [];
  private readonly jetMaterial: ShaderMaterial;
  private readonly jetMesh: Mesh;
  private readonly lights: PointLight[] = [];
  private readonly plan: QualityPlan;
  private readonly wisps: Points | null = null;
  private readonly wispPositions: Float32Array = new Float32Array(0);
  private readonly wispVelocities: Float32Array = new Float32Array(0);
  private readonly wispLife: Float32Array = new Float32Array(0);
  private wispCursor = 0;
  private wispDebt = 0;
  private readonly streakGeometry = new BufferGeometry();
  private readonly streakPositions: Float32Array;
  private readonly speedLines: LineSegments;
  private readonly scratch = new Vector3();
  private readonly scratch2 = new Vector3();
  private time = 0;
  private surge = 0;
  private lastState = FlightState.Ground;
  private wasBoost = false;

  constructor(camera: Camera, mounts: Object3D[], lineCount: number, quality: QualityLevel = 'HIGH') {
    this.plan = PLAN[quality];
    for (const mount of mounts.slice(0, MAX_JETS)) {
      const kind = (mount.userData.kind as JetKind | undefined) ?? 'back';
      this.jets.push({ mount, kind, side: mount.userData.side === 'R' ? -1 : 1, power: 0, seed: this.jets.length * 0.173 + 0.11 });
    }
    for (let i = 0; i < MAX_JETS; i++) { this.origins.push(new Vector3()); this.axes.push(new Vector3(0, -1, 0)); this.params.push(new Vector4()); }

    // two quads per jet: plume ribbon + nozzle flare
    const count = this.jets.length;
    const position = new Float32Array(count * 8 * 3), uv = new Float32Array(count * 8 * 2);
    const jet = new Float32Array(count * 8), kind = new Float32Array(count * 8), index: number[] = [];
    const corners = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (let j = 0; j < count; j++) for (let q = 0; q < 2; q++) {
      const base = (j * 2 + q) * 4;
      for (let c = 0; c < 4; c++) { uv[(base + c) * 2] = corners[c][0]; uv[(base + c) * 2 + 1] = corners[c][1]; jet[base + c] = j; kind[base + c] = q; }
      index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(position, 3));
    geometry.setAttribute('uv', new BufferAttribute(uv, 2));
    geometry.setAttribute('aJet', new BufferAttribute(jet, 1));
    geometry.setAttribute('aKind', new BufferAttribute(kind, 1));
    geometry.setIndex(index);
    this.jetMaterial = new ShaderMaterial({
      vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, depthWrite: false, blending: AdditiveBlending,
      premultipliedAlpha: true, toneMapped: true,
      defines: { OCTAVES: this.plan.octaves, SHOCK: this.plan.shock > 0 ? 1 : 0 },
      uniforms: {
        uOrigin: { value: this.origins }, uAxis: { value: this.axes }, uParams: { value: this.params },
        uTime: { value: 0 }, uShock: { value: this.plan.shock }, uEnvelope: { value: this.plan.envelope },
        uCore: { value: new Color('#eaf6ff') }, uBlue: { value: new Color('#2f9bff') }, uDeep: { value: new Color('#0a3aa8') },
      },
    });
    this.jetMesh = new Mesh(geometry, this.jetMaterial);
    this.jetMesh.frustumCulled = false; this.jetMesh.renderOrder = 4; this.jetMesh.name = 'AEGIS thruster jets';

    for (let i = 0; i < this.plan.lights; i++) {
      const light = new PointLight('#3aa2ff', 0, 7, 2); light.castShadow = false; this.lights.push(light);
    }
    if (this.plan.wisps > 0) {
      const n = this.plan.wisps;
      this.wispPositions = new Float32Array(n * 3); this.wispVelocities = new Float32Array(n * 3); this.wispLife = new Float32Array(n);
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(this.wispPositions, 3).setUsage(DynamicDrawUsage));
      g.setAttribute('aLife', new BufferAttribute(this.wispLife, 1).setUsage(DynamicDrawUsage));
      this.wisps = new Points(g, new ShaderMaterial({
        vertexShader: WISP_VERTEX, fragmentShader: WISP_FRAGMENT, transparent: true, depthWrite: false, blending: AdditiveBlending,
        premultipliedAlpha: true, uniforms: { uScale: { value: 900 }, uBlue: { value: new Color('#5fb4ff') } },
      }));
      this.wisps.frustumCulled = false; this.wisps.renderOrder = 3;
    }

    this.streakPositions = new Float32Array(lineCount * 6);
    for (let index = 0; index < lineCount; index += 1) this.resetLine(index, true);
    this.streakGeometry.setAttribute('position', new BufferAttribute(this.streakPositions, 3));
    this.speedLines = new LineSegments(this.streakGeometry, new LineBasicMaterial({
      color: '#c8f8ff', transparent: true, opacity: 0.42, blending: AdditiveBlending, depthWrite: false,
    }));
    this.speedLines.visible = false;
    camera.add(this.speedLines);
  }

  public update(delta: number, state: FlightState, speed: number, boost: boolean, input: ThrustInput = {}): void {
    this.time += delta;
    this.attach();
    const flying = state !== FlightState.Ground && state !== FlightState.Jump;
    const wasFlying = this.lastState !== FlightState.Ground && this.lastState !== FlightState.Jump;
    if (flying && !wasFlying && state !== FlightState.Fall) this.surge = 1;   // ignition
    if (boost && !this.wasBoost) this.surge = Math.max(this.surge, 0.85);    // boost kick
    this.surge *= Math.exp(-delta * 3.2);
    this.lastState = state; this.wasBoost = boost;
    const bank = input.bank ?? 0, climb = input.velocity ? input.velocity.y : 0, pace = Math.min(1, speed / 48);

    let anyOn = false;
    for (let i = 0; i < this.jets.length; i++) {
      const jet = this.jets[i];
      const target = flying ? this.demand(jet, state, boost, pace, bank, climb) : 0;
      // jets spool up faster than they die away
      jet.power += (target - jet.power) * (1 - Math.exp(-delta * (target > jet.power ? 11 : 6)));
      if (jet.power < 0.004) jet.power = 0;
      const shape = SHAPE[jet.kind];
      jet.mount.getWorldPosition(this.origins[i]);
      // exhaust leaves along the mount's local -Y
      const e = jet.mount.matrixWorld.elements;
      this.axes[i].set(-e[4], -e[5], -e[6]).normalize();
      const scale = Math.hypot(e[4], e[5], e[6]);
      // the plume unfolds as the jet lights, then stays put: at most 8% longer at full boost
      const length = shape.length * scale * (0.5 + 0.5 * MathUtils.smoothstep(jet.power, 0, 0.3)) * (1 + 0.08 * Math.min(1, pace));
      this.params[i].set(length, shape.radius * scale, jet.power, jet.seed);
      anyOn ||= jet.power > 0;
    }
    this.jetMesh.visible = anyOn;
    this.jetMaterial.uniforms.uTime.value = this.time;

    this.updateLights();
    const powered = flying && state !== FlightState.Fall && state !== FlightState.Landing;
    if (this.wisps) this.updateWisps(delta, powered && (boost || speed > 20), input.velocity);

    const activeLines = flying && speed > 25;
    this.speedLines.visible = activeLines;
    if (!activeLines) return;
    const positions = this.streakPositions;
    const advance = speed * delta * (boost ? 2.5 : 1.2);
    for (let index = 0; index < positions.length / 6; index += 1) {
      const offset = index * 6;
      positions[offset + 2] += advance;
      positions[offset + 5] += advance;
      if (positions[offset + 2] > -1) this.resetLine(index, false);
    }
    const attribute = this.streakGeometry.getAttribute('position') as BufferAttribute;
    attribute.needsUpdate = true;
  }

  /** How hard each thruster works for the current manoeuvre. */
  private demand(jet: Jet, state: FlightState, boost: boolean, pace: number, bank: number, climb: number): number {
    const { kind } = jet;
    let power: number;
    switch (state) {
      case FlightState.Takeoff: power = kind === 'foot' ? 1.25 : kind === 'back' ? 1.0 : 0.5; break;
      case FlightState.Hover: power = kind === 'foot' ? 1.0 : kind === 'back' ? 0.42 : 0.26; break;
      case FlightState.Cruise: power = kind === 'back' ? 1.0 + pace * 0.3 : kind === 'foot' ? 0.55 : 0.16; break;
      case FlightState.Boost: power = kind === 'back' ? 1.6 : kind === 'foot' ? 0.9 : 0.22; break;
      case FlightState.Brake: power = kind === 'palm' ? 0.95 : kind === 'foot' ? 0.85 : 0.2; break;
      // free fall: main propulsion off, the palms trim the attitude
      case FlightState.Fall: power = kind === 'palm' ? 0.2 : 0; break;
      // bracing for the ground: a short corrective burst, shut down on contact
      case FlightState.Landing: power = kind === 'foot' ? 0.9 : kind === 'back' ? 0.2 : 0.42; break;
      default: power = 0;
    }
    if (boost && state !== FlightState.Boost) power *= 1.15;
    // climbing needs more lift, sinking less; the feet carry most of it
    power += Math.max(-0.25, Math.min(0.35, climb * 0.03)) * (kind === 'foot' ? 1 : 0.4);
    // turning: the outside jets push harder, the inside ones ease off
    power *= 1 + jet.side * bank * (kind === 'palm' ? 0.55 : 0.22);
    // ignition / boost surge, then small stabilising corrections
    power *= 1 + this.surge * (kind === 'back' ? 0.7 : 0.5);
    const hunt = state === FlightState.Fall ? 0.6 : state === FlightState.Hover || state === FlightState.Landing ? 0.09 : 0.04;
    power *= 1 + Math.sin(this.time * (5.3 + jet.seed * 9) + jet.seed * 40) * hunt;
    return Math.max(0, power);
  }

  private updateLights(): void {
    // light 0 follows the back pack, light 1 the boots; intensity tracks thrust
    for (let l = 0; l < this.lights.length; l++) {
      const light = this.lights[l]; const wanted: JetKind = l === 0 ? 'back' : 'foot';
      let power = 0, n = 0; this.scratch.set(0, 0, 0);
      for (let i = 0; i < this.jets.length; i++) if (this.jets[i].kind === wanted) {
        this.scratch.add(this.origins[i]).addScaledVector(this.axes[i], 0.18); power += this.jets[i].power; n++;
      }
      if (n === 0) { light.intensity = 0; continue; }
      light.position.copy(this.scratch.multiplyScalar(1 / n));
      light.intensity = Math.min(1.6, power / n) * 3.2;
    }
  }

  private updateWisps(delta: number, emit: boolean, velocity?: Vector3): void {
    const n = this.wispLife.length;
    for (let i = 0; i < n; i++) {
      if (this.wispLife[i] <= 0) continue;
      this.wispLife[i] = Math.max(0, this.wispLife[i] - delta * 2.6);
      this.wispPositions[i * 3] += this.wispVelocities[i * 3] * delta;
      this.wispPositions[i * 3 + 1] += this.wispVelocities[i * 3 + 1] * delta;
      this.wispPositions[i * 3 + 2] += this.wispVelocities[i * 3 + 2] * delta;
    }
    if (emit) {
      this.wispDebt += delta * n * 2.2;
      while (this.wispDebt >= 1) {
        this.wispDebt -= 1;
        // back thrusters shed the wisps
        const j = this.jets.findIndex((jet, index) => jet.kind === 'back' && (this.wispCursor + index) % 2 === 0 && jet.power > 0.3);
        if (j < 0) break;
        const i = this.wispCursor = (this.wispCursor + 1) % n;
        const reach = this.params[j].x * (0.55 + Math.random() * 0.5);
        this.scratch2.copy(this.origins[j]).addScaledVector(this.axes[j], reach);
        this.wispPositions[i * 3] = this.scratch2.x; this.wispPositions[i * 3 + 1] = this.scratch2.y; this.wispPositions[i * 3 + 2] = this.scratch2.z;
        const drag = velocity ? 0.35 : 0;
        this.wispVelocities[i * 3] = this.axes[j].x * 2.2 + (velocity ? velocity.x * drag : 0) + (Math.random() - 0.5) * 0.9;
        this.wispVelocities[i * 3 + 1] = this.axes[j].y * 2.2 + (velocity ? velocity.y * drag : 0) + (Math.random() - 0.5) * 0.9;
        this.wispVelocities[i * 3 + 2] = this.axes[j].z * 2.2 + (velocity ? velocity.z * drag : 0) + (Math.random() - 0.5) * 0.9;
        this.wispLife[i] = 1;
      }
    } else this.wispDebt = 0;
    const g = this.wisps!.geometry;
    (g.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (g.getAttribute('aLife') as BufferAttribute).needsUpdate = true;
  }

  /** Jets live in world space: parent them to whatever scene the character is in. */
  private attach(): void {
    if (this.jetMesh.parent || this.jets.length === 0) return;
    let root: Object3D = this.jets[0].mount;
    while (root.parent) root = root.parent;
    root.add(this.jetMesh);
    for (const light of this.lights) root.add(light);
    if (this.wisps) root.add(this.wisps);
  }

  private resetLine(index: number, initial: boolean): void {
    const offset = index * 6;
    const spread = initial ? Math.random() * 80 : 80 + Math.random() * 50;
    const x = (Math.random() - 0.5) * 26;
    const y = (Math.random() - 0.5) * 16;
    const z = -spread;
    const length = 2 + Math.random() * 8;
    this.streakPositions[offset] = x;
    this.streakPositions[offset + 1] = y;
    this.streakPositions[offset + 2] = z;
    this.streakPositions[offset + 3] = x;
    this.streakPositions[offset + 4] = y;
    this.streakPositions[offset + 5] = z - length;
  }
}
