import {defineConfig} from '../../../node_modules/vite/dist/node/index.js';import {resolve} from 'node:path';
export default defineConfig({root:resolve('artifacts/phase8/before'),publicDir:resolve('public'),cacheDir:resolve('node_modules/.vite-phase8-before'),server:{host:'127.0.0.1',port:5206,strictPort:true,fs:{allow:[resolve('.')]}}});
