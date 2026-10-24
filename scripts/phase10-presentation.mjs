import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const stage=process.env.PHASE10_STAGE??'after',dir=`artifacts/phase10/${stage}`,base=process.env.AEGIS_BASE_URL??'http://127.0.0.1:5192';
await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[],results=[];
page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.addInitScript(()=>localStorage.setItem('aegis-quality','MEDIUM'));
try{
 await page.goto(base+'/?qa=1');await page.waitForFunction(()=>window.__AEGIS__,null,{timeout:180000});
 for(const [name,weather,hour,eye,look] of [
 ['street','clear',14,[248,2.5,-430],[232,9,-496]],['sidewalk','clear',14,[249,1.1,-435],[250,.6,-447]],['intersection','clear',16,[246,3,-473],[222,5,-513]],['rain-night','heavy-rain',23,[248,2.5,-430],[232,9,-496]],
 ['gothic','clear',17,[-505,5,-370],[-540,50,-416]],['industrial','partly-cloudy',16,[696,3,690],[652,8,748]]]){
  await page.evaluate(async p=>{const q=window.__AEGIS__;q.start();q.teleport(q.player.position.clone().fromArray(p.eye));q.player.state='HOVER';q.player.root.visible=false;q.city.prepareAt(q.player.position);await q.city.assets.idle();q.city.prepareAt(q.player.position);await q.city.assets.idle();q.city.setWeather(p.weather,0);q.city.weather.setTime(p.hour);q.city.weather.wetness=p.weather.includes('rain')?1:0;q.city.setCaptureView(p.eye,p.look);},{weather,hour,eye,look});await page.waitForTimeout(1500);
  await page.screenshot({path:`${dir}/${name}.png`});
  const measured=await page.evaluate(()=>new Promise(resolve=>{const frames=[],counters=[];let last=performance.now();const tick=t=>{frames.push(t-last);last=t;if(frames.length%45===0)counters.push(window.aegisDiagnostics());if(frames.length<360)requestAnimationFrame(tick);else{const a=frames.slice(1).sort((a,b)=>a-b),mean=a.reduce((x,y)=>x+y,0)/a.length;resolve({samples:a.length,meanMs:mean,fps:1000/mean,p50Ms:a[Math.floor(a.length*.5)],p95Ms:a[Math.floor(a.length*.95)],p99Ms:a[Math.floor(a.length*.99)],worstMs:a.at(-1),counters});}};requestAnimationFrame(tick);}));
  results.push({name,weather,hour,eye,look,quality:'MEDIUM',viewport:[1280,720],...measured});console.log(stage,name,measured.fps.toFixed(1));
 }
}finally{await writeFile(`${dir}/presentation.json`,JSON.stringify({stage,date:new Date().toISOString(),method:'Identical main-game QA architecture cameras. 359 timed frames after warmup, no video or concurrent workload.',results,errors},null,2));await browser.close();}
if(errors.length)process.exitCode=1;
