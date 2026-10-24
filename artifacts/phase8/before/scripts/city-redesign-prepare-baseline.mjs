import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
const dir='artifacts/city-redesign/before';await mkdir(dir,{recursive:true});await copyFile('index.html',dir+'/index.html');
const families=JSON.parse((await readFile(dir+'/src/world/DestructibleFamilies.ts','utf8')).split('=')[1].split(' as const')[0]);
const catalog=JSON.parse(await readFile('public/assets/environment/premium/city/runtime-components.json','utf8')),ids=new Set(families.map(f=>f.id));await writeFile(dir+'/runtime-components.json',JSON.stringify({families,components:catalog.components.filter(c=>ids.has(c.family))}));
const config=`import {defineConfig} from '../../../node_modules/vite/dist/node/index.js';
import {readFileSync,existsSync} from 'node:fs';import {resolve,basename} from 'node:path';
const project=resolve('.'),root=resolve('artifacts/city-redesign/before');
export default defineConfig({root,publicDir:resolve('public'),cacheDir:resolve('node_modules/.vite-city-before'),server:{host:'127.0.0.1',port:5195,strictPort:true,fs:{allow:[project]}},plugins:[{name:'preserved-before-assets',configureServer(server){server.middlewares.use((req,res,next)=>{
const url=(req.url??'').split('?')[0];if(url==='/assets/environment/premium/city/runtime-components.json'){res.setHeader('Content-Type','application/json');res.end(readFileSync(resolve(root,'runtime-components.json')));return;}
if(url.startsWith('/assets/environment/premium/')&&url.endsWith('-optimized.glb')){const file=resolve('artifacts/city-redesign/embedded-texture-backup',basename(url));if(existsSync(file)){res.setHeader('Content-Type','model/gltf-binary');res.end(readFileSync(file));return;}}
if(url.startsWith('/node_modules/'))req.url='/@fs/'+project.replaceAll('\\\\','/')+url;next();});}}]});`;
await writeFile(dir+'/vite.baseline.config.mjs',config);console.log('Prepared exact pre-redesign source with original embedded texture payloads and catalog.');
