import {chromium} from '@playwright/test';import {mkdir,readFile,writeFile} from 'node:fs/promises';
const dir=`artifacts/phase7/${process.env.PHASE7_DEMO_DIR??'provided-demo'}`,base=process.env.AEGIS_BASE_URL??'http://127.0.0.1:5192';await mkdir(dir+'/videos',{recursive:true});const catalog=JSON.parse(await readFile('public/assets/environment/premium/provided/runtime-components.json','utf8')),records=[];
const browser=await chromium.launch({channel:'chrome',headless:true});
for(const [name,id] of [['glass',235],['gothic',211]]){
 const family=catalog.families.find(f=>f.buildingId===id),pane=catalog.components.filter(c=>c.family===family.id&&c.kind==='glass'&&c.side===0).sort((a,b)=>Math.abs(a.floor-4)-Math.abs(b.floor-4))[0];
 const point=[family.x+pane.center[0],pane.center[1],family.z+pane.center[2]],eye=[point[0]+5,point[1]+2,point[2]+26],player=[point[0],point[1]-2,point[2]+20];
 const context=await browser.newContext({viewport:{width:1600,height:900},recordVideo:{dir:dir+'/videos',size:{width:1600,height:900}}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>localStorage.setItem('aegis-quality','LOW'));await page.goto(base+'/?qa=1');await page.waitForFunction(()=>window.__AEGIS__,null,{timeout:120000});
 async function setup(){await page.evaluate(({eye,point,player})=>{const q=window.__AEGIS__;q.start();q.teleport(q.player.position.clone().fromArray(player));q.player.state='HOVER';q.city.prepareAt(q.player.position);q.city.setWeather('heavy-rain',0);q.city.weather.setTime(23);q.city.weather.wetness=1;q.city.setCaptureView(eye,point);},{eye,point,player});await page.waitForTimeout(2500);}
 await setup();await page.screenshot({path:`${dir}/${name}-night-intact-closeup.png`});
 const before=await page.evaluate(()=>window.__AEGIS__.city.architecture.diagnostics());
 await page.evaluate(({id})=>window.__AEGIS__.city.architecture.demonstrate(id,'windows'),{id});await page.waitForTimeout(1500);await page.screenshot({path:`${dir}/${name}-night-windows-closeup.png`});
 await page.evaluate(({id})=>window.__AEGIS__.city.architecture.demonstrate(id,'wall'),{id});await page.waitForTimeout(1800);await page.screenshot({path:`${dir}/${name}-night-wall-closeup.png`});
 const after=await page.evaluate(()=>window.__AEGIS__.city.architecture.diagnostics());
 // A fresh state, damaged by actual hand-beam and missile input through the existing combat system.
 await setup();await page.keyboard.down('l');await page.waitForTimeout(3300);await page.keyboard.up('l');await page.evaluate(()=>window.__AEGIS__.encounter.missiles.mode='OFF');await page.keyboard.press('f');await page.waitForTimeout(3500);await page.screenshot({path:`${dir}/${name}-weapons-damage.png`});
 const weapons=await page.evaluate(()=>{const q=window.__AEGIS__;return {architecture:q.city.architecture.diagnostics(),beamSeconds:q.encounter.hands.beamSeconds,launches:q.encounter.missiles.launches,mode:window.aegisDiagnostics().mode,form:q.player.form};});records.push({name,id,eye,point,player,before,after,weapons,errors});console.log(name,weapons);
 const video=page.video();await context.close();await video.saveAs(`${dir}/videos/${name}-night-closeup-and-weapons.webm`);
}
await writeFile(dir+'/actions.json',JSON.stringify(records,null,2));await browser.close();
