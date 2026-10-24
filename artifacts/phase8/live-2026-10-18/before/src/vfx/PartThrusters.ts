import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, NormalBlending, Object3D, Points,
  ShaderMaterial, Vector3,
} from 'three';

/** Flame sprites per jet: a hot core at the nozzle and two cooler ones down the plume. */
const FLAME = [[0, 1, 1], [0.55, 0.72, 0.6], [1.15, 0.5, 0.28]] as const;   // [distance, size, brightness]
/** Metres of flight per smoke puff. */
const TRAIL_SPACING = 0.12;
const SCRATCH = new Vector3();

/**
 * Small manoeuvring thrusters for armour components in free flight, and the smoke they
 * leave behind. Two draw calls in total (additive flames, alpha-blended smoke), both
 * hidden while nothing is burning. Positions are in the space of `root`.
 */
export class PartThrusters {
  private readonly flames: Points;
  private readonly smoke: Points;
  private readonly flamePosition: Float32Array;
  private readonly flameLook: Float32Array;        // size (m), brightness
  private readonly smokePosition: Float32Array;
  private readonly smokeLook: Float32Array;        // age 0..1, size (m), seed
  private readonly smokeVelocity: Float32Array;
  private readonly smokeLife: Float32Array;        // seconds lived, lifetime
  private readonly debt: Float32Array;             // fractional particles owed per jet
  private readonly last: Float32Array;             // where each jet's nozzle was last frame
  private readonly lit: Uint8Array;                // 1 = burning last frame, 2 = also this frame
  private cursor = 0;
  private alive = 0;
  private burning = false;

  constructor(root: Object3D, private readonly jets: number, private readonly particles = 640) {
    this.flamePosition = new Float32Array(jets * FLAME.length * 3);
    this.flameLook = new Float32Array(jets * FLAME.length * 2);
    this.smokePosition = new Float32Array(particles * 3);
    this.smokeLook = new Float32Array(particles * 3).fill(1);
    this.smokeVelocity = new Float32Array(particles * 3);
    this.smokeLife = new Float32Array(particles * 2);
    this.debt = new Float32Array(jets);
    this.last = new Float32Array(jets * 3);
    this.lit = new Uint8Array(jets);
    for (let i = 0; i < particles; i++) this.smokeLook[i * 3] = 1;      // age 1 = dead

    const flameGeometry = new BufferGeometry();
    flameGeometry.setAttribute('position', new BufferAttribute(this.flamePosition, 3).setUsage(DynamicDrawUsage));
    flameGeometry.setAttribute('aLook', new BufferAttribute(this.flameLook, 2).setUsage(DynamicDrawUsage));
    this.flames = new Points(flameGeometry, new ShaderMaterial({
      transparent: true, depthWrite: false, blending: AdditiveBlending,
      uniforms: { uCore: { value: new Color('#eaf6ff') }, uGlow: { value: new Color('#2f8dff') } },
      vertexShader: `attribute vec2 aLook; varying float vLevel;
        void main(){ vLevel=aLook.y; vec4 mv=modelViewMatrix*vec4(position,1.0);
          gl_PointSize=aLook.y>0.0?aLook.x*projectionMatrix[1][1]*900.0/max(0.1,-mv.z):0.0; gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform vec3 uCore; uniform vec3 uGlow; varying float vLevel;
        void main(){ float d=length(gl_PointCoord*2.0-1.0); float core=exp(-d*d*22.0), halo=exp(-d*d*4.0)*(1.0-smoothstep(0.75,1.0,d));
          vec3 c=uCore*core*1.3+uGlow*halo*0.85; gl_FragColor=vec4(c*vLevel,1.0); }`,
    }));
    const smokeGeometry = new BufferGeometry();
    smokeGeometry.setAttribute('position', new BufferAttribute(this.smokePosition, 3).setUsage(DynamicDrawUsage));
    smokeGeometry.setAttribute('aLook', new BufferAttribute(this.smokeLook, 3).setUsage(DynamicDrawUsage));
    this.smoke = new Points(smokeGeometry, new ShaderMaterial({
      transparent: true, depthWrite: false, blending: NormalBlending,
      uniforms: { uYoung: { value: new Color('#b9c9dc') }, uOld: { value: new Color('#5b616b') } },
      vertexShader: `attribute vec3 aLook; varying float vAge; varying float vSeed;
        void main(){ vAge=aLook.x; vSeed=aLook.z; vec4 mv=modelViewMatrix*vec4(position,1.0);
          float size=aLook.y*(0.3+0.7*sqrt(aLook.x));
          gl_PointSize=aLook.x<1.0?size*projectionMatrix[1][1]*900.0/max(0.1,-mv.z):0.0; gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform vec3 uYoung; uniform vec3 uOld; varying float vAge; varying float vSeed;
        void main(){ vec2 p=gl_PointCoord*2.0-1.0; float a=vSeed*6.2832; p=mat2(cos(a),-sin(a),sin(a),cos(a))*p;
          // a soft puff, slightly uneven so a trail does not read as a row of discs
          float d=length(p)*(1.0+0.08*sin(atan(p.y,p.x)*2.0+vSeed*40.0));
          float body=exp(-d*d*2.6)*(1.0-smoothstep(0.7,1.0,d));
          float fade=(1.0-vAge)*(1.0-vAge)*smoothstep(0.0,0.08,vAge);
          gl_FragColor=vec4(mix(uYoung,uOld,vAge),body*fade*0.3); }`,
    }));
    for (const points of [this.flames, this.smoke]) { points.frustumCulled = false; points.visible = false; root.add(points); }
    this.flames.renderOrder = 6; this.smoke.renderOrder = 5;
  }

  /** Turn every jet off; call before placing this frame's jets. */
  public begin(): void { this.flameLook.fill(0); this.burning = false; }

  /**
   * Place jet `index`: nozzle position, the direction the exhaust leaves in (unit),
   * throttle 0..1 and nozzle size in metres. With `delta` > 0 it also sheds smoke.
   */
  public jet(index: number, nozzle: Vector3, exhaust: Vector3, throttle: number, size: number, delta = 0): void {
    if (index < 0 || index >= this.jets || throttle <= 0.02) return;
    this.burning = true;
    const flicker = 0.85 + 0.15 * Math.sin(performance.now() * 0.045 + index * 2.4);
    for (let f = 0; f < FLAME.length; f++) {
      const [along, scale, bright] = FLAME[f], at = (index * FLAME.length + f);
      SCRATCH.copy(exhaust).multiplyScalar(along * size * (0.6 + 0.9 * throttle)).add(nozzle).toArray(this.flamePosition, at * 3);
      this.flameLook[at * 2] = size * scale * 1.7; this.flameLook[at * 2 + 1] = bright * throttle * flicker;
    }
    if (delta <= 0) { if (this.lit[index]) this.lit[index] = 2; return; }      // shown, not moved: the trail carries on
    // Smoke is shed per distance flown, so a fast component leaves an unbroken trail,
    // plus a trickle while it hovers.
    const moved = this.lit[index] ? SCRATCH.fromArray(this.last, index * 3).distanceTo(nozzle) : 0;
    this.debt[index] += moved / TRAIL_SPACING + delta * 14 * throttle;
    const count = Math.min(14, Math.floor(this.debt[index]));
    this.debt[index] -= Math.floor(this.debt[index]);
    for (let k = 0; k < count; k++) {
      const back = moved > 0 ? (k + Math.random()) / count : 0;      // spread along the path since last frame
      const p = this.cursor; this.cursor = (this.cursor + 1) % this.particles;
      const jitter = (): number => Math.random() - 0.5;
      for (let c = 0; c < 3; c++) {
        const here = nozzle.getComponent(c), was = this.lit[index] ? this.last[index * 3 + c] : here;
        this.smokePosition[p * 3 + c] = here + (was - here) * back + exhaust.getComponent(c) * size + jitter() * size * 0.8;
        this.smokeVelocity[p * 3 + c] = exhaust.getComponent(c) * (0.5 + Math.random() * 0.7) + jitter() * 0.35;
      }
      this.smokeVelocity[p * 3 + 1] += 0.15;
      this.smokeLife[p * 2] = 0; this.smokeLife[p * 2 + 1] = 0.55 + Math.random() * 0.5;
      this.smokeLook[p * 3] = 0; this.smokeLook[p * 3 + 1] = size * (1.5 + Math.random() * 1.0); this.smokeLook[p * 3 + 2] = Math.random();
    }
    nozzle.toArray(this.last, index * 3); this.lit[index] = 2;
  }

  /** Upload this frame's jets and age the smoke. Call once per frame, also when idle. */
  public update(delta: number): void {
    for (let i = 0; i < this.jets; i++) this.lit[i] = this.lit[i] === 2 ? 1 : 0;      // a jet that went dark starts a new trail
    this.flames.visible = this.burning;
    if (this.burning || this.flames.userData.dirty) {
      (this.flames.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
      (this.flames.geometry.getAttribute('aLook') as BufferAttribute).needsUpdate = true;
      this.flames.userData.dirty = this.burning;
    }
    this.alive = 0;
    for (let p = 0; p < this.particles; p++) {
      if (this.smokeLook[p * 3] >= 1) continue;
      const lived = (this.smokeLife[p * 2] += delta), age = lived / this.smokeLife[p * 2 + 1];
      if (age >= 1) { this.smokeLook[p * 3] = 1; continue; }
      this.alive++;
      this.smokeLook[p * 3] = age;
      const drag = Math.exp(-2.6 * delta);
      for (let c = 0; c < 3; c++) { this.smokeVelocity[p * 3 + c] *= drag; this.smokePosition[p * 3 + c] += this.smokeVelocity[p * 3 + c] * delta; }
      this.smokePosition[p * 3 + 1] += 0.18 * delta;          // warm air rises
    }
    const visible = this.alive > 0;
    if (visible || this.smoke.visible) {
      (this.smoke.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
      (this.smoke.geometry.getAttribute('aLook') as BufferAttribute).needsUpdate = true;
    }
    this.smoke.visible = visible;
  }

  public dispose(): void {
    for (const points of [this.flames, this.smoke]) { points.removeFromParent(); points.geometry.dispose(); (points.material as ShaderMaterial).dispose(); }
  }
}
