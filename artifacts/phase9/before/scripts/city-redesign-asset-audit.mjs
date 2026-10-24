import {NodeIO} from '@gltf-transform/core';import {ALL_EXTENSIONS} from '@gltf-transform/extensions';import {MeshoptDecoder} from 'meshoptimizer';import {readFile,writeFile,stat} from 'node:fs/promises';
const catalog=JSON.parse(await readFile('public/assets/environment/metropolis/runtime-components.json','utf8'));await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder}),assets=[],errors=[];
for(const family of catalog.families){const ns=family.id.startsWith('aer_')?'provided':'city',ids=new Set(catalog.components.filter(c=>c.family===family.id).map(c=>c.id));
 for(const lod of ['near','mid']){const file=`public/assets/environment/premium/${ns}/${family.id}-${lod}-optimized.glb`;
  try{const doc=await io.read(file);let triangles=0,vertices=0,primitives=0;
   for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives()){
    const position=p.getAttribute('POSITION'),normal=p.getAttribute('NORMAL'),uv=p.getAttribute('TEXCOORD_0'),index=p.getIndices();if(!position||!normal||!uv||!index||!p.getMaterial())throw Error('Missing authored attributes/material');
    if(position.getCount()!==normal.getCount()||position.getCount()!==uv.getCount())throw Error('Mismatched attributes');for(const value of position.getArray())if(!Number.isFinite(value))throw Error('Non-finite position');
    if(lod==='near'){const cid=p.getAttribute('_CID');if(!cid)throw Error('Missing stable damage IDs');for(const id of new Set(cid.getArray()))if(!ids.has(Math.round(id)))throw Error('Unregistered damage ID '+id);}
    triangles+=index.getCount()/3;vertices+=position.getCount();primitives++;
   }
   assets.push({family:family.id,lod,file,bytes:(await stat(file)).size,triangles,vertices,primitives});
  }catch(error){errors.push({file,error:error.message});}
 }
 const folder=family.id==='city_meridian_arcade'?'art/environment/city-redesign/families':`art/environment/phase7/${ns}`;
 for(const suffix of ['source','destructible']){const file=`${folder}/${family.id}-${suffix}.blend`;try{await stat(file);}catch{errors.push({file,error:'Missing editable source'});}}
}
const report={checkedAt:new Date().toISOString(),families:catalog.families.length,lodFiles:assets.length,assets,errors,method:'Decode actual Meshopt runtime GLBs; verify finite geometry, normals, UVs, materials, registered near component IDs and editable source/damage Blender files. Far presentation uses shared source-view HLOD, not 25 dense FAR meshes.'};
await writeFile('artifacts/city-redesign/asset-validation.json',JSON.stringify(report,null,2));console.log(report.families,'families;',assets.length,'LOD files;',errors.length,'errors');if(errors.length){console.log(errors);process.exitCode=1;}
