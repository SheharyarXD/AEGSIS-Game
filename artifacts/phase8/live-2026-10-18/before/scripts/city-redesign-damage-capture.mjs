import {chromium} from '@playwright/test';import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.AEGIS_BASE_URL??'http://127.0.0.1:5192',dir='artifacts/city-redesign/after/damage';await mkdir(dir+'/videos',{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true}),records=[];
for(const [name,id] of [['glass',235],['gothic',211],['commercial',287]]){
 const context=await browser.newContext({viewport:{width:1600,height:900},recordVideo:{dir:dir+'/videos',size:{width:1600,height:900}}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>localStorage.setItem('aegis-quality','LOW'));await page.goto(base+'/?qa=1');await page.waitForFunction(()=>window.__AEGIS__,null,{timeout:120000});
 const pose=await page.evaluate(async id=>{
  const q=window.__AEGIS__,b=q.city.layout.buildings.find(b=>b.id===id);q.start();await q.city.assets.ensure(b.family,b.assetHeight,'near');
  const c=q.city.assets.catalog.components.filter(c=>c.family===b.family&&c.kind==='glass'&&c.side===0).sort((a,b)=>Math.abs(a.floor-4)-Math.abs(b.floor-4))[0],f=q.city.assets.catalog.families.find(f=>f.id===b.family);
  const p=q.player.position.clone().fromArray(c.center).multiply(q.player.position.clone().set(b.w/f.width,b.h/b.assetHeight,b.d/f.depth)).applyAxisAngle(q.player.position.clone().set(0,1,0),b.angle??0).add(q.player.position.clone().set(b.x,0,b.z));
  const eye=p.clone().add(q.player.position.clone().set(7,3,32)),actor=p.clone().add(q.player.position.clone().set(0,-2,23));q.teleport(actor);q.player.state='HOVER';q.city.prepareAt(actor);await q.city.assets.idle();q.city.prepareAt(actor);await q.city.assets.idle();q.city.setWeather('clear',0);q.city.weather.setTime(16);q.city.setCaptureView(eye.toArray(),p.toArray());const aim=p.clone().sub(eye).normalize();q.camera.yaw=Math.atan2(aim.x,aim.z);q.camera.pitch=Math.asin(aim.y);return {building:b,point:p.toArray(),eye:eye.toArray(),actor:actor.toArray()};
 },id);await page.waitForTimeout(1800);const stages=[];
 for(const stage of ['intact','windows','wall','structure','collapse']){
  if(stage!=='intact')await page.evaluate(({id,stage})=>window.__AEGIS__.city.architecture.demonstrate(id,stage),{id,stage});
  if(stage==='structure'||stage==='collapse')await page.evaluate(id=>{const q=window.__AEGIS__,b=q.city.layout.buildings.find(b=>b.id===id);q.city.setCaptureView([b.x+b.w*1.5,b.h*.36,b.z+b.d*3.8],[b.x,b.h*.43,b.z]);},id);
  await page.waitForTimeout(stage==='structure'?1800:stage==='collapse'?3600:1000);await page.screenshot({path:`${dir}/${name}-${stage}.png`});stages.push({stage,diagnostics:await page.evaluate(()=>window.__AEGIS__.city.architecture.diagnostics())});console.log(name,stage);
 }
 const saved=await page.evaluate(()=>window.__AEGIS__.city.architecture.serialize());await page.evaluate(()=>{const q=window.__AEGIS__;q.teleport(q.player.position.clone().set(-850,150,800));q.city.prepareAt(q.player.position);});await page.waitForTimeout(1200);const distant=await page.evaluate(()=>window.__AEGIS__.city.architecture.diagnostics());await page.evaluate(({actor})=>{const q=window.__AEGIS__;q.teleport(q.player.position.clone().fromArray(actor));q.player.state='HOVER';q.city.prepareAt(q.player.position);},{actor:pose.actor});await page.waitForTimeout(1200);const returned=await page.evaluate(()=>window.__AEGIS__.city.architecture.diagnostics());records.push({name,id,pose,stages,saved,distant,returned,errors,method:'Recorded real geometry/physics. QA stage helpers exercise the same component HP/support/cascade path as gameplay; weapon-input footage is separate.'});
 const video=page.video();await context.close();await video.saveAs(`${dir}/videos/${name}-progressive-destruction.webm`);
}
await writeFile(dir+'/stages.json',JSON.stringify(records,null,2));await browser.close();
