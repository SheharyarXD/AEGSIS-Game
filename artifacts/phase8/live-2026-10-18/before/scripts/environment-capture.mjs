import { chromium } from '@playwright/test';
import { mkdir,writeFile } from 'node:fs/promises';
const dir='artifacts/environment';await mkdir(`${dir}/scenes`,{recursive:true});await mkdir(`${dir}/videos`,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});const errors=[],captures=[];
const context=await browser.newContext({viewport:{width:1280,height:720}});const page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.addInitScript(()=>localStorage.setItem('aegis-quality','LOW'));
await page.goto(`${process.env.AEGIS_BASE_URL??'http://127.0.0.1:5188'}/?qa=1`);await page.waitForFunction(()=>window.__AEGIS__,null,{timeout:60000});
const scenes=[
 ['01-downtown-day',[128,4,-320],[310,95,-496],[122,3,-308],'clear',12],
 ['02-downtown-night',[128,7,-320],[328,130,-496],[121,10,-310],'partly-cloudy',23],
 ['03-gothic-night',[-626,3,-292],[-640,22,-368],[-616,4,-281],'partly-cloudy',22],
 ['04-waterfront-sunset',[725,18,570],[820,24,720],[713,20,570],'partly-cloudy',17.5],
 ['05-commercial-heavy-rain',[128,4,325],[165,38,410],[120,5,317],'heavy-rain',21],
 ['06-residential-day',[-570,7,600],[-580,18,410],[-558,9,600],'clear',11],
 ['07-rooftop-city',[30,210,-240],[328,115,-500],[40,212,-240],'partly-cloudy',16],
 ['08-high-altitude',[700,850,650],[0,40,-220],[710,852,650],'clear',12],
 ['09-sunrise',[-400,300,-180],[500,160,-350],[-390,302,-180],'partly-cloudy',6.35],
 ['10-sunset',[650,170,-360],[-300,100,-320],[660,172,-360],'partly-cloudy',17.8],
 ['11-clear-night',[150,190,210],[150,420,-400],[160,192,210],'clear',0],
 ['12-thunderstorm',[128,95,-180],[328,210,-496],[120,97,-180],'thunderstorm',22],
 ['13-dense-fog',[-576,4,-260],[-635,25,-370],[-564,5,-250],'fog',7],
 ['14-light-snow',[-512,9,480],[-420,30,390],[-503,11,480],'light-snow',10],
 ['15-heavy-snow',[-576,8,-260],[-640,30,-368],[-565,10,-250],'heavy-snow',12],
 ['16-wet-road',[128,1.0,344],[128,1.5,373],[118,3,337],'heavy-rain',22],
];
for(const [name,eye,look,position,weather,hour] of scenes){
 const configured=await page.evaluate(({name,eye,look,position,weather,hour})=>{
  const q=window.__AEGIS__;q.start();
  if(name==='07-rooftop-city'){const b=q.city.layout.buildings.filter(b=>b.district==='financial').sort((a,b)=>b.h-a.h)[0];eye=[b.x+b.w*.16,b.h+8,b.z-b.d*.16];position=[eye[0]+8,b.h+9,eye[2]];look=[328,190,-800];}
  q.player.object.visible=false;q.player.body.teleport(q.player.position.clone().fromArray(position));q.player.state='HOVER';q.player.velocity.set(0,0,0);q.city.prepareAt(q.player.position);
  q.city.setWeather(weather,0);q.city.weather.setTime(hour);q.city.weather.wetness=weather.includes('rain')||weather==='thunderstorm'?1:0;q.city.weather.snowCover=weather==='heavy-snow'?.7:weather==='light-snow'?.15:0;
  q.city.setCaptureView(eye,look);document.querySelector('.hud').style.display='none';
  return {eye,look,position};
 },{name,eye,look,position,weather,hour});
 await page.waitForTimeout(700);if(weather==='thunderstorm'){await page.evaluate(()=>window.__AEGIS__.city.triggerLightning());await page.waitForTimeout(30);}
 await page.screenshot({path:`${dir}/scenes/${name}.png`});captures.push({name,...configured,weather,hour,environment:await page.evaluate(()=>window.__AEGIS__.city.diagnostics()),game:await page.evaluate(()=>window.aegisDiagnostics())});
}
// Actual movement and landing, with the playable character and HUD visible.
const videoContext=await browser.newContext({viewport:{width:1280,height:720},recordVideo:{dir:`${dir}/videos`,size:{width:1280,height:720}}});
const game=await videoContext.newPage();game.on('pageerror',e=>errors.push(e.message));await game.addInitScript(()=>localStorage.setItem('aegis-quality','LOW'));
await game.goto(`${process.env.AEGIS_BASE_URL??'http://127.0.0.1:5188'}/?qa=1`);await game.waitForFunction(()=>window.__AEGIS__);
await game.evaluate(()=>{
 const q=window.__AEGIS__;q.start();q.player.body.teleport(q.player.position.clone().set(128,105,-460));q.player.state='CRUISE';q.player.velocity.set(0,0,40);q.camera.yaw=0;q.camera.pitch=0;q.camera.camera.position.set(128,108,-470);q.city.setWeather('light-rain',0);q.city.weather.setTime(16);q.city.prepareAt(q.player.position);
});
await game.keyboard.down('w');await game.keyboard.down('Shift');await game.waitForTimeout(3600);await game.screenshot({path:`${dir}/scenes/17-high-speed-flight.png`});
await game.keyboard.up('Shift');await game.waitForTimeout(16000);await game.screenshot({path:`${dir}/scenes/19-district-traversal.png`});
const traversal=await game.evaluate(()=>({game:window.aegisDiagnostics(),environment:window.__AEGIS__.city.diagnostics()}));await game.keyboard.up('w');await game.keyboard.down('q');await game.waitForTimeout(1200);await game.keyboard.up('q');
const landing=await game.evaluate(()=>{
 const q=window.__AEGIS__,b=q.city.layout.buildings.find(b=>b.style==='deco'&&b.district==='financial');q.player.body.teleport(q.player.position.clone().set(b.x+b.w*.15,b.h+8,b.z-b.d*.16));q.player.state='LANDING';q.player.velocity.set(0,-6,0);q.camera.reset(q.player.position);q.city.prepareAt(q.player.position);return {id:b.id,height:b.h};
});
await game.waitForFunction(h=>window.__AEGIS__.player.body.grounded&&Math.abs(window.__AEGIS__.player.position.y-h)<.2,landing.height,{timeout:6000});await game.waitForTimeout(250);await game.screenshot({path:`${dir}/scenes/18-rooftop-landing.png`});
await game.evaluate(()=>{const q=window.__AEGIS__;q.city.setWeather('heavy-rain',0);q.city.weather.setTime(22);q.city.weather.wetness=1;});await game.waitForTimeout(1000);await game.screenshot({path:`${dir}/scenes/20-low-weather-gameplay.png`});
const video=game.video();await videoContext.close();await video.saveAs(`${dir}/videos/flight-districts-rooftop-weather.webm`);
await writeFile(`${dir}/capture-manifest.json`,JSON.stringify({date:'2026-10-11',browser:browser.version(),viewport:[1280,720],quality:'LOW',captures,traversal,landing,video:`${dir}/videos/flight-districts-rooftop-weather.webm`,errors},null,2));
console.log(JSON.stringify({scenes:20,errors,traversal:traversal.game.position,landing}));await context.close();await browser.close();
