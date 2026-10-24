import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,stat,readdir,mkdir} from 'node:fs/promises';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';

// Files, decoded GLB data and hashes only. Never starts a server or browser.
const root='artifacts/phase8';await mkdir(root,{recursive:true});
const json=async file=>JSON.parse(await readFile(file,'utf8'));
const sha=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
const snapshot=await json(`${root}/before/snapshot.json`),changed=[],preserved=[];
for(const row of snapshot.files){const current=await sha(row.file);(current===row.sha256?preserved:changed).push({file:row.file,before:row.sha256,after:current});}
const protectedFiles=snapshot.files.filter(r=>r.file.startsWith('src/player/')||['src/ui/Hud.ts','src/camera/CameraRig.ts','src/audio/AudioSystem.ts','src/input/InputController.ts','src/physics/PhysicsWorld.ts'].includes(r.file));
for(const row of protectedFiles)assert.equal(await sha(row.file),row.sha256,`Protected source changed: ${row.file}`);
const external=[];
for(const row of await json('artifacts/phase7/provided-asset-inventory.json')){
 const file=`art/external/${row.file}`,hash=await sha(file);assert.equal(hash,row.sha256,`External original changed: ${file}`);external.push({file,bytes:(await stat(file)).size,sha256:hash,unchanged:true});
}
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const base='public/assets/environment/metropolis/phase8-titan-kit',modules=new Map(),decoded=await io.read(`${base}-optimized.glb`),materials=decoded.getRoot().listMaterials().map(m=>m.getName());
let vertices=0,triangles=0,primitives=0;
for(const node of decoded.getRoot().listNodes()){
 const mesh=node.getMesh();if(!mesh)continue;
 const key=node.getExtras().aegisKey;assert.equal(typeof key,'string','Missing authored module key');
 const entry=modules.get(key)??{key,meshes:0,primitives:0,vertices:0,triangles:0,materials:new Set()};entry.meshes++;
 for(const p of mesh.listPrimitives()){
  const pos=p.getAttribute('POSITION'),normal=p.getAttribute('NORMAL'),uv=p.getAttribute('TEXCOORD_0'),indices=p.getIndices();
  assert.ok(pos&&normal&&uv&&indices,`${key}: positions/normals/UVs/indices required`);
  assert.equal(normal.getCount(),pos.getCount());assert.equal(uv.getCount(),pos.getCount());assert.equal(indices.getCount()%3,0);
  for(const attr of [pos,normal,uv])assert.ok(Array.from(attr.getArray()).every(Number.isFinite),`${key}: non-finite attribute`);
  for(const i of indices.getArray())assert.ok(i<pos.getCount(),`${key}: invalid index`);
  entry.vertices+=pos.getCount();entry.triangles+=indices.getCount()/3;entry.primitives++;entry.materials.add(p.getMaterial()?.getName());
  vertices+=pos.getCount();triangles+=indices.getCount()/3;primitives++;
 }modules.set(key,entry);
}
for(const key of ['breach_frame','lobby_portal','stoop','basement_grate','bike_rack','courtyard_wall','courtyard_gate','historic_lamp','railing',...['glass','steel','concrete','brick','stone','composite'].map(k=>'fragment_'+k)])assert.ok(modules.has('titan_'+key),`Missing module ${key}`);
const blend='art/environment/phase8/titan-urban-and-fracture.blend',rawBytes=(await stat(`${base}.glb`)).size,optimizedBytes=(await stat(`${base}-optimized.glb`)).size;
assert.ok((await stat(blend)).size>100000);assert.ok(optimizedBytes<rawBytes);
const assetCatalog={source:blend,script:'art/environment/phase8/build_titan_kit.py',license:'public/assets/environment/metropolis/PHASE8-LICENSES.txt',raw:`${base}.glb`,optimized:`${base}-optimized.glb`,rawBytes,optimizedBytes,savingsPercent:100*(1-optimizedBytes/rawBytes),sourceSha256:await sha(blend),exportSha256:await sha(`${base}-optimized.glb`),modules:[...modules.values()].map(m=>({...m,materials:[...m.materials]})),materials,primitives,vertices,triangles,uvs:true,normals:true,finiteAttributes:true,validIndices:true};
const catalog=await json('public/assets/environment/metropolis/runtime-components.json');
const newFiles=[];for(const dir of ['src/world/titan','src/world/streaming','tests/helpers','art/environment/phase8'])for(const f of await readdir(dir))if(!f.endsWith('.blend1'))newFiles.push(`${dir}/${f}`);
newFiles.push('tests/phase8.test.ts','scripts/phase8-offline-audit.mjs','scripts/phase8-code-report.ts','scripts/phase8-verify-offline.mjs','scripts/phase8-performance.mjs','scripts/phase8-shader-probe.mjs','docs/PHASE8-IMPLEMENTATION-PLAN.md','docs/PHASE8-CODEX-TO-CLAUDE-HANDOFF.md','public/assets/environment/metropolis/phase8-titan-kit.glb','public/assets/environment/metropolis/phase8-titan-kit-optimized.glb','public/assets/environment/metropolis/PHASE8-LICENSES.txt');
const preservation={checkedAt:new Date().toISOString(),baselineFiles:snapshot.files.length,unchanged:preserved.length,changed,protectedFiles:protectedFiles.map(r=>({file:r.file,sha256:r.sha256,unchanged:true})),originalAssets:external,sourceFamilies:catalog.families.length,newFiles};
await writeFile(`${root}/asset-catalog.json`,JSON.stringify(assetCatalog,null,2)+'\n');
await writeFile(`${root}/preservation.json`,JSON.stringify(preservation,null,2)+'\n');
console.log(JSON.stringify({protectedFiles:protectedFiles.length,originalAssets:external.length,baselineUnchanged:preserved.length,changed:changed.length,moduleCount:modules.size,primitives,vertices,triangles,optimizedBytes,sourceFamilies:catalog.families.length},null,2));
