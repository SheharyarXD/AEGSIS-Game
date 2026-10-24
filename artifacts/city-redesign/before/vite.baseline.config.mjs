import {defineConfig} from '../../../node_modules/vite/dist/node/index.js';
import {readFileSync,existsSync} from 'node:fs';import {resolve,basename} from 'node:path';
const project=resolve('.'),root=resolve('artifacts/city-redesign/before');
export default defineConfig({root,publicDir:resolve('public'),cacheDir:resolve('node_modules/.vite-city-before'),server:{host:'127.0.0.1',port:5195,strictPort:true,fs:{allow:[project]}},plugins:[{name:'preserved-before-assets',configureServer(server){server.middlewares.use((req,res,next)=>{
const url=(req.url??'').split('?')[0];if(url==='/assets/environment/premium/city/runtime-components.json'){res.setHeader('Content-Type','application/json');res.end(readFileSync(resolve(root,'runtime-components.json')));return;}
if(url.startsWith('/assets/environment/premium/')&&url.endsWith('-optimized.glb')){const file=resolve('artifacts/city-redesign/embedded-texture-backup',basename(url));if(existsSync(file)){res.setHeader('Content-Type','model/gltf-binary');res.end(readFileSync(file));return;}}
if(url.startsWith('/node_modules/'))req.url='/@fs/'+project.replaceAll('\\','/')+url;next();});}}]});