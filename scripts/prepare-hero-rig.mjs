/**
 * Step 1 of the AEGIS hero pipeline (see art/aegis-hero/README.md).
 * Extracts the animation skeleton + the 16 gameplay clips from the deployed
 * operative GLB into a clean, texture-free rig source for Blender.
 *  - Godot robot meshes are kept only as a scale reference (Blender deletes them).
 *  - The legacy `head.001` scale squash (a robot-head workaround) is reset to 1.
 */
import fs from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';

const input = 'public/assets/aegis-operative.glb';
const output = 'art/aegis-hero/source/rig-source.glb';
await fs.mkdir('art/aegis-hero/source', { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read(input);
const root = document.getRoot();
for (const texture of root.listTextures()) texture.dispose();
for (const extension of root.listExtensionsUsed()) extension.dispose();
for (const clip of root.listAnimations()) {
  for (const channel of clip.listChannels()) {
    if (channel.getTargetPath() !== 'scale') continue;
    const sampler = channel.getSampler();
    const values = new Float32Array(sampler.getOutput().getArray());
    const node = channel.getTargetNode();
    if (node?.getName() === 'head.001') values.fill(1);
    sampler.setOutput(sampler.getOutput().clone().setArray(values));
  }
}
await document.transform(prune());
await io.write(output, document);
console.log(`wrote ${output}: ${root.listSkins()[0].listJoints().length} joints, ${root.listAnimations().length} clips`);
