import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
if(process.env.PHASE8_LIVE_VERIFICATION!=='1')throw new Error('Explicit live-verification authorization is required.');
const stage=process.env.PHASE8_STAGE??'after',quality=process.env.PHASE8_QUALITY??'LOW',base=process.env.AEGIS_BASE_URL??(stage==='before'?'http://127.0.0.1:5206':'http://127.0.0.1:5192');
const [width,height]=(process.env.PHASE8_VIEWPORT??'1280x720').split('x').map(Number),viewport={width,height};
const dir=process.env.PHASE8_PERF_OUT??`artifacts/phase8/live-2026-10-18/performance-${stage}-${quality}-${width}x${height}`;await mkdir(dir,{recursive:true});
const scenarios=(process.env.PHASE8_SCENES??'cold-flight,street-traversal,rooftop-traversal,rain-night,combat,first-hit,rain-collapse').split(','),results=[];
for(const scenario of scenarios){
 const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
 await page.addInitScript(q=>{localStorage.setItem('aegis-quality',q);window.phase8LongTasks=[];new PerformanceObserver(list=>{for(const e of list.getEntries())window.phase8LongTasks.push({start:e.startTime,ms:e.duration});}).observe({type:'longtask',buffered:true});},quality);
 let traceSession;
 if(process.env.PHASE8_TRACE==='1')await page.addInitScript(()=>{window.phase8GlCalls=[];for(const name of ['getProgramInfoLog','texImage2D','compressedTexImage2D','bufferData']){const original=WebGL2RenderingContext.prototype[name];WebGL2RenderingContext.prototype[name]=function(...args){const at=performance.now(),value=original.apply(this,args),ms=performance.now()-at;if(ms>20)window.phase8GlCalls.push({name,at,ms,...(name==='getProgramInfoLog'?{sources:this.getAttachedShaders(args[0]).map(s=>this.getShaderSource(s).slice(0,2600))}:{})});return value;};}});
 try{
  await page.goto(base+'/?qa=1');await page.waitForFunction(()=>window.__AEGIS__,null,{timeout:180000});
  if(process.env.PHASE8_TRACE==='1'){traceSession=await context.newCDPSession(page);await traceSession.send('Tracing.start',{categories:'devtools.timeline,v8,disabled-by-default-v8.cpu_profiler',transferMode:'ReturnAsStream'});}
  const cold=scenario==='cold-flight';
  // Lightweight RAF samples; full diagnostics only every twentieth frame.
  const sampler=()=>{window.phase8SampleOn=true;window.phase8Samples=[];window.phase8Counters=[];window.phase8Start=performance.now();let last=performance.now(),frame=0;const sample=t=>{if(!window.phase8SampleOn)return;const q=window.__AEGIS__;window.phase8Samples.push({t,ms:t-last,p:q.player.position.toArray(),state:q.player.state,steps:q.physics.steps});last=t;if(frame++%20===0)window.phase8Counters.push({t,d:window.aegisDiagnostics()});requestAnimationFrame(sample);};requestAnimationFrame(sample);};
  await page.evaluate(({scenario,cold,samplerSource})=>{
   const q=window.__AEGIS__;q.start(scenario==='combat');
   if(cold)(0,eval)(`(${samplerSource})()`);
   let p=[248,.3,-430],yaw=Math.PI,pitch=0;
   if(scenario.includes('flight')||scenario==='aerial-traversal')p=[232,scenario==='aerial-traversal'?230:65,scenario==='aerial-traversal'?200:-40];
   if(scenario==='combat'){p=[0,5,-35];pitch=-.12;}
   if(scenario==='rooftop-traversal'){const b=q.city.layout.buildings.find(b=>b.style==='industrial');p=[b.x+b.w*.15,b.h+.25,b.z-b.d*.16];yaw=-.4;}
   if(scenario==='first-hit'||scenario==='rain-collapse'){const b=q.city.layout.buildings.find(b=>b.id===235),f=q.city.assets.catalog.families.find(f=>f.id===b.family),c=q.city.assets.catalog.components.filter(c=>c.family===b.family&&c.kind==='glass'&&c.side===0).sort((a,b)=>Math.abs(a.floor-4)-Math.abs(b.floor-4))[0];window.phase8Hit=q.player.position.clone().fromArray(c.center).multiply(q.player.position.clone().set(b.w/f.width,b.h/b.assetHeight,b.d/f.depth)).add(q.player.position.clone().set(b.x,0,b.z)).toArray();p=[window.phase8Hit[0]+7,window.phase8Hit[1]+3,window.phase8Hit[2]+35];pitch=-.08;}
   q.teleport(q.player.position.clone().fromArray(p));if(p[1]>2&&scenario!=='rooftop-traversal')q.player.state='HOVER';q.camera.yaw=yaw;q.camera.pitch=pitch;
   q.city.setWeather(scenario.startsWith('rain')?'heavy-rain':'clear',0);q.city.weather.setTime(scenario.startsWith('rain')?23:14);q.city.weather.wetness=scenario.startsWith('rain')?1:0;
  },{scenario,cold,samplerSource:sampler.toString()});
  if(!cold){await page.evaluate(async()=>{const q=window.__AEGIS__;await q.city.assets.idle();q.city.prepareAt(q.player.position);await q.city.assets.idle();});await page.waitForTimeout(1300);}
  if(scenario==='warm-flight'){await page.keyboard.down('w');await page.keyboard.down('ShiftLeft');await page.waitForTimeout(6500);await page.keyboard.up('w');await page.keyboard.up('ShiftLeft');await page.evaluate(()=>{const q=window.__AEGIS__;q.camera.yaw=0;q.player.energy=100;});await page.waitForTimeout(350);}
  if(!cold)await page.evaluate(sampler);
  const setup=await page.evaluate(()=>window.aegisDiagnostics());
  if(scenario.includes('flight')||scenario==='aerial-traversal'){await page.keyboard.down('w');await page.keyboard.down('ShiftLeft');}
  if(scenario==='street-traversal'||scenario==='rain-night'||scenario==='rooftop-traversal')await page.keyboard.down('w');
  if(scenario==='first-hit')await page.evaluate(()=>{const q=window.__AEGIS__;q.city.architecture.blast(q.player.position.clone().fromArray(window.phase8Hit),3.5,120,q.player.position.clone().set(0,0,-1));});
  if(scenario==='rain-collapse')await page.evaluate(()=>window.__AEGIS__.city.architecture.demonstrate(235,'collapse'));
  if(scenario==='combat'){await page.keyboard.press('f');await page.keyboard.down('z');await page.waitForTimeout(1800);await page.keyboard.up('z');await page.keyboard.down('l');await page.waitForTimeout(1600);await page.keyboard.up('l');await page.keyboard.press('f');}
  await page.waitForTimeout(scenario==='combat'?4600:scenario==='rain-collapse'?10000:8000);
  await page.keyboard.up('w');await page.keyboard.up('ShiftLeft');
  const data=await page.evaluate(()=>{
   window.phase8SampleOn=false;const frames=window.phase8Samples.map(s=>s.ms).filter(ms=>ms>0).sort((a,b)=>a-b),pct=q=>frames[Math.min(frames.length-1,Math.floor(frames.length*q))]??null,mean=frames.reduce((a,b)=>a+b,0)/frames.length,gl=document.querySelector('canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');
   return {frames:frames.length,fps:1000/mean,meanMs:mean,p50:pct(.5),p95:pct(.95),p99:pct(.99),worstMs:pct(1),minInstantFPS:1000/pct(1),over50:frames.filter(x=>x>50).length,over1000:frames.filter(x=>x>1000).length,samples:window.phase8Samples,counters:window.phase8Counters,longTasks:window.phase8LongTasks.filter(e=>e.start>=window.phase8Start),glCalls:(window.phase8GlCalls??[]).filter(e=>e.at>=window.phase8Start),final:window.aegisDiagnostics(),gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,internal:[gl.drawingBufferWidth,gl.drawingBufferHeight],devicePixelRatio:window.devicePixelRatio,heap:performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize,limit:performance.memory.jsHeapSizeLimit}:null};
  });
  if(traceSession){const done=new Promise(r=>traceSession.once('Tracing.tracingComplete',r));await traceSession.send('Tracing.end');const {stream}=await done;let trace='';for(;;){const chunk=await traceSession.send('IO.read',{handle:stream});trace+=chunk.data;if(chunk.eof)break;}await traceSession.send('IO.close',{handle:stream});await writeFile(`${dir}/${scenario}-trace.json`,trace);}
  let hardware;try{const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/phase7-hardware-state.ps1','-BenchmarkNodePid',String(process.pid)],{windowsHide:true,timeout:20000});hardware=JSON.parse(stdout);}catch(e){hardware={error:e.message};}
  await page.screenshot({path:`${dir}/${scenario}.png`});results.push({scenario,quality,setup,...data,errors,hardware});
  if(errors.length)process.exitCode=1;
  console.log(JSON.stringify({stage,quality,scenario,fps:data.fps,p95:data.p95,p99:data.p99,worst:data.worstMs,over50:data.over50,errors:errors.length,gpu:data.gpu}));
 }catch(e){results.push({scenario,quality,error:e.stack,errors});console.log(JSON.stringify({stage,quality,scenario,error:e.message}));process.exitCode=1;}
 finally{await context.close();await browser.close();await writeFile(dir+'/results.json',JSON.stringify({stage,base,quality,viewport,method:'Fresh hardware Chrome per scenario. No video during timing. RAF timing every frame; detailed counters every twentieth frame. Cold flight includes fixture ingress; other scenes settle assets first. Walking/flight/combat use actual keyboard input; first-hit and collapse are labeled scripted damage fixtures. GPU memory is a point sample after timing, not peak.',results},null,2));}
}
