import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 await page.addInitScript(()=>localStorage.setItem('aegis-quality','MEDIUM'));
 await page.goto('http://127.0.0.1:5192/?qa=1');
 await page.waitForFunction(()=>window.__AEGIS__,null,{timeout:180000});
 const data=await page.evaluate(async()=>{
  const q=window.__AEGIS__;q.start();q.teleport(q.player.position.clone().set(232,18,-200));q.player.state='HOVER';q.city.prepareAt(q.player.position);await q.city.assets.idle();
  const {planBreach}=await import('/src/world/titan/BreachPlan.ts'),{validateExterior}=await import('/src/world/titan/CinematicRoute.ts');
  const candidates=q.city.layout.buildings.filter(b=>Math.hypot(b.x-232,b.z+200)<200).map(b=>{
   const origin=q.player.position.clone().setY(20),dir=origin.clone().set(b.x,20,b.z).sub(origin).normalize();
   const plan=planBreach(q.city.layout.buildings,origin,dir,180,80,2.75,2.3);
   return {id:b.id,x:b.x,z:b.z,w:b.w,d:b.d,h:b.h,family:b.family,plan:plan?{id:plan.buildingId,length:plan.length,entry:plan.entry.toArray(),exit:plan.exit.toArray()}:null,reason:plan?validateExterior(q.physics,plan,q.player.position,q.player.body.body):null};
  });return candidates;
 });await writeFile('artifacts/phase10/overlap-probe.json',JSON.stringify(data,null,2));
 console.log(JSON.stringify(data));
}finally{await browser.close();}
