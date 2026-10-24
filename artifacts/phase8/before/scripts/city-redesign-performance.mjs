import {chromium} from '@playwright/test';import {mkdir,writeFile,readFile} from 'node:fs/promises';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const base=process.env.AEGIS_BASE_URL??'http://127.0.0.1:5192',stage=process.env.CITY_PROFILE_STAGE??'after',out=`artifacts/city-redesign/performance-${stage}`;
const [width,height]=(process.env.CITY_PROFILE_VIEWPORT??'1280x720').split('x').map(Number),viewport={width,height};if(!width||!height)throw Error('Invalid profiling viewport');
await mkdir(out,{recursive:true});const requested=process.env.CITY_PROFILE_SCENES?.split(','),tiers=process.env.CITY_PROFILE_TIERS?.split(',')??['LOW','MEDIUM','HIGH','ULTRA'];const scenes=['street-traversal','rooftop-traversal','night-rain','aerial-traversal','combat','destruction-stress'];
let results=[];try{results=JSON.parse(await readFile(out+'/results.json','utf8')).results.filter(r=>!(tiers.includes(r.quality)&&(!requested||requested.includes(r.scene))));}catch{}
for(const quality of tiers)for(const scene of scenes){if(requested&&!requested.includes(scene))continue;
 const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
 try{
  await page.addInitScript(q=>localStorage.setItem('aegis-quality',q),quality);await page.goto(base+'/?qa=1');await page.waitForFunction(()=>window.__AEGIS__,null,{timeout:120000});
  const setup=await page.evaluate(async({scene})=>{
   const q=window.__AEGIS__;q.start(scene==='combat');q.city.setWeather(scene==='night-rain'?'heavy-rain':'clear',0);q.city.weather.setTime(scene==='night-rain'?23:12);q.city.weather.wetness=scene==='night-rain'?1:0;
   if(scene==='combat'){q.camera.yaw=Math.PI;q.camera.pitch=.05;return {position:q.player.position.toArray(),state:q.player.state,enemyCount:q.encounter.enemies.length};}
   let p=[248,.3,-410],state='GROUND',yaw=Math.PI,pitch=.04;
   if(scene==='aerial-traversal'){p=[128,420,-320];state='HOVER';pitch=-.22;}
   if(scene==='rooftop-traversal'){const b=q.city.layout.buildings.find(b=>b.id===235);p=[b.x,b.h+4,b.z+b.d*.15];state='HOVER';pitch=-.2;}
   if(scene==='destruction-stress'){const b=q.city.layout.buildings.find(b=>b.id===235);await q.city.assets.ensure(b.family,b.assetHeight,'near');p=[b.x+6,23,b.z+b.d/2+27];state='HOVER';pitch=.04;}
   q.teleport(q.player.position.clone().fromArray(p));q.player.state=state;q.camera.yaw=yaw;q.camera.pitch=pitch;q.city.prepareAt(q.player.position);await q.city.assets.idle();q.city.prepareAt(q.player.position);await q.city.assets.idle();return {position:p,state,yaw,pitch};
  },{scene});
  await page.keyboard.press('ControlLeft');await page.waitForTimeout(1500);await page.evaluate(()=>new Promise(resolve=>{let n=0;const frame=()=>++n>=180?resolve():requestAnimationFrame(frame);requestAnimationFrame(frame);}));
  const before=await page.evaluate(()=>window.aegisDiagnostics());
  if(scene==='combat'){await page.keyboard.down('b');await page.keyboard.down('d');}
  if(scene==='street-traversal'||scene==='rooftop-traversal'||scene==='aerial-traversal')await page.keyboard.down('w');
  if(scene==='aerial-traversal')await page.keyboard.down('ShiftLeft');
  if(scene==='destruction-stress')await page.evaluate(()=>{const a=window.__AEGIS__.city.architecture;a.demonstrate(235,'wall');a.demonstrate(235,'structure');a.demonstrate(235,'collapse');});
  const measurements=await page.evaluate(async()=>{
   const samples=[],draws=[],triangles=[],simulation=[],debris=[],gameplay=[],activation=[],positions=[];let last=0,start=0;
   await new Promise(resolve=>{const frame=t=>{if(!start)start=t;if(last){const d=window.aegisDiagnostics();samples.push(t-last);draws.push(d.drawCalls);triangles.push(d.triangles);simulation.push(d.simulationMs);debris.push(d.environment.destruction?.activeDebris??0);gameplay.push(d.mode==='play');activation.push(d.environment.generationMs);positions.push(d.position);}last=t;if(t-start<6000)requestAnimationFrame(frame);else resolve();};requestAnimationFrame(frame);});
   const mean=a=>a.reduce((n,v)=>n+v,0)/a.length,sorted=[...samples].sort((a,b)=>a-b),q=window.__AEGIS__,gl=document.querySelector('canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');
   return {samples:samples.length,meanMs:mean(samples),fps:1000/mean(samples),medianMs:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)],maxMs:Math.max(...samples),meanDrawCalls:mean(draws),maxDrawCalls:Math.max(...draws),meanSubmittedTriangles:mean(triangles),maxSubmittedTriangles:Math.max(...triangles),meanSimulationMs:mean(simulation),maxActiveArchitectureDebris:Math.max(...debris),activeGameplayFrames:gameplay.filter(Boolean).length,meanGenerationMs:mean(activation),internalResolution:[gl.drawingBufferWidth,gl.drawingBufferHeight],gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),gpuTimers:q.city.gpuStats(),game:window.aegisDiagnostics(),environment:q.city.diagnostics(),startPosition:positions[0],endPosition:positions.at(-1),jsHeap:performance.memory?.usedJSHeapSize??null};
  });
  for(const key of ['b','d','w','ShiftLeft'])await page.keyboard.up(key);await page.screenshot({path:`${out}/${quality.toLowerCase()}-${scene}.png`});
  let hardware;try{const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/phase7-hardware-state.ps1','-BenchmarkNodePid',String(process.pid)],{windowsHide:true,timeout:15000});hardware=JSON.parse(stdout);}catch(e){hardware={unavailable:e.message};}
  results.push({quality,scene,setup,before,...measurements,hardware,errors,measuredAt:new Date().toISOString()});console.log(`${stage} ${quality} ${scene}: ${measurements.meanMs.toFixed(2)} ms / ${measurements.fps.toFixed(1)} FPS / ${Math.round(measurements.meanDrawCalls)} draws / errors ${errors.length}`);
 }catch(error){results.push({quality,scene,error:error.message,errors});console.log('FAILED',quality,scene,error.message);}finally{await browser.close();}
 await writeFile(out+'/results.json',JSON.stringify({stage,baseURL:base,browser:'Chrome (fresh isolated process per scene)',viewport:[width,height],warmupFrames:180,sampleSeconds:6,headless:true,note:'Actual MAIN game. Each timed traversal uses the same six seconds of input, rather than tying travel distance to rendered frame count. Mean FPS is 1000/mean frame interval; submitted triangles include beauty, shadow and AO passes. Quality render scales are unchanged. Hardware counters are sampled immediately after timed gameplay; source texture estimates exclude driver allocations and are not total VRAM.',results},null,2));
}
