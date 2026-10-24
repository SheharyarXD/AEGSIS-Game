import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const label=process.argv[2]??'after',base=process.env.AEGIS_BASE_URL??'http://127.0.0.1:5202';
const dir=`artifacts/visibility-destruction-fix/${label}`;await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
try{
 for(const quality of ['LOW','HIGH']){
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(q=>localStorage.setItem('aegis-quality',q),quality);await page.goto(base+'/?qa=1');await page.waitForFunction(()=>window.__AEGIS__,null,{timeout:120000});
  await page.evaluate(()=>{const q=window.__AEGIS__,b=q.city.layout.buildings.find(b=>b.id===235);q.start();q.city.setWeather('clear',0);q.city.weather.setTime(14);q.teleport(q.player.position.clone().set(-700,180,700));q.player.state='HOVER';q.city.setCaptureView([b.x+700,140,b.z+1100],[b.x,b.h*.5,b.z]);});
  await page.waitForTimeout(1500);
  const sample=()=>page.evaluate(async()=>{const intervals=[],cpu=[],draws=[],triangles=[];let last=0;await new Promise(resolve=>{function frame(t){if(last){const d=window.aegisDiagnostics();intervals.push(t-last);cpu.push(d.simulationMs);draws.push(d.drawCalls);triangles.push(d.triangles);}last=t;if(intervals.length<120)requestAnimationFrame(frame);else resolve();}requestAnimationFrame(frame);});const sorted=[...intervals].sort((a,b)=>a-b),mean=a=>a.reduce((n,v)=>n+v,0)/a.length;return{samples:intervals.length,meanMs:mean(intervals),p95Ms:sorted[Math.floor(sorted.length*.95)],maxMs:sorted.at(-1),simulationMeanMs:mean(cpu),simulationMaxMs:Math.max(...cpu),drawCallsMean:mean(draws),trianglesMean:mean(triangles)};});
  const skyline=await sample();await page.screenshot({path:`${dir}/${quality.toLowerCase()}-long-distance.png`});
  const tall=await page.evaluate(()=>{const q=window.__AEGIS__,gl=document.querySelector('canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return{renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown',buildings:q.city.layout.buildings.filter(b=>b.h>=90).map(b=>({id:b.id,family:b.family,height:b.h,fullSource:!!q.city.assets.parts.get(`${b.family}_${b.assetHeight??b.h}_skyline`),visible:q.city.streaming.isFarVisible(b.id)}))};});
  await page.evaluate(async()=>{const q=window.__AEGIS__,b=q.city.layout.buildings.find(b=>b.id===235);await q.city.assets.ensure(b.family,b.assetHeight??b.h,'near');q.teleport(q.player.position.clone().set(b.x,20,b.z+b.d/2+20));q.player.state='HOVER';q.city.prepareAt(q.player.position);q.city.setCaptureView([b.x+35,b.h*.48,b.z+155],[b.x,b.h*.45,b.z]);});
  await page.waitForTimeout(1000);
  const impacts=await page.evaluate(()=>{const q=window.__AEGIS__,a=q.city.architecture,profile={};for(const name of ['activate','hydrate','rebuildCoarse','ensureFloor','spawnSource','spawn','remove']){const original=a[name];a[name]=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{const entry=profile[name]??={calls:0,totalMs:0};entry.calls++;entry.totalMs+=performance.now()-start;}};}return ['windows','wall','structure'].map(stage=>{for(const name of Object.keys(profile))delete profile[name];const start=performance.now();a.demonstrate(235,stage);const callMs=performance.now()-start;return{stage,callMs,profile:structuredClone(profile),architecture:a.diagnostics()};});});
  const destruction=await sample();await page.screenshot({path:`${dir}/${quality.toLowerCase()}-destruction.png`});
  const entry={quality,viewport:[1440,900],skyline,...tall,impacts,destruction,errors};results.push(entry);console.log(JSON.stringify({quality,skyline,impacts:impacts.map(({stage,callMs})=>({stage,callMs})),destruction,errors}));await writeFile(`${dir}/probe.json`,JSON.stringify({measuredAt:new Date().toISOString(),base,results},null,2));await page.close();
 }
}finally{await browser.close();}
