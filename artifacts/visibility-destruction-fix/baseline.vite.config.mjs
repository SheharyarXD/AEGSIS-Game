import {defineConfig} from 'vite';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const saved=new Map(['src/world/WorldStreaming.ts','src/world/ArchitectureDestruction.ts','src/world/City.ts','src/world/environment/AssetLibrary.ts'].map(path=>[resolve(root,path).replaceAll('\\','/'),resolve(root,'artifacts/visibility-destruction-fix/pre-change',path.split('/').at(-1))]));
export default defineConfig({root,cacheDir:'node_modules/.vite-visibility-baseline',plugins:[{name:'preserved-visibility-destruction-baseline',enforce:'pre',load(id){const path=saved.get(id.replaceAll('\\','/').split('?')[0]);if(path)return readFileSync(path,'utf8');}}]});
