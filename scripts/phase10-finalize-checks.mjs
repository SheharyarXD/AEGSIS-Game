import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {readFile,writeFile,stat} from 'node:fs/promises';
import assert from 'node:assert/strict';
const root='artifacts/phase10',json=async p=>JSON.parse(await readFile(`${root}/${p}`,'utf8'));
const stages=await json('final-stages.json');
async function refresh(name,args){
 const started=new Date().toISOString(),log=createWriteStream(`${root}/${name}-refresh.log`);
 const child=spawn(process.execPath,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
 child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
 const exitCode=await new Promise((r,j)=>{child.once('error',j);child.once('close',r);});
 await new Promise(r=>log.end(r));const index=stages.findIndex(s=>s.name===name),prior=stages[index];
 stages[index]={name,started,finished:new Date().toISOString(),exitCode,previousAttempt:prior};
 await writeFile(`${root}/final-stages.json`,JSON.stringify(stages,null,2));
 console.log(JSON.stringify(stages[index]));assert.equal(exitCode,0,`${name} failed`);
}
// Profiling has finished. Final build/tests now include the two preparation guards.
await refresh('code-final',['scripts/phase10-code-checks.mjs']);
await refresh('production-final',['scripts/phase10-production-smoke.mjs']);
const failed=await json('weapons-rejected-corner-aim/results.json'),retry=await json('weapons-overlap-centre/results.json');
const results=[failed.results.find(r=>r.scenario==='demolition'),retry.results.find(r=>r.scenario==='overlap')];
assert.ok(results.every(r=>r?.passed));assert.ok(results[1].overlap.impactSamples>0);
await writeFile(`${root}/weapons-MEDIUM/results.json`,JSON.stringify({
 method:retry.method,results,
 attempts:{initial:'../weapons-rejected-corner-aim/results.json',correctedOverlap:'../weapons-overlap-centre/results.json',reason:'Original near-corner aim clipped the neighbouring saved building footprint; safely rejected before cost. Corrected centre aim passes without relocation or resource injection.'}
},null,2));
const i=stages.findIndex(s=>s.name==='weapons-medium'),times=await stat(`${root}/weapons-overlap-centre/results.json`);
stages[i]={name:'weapons-medium',started:times.birthtime.toISOString(),finished:times.mtime.toISOString(),exitCode:0,previousAttempt:stages[i],results:'weapons-MEDIUM/results.json',note:'Demolition passed originally; corrected overlap fixture passed in a separate serialized browser run. Original failed attempt retained.'};
await writeFile(`${root}/final-stages.json`,JSON.stringify(stages,null,2));
console.log('Final code/build/production refresh and stress results complete.');
