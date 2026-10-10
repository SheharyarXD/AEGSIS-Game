import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Camera,
  Color,
  ConeGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PointLight,
} from 'three';
import { FlightState } from '../player/FlightState';

interface EngineFlame {
  group: Group;
  light: PointLight;
}

export class FlightVfx {
  private readonly flames: EngineFlame[] = [];
  private readonly streakGeometry = new BufferGeometry();
  private readonly streakPositions: Float32Array;
  private readonly speedLines: LineSegments;
  private time = 0;

  constructor(camera: Camera, mounts: Object3D[], lineCount: number) {
    const flameMaterial = new MeshBasicMaterial({
      color: new Color('#73efff'), transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false,
    });
    const innerMaterial = new MeshBasicMaterial({
      color: new Color('#ffffff'), transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false,
    });
    for (const mount of mounts) {
      const group = new Group();
      const plume = new Mesh(new ConeGeometry(0.22, 1.75, 10, 1, true), flameMaterial);
      plume.rotation.z = Math.PI;
      plume.position.y = -0.88;
      group.add(plume);
      const core = new Mesh(new ConeGeometry(0.09, 1.1, 8, 1, true), innerMaterial);
      core.rotation.z = Math.PI;
      core.position.y = -0.58;
      group.add(core);
      const light = new PointLight('#3cdfff', 0, 13, 2);
      light.position.y = -0.35;
      group.add(light);
      group.visible = false;
      mount.add(group);
      this.flames.push({ group, light });
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

  public update(delta: number, state: FlightState, speed: number, boost: boolean): void {
    this.time += delta;
    const flying = state !== FlightState.Ground && state !== FlightState.Jump;
    const power = flying ? Math.max(0.42, Math.min(1.65, speed / 29 + (boost ? 0.62 : 0))) : 0;
    for (const [index, flame] of this.flames.entries()) {
      flame.group.visible = flying;
      if (!flying) continue;
      const flicker = 0.9 + Math.sin(this.time * 22 + index) * 0.1;
      flame.group.scale.set(.65, power * flicker*.7, .65);
      flame.light.intensity = 2.5 * power;
    }
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
