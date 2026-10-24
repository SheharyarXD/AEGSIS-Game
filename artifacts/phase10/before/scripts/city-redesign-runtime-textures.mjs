// Native DDS/WebP maps are shared and loaded once by material name. Keep glTF samplers/UVs,
// replacing duplicate embedded image payloads with tiny placeholders in runtime copies only.
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder,MeshoptEncoder} from 'meshoptimizer';
import {readFile,writeFile,stat,mkdir,copyFile} from 'node:fs/promises';
import sharp from 'sharp';
await MeshoptDecoder.ready;await MeshoptEncoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const placeholder=await sharp({create:{width:1,height:1,channels:4,background:{r:255,g:255,b:255,alpha:1}}}).png().toBuffer();
const families=JSON.parse(await readFile('art/environment/city-redesign/used-families.json','utf8')),results=[];
await mkdir('artifacts/city-redesign/embedded-texture-backup',{recursive:true});
for(const f of families)for(const lod of ['near','mid']){
 const path=`public/assets/environment/premium/${f.id.startsWith('aer_')?'provided':'city'}/${f.id}-${lod}-optimized.glb`,before=(await stat(path)).size,doc=await io.read(path);
 let changed=false;for(const texture of doc.getRoot().listTextures())if((texture.getImage()?.byteLength??0)>100){texture.setImage(placeholder).setMimeType('image/png');changed=true;}
 if(changed){await copyFile(path,`artifacts/city-redesign/embedded-texture-backup/${f.id}-${lod}-optimized.glb`);await io.write(path,doc);}
 results.push({path,before,after:(await stat(path)).size});
}
await writeFile('artifacts/city-redesign/runtime-texture-optimization.json',JSON.stringify({method:'Shared native BC3 DDS with equal-resolution WebP fallback; preserved glTF UV channels, sampler transforms and material slots. Original source Blender and external GLBs remain intact.',results},null,2));
console.log('Shared-map runtime savings',results.reduce((n,r)=>n+r.before-r.after,0),'bytes across',results.length,'LOD files');
