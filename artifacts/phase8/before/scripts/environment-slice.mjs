import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('artifacts/environment/vertical-slice',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.addInitScript(()=>localStorage.setItem('aegis-quality','LOW'));
await page.goto(`${process.env.AEGIS_BASE_URL??'http://127.0.0.1:5188'}/?qa=1&districtSlice=1`);await page.waitForFunction(()=>window.__AEGIS__,null,{timeout:60000});
for(const [name,eye,look,player,hour] of [
 ['gothic-street',[-626,3,-292],[-640,20,-368],[-616,2,-281],22],
 ['gothic-rooftop',[-665,73,-290],[-620,38,-430],[-650,75,-280],18],
 ['gothic-altitude',[-890,340,-90],[-550,20,-430],[-890,342,-90],17.6]]){
 await page.evaluate(({eye,look,player,hour})=>{const q=window.__AEGIS__;q.start();q.city.setWeather('partly-cloudy',0);q.city.weather.setTime(hour);q.player.body.teleport(q.player.position.clone().fromArray(player));q.player.state='HOVER';q.player.velocity.set(0,0,0);q.city.prepareAt(q.player.position);q.city.setCaptureView(eye,look);document.querySelector('.hud').style.display='none';},{eye,look,player,hour});
 await page.waitForTimeout(1500);await page.screenshot({path:`artifacts/environment/vertical-slice/${name}.png`});
}
await writeFile('artifacts/environment/vertical-slice/result.json',JSON.stringify({errors,environment:await page.evaluate(()=>window.__AEGIS__.city.diagnostics()),game:await page.evaluate(()=>window.aegisDiagnostics())},null,2));
console.log(JSON.stringify({errors}));await browser.close();
