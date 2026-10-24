import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup,weld,meshopt} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';
import {stat,writeFile} from 'node:fs/promises';
const input=process.argv[2]??'public/assets/environment/premium/aegis-premium-architecture.glb',output=input.replace('.glb','-optimized.glb');
await MeshoptEncoder.ready;const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const doc=await io.read(input);await doc.transform(dedup(),weld(),meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:16,quantizeTexcoord:16}));await io.write(output,doc);
const report={input,output,sourceBytes:(await stat(input)).size,runtimeBytes:(await stat(output)).size,meshes:doc.getRoot().listMeshes().length};await writeFile(output.replace('.glb','.json'),JSON.stringify(report,null,2));console.log(report);
