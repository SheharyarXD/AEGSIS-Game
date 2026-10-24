import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
await page.goto('http://127.0.0.1:5192/?qa=1');
await page.waitForFunction(()=>window.__AEGIS__,null,{timeout:120000});
await page.evaluate(()=>window.__AEGIS__.start());await page.waitForTimeout(500);
const initial=await page.evaluate(()=>{
 const q=window.__AEGIS__,b=q.city.layout.buildings.find(b=>b.id===8004);
 const origin=q.player.position.clone().set(b.x+b.w/2+10,7,b.z);
 q.physics.world.step();const hit=q.physics.ray(origin,q.player.position.clone().set(-1,0,0),40,q.player.body.body);
 const wall=hit&&{toi:hit.timeOfImpact,normal:hit.normal,handle:hit.collider.handle,surface:q.physics.surfaces.get(hit.collider.handle)};
 origin.x-=hit.timeOfImpact-2.5;q.teleport(origin);q.player.state='CRUISE';q.player.velocity.set(-45,0,0);q.camera.yaw=-Math.PI/2;
 const callback=q.player.onCollision;q.player.onCollision=(speed,p,n,c)=>{(window.probeHits??=[]).push({speed,p:p.toArray(),n:n.toArray(),surface:q.physics.surfaces.get(c.handle)});callback?.(speed,p,n,c);};
 return {b,wall,origin:origin.toArray()};
});
const samples=[];for(let i=0;i<8;i++){await page.waitForTimeout(150);samples.push(await page.evaluate(()=>{const q=window.__AEGIS__;return {p:q.player.position.toArray(),v:q.player.velocity.toArray(),state:q.player.state,recovering:q.player.recovering,crashes:q.player.crashCount,hits:window.probeHits??[],mode:window.aegisDiagnostics().mode};}));}
await writeFile('artifacts/phase7/flight-probe.json',JSON.stringify({initial,samples},null,2));console.log(JSON.stringify({initial,samples},null,2));await browser.close();
