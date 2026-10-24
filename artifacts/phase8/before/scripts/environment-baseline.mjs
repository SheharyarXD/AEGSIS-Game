import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('artifacts/environment',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1280,height:720}});
await page.addInitScript(()=>localStorage.setItem('aegis-quality','LOW'));
await page.goto(`${process.env.AEGIS_BASE_URL??'http://127.0.0.1:5188'}/?qa=1`);
await page.waitForFunction(()=>window.__AEGIS__);
await page.evaluate(()=>{const q=window.__AEGIS__;q.start();q.player.body.teleport(q.player.position.clone().set(0,2,0));q.player.state='HOVER';q.camera.reset(q.player.position);});
await page.waitForTimeout(1500);
const measurements=await page.evaluate(async()=>{
 const samples=[];let last=performance.now();await new Promise(resolve=>{const step=t=>{samples.push(t-last);last=t;if(samples.length<181)requestAnimationFrame(step);else resolve();};requestAnimationFrame(step);});samples.shift();samples.sort((a,b)=>a-b);
 const gl=document.querySelector('canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');
 return {gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),meanMs:samples.reduce((a,b)=>a+b,0)/samples.length,p95Ms:samples[Math.floor(samples.length*.95)],samples:samples.length,diagnostics:window.aegisDiagnostics()};
});
await page.screenshot({path:'artifacts/environment/baseline-low.png'});
await writeFile('artifacts/environment/baseline.json',JSON.stringify({date:'2026-10-11',browser:browser.version(),viewport:[1280,720],scenario:'Committed deployment district, LOW, clear daylight, hovering at (0,2,0)',...measurements},null,2));
console.log(JSON.stringify(measurements));await browser.close();
