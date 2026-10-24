import {
  BoxGeometry, Group, Mesh, MeshStandardMaterial, Object3D,
  Shape, ShapeGeometry, Vector3,
} from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/**
 * Original supplementary AEGIS armour. The animated/skinned source GLB stays
 * authoritative; these low-poly panels follow its existing head/chest/knee bones.
 * Coordinates are authored against the loaded 2.15 m character in its idle pose.
 * Do not mistake this for a replacement sculpt, rig, or independently animated mesh.
 */
export interface AegisMaterialSet {
  shell: MeshStandardMaterial;
  alloy: MeshStandardMaterial;
  composite: MeshStandardMaterial;
  optic: MeshStandardMaterial;
}

export type ArmorMount = (bone: string, worldPosition: Vector3, phase: number, release: Vector3) => Group;

function shapedPanel(parent: Object3D, material: MeshStandardMaterial, points: [number, number][], z: number): Mesh {
  const outline = new Shape();
  outline.moveTo(points[0][0], points[0][1]);
  for (const [x, y] of points.slice(1)) outline.lineTo(x, y);
  outline.closePath();
  const mesh = new Mesh(new ShapeGeometry(outline), material);
  mesh.position.z = z;
  parent.add(mesh);
  return mesh;
}

function bar(parent: Object3D, material: MeshStandardMaterial,
  start: [number, number], end: [number, number], width: number, depth: number, z = 0): Mesh {
  const dx = end[0] - start[0], dy = end[1] - start[1];
  const mesh = new Mesh(new RoundedBoxGeometry(Math.hypot(dx, dy), width, depth, 1, 0.003), material);
  mesh.position.set((start[0] + end[0]) * .5, (start[1] + end[1]) * .5, z);
  mesh.rotation.z = Math.atan2(dy, dx);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function faceted(parent: Object3D, material: MeshStandardMaterial, points: [number, number, number][]): Mesh {
  const geometry = new ConvexGeometry(points.map(([x, y, z]) => new Vector3(x, y, z)));
  const mesh = new Mesh(geometry, material);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

export function installAegisIdentity(mount: ArmorMount, materials: AegisMaterialSet): void {
  const { shell, alloy, composite, optic } = materials;

  // Physically layered triangular insignia. The dark recess and the light
  // trace occupy different depths; no floating sphere or projected decal.
  const chest = mount('chest', new Vector3(0, 1.41, .245), .26, new Vector3(0, .15, 1.1));
  shapedPanel(chest, composite, [[0, .112], [-.113, -.082], [.113, -.082]], -.016);
  const edges: [[number, number], [number, number]][] = [
    [[0, .112], [-.113, -.082]], [[-.113, -.082], [.113, -.082]], [[.113, -.082], [0, .112]],
  ];
  for (const [start, end] of edges) {
    bar(chest, alloy, start, end, .019, .017, .002);
    // Emission is set behind the surrounding metal rim for a restrained edge glow.
    const a: [number, number] = [start[0] * .77, start[1] * .77];
    const b: [number, number] = [end[0] * .77, end[1] * .77];
    bar(chest, optic, a, b, .009, .007, .013);
  }
  shapedPanel(chest, shell, [[0, .047], [-.037, -.023], [.037, -.023]], .002);
  // Breastplate seams visually connect the insignia to the existing skinned torso.
  for (const sign of [-1, 1]) {
    const breast = mount('chest', new Vector3(sign * .145, 1.44, .19), .34, new Vector3(sign * .55, .15, .6));
    faceted(breast, shell, [
      [0, .058, -.01], [sign * .103, .021, -.015], [sign * .087, -.092, -.015],
      [sign * .018, -.074, .037], [sign * .031, .043, .045], [sign * .065, -.018, .05],
    ]);
    bar(breast, alloy, [sign * .034, -.064], [sign * .08, -.027], .009, .009, .049);
  }

  // Faceted visor housing over the rigged head, with recessed optics, armored
  // brows, cheek guards and additional rear plates. Kept compact for animation.
  const face = mount('head001', new Vector3(0, 1.94, .22), .67, new Vector3(0, .25, .62));
  faceted(face, shell, [
    [-.178, .103, -.023], [.178, .103, -.023], [-.150, -.126, .021], [.150, -.126, .021],
    [0, -.205, .072], [0, .084, .120], [-.139, .024, .086], [.139, .024, .086],
  ]);
  shapedPanel(face, composite, [[-.145, .074], [.145, .074], [.116, -.004], [0, -.028], [-.116, -.004]], .134);
  // Two angular blades share the same recessed pocket. No broad luminous block.
  for (const sign of [-1, 1]) {
    shapedPanel(face, optic, [
      [sign * .012, .048], [sign * .133, .053], [sign * .108, .017], [sign * .030, .019],
    ], .139);
    // Overhanging rim makes the illuminated elements read as inset lenses.
    bar(face, alloy, [sign * .016, .086], [sign * .15, .078], .018, .021, .159);
    faceted(face, shell, [
      [sign * .141, -.006, .11], [sign * .189, -.035, .049],
      [sign * .145, -.137, .049], [sign * .086, -.118, .151],
      [sign * .111, -.052, .162],
    ]);
    bar(face, alloy, [sign * .113, -.136], [sign * .062, -.167], .013, .015, .110);
    // Distinct temple cutout that breaks the helmet's side profile.
    faceted(face, alloy, [
      [sign * .164, .065, -.055], [sign * .185, .016, -.071],
      [sign * .194, -.052, -.066], [sign * .166, -.046, .013],
      [sign * .152, .044, .029],
    ]);
  }
  faceted(face, alloy, [
    [0, .142, .025], [-.039, .103, .096], [.039, .103, .096],
    [-.029, .063, .157], [.029, .063, .157], [0, .113, .145],
  ]);
  bar(face, shell, [-.068, -.181], [.068, -.181], .023, .033, .107);

  // The helmet must have an intentional back, not just a front faceplate.
  const helmetBack = mount('head001', new Vector3(0, 1.96, -.135), .73, new Vector3(0, .23, -1));
  for (const sign of [-1, 1]) {
    faceted(helmetBack, shell, [
      [sign * .012, .091, -.035], [sign * .154, .075, -.022],
      [sign * .160, -.068, -.028], [sign * .058, -.124, -.040],
      [sign * .040, .033, -.092], [sign * .122, -.033, -.091],
    ]);
    bar(helmetBack, alloy, [sign * .042, .060], [sign * .124, .049], .01, .013, -.099);
  }

  // Compact articulated spine shroud: small enough not to obscure the two
  // existing, bone-mounted back propulsion pods.
  const spine = mount('chest', new Vector3(0, 1.42, -.31), .58, new Vector3(0, .15, -.8));
  const spineArmor = new Mesh(new RoundedBoxGeometry(.115, .30, .045, 2, .012), shell);
  spineArmor.castShadow = true;
  spine.add(spineArmor);
  for (const y of [-.085, 0, .085]) {
    const heatSink = new Mesh(new BoxGeometry(.08, .012, .02), alloy);
    heatSink.position.set(0, y, -.034);
    spine.add(heatSink);
  }

  // Knee structure tracks real bone articulation rather than following the torso.
  for (const sign of [-1, 1]) {
    const knee = mount(sign > 0 ? 'kneeL' : 'kneeR',
      new Vector3(sign * .20, .65, .23), .17, new Vector3(sign * .48, -.18, .6));
    faceted(knee, shell, [
      [-.064, .044, -.021], [.064, .044, -.021], [-.063, -.047, -.019],
      [.063, -.047, -.019], [0, -.072, .035], [0, .035, .061],
    ]);
    bar(knee, alloy, [-.047, .022], [.047, .022], .012, .01, .065);
  }
}
