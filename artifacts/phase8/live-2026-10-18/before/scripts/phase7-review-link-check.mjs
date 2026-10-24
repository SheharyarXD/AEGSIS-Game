import {readFile,stat,writeFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const root='artifacts/phase7',html=await readFile(`${root}/review.html`,'utf8'),missing=[];
for(const match of html.matchAll(/(?:src|href)="([^"]+)"/g)){const reference=match[1];if(reference.includes('://')||reference.startsWith('#'))continue;try{await stat(resolve(root,reference));}catch{missing.push(reference);}}
const bytes=async folder=>{let total=0;for(const entry of await readdir(folder,{withFileTypes:true})){const path=join(folder,entry.name);total+=entry.isDirectory()?await bytes(path):(await stat(path)).size;}return total;};
const file=`${root}/runtime-packaging.json`,packaging=JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,''));packaging.verifiedRuntimeBytes=await bytes('public/assets/environment/premium');packaging.verifiedOn='2026-10-12';await writeFile(file,JSON.stringify(packaging,null,2));
await writeFile(`${root}/review-link-validation.json`,JSON.stringify({checkedOn:'2026-10-12',missing,verifiedRuntimeBytes:packaging.verifiedRuntimeBytes},null,2));console.log('Missing local review links:',missing.length,'runtime bytes:',packaging.verifiedRuntimeBytes);if(missing.length){console.log(missing);process.exitCode=1;}
