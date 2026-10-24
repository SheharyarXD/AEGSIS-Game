import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
if(process.env.PHASE8_LIVE_VERIFICATION!=='1')throw new Error('Explicit live-verification authorization is required.');
const dir='artifacts/phase8/live-2026-10-18',base=process.env.AEGIS_BASE_URL??'http://127.0.0.1:5194';
const errors=[],results=[];
for(const quality of ['LOW','HIGH']){
 const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:{width:1280,height:720}}),page=await context.newPage(),requests=[];
 page.on('response',r=>{requests.push({url:r.url(),status:r.status()});if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
 page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(q=>localStorage.setItem('aegis-quality',q),quality);
 try{
  await page.goto(base+'/?qa=1');await page.waitForFunction(()=>window.__AEGIS__,null,{timeout:180000});
  const initial=await page.evaluate(()=>window.aegisDiagnostics());assert.equal(initial.quality,quality);
  await page.evaluate(async()=>{const q=window.__AEGIS__;q.start();q.teleport(q.player.position.clone().set(248,.3,-430));q.camera.yaw=Math.PI;q.camera.pitch=0;q.city.prepareAt(q.player.position);await q.city.assets.idle();});
  await page.waitForFunction(()=>window.__AEGIS__.player.body.grounded);const start=await page.evaluate(()=>window.__AEGIS__.player.position.toArray());
  await page.keyboard.down('w');await page.waitForTimeout(900);await page.keyboard.up('w');
  const walked=await page.evaluate(()=>window.__AEGIS__.player.position.toArray());assert.ok(Math.hypot(walked[0]-start[0],walked[2]-start[2])>1);
  await page.keyboard.press('e');await page.keyboard.down('Space');await page.waitForTimeout(1900);await page.keyboard.up('Space');
  await page.keyboard.press('f');await page.keyboard.down('l');await page.waitForTimeout(600);await page.keyboard.up('l');
  await page.evaluate(()=>{const q=window.__AEGIS__;q.city.setWeather('heavy-rain',0);q.city.weather.setTime(23);});await page.waitForTimeout(1000);
  const final=await page.evaluate(()=>({d:window.aegisDiagnostics(),enabled:window.__AEGIS__.player.body.body.isEnabled(),sourceScripts:[...document.scripts].map(s=>s.src)}));
  assert.ok(final.enabled);assert.ok(final.d.position[1]>start[1]+3);assert.equal(final.d.mode,'play');assert.ok(final.sourceScripts.every(s=>!s.includes('/src/')));
  assert.ok(requests.some(r=>/geometry\.worker-.*\.js/.test(r.url)&&r.status===200),'Bundled geometry worker not requested');
  assert.ok(requests.some(r=>/near-optimized\.glb/.test(r.url)&&r.status===200),'Supplied source architecture not requested');
  await page.screenshot({path:`${dir}/production-${quality}.png`});results.push({quality,initial,final,requests,method:'Production dist; QA starting fixture, real W/E/Space/F/L input, rain/night. No /src imports.'});
 }catch(e){errors.push(e.stack);process.exitCode=1;}finally{await context.close();await browser.close();}
}
await writeFile(dir+'/production-smoke.json',JSON.stringify({createdAt:new Date().toISOString(),base,passed:!errors.length&&results.length===2,results,errors},null,2)+'\n');
console.log(JSON.stringify({qualities:results.map(r=>r.quality),errors}));
