import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,readdir,stat,mkdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

// Deliberately contains no Playwright, HTTP server or browser/game launch.
const dir='artifacts/phase8';await mkdir(dir,{recursive:true});
const commands=[];
async function run(log,args,append=false){
 const result=await new Promise((accept,reject)=>{
  const child=spawn(process.execPath,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';
  child.stdout.on('data',b=>output+=b.toString());child.stderr.on('data',b=>output+=b.toString());child.on('error',reject);child.on('close',code=>accept({code,output}));
 });
 const previous=append?await readFile(`${dir}/${log}`,'utf8'):'';
 await writeFile(`${dir}/${log}`,previous+`$ node ${args.join(' ')}\n`+result.output);
 commands.push({command:`node ${args.join(' ')}`,exitCode:result.code,log:`${dir}/${log}`});
 assert.equal(result.code,0,`${log} failed; inspect its raw output`);return result.output;
}
const tests=['physics','environment','world-recovery','visibility-destruction','world-realism','phase8'].map(name=>`tests/${name}.test.ts`);
const results=await Promise.allSettled([
 run('unit-tests.log',['--import','tsx','--test','--test-reporter=spec',...tests]),
 (async()=>{await run('build.log',['node_modules/typescript/bin/tsc','--noEmit']);await run('build.log',['node_modules/vite/bin/vite.js','build'],true);})(),
 (async()=>{await run('asset-audit.log',['scripts/phase8-offline-audit.mjs']);await run('code-report.log',['--import','tsx','scripts/phase8-code-report.ts']);})(),
]);
for(const r of results)if(r.status==='rejected')throw r.reason;
const output=results[0].value,total=Number(output.match(/tests (\d+)/)?.[1]),passed=Number(output.match(/pass (\d+)/)?.[1]);
assert.ok(total>0&&total===passed,'All offline tests must pass');
const json=async file=>JSON.parse(await readFile(`${dir}/${file}`,'utf8'));
const assets=await json('asset-catalog.json'),preservation=await json('preservation.json'),plan=await json('street-standard.json');
const sha=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
assert.equal(await sha('dist/assets/environment/metropolis/phase8-titan-kit-optimized.glb'),assets.exportSha256,'Production kit differs from audited export');
const bundles=await readdir('dist/assets'),worker=bundles.find(f=>/^geometry\.worker-.*\.js$/.test(f));assert.ok(worker,'Production worker is missing');
const buildAssets=await Promise.all(bundles.filter(f=>/\.(js|css)$/.test(f)).map(async f=>({file:`dist/assets/${f}`,bytes:(await stat(`dist/assets/${f}`)).size})));
const pending=[
 'Before/after street design','Sidewalk and curb close-up','Intersection with signals and road details','Night streetlights and storefronts','Rainy downtown gameplay','Laser heating the facade','Cooling into persistent scorch','Standard 3× missile impact','Heavy 5× demolition missile','Layered explosion and smoke','Titan entry impact','Continuous physical interior travel','Titan exit impact','Persistent holes after district streaming','Partial skyscraper collapse','Complete showcase collapse','High-speed district flight and cold/warm profiling','LOW destruction stress under rain',
];
const verification={createdAt:new Date().toISOString(),scope:'OFFLINE ONLY — live verification explicitly deferred by user',status:'Code and assets verified; visual/gameplay/performance acceptance pending',browserLaunched:false,gameLaunched:false,newScreenshots:0,newRecordings:0,newFPSRuns:0,unitTests:{total,passed,failed:0,log:`${dir}/unit-tests.log`},build:{passed:true,worker:`dist/assets/${worker}`,bundles:buildAssets,largeChunkWarning:true,log:`${dir}/build.log`},assetAudit:{passed:true,moduleCount:assets.modules.length,materials:assets.materials.length,optimizedBytes:assets.optimizedBytes,triangles:assets.triangles,vertices:assets.vertices},preservation:{protectedSourceFiles:preservation.protectedFiles.length,originalAssets:preservation.originalAssets.length,baselineFiles:preservation.baselineFiles,unchanged:preservation.unchanged,changed:preservation.changed.length},world:{buildings:plan.buildings,families:plan.sourceFamilies.length,districts:plan.districts.length,meters:plan.worldMeters,historicLinks:plan.historicFrontageLinks.length,trafficLoops:plan.trafficLoops},performance:Object.fromEntries(['LOW','MEDIUM','HIGH','ULTRA'].map(q=>[q,{finalFPS:null,p50Ms:null,p95Ms:null,p99Ms:null,worstMs:null,peakGpuMemory:null,status:'Deferred by user; not measured on final implementation'}])),pendingLiveChecks:pending,commands};
await writeFile(`${dir}/verification.json`,JSON.stringify(verification,null,2)+'\n');
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const links=[['Full implementation handoff','../../docs/PHASE8-CODEX-TO-CLAUDE-HANDOFF.md'],['Implementation plan and diagnosis','../../docs/PHASE8-IMPLEMENTATION-PLAN.md'],['Verification JSON','verification.json'],['Offline tests','unit-tests.log'],['Build log','build.log'],['Asset catalog','asset-catalog.json'],['Preservation hashes / changed files','preservation.json'],['Saved street standards and quality budgets','street-standard.json'],['Editable Blender source','../../art/environment/phase8/titan-urban-and-fracture.blend'],['Blender authoring script','../../art/environment/phase8/build_titan_kit.py'],['Optimized GLB','../../public/assets/environment/metropolis/phase8-titan-kit-optimized.glb'],['New original-work license notice','../../public/assets/environment/metropolis/PHASE8-LICENSES.txt'],['Existing building attribution','../../public/assets/environment/ATTRIBUTION.txt'],['Historical before profiling','performance-before/results.json'],['Historical foundation experiment (not final after)','performance-foundation-ready/results.json']];
for(const [,href] of links)await access(resolve(dir,href));
const page=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AEGIS Phase 8 — offline verification</title>
<style>body{margin:0;background:#0d151b;color:#d9e6e8;font:16px/1.65 system-ui,sans-serif}main{max-width:1050px;margin:auto;padding:45px 24px}h1{font-weight:600;letter-spacing:.03em;line-height:1.2}h2{font-size:1.2rem;color:#9fd1d0;margin-top:2.2em}a{color:#a8dce6}.notice{border-left:3px solid #d7b573;background:#1e2527;padding:16px 20px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin:24px 0}.card{padding:20px;background:#17232c;border:1px solid #2b3c46}.card strong{display:block;font-size:30px;color:#b8dfd6}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:12px 8px;border-bottom:1px solid #30414b}small{color:#9aaeb8}code{color:#cfdbc0}li{margin:8px 0}</style>
<main><small>AEGIS / RISE OF THE TITAN · PHASE 8 · ${esc(verification.createdAt)}</small><h1>Titan destruction &amp; streaming</h1>
<p class="notice"><strong>Offline verification complete. Live acceptance is pending.</strong><br>The user asked to finish code without launching the game. No browser, new footage, screenshots or final FPS measurements were produced in this continuation. This page displays source and validation artifacts, with no embedded game.</p>
<div class="cards"><div class="card"><strong>${passed}/${total}</strong>offline tests passed</div><div class="card"><strong>Passed</strong>TypeScript + production build</div><div class="card"><strong>${assets.modules.length}</strong>original Blender modules</div><div class="card"><strong>${Math.round(assets.optimizedBytes/1024)} KiB</strong>optimized new asset kit</div></div>
<h2>Implemented in the main game</h2><p>Predictive priority streaming, worker preparation, scheduled texture uploads and exact shader readiness; district street standards and original frontage modules; surface-aligned thermal damage; 3× standard and optional 5× demolition building damage; intentional physical Titan Breakthrough; bounded support-driven collapse and persistent damaged states.</p><p><strong>Y</strong> activates Titan during aligned armored flight. <strong>O</strong> toggles demolition; <strong>F</strong> keeps the existing launcher. Character and HUD source remain unchanged. ${plan.buildings} fixed buildings, ${plan.sourceFamilies.length} source families, five districts and the 2048 m world remain.</p>
<h2>What the offline checks prove</h2><p>Tests decode the actual supplied building GLBs, remove their authored damage sections, sweep an enabled Rapier capsule through the mid-rise, Gothic and glass buildings, exercise ability costs/cancellation/cooldown, restore openings and heat, and verify shared collapse/debris budgets. Other checks cover resident collision, camera sweeps, weather, culling, asset failures and worker recovery. All ${preservation.originalAssets.length} external originals and ${preservation.protectedFiles.length} protected source files match saved hashes.</p>
<h2>Final performance status</h2><table><thead><tr><th>Quality</th><th>FPS / p50 / p95 / p99 / worst / GPU memory</th></tr></thead><tbody>${Object.keys(verification.performance).map(q=>`<tr><td>${q}</td><td>Not measured — deferred by user</td></tr>`).join('')}</tbody></table><p>Earlier LOW traces identified multi-second first-use shader stalls. Intermediate foundation measurements still included a 1,159.7 ms rainy collapse stall; they predate the final fixes/features. They are linked below as historical evidence and do not establish final acceptance.</p>
<h2>Assets and implementation files</h2><ul>${links.map(([label,href])=>`<li><a href="${esc(href)}">${esc(label)}</a></li>`).join('')}</ul>
<h2>Deferred live checks</h2><ol>${pending.map(s=>`<li>${esc(s)}</li>`).join('')}</ol>
<h2>Limits</h2><p>No final visual review or performance certification. Destruction follows authored components and an approximate support graph. Smoke/fire use pooled transparent billboards. Streets retain the existing block and road plan; cosmetic traffic is not full AI. Marks, debris and corridor detail have explicit caps. Full room interiors, automatic cross-session saves and portal download certification are not added. Vite still reports large Three.js/Rapier chunks.</p>
<h2>Repeat offline verification</h2><p>From the project directory: <code>node scripts/phase8-verify-offline.mjs</code>. Browser/game commands are documented separately in the handoff for use after the user requests live verification.</p></main></html>`;
await writeFile(`${dir}/review.html`,page);
console.log(JSON.stringify({tests:`${passed}/${total}`,build:'passed',protectedSources:preservation.protectedFiles.length,externalOriginals:preservation.originalAssets.length,review:`${dir}/review.html`,live:'deferred'},null,2));
