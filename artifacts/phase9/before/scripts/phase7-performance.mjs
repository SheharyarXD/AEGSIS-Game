import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {baseURL,dir as integrationDir,boot,position,weather,observe,freezeEnemies,aim,directories} from './integration-browser.mjs';
const dir=`artifacts/phase7/${process.env.PHASE7_STAGE??'before'}`;await (await import('node:fs/promises')).mkdir(dir+'/screenshots',{recursive:true});const selected=process.env.AEGIS_PERF_SCENES?.split(',');let results=[];if(selected){try{results=JSON.parse(await (await import('node:fs/promises')).readFile(`${dir}/combined-performance.json`,'utf8')).results.filter(r=>!selected.includes(r.label));}catch{}}
const scenes=[
 ['LOW','clear',12,'downtown-clear'],['LOW','heavy-rain',12,'downtown-heavy-rain'],['LOW','clear',23,'low-night'],['LOW','thunderstorm',16,'storm-flight'],['LOW','clear',12,'high-altitude'],
 ['MEDIUM','partly-cloudy',12,'normal-gameplay'],['HIGH','clear',12,'downtown-clear'],['HIGH','heavy-rain',23,'night-rain'],['HIGH','clear',23,'high-night'],['HIGH','heavy-rain',12,'high-heavy-rain'],
 ['LOW','clear',12,'district-boundary-flight'],['LOW','partly-cloudy',12,'combat-three-enemies'],['LOW','heavy-rain',17,'missiles-laser-weather'],['LOW','clear',12,'rooftop-landing'],['LOW','clear',12,'restart-gameplay'],
];
for(const [quality,preset,hour,label] of scenes){
 if(selected&&!selected.includes(label))continue;
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:720}}),observed=observe(page),combat=label.includes('combat')||label.includes('missiles');
 await boot(page,quality,combat);if(combat)await page.keyboard.down('b');await weather(page,preset,hour);
 if(label==='high-altitude')await position(page,[128,900,-320]);
 else if(label==='storm-flight')await position(page,[128,180,-320],'CRUISE',0,.2);
 else if(label==='district-boundary-flight')await position(page,[128,330,-100],'HOVER',0);
 else if(!combat&&label!=='restart-gameplay')await position(page,[128,.3,-320],'GROUND',Math.PI);
 if(label==='missiles-laser-weather'){
   await freezeEnemies(page);await page.evaluate(()=>{const q=window.__AEGIS__;q.teleport(q.player.position.clone().set(128,4,-304));q.player.state='HOVER';q.encounter.enemies.forEach((e,i)=>e.body.teleport(e.position.clone().set(120+i*8,4,-354)));});await aim(page);
 }
 await page.waitForTimeout(1800);await page.evaluate(()=>new Promise(resolve=>{let n=0;const warm=()=>++n>=180?resolve():requestAnimationFrame(warm);requestAnimationFrame(warm);}));const before=await page.evaluate(()=>({game:window.aegisDiagnostics(),environment:window.__AEGIS__.city.diagnostics()}));
 if(label==='district-boundary-flight')await page.evaluate(()=>{const p=window.__AEGIS__.player;p.state='CRUISE';p.velocity.set(0,0,52);});
 if(label==='storm-flight'||label==='district-boundary-flight'){await page.keyboard.down('w');await page.keyboard.down('ShiftLeft');}
 if(label==='combat-three-enemies'){await page.keyboard.down('b');await page.keyboard.down('d');}
 if(label==='missiles-laser-weather'){await page.keyboard.down('l');await page.keyboard.press('f');}
 if(label==='normal-gameplay')await page.keyboard.down('w');
 if(label==='rooftop-landing')await page.evaluate(()=>{const q=window.__AEGIS__,b=q.city.layout.buildings.find(b=>b.style==='deco'&&b.district==='financial');q.teleport(q.player.position.clone().set(b.x+b.w*.15,b.h+22,b.z-b.d*.16));q.player.state='FALL';q.player.velocity.set(0,-18,0);});
 if(label==='restart-gameplay'){await page.evaluate(()=>{const q=window.__AEGIS__;q.start(true);q.reset();q.start();});}
 const data=await page.evaluate(async()=>{
  const samples=[],simulation=[],draws=[],triangles=[],tiles=[],colliders=[],modes=[];let last=0;const q=window.__AEGIS__;
  await new Promise(resolve=>{const frame=t=>{if(last){const d=window.aegisDiagnostics();samples.push(t-last);simulation.push(d.simulationMs);draws.push(d.drawCalls);triangles.push(d.triangles);tiles.push(d.environment.tiles);colliders.push(d.colliders);modes.push(d.mode);}last=t;if(samples.length<360)requestAnimationFrame(frame);else resolve();};requestAnimationFrame(frame);});
  const sorted=[...samples].sort((a,b)=>a-b),avg=a=>a.reduce((x,y)=>x+y,0)/a.length,gl=document.querySelector('canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');
  const {Frustum,Matrix4,Sphere}=await import('/node_modules/three/build/three.module.js');
  const camera=q.camera.camera,frustum=new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));let visibleTrianglesEstimate=0;
  for(const root of [q.city.group,q.player.root,q.encounter.group,q.impacts.group,q.destruction.group,camera,q.city.atmosphere.sky,q.city.atmosphere.cloud])root.traverse(o=>{
    if(!o.isMesh)return;for(let p=o;p;p=p.parent)if(!p.visible)return;
    const geometry=o.geometry;geometry.computeBoundingSphere();const tris=(geometry.index?.count??geometry.attributes.position.count)/3,sphere=new Sphere();
    if(o.isInstancedMesh){const matrix=new Matrix4();for(let i=0;i<o.count;i++){o.getMatrixAt(i,matrix);if(matrix.elements[0]===0&&matrix.elements[5]===0&&matrix.elements[10]===0)continue;matrix.premultiply(o.matrixWorld);sphere.copy(geometry.boundingSphere).applyMatrix4(matrix);if(frustum.intersectsSphere(sphere))visibleTrianglesEstimate+=tris;}}
    else if(!o.frustumCulled||frustum.intersectsSphere(sphere.copy(geometry.boundingSphere).applyMatrix4(o.matrixWorld)))visibleTrianglesEstimate+=tris;
  });
  const geometries=new Set(),textures=new Set();let geometryBytes=0,instanceBytes=0;
  for(const root of [q.city.group,q.player.root,q.encounter.group])root.traverse(o=>{const g=o.geometry;if(g&&!geometries.has(g)){geometries.add(g);for(const a of Object.values(g.attributes))geometryBytes+=a.array?.byteLength??0;geometryBytes+=g.index?.array.byteLength??0;}if(o.instanceMatrix)instanceBytes+=o.instanceMatrix.array.byteLength;
    for(const m of !o.material?[]:Array.isArray(o.material)?o.material:[o.material]){for(const value of Object.values(m))if(value?.isTexture)textures.add(value);for(const u of Object.values(m.uniforms??{}))if(u.value?.isTexture)textures.add(u.value);}});
  for(const t of q.city.materials.textures)textures.add(t);let textureBytes=0;for(const t of textures){const im=t.image??t.source?.data;textureBytes+=(im?.width??0)*(im?.height??0)*(t.type===1015?16:4)*(t.generateMipmaps?4/3:1);}
  return {visibleTrianglesEstimate,visibleTriangleMethod:'Per-mesh and per-instance sphere/frustum estimate, excluding hidden ancestors and zero-scale LOD slots; includes potentially occluded geometry.',samples:samples.length,meanMs:avg(samples),medianMs:sorted[180],p95Ms:sorted[342],maxMs:Math.max(...samples),meanSimulationMs:avg(simulation),meanDrawCalls:avg(draws),maxDrawCalls:Math.max(...draws),meanSubmittedTriangles:avg(triangles),maxSubmittedTriangles:Math.max(...triangles),minTiles:Math.min(...tiles),maxTiles:Math.max(...tiles),minColliders:Math.min(...colliders),maxColliders:Math.max(...colliders),activeGameplaySamples:modes.filter(m=>m==='play').length,
    gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),gpuTimings:q.city.gpuStats(),internalResolution:[gl.drawingBufferWidth,gl.drawingBufferHeight],memory:{geometryBytes,instanceBytes,decodedTextureEstimateBytes:textureBytes,jsHeapUsedBytes:performance.memory?.usedJSHeapSize??null,scope:'Approximation from city, player and encounter CPU geometry/instance/texture resources. Excludes driver allocations, render targets, shadows and some effects. Not total VRAM.'},landing:q.player.lastLanding&&{tier:q.player.lastLanding.tier,speed:q.player.lastLanding.speed,position:q.player.lastLanding.position.toArray()},game:window.aegisDiagnostics(),environment:q.city.diagnostics()};
 });
 await page.screenshot({path:`${dir}/screenshots/perf-${quality.toLowerCase()}-${label}.png`});
 for(const k of ['w','d','b','l','ShiftLeft'])await page.keyboard.up(k);
 let hardware=null;try{const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/phase7-hardware-state.ps1','-BenchmarkNodePid',String(process.pid)],{windowsHide:true,timeout:15000});hardware=JSON.parse(stdout);}catch(error){hardware={unavailable:error.message};}
 results.push({quality,preset,hour,label,before,...data,hardware,measuredAt:new Date().toISOString(),errors:observed.errors});
 await writeFile(`${dir}/combined-performance.json`,JSON.stringify({date:new Date().toISOString(),project:resolve('.'),baseURL,browser:browser.version(),viewport:[1280,720],headless:true,warmupFrames:180,browserIsolation:'Fresh Chrome process per scene, same for baseline and rebuilt city.',submittedTriangleNote:'renderer.info sums beauty, shadow and AO passes; this is submitted work, not unique visible scene triangles.',results},null,2));
 console.log(`${quality} ${label}: mean ${data.meanMs.toFixed(2)} ms, p95 ${data.p95Ms.toFixed(2)} ms, ${Math.round(data.meanDrawCalls)} draws, errors ${observed.errors.length}`);await page.close();await browser.close();
}
