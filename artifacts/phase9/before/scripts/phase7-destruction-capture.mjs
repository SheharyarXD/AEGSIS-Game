import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const dir='artifacts/phase7/destruction',base=process.env.AEGIS_BASE_URL??'http://127.0.0.1:5192';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});const records=[];
for(const [family,id,x,z,h] of [['glass',235,170,-390,136],['gothic',211,-534,-390,96],['commercial',287,170,-218,32]]){
 const context=await browser.newContext({viewport:{width:1600,height:900},recordVideo:{dir:dir+'/videos',size:{width:1600,height:900}}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>localStorage.setItem('aegis-quality', 'MEDIUM'));await page.goto(base+'/?qa=1');await page.waitForFunction(()=>window.__AEGIS__,null,{timeout:120000});
 await page.evaluate(({x,z,h})=>{const q=window.__AEGIS__;q.start();q.teleport(q.player.position.clone().set(x-8,22,z+65));q.player.state='HOVER';q.city.prepareAt(q.player.position);q.city.setWeather('partly-cloudy',0);q.city.weather.setTime(15);q.city.setCaptureView([x+35,h*.48,z+(h>60?155:90)],[x,h*.45,z]);},{x,z,h});await page.waitForTimeout(4000);
 const stages=['intact','windows','wall','structure','collapse'];
 for(const stage of stages){
  if(stage!=='intact')await page.evaluate(({id,stage})=>window.__AEGIS__.city.architecture.demonstrate(id,stage),{id,stage});await page.waitForTimeout(stage==='collapse'?6000:stage==='structure'?4000:1500);
  await page.screenshot({path:`${dir}/${family}-${stage}.png`});const data=await page.evaluate(()=>({game:window.aegisDiagnostics(),destruction:window.__AEGIS__.city.architecture.diagnostics()}));records.push({family,id,stage,...data,errors:[...errors]});console.log(family,stage,data.game.meanMs.toFixed(2),data.destruction.brokenComponents);
 }
 // Verify persistence through a remote teleport, tile eviction, and return.
 const prior=await page.evaluate(()=>window.__AEGIS__.city.architecture.diagnostics());await page.evaluate(()=>{const q=window.__AEGIS__;q.teleport(q.player.position.clone().set(704,60,512));q.city.prepareAt(q.player.position);});await page.waitForTimeout(700);await page.evaluate(({x,z})=>{const q=window.__AEGIS__;q.teleport(q.player.position.clone().set(x,22,z+65));q.city.prepareAt(q.player.position);},{x,z});await page.waitForTimeout(700);
 records.push({family,persistence:{before:prior,after:await page.evaluate(()=>window.__AEGIS__.city.architecture.diagnostics())},errors:[...errors]});const video=page.video();await context.close();await video.saveAs(`${dir}/videos/${family}-progressive-destruction.webm`);
}
await writeFile(dir+'/capture-manifest.json',JSON.stringify({project:process.cwd(),viewport:[1600,900],quality:'MEDIUM',records},null,2));await browser.close();
