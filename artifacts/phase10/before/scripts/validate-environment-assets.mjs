import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),results=[];
for(const file of ['aegis-city-kit.glb','aegis-skyline-lod.glb','aegis-landmarks.glb']){
 const doc=await io.read(`public/assets/environment/${file}`),root=doc.getRoot();let triangles=0,shells=0;
 for(const mesh of root.listMeshes())for(const p of mesh.listPrimitives()){
  const position=p.getAttribute('POSITION'),normal=p.getAttribute('NORMAL'),uv=p.getAttribute('TEXCOORD_0');
  assert.ok(position&&normal&&uv,`Missing PBR attributes: ${mesh.getName()}`);assert.ok([...position.getArray()].every(Number.isFinite));assert.ok([...normal.getArray()].every(Number.isFinite));
  const indices=p.getIndices(),count=indices?.getCount()??position.getCount();triangles+=count/3;
  if(p.getMaterial()?.getName().startsWith('wall_')){
   let volume=0;const a=[],b=[],c=[];
   for(let i=0;i<count;i+=3){position.getElement(indices?indices.getScalar(i):i,a);position.getElement(indices?indices.getScalar(i+1):i+1,b);position.getElement(indices?indices.getScalar(i+2):i+2,c);volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;}
   assert.ok(volume>0,`Inside-out shell: ${mesh.getName()} (${volume})`);shells++;
  }
 }
 results.push({file,bytes:(await readFile(`public/assets/environment/${file}`)).length,meshes:root.listMeshes().length,materials:root.listMaterials().length,triangles,validatedOutwardShells:shells});
}
const provenance=JSON.parse(await readFile('public/assets/environment/external-manifest.json','utf8'));assert.ok(provenance.assets.every(a=>a.license==='CC0-1.0'&&a.commercialUse&&a.sourceUrl&&a.originalBytes>0&&a.optimizedBytes>0));
await writeFile('artifacts/environment/asset-validation.json',JSON.stringify({passed:true,results,externalAssetLicensesChecked:provenance.assets.length},null,2));console.log(results);
