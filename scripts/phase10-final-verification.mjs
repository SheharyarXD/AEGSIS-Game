import {spawn} from 'node:child_process';import {createWriteStream} from 'node:fs';import {writeFile} from 'node:fs/promises';
const root='artifacts/phase10',stages=[];
async function run(name,args,env={}){
 const started=new Date().toISOString(),log=createWriteStream(`${root}/${name}.log`),child=spawn(process.execPath,args,{env:{...process.env,...env},windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
 const exitCode=await new Promise((r,j)=>{child.once('error',j);child.once('close',r);});await new Promise(r=>log.end(r));const result={name,started,finished:new Date().toISOString(),exitCode};stages.push(result);await writeFile(`${root}/final-stages.json`,JSON.stringify(stages,null,2));console.log(JSON.stringify(result));if(exitCode!==0)throw Error(`${name} failed; inspect ${root}/${name}.log before continuing.`);
}
await run('code-final',['scripts/phase10-code-checks.mjs']);
await run('browser-final',['node_modules/@playwright/test/cli.js','test','--config','playwright.phase10.config.mjs']);
await run('production-final',['scripts/phase10-production-smoke.mjs']);
await run('demolition-footage',['scripts/phase9-live-acceptance.mjs'],{PHASE9_CASES:'collapse',PHASE9_ACCEPT_OUT:`${root}/demolition`});
// No recording or CPU/build/test workloads run alongside the following GPU measurements.
await run('presentation-after',['scripts/phase10-presentation.mjs'],{PHASE10_STAGE:'after'});
for(const quality of ['LOW','MEDIUM','HIGH','ULTRA'])await run(`cinematic-${quality}`,['scripts/phase10-cinematic-live.mjs'],{PHASE10_QUALITY:quality,PHASE10_CASES:quality==='MEDIUM'?'night,gothic,fast':'night',PHASE10_VIDEO:'0',PHASE10_TRACE:'0',PHASE10_OUT:`${root}/performance-${quality}`});
await run('streaming-medium',['scripts/phase8-live-performance.mjs'],{PHASE8_LIVE_VERIFICATION:'1',PHASE8_STAGE:'after',PHASE8_QUALITY:'MEDIUM',PHASE8_SCENES:'cold-flight,street-traversal,rooftop-traversal,combat',PHASE8_PERF_OUT:`${root}/streaming-MEDIUM`});
await run('weapons-medium',['scripts/phase10-weapons-performance.mjs'],{PHASE9_QUALITY:'MEDIUM',PHASE9_PERF_SCENARIOS:'demolition,overlap',PHASE9_PERF_VIDEO:'0',PHASE9_PERF_OUT:`${root}/weapons-MEDIUM`});
console.log('Phase 10 serialized verification stages complete.');
