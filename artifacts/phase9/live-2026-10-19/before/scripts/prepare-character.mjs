/** Reproducible, pinned acquisition and browser asset preparation. No runtime remote URLs. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';

const commit = 'a82f15448e9b015440d3bbdf5e10801b260c4e9f';
const base = `https://raw.githubusercontent.com/godotengine/tps-demo/${commit}/`;
const sourceDir = 'assets-source/godot-tps';
const outputDir = 'public/assets';
await fs.mkdir(sourceDir, { recursive: true });
await fs.mkdir(outputDir, { recursive: true });
const sources = [];
for (const source of ['player/model/player.glb', ...['albedo', 'normal', 'orm', 'emissive'].map(n => `player/textures/player_robot_${n}.png`), 'LICENSE.md']) {
  const destination = source === 'LICENSE.md' ? `${outputDir}/LICENSE-godot.txt` : `${sourceDir}/${path.basename(source)}`;
  let bytes;
  try { bytes = await fs.readFile(destination); }
  catch {
    const response = await fetch(base + source);
    if (!response.ok) throw new Error(`Asset download failed (${response.status}): ${source}`);
    bytes = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(destination, bytes);
  }
  sources.push({ source: base + source, localSource: destination, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read(`${sourceDir}/player.glb`);
const retainedNames = new Set(['Idle-cycle', 'Idlecombat-cycle', 'walking_nogun-cycle', 'running_nogun-cycle', 'jump_1_up', 'jump_2_upwards-cycle', 'jump_3_midair-cycle', 'jump_4_falling-cycle', 'jump_5_hardlanding', 'flinch1', 'flinch2', 'flinch_heavy', 'Cannon_Charge', 'Cannon_Charge-cycle', 'lean_left-cycle', 'lean_right-cycle']);
for (const clip of document.getRoot().listAnimations()) if (!retainedNames.has(clip.getName())) {
  for (const channel of clip.listChannels()) channel.dispose();
  for (const sampler of clip.listSamplers()) sampler.dispose();
  clip.dispose();
}
// Physics owns translation. Remove source root travel and center each clip's pelvis
// in X/Z while retaining authored vertical compression and local weight shifts.
for (const clip of document.getRoot().listAnimations()) {
  for (const channel of clip.listChannels()) {
    const name = channel.getTargetNode()?.getName();
    if (name === 'head.001' && channel.getTargetPath() === 'scale') {
      const sampler = channel.getSampler();
      const source = sampler.getOutput();
      const output = source.clone();
      const values = new Float32Array(source.getArray());
      for (let index = 0; index < values.length; index += 3) {
        values[index] *= 0.68; values[index + 1] *= 0.78; values[index + 2] *= 0.82;
      }
      output.setArray(values); sampler.setOutput(output);
    }
    if (channel.getTargetPath() !== 'translation' || (name !== 'root' && name !== 'hips')) continue;
    const sampler = channel.getSampler();
    const source = sampler.getOutput();
    const output = source.clone();
    const values = new Float32Array(source.getArray());
    const offsetX = values[0];
    const offsetZ = values[2];
    for (let index = 0; index < values.length; index += 3) {
      if (name === 'root') {
        values[index] = 0; values[index + 1] = -1.2437940835952759; values[index + 2] = 0;
      } else {
        values[index] -= offsetX; values[index + 2] -= offsetZ;
      }
    }
    output.setArray(values); sampler.setOutput(output);
  }
}
const maps = {};
for (const name of ['albedo', 'normal', 'orm', 'emissive']) {
  maps[name] = document.createTexture(`player_robot_${name}`).setImage(await fs.readFile(`${sourceDir}/player_robot_${name}.png`)).setMimeType('image/png');
}
for (const material of document.getRoot().listMaterials()) {
  material.setDoubleSided(false);
  if (material.getName() === 'playerobot') {
    material.setBaseColorTexture(maps.albedo).setBaseColorFactor([0.055, 0.078, 0.1, 1]);
    material.setNormalTexture(maps.normal).setNormalScale(0.85);
    material.setMetallicRoughnessTexture(maps.orm).setMetallicFactor(0.95).setRoughnessFactor(0.88);
    material.setOcclusionTexture(maps.orm).setOcclusionStrength(0.7);
    material.setEmissiveTexture(maps.emissive).setEmissiveFactor([0.02, 0.6, 0.9]);
  } else {
    material.setBaseColorFactor([0.03, 0.2, 0.32, 1]).setEmissiveFactor([0.02, 0.65, 1]).setMetallicFactor(0.4).setRoughnessFactor(0.3);
  }
}
await document.transform(dedup(), resample({ tolerance: 0.00015 }), prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [2048, 2048], quality: 90, effort: 70 }));
await io.write(`${outputDir}/aegis-operative.glb`, document);
const outputBytes = await fs.readFile(`${outputDir}/aegis-operative.glb`);
const manifest = {
  asset: 'Godot TPS demo robot, AEGIS material/propulsion adaptation',
  license: 'CC-BY-3.0',
  attribution: 'All assets Copyright (c) 2018 Juan Linietsky, Fernando Miguel Calabró. Original Substance Painter materials kindly provided by GameTextures.com (upstream attribution).',
  licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
  repository: 'https://github.com/godotengine/tps-demo', commit,
  sources,
  output: { file: 'public/assets/aegis-operative.glb', bytes: outputBytes.length, sha256: createHash('sha256').update(outputBytes).digest('hex') },
  rig: { format: 'glTF 2.0 skin', boneCount: document.getRoot().listSkins()[0].listJoints().length, skinnedMeshes: document.getRoot().listNodes().filter(n => n.getSkin()).length },
  animations: document.getRoot().listAnimations().map(a => a.getName()),
  textures: document.getRoot().listTextures().map(t => ({ name: t.getName(), size: t.getSize(), bytes: t.getImage().length, format: t.getMimeType() })),
  modifications: ['Retained 16 gameplay animation clips; removed unused development clips from deployable derivative only.', 'Resampled animation keyframes with 0.00015 tolerance; deduplicated/pruned unused data.', 'Bundled original 2K albedo, normal, ORM, emissive maps; WebP quality 90.', 'Gunmetal and restrained cyan PBR material adaptation; single-sided rendering.', 'AEGIS runtime propulsion modules supplement original authored character.'],
  integration: 'Local GLB loaded once; SkeletonUtils clones share geometry and textures, with individual AnimationMixers and materials.',
  limitations: ['Underlying robot silhouette is a licensed asset, not an original fully authored AEGIS hero.', 'No authored melee/throw/recovery/flight or modular suit-up clips. Procedural overlays and removable supplementary panels are practical fallbacks.', 'WebP reduces download size, not decoded GPU texture memory; no KTX2 GPU compression.']
};
await fs.writeFile(`${outputDir}/asset-manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ output: manifest.output, rig: manifest.rig, clips: manifest.animations, textures: manifest.textures }, null, 2));
