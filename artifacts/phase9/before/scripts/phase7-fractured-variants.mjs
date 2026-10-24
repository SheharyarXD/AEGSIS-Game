import {NodeIO} from '@gltf-transform/core';import {ALL_EXTENSIONS} from '@gltf-transform/extensions';import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';import {prune} from '@gltf-transform/functions';import {mkdir,readFile,writeFile} from 'node:fs/promises';
const out='art/environment/phase7/provided/fractured';await mkdir(out,{recursive:true});const catalog=JSON.parse(await readFile('public/assets/environment/premium/city/runtime-components.json','utf8'));await MeshoptEncoder.ready;const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder}),records=[];
for(const family of catalog.families.filter(f=>f.id.startsWith('aer_'))){
 const components=catalog.components.filter(c=>c.family===family.id),glass=components.filter(c=>c.kind==='glass'&&c.side===0).sort((a,b)=>Math.abs(a.floor-4)-Math.abs(b.floor-4))[0];
 for(const stage of ['windows','wall','partial-collapse']){
  const broken=new Set(components.filter(c=>stage==='windows'?c.kind==='glass'&&c.side===0&&Math.abs(c.floor-glass.floor)<=1:stage==='wall'?Math.hypot(c.center[0]-glass.center[0],c.center[1]-glass.center[1],c.center[2]-glass.center[2])<6:c.floor>=6&&c.center[0]<0).map(c=>c.id));
  const doc=await io.read(`public/assets/environment/premium/provided/${family.id}-near-optimized.glb`);let removed=0;
  for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives()){
   const cid=p.getAttribute('_CID')?.getArray(),indices=p.getIndices()?.getArray();if(!cid||!indices)continue;const keep=[];for(let i=0;i<indices.length;i+=3){if(broken.has(Math.round(cid[indices[i]]))){removed++;continue;}keep.push(indices[i],indices[i+1],indices[i+2]);}p.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(keep)).setBuffer(doc.getRoot().listBuffers()[0]));
  }
  doc.getRoot().setExtras({family:family.id,stage,source:family.source,changes:'Prepared fractured version of the actual licensed model; intact source UVs and materials retained.'});await doc.transform(prune());const file=`${out}/${family.id}-${stage}.glb`;await io.write(file,doc);records.push({family:family.id,stage,file,removedTriangles:removed,brokenComponents:broken.size});console.log(family.id,stage,removed);
 }
}
await writeFile(out+'/manifest.json',JSON.stringify(records,null,2));
