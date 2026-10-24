import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup,prune,resample,textureCompress} from '@gltf-transform/functions';
import sharp from 'sharp';
await import('./acquire-sentinel.mjs');
const dir='assets-source/godot-tps/red-robot',commit='a82f15448e9b015440d3bbdf5e10801b260c4e9f';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),doc=await io.read(`${dir}/red_robot.glb`);
const keep=new Set(['Idle-cycle','Walk-cycle','TurnLeft-cycle','TurnRight-cycle','Cannon_Fire_Recoil','Cannon-N','Damage_heavy','Damage_take1']);
for(const clip of doc.getRoot().listAnimations())if(!keep.has(clip.getName())){clip.listChannels().forEach(c=>c.dispose());clip.listSamplers().forEach(s=>s.dispose());clip.dispose();}
for(const clip of doc.getRoot().listAnimations())for(const channel of clip.listChannels())if(channel.getTargetPath()==='translation'&&/root/i.test(channel.getTargetNode()?.getName()??'')){
  const sampler=channel.getSampler(),output=sampler.getOutput().clone(),values=new Float32Array(output.getArray());
  const first=values.slice(0,3);for(let i=0;i<values.length;i+=3){values[i]=first[0];values[i+2]=first[2];}output.setArray(values);sampler.setOutput(output);
}
const maps={};for(const name of ['albedo','normal','orm','emission'])maps[name]=doc.createTexture(`sentinel_${name}`).setImage(await fs.readFile(`${dir}/red_robot_${name}.png`)).setMimeType('image/png');
for(const m of doc.getRoot().listMaterials()){
  m.setDoubleSided(false);
  if(m.getName()==='EvilRobo')m.setBaseColorTexture(maps.albedo).setBaseColorFactor([.45,.38,.32,1]).setNormalTexture(maps.normal).setNormalScale(.85).setMetallicRoughnessTexture(maps.orm).setMetallicFactor(.92).setRoughnessFactor(.85).setOcclusionTexture(maps.orm).setOcclusionStrength(.85).setEmissiveTexture(maps.emission).setEmissiveFactor([1,.2,.04]);
}
await doc.transform(dedup(),resample({tolerance:.0002}),prune(),textureCompress({encoder:sharp,targetFormat:'webp',resize:[2048,2048],quality:86,effort:50}));
const file='public/assets/titan-sentinel.glb';await io.write(file,doc);const output=await fs.readFile(file);
const manifest={asset:'TITAN-09 adaptation of Godot TPS red robot',source:`https://github.com/godotengine/tps-demo/tree/${commit}/enemies/red_robot`,commit,license:'CC-BY-3.0',attribution:'Copyright (c) 2018 Juan Linietsky, Fernando Miguel Calabró. Original Substance Painter materials kindly provided by GameTextures.com (upstream attribution).',licenseFile:'LICENSE-godot.txt',output:{file,bytes:output.length,sha256:createHash('sha256').update(output).digest('hex')},rig:{bones:doc.getRoot().listSkins()[0].listJoints().length,skinnedMeshes:doc.getRoot().listNodes().filter(n=>n.getSkin()).length},animations:doc.getRoot().listAnimations().map(a=>a.getName()),modifications:['PBR maps embedded as 2K WebP','Unused development clips removed; gameplay keys resampled','Root XZ travel removed; runtime collision owns position','Runtime scaled to 6.5m, metal materials adapted for TITAN-09'],limitations:['Source rig is a stylized original robot, not a bespoke AAA boss','Aerial traversal and collapse are runtime transforms, not authored flight/death clips'],sources:[]};
for(const name of ['red_robot.glb',...['albedo','normal','orm','emission'].map(n=>`red_robot_${n}.png`)]){const bytes=await fs.readFile(`${dir}/${name}`);manifest.sources.push({file:`${dir}/${name}`,url:`https://raw.githubusercontent.com/godotengine/tps-demo/${commit}/enemies/red_robot/${name.endsWith('.glb')?'model':'textures'}/${name}`,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
await fs.writeFile('public/assets/titan-manifest.json',JSON.stringify(manifest,null,2));console.log(JSON.stringify({output:manifest.output,rig:manifest.rig,clips:manifest.animations},null,2));
