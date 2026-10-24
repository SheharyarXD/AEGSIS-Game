import {defineConfig} from '../../../node_modules/vite/dist/node/index.js';
import {resolve} from 'node:path';
export default defineConfig({root:resolve('artifacts/world-realism/before'),publicDir:resolve('public'),cacheDir:resolve('node_modules/.vite-world-realism-before'),server:{host:'127.0.0.1',port:5196,strictPort:true,fs:{allow:[resolve('.')]}}});
