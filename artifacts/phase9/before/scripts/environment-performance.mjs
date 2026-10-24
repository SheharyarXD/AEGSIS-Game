import { chromium } from '@playwright/test';
import { writeFile,mkdir } from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true});const results=[];await mkdir('artifacts/environment',{recursive:true});
for(const [quality,preset,hour,position,label] of [
 ['LOW','clear',12,[0,2,0],'baseline-equivalent'],
 ['LOW','heavy-rain',22,[128,4,350],'commercial-rain'],
 ['LOW','thunderstorm',22,[128,120,-320],'downtown-storm'],
 ['LOW','heavy-snow',12,[-576,6,-260],'gothic-snow'],
 ['MEDIUM','heavy-rain',22,[128,4,350],'commercial-rain'],
 ['HIGH','clear',12,[128,120,-320],'downtown-clear'],
]){
 const page=await browser.newPage({viewport:{width:1280,height:720}});await page.addInitScript(q=>localStorage.setItem('aegis-quality',q),quality);
 await page.goto(`${process.env.AEGIS_BASE_URL??'http://127.0.0.1:5188'}/?qa=1`);await page.waitForFunction(()=>window.__AEGIS__);
 await page.evaluate(({preset,hour,position})=>{const q=window.__AEGIS__;q.start();q.player.body.teleport(q.player.position.clone().fromArray(position));q.player.state='HOVER';q.camera.reset(q.player.position);q.city.prepareAt(q.player.position);q.city.setWeather(preset,0);q.city.weather.setTime(hour);q.city.weather.wetness=preset.includes('rain')||preset==='thunderstorm'?1:0;},{preset,hour,position});await page.waitForTimeout(1200);
 const data=await page.evaluate(async()=>{
  const samples=[],simulation=[],generation=[];let last=performance.now();await new Promise(resolve=>{const frame=t=>{samples.push(t-last);last=t;simulation.push(window.aegisDiagnostics().simulationMs);generation.push(window.__AEGIS__.city.diagnostics().generationMs);if(samples.length<361)requestAnimationFrame(frame);else resolve();};requestAnimationFrame(frame);});samples.shift();samples.sort((a,b)=>a-b);
  const gl=document.querySelector('canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return {gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),gpuTimerSupported:!!gl.getExtension('EXT_disjoint_timer_query_webgl2'),samples:samples.length,meanMs:samples.reduce((a,b)=>a+b,0)/samples.length,p95Ms:samples[Math.floor(samples.length*.95)],p99Ms:samples[Math.floor(samples.length*.99)],meanSimulationMs:simulation.reduce((a,b)=>a+b,0)/simulation.length,maxTileGenerationMs:Math.max(...generation),game:window.aegisDiagnostics(),environment:window.__AEGIS__.city.diagnostics()};
 });results.push({quality,preset,hour,position,label,...data});console.log(`${quality} ${label}: ${data.meanMs.toFixed(2)} ms, p95 ${data.p95Ms.toFixed(2)}, ${data.game.drawCalls} draws, ${data.game.triangles} triangles`);await page.close();
}
await writeFile('artifacts/environment/performance.json',JSON.stringify({date:'2026-10-11',browser:browser.version(),viewport:[1280,720],headless:true,results},null,2));await browser.close();
