import {mkdir,readFile,writeFile,copyFile,readdir,stat,unlink} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
// Construct a fresh reviewed package. Never delete or move source assets.
const out=resolve('artifacts/city-redesign/deploy'),files=new Set(['index.html']);
for(const e of await readdir('dist/assets',{withFileTypes:true}))if(e.isFile())files.add('assets/'+e.name);
for(const e of await readdir('public/assets',{withFileTypes:true}))if(e.isFile())files.add('assets/'+e.name);
for(const f of JSON.parse(await readFile('artifacts/city-redesign/deployment-environment-files.json','utf8')))files.add(f);
let bytes=0;const manifest=[];
for(const f of files){const target=resolve(out,f);if(!target.startsWith(out+'/')&&!target.startsWith(out+'\\'))throw Error('Invalid target '+f);
 const source=resolve(f==='index.html'||!f.startsWith('assets/environment/')&&!await stat(resolve('public',f)).catch(()=>null)?'dist':'public',f);
 await mkdir(dirname(target),{recursive:true});await copyFile(source,target);const size=(await stat(source)).size;bytes+=size;manifest.push({file:f,bytes:size});}
// Remove stale generated build files only inside the verified package directory.
async function prune(folder){for(const entry of await readdir(folder,{withFileTypes:true})){
 const path=resolve(folder,entry.name);if(!path.startsWith(out+'\\')&&!path.startsWith(out+'/'))throw Error('Package path escaped');
 if(entry.isSymbolicLink())throw Error('Unexpected package symlink');if(entry.isDirectory())await prune(path);else if(!files.has(relative(out,path).replaceAll('\\','/')))await unlink(path);
}}
await prune(out);
await writeFile('artifacts/city-redesign/deployment.json',JSON.stringify({directory:out,bytes,files:manifest,note:'Static Vite build plus runtime allowlist. Includes DDS and WebP alternatives; browsers download the supported format. Architecture source files, unused families, Blender files and review media excluded.'},null,2));
console.log('Packaged',manifest.length,'files',Math.round(bytes/1024/1024)+' MiB');
