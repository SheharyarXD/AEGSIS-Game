import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import {readFile,writeFile,stat} from 'node:fs/promises';
const catalog=JSON.parse(await readFile('public/assets/environment/premium/city/runtime-components.json','utf8'));
const layout=JSON.parse(await readFile('art/environment/phase7/city-layout.json','utf8'));
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder}),assets=[],errors=[];
for(const family of catalog.families){
 const directory=family.id.startsWith('aer_')?'provided':'city',ids=new Set(catalog.components.filter(c=>c.family===family.id).map(c=>c.id));
 for(const lod of ['near','mid','far']){
  const file=`public/assets/environment/premium/${directory}/${family.id}-${lod}-optimized.glb`;
  try{
   const doc=await io.read(file),root=doc.getRoot();let triangles=0,primitives=0,vertices=0;
   for(const mesh of root.listMeshes())for(const primitive of mesh.listPrimitives()){
    primitives++;const position=primitive.getAttribute('POSITION'),normal=primitive.getAttribute('NORMAL'),uv=primitive.getAttribute('TEXCOORD_0'),index=primitive.getIndices();
    if(!position||!normal||!uv||!index||index.getCount()===0)throw new Error('Missing position, normal, UV or triangle indices');
    if(position.getCount()!==normal.getCount()||position.getCount()!==uv.getCount())throw new Error('Attribute counts differ');
    for(const value of position.getArray())if(!Number.isFinite(value))throw new Error('Non-finite source position');
    if(!primitive.getMaterial())throw new Error('Missing authored material');
    if(lod==='near'){
     const cid=primitive.getAttribute('_CID');if(!cid)throw new Error('Missing stable damage component IDs');
     for(const id of new Set(cid.getArray()))if(!ids.has(Math.round(id)))throw new Error(`Unregistered damage component ${id}`);
    }
    triangles+=index.getCount()/3;vertices+=position.getCount();
   }
   if(!primitives)throw new Error('No source geometry');assets.push({family:family.id,lod,file,bytes:(await stat(file)).size,triangles,vertices,primitives});
  }catch(error){errors.push({file,message:error.message});}
 }
 for(const suffix of ['source','destructible']){const file=`art/environment/phase7/${directory}/${family.id}-${suffix}.blend`;try{await stat(file);}catch{errors.push({file,message:'Editable Blender source missing'});}}
}
for(const building of layout.buildings)if(!catalog.families.some(f=>f.id===building.family))errors.push({building:building.id,message:'Fixed placement lacks source family'});
const report={checkedAt:new Date().toISOString(),libraryFamilies:catalog.families.length,placedFamilies:new Set(layout.buildings.map(b=>b.family)).size,placements:layout.buildings.length,lodFiles:assets.length,method:'Decode Meshopt GLBs and check actual geometry, UVs, normals, materials, near damage IDs, Blender sources and fixed family references.',assets,errors};
await writeFile('artifacts/phase7/asset-validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify({families:report.libraryFamilies,placedFamilies:report.placedFamilies,lods:report.lodFiles,errors:errors.length}));if(errors.length)process.exitCode=1;
