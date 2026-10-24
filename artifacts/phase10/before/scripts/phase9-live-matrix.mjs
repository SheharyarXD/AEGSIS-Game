import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
const root=process.env.PHASE9_LIVE_OUT??'artifacts/phase9/live-2026-10-19';await mkdir(root,{recursive:true});const results=[];
// One hardware browser at a time. CPU/build work must also finish before timing.
for(const quality of ['MEDIUM','LOW','HIGH','ULTRA']){
 const scenes=quality==='MEDIUM'?'cold-flight,street-traversal,rooftop-traversal,aerial-traversal,rain-night,combat':'cold-flight,street-traversal,rain-night',log=createWriteStream(`${root}/performance-${quality}.log`),start=new Date().toISOString();
 const child=spawn(process.execPath,['scripts/phase8-live-performance.mjs'],{env:{...process.env,AEGIS_BASE_URL:process.env.AEGIS_BASE_URL??'http://127.0.0.1:5192',PHASE8_LIVE_VERIFICATION:'1',PHASE8_STAGE:'after',PHASE8_VIEWPORT:'1280x720',PHASE8_QUALITY:quality,PHASE8_SCENES:scenes,PHASE8_PERF_OUT:`${root}/performance-${quality}`},windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});await new Promise(r=>log.end(r));results.push({quality,scenes:scenes.split(','),start,finish:new Date().toISOString(),exitCode:code});await writeFile(`${root}/matrix-status.json`,JSON.stringify({method:'Serialized hardware Chrome runs; GPU contention is recorded per scene rather than inferred.',results},null,2));console.log(JSON.stringify(results.at(-1)));if(code!==0)process.exitCode=1;
}
