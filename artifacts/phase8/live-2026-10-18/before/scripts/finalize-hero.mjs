/**
 * Final step of the AEGIS hero pipeline (see art/aegis-hero/README.md).
 * Takes Blender's raw export + baked maps and writes the deployable GLB:
 *   - armour: one shared 2K texture set (albedo variation, normal, occlusion/roughness/
 *     metal) attached to every surface material; emitters stay texture-free
 *   - pilot (no baked maps): keeps its own textures, capped at 2K
 *   - WebP textures, quantised geometry, resampled animation
 *   - public/assets/<name>-manifest.json with provenance and measured stats
 *
 *   node scripts/finalize-hero.mjs [name=aegis-hero] [textureSize=2048]
 */
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, quantize, resample, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const name = process.argv[2] || 'aegis-hero';
const size = Number(process.argv[3] || 2048);
const src = `art/aegis-hero/export/${name}.glb`;
const tex = `art/aegis-hero/textures/${name}_`;
const out = `public/assets/${name}.glb`;
const ALBEDO_GAIN = 1.25;  // baked albedo stores neutral at 0.8 so worn edges can brighten
const EMITTERS = new Set(['M_energy', 'M_visor']);
const QUANTIZED = /^(POSITION|NORMAL|TANGENT|TEXCOORD_\d+|JOINTS_\d+|WEIGHTS_\d+)$/;   // never the _GROUP ids
const LOD_RATIO = 0.24;    // crowd mesh keeps about a quarter of the triangles

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read(src);
const root = document.getRoot();
// Assets with baked maps (the armour) get the shared set; others (the pilot) keep their own textures.
const baked = await fs.access(`${tex}normal.png`).then(() => true, () => false);
const load = async (kind) => sharp(`${tex}${kind}.png`).resize(size, size, { kernel: 'lanczos3' }).png().toBuffer();
const maps = {};
if (baked) for (const kind of ['albedo', 'normal', 'orm']) {
  maps[kind] = document.createTexture(`${name}_${kind}`).setImage(await load(kind)).setMimeType('image/png');
}
for (const material of baked ? root.listMaterials() : []) {
  material.setDoubleSided(false);
  if (EMITTERS.has(material.getName())) continue;
  const [r, g, b, a] = material.getBaseColorFactor();
  material.setBaseColorFactor([Math.min(1, r * ALBEDO_GAIN), Math.min(1, g * ALBEDO_GAIN), Math.min(1, b * ALBEDO_GAIN), a]);
  material.setBaseColorTexture(maps.albedo);
  material.setNormalTexture(maps.normal).setNormalScale(1);
  material.setMetallicRoughnessTexture(maps.orm);
  material.setOcclusionTexture(maps.orm).setOcclusionStrength(1);
}
// Tables the game reads from gltf.userData: assembly groups and clip ground speeds.
const readJson = async (file) => fs.readFile(file, 'utf8').then(JSON.parse, () => null);
const assembly = await readJson(`art/aegis-hero/export/${name}.assembly.json`);
const motion = await readJson(`art/aegis-hero/export/${name}.motion.json`);
root.setExtras({ ...root.getExtras(), aegis: { groups: assembly?.groups ?? [], motion: motion ?? [] } });
await document.transform(
  dedup(),
  resample({ tolerance: 0.0002 }),
  prune({ keepLeaves: true }),
  quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeWeight: 8, pattern: QUANTIZED }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 92, effort: 80, resize: [size, size] }),
);
await io.write(out, document);

// Crowd LOD for the armour: geometry + skin only. At runtime it borrows the hero's
// materials, textures and clips, so it costs no extra texture memory.
let lod = null;
if (baked) {
  const lodDocument = await io.read(src);
  const lodRoot = lodDocument.getRoot();
  for (const animation of lodRoot.listAnimations()) {
    for (const channel of animation.listChannels()) channel.dispose();
    for (const sampler of animation.listSamplers()) sampler.dispose();
    animation.dispose();
  }
  for (const texture of lodRoot.listTextures()) texture.dispose();
  // The crowd mesh has no assembly groups to hide things with, so equipment that is
  // normally stowed (the shoulder missile pods) is left out of it altogether.
  const stowed = new Set((assembly?.groups ?? []).map((g, i) => (/^missile_pod/.test(g.name) ? i : -1)).filter(i => i >= 0));
  for (const mesh of lodRoot.listMeshes()) for (const prim of mesh.listPrimitives()) {
    const ids = prim.getAttribute('_GROUP'), indices = prim.getIndices();
    if (ids && indices && stowed.size) {
      const src = indices.getArray(), kept = [];
      for (let i = 0; i < src.length; i += 3) if (!stowed.has(Math.round(ids.getScalar(src[i])))) kept.push(src[i], src[i + 1], src[i + 2]);
      indices.setArray(new Uint32Array(kept));
    }
    prim.setAttribute('_GROUP', null);
  }
  await MeshoptSimplifier.ready;
  await lodDocument.transform(
    weld(), simplify({ simplifier: MeshoptSimplifier, ratio: LOD_RATIO, error: 0.004 }), prune({ keepLeaves: true }),
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeWeight: 8 }),
  );
  const lodOut = `public/assets/${name}-lod.glb`;
  await io.write(lodOut, lodDocument);
  let lodTriangles = 0;
  for (const mesh of lodRoot.listMeshes()) for (const prim of mesh.listPrimitives()) lodTriangles += prim.getIndices().getCount() / 3;
  lod = { file: lodOut, bytes: (await fs.readFile(lodOut)).length, triangles: lodTriangles };
}
const bytes = await fs.readFile(out);
let triangles = 0;
let vertices = 0;
for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
  vertices += prim.getAttribute('POSITION').getCount();
  triangles += (prim.getIndices() ? prim.getIndices().getCount() : prim.getAttribute('POSITION').getCount()) / 3;
}
const manifest = {
  asset: name,
  output: { file: out, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') },
  geometry: { triangles, vertices, primitives: root.listMeshes().reduce((n, m) => n + m.listPrimitives().length, 0) },
  materials: root.listMaterials().map(m => ({
    name: m.getName(), baseColor: m.getBaseColorFactor().map(v => +v.toFixed(3)), metallic: m.getMetallicFactor(),
    roughness: +m.getRoughnessFactor().toFixed(3), emissive: m.getEmissiveFactor().map(v => +v.toFixed(3)),
  })),
  textures: root.listTextures().map(t => ({ name: t.getName(), size: t.getSize(), bytes: t.getImage().length, format: t.getMimeType() })),
  rig: { joints: root.listSkins()[0]?.listJoints().length ?? 0, mounts: root.listNodes().map(n => n.getName()).filter(n => n.startsWith('MOUNT_')) },
  animations: root.listAnimations().map(a => a.getName()),
  ...(lod ? { lod } : {}),
};
let extra = {};
try { extra = JSON.parse(await fs.readFile(`art/aegis-hero/${name}.provenance.json`, 'utf8')); } catch { /* optional */ }
await fs.writeFile(`public/assets/${name}-manifest.json`, JSON.stringify({ ...manifest, ...extra }, null, 2) + '\n');
console.log(JSON.stringify({ file: out, MB: +(bytes.length / 1e6).toFixed(2), ...manifest.geometry, clips: manifest.animations.length, mounts: manifest.rig.mounts, lod }, null, 1));
