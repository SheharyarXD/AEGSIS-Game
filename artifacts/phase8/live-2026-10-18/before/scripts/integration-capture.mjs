import {chromium} from '@playwright/test';
import {writeFile,unlink,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {baseURL,dir,boot,position,weather,observe,snapshot,freezeEnemies,aim,key,directories} from './integration-browser.mjs';
await directories();const browser=await chromium.launch({channel:'chrome',headless:true});let captures=[];
const selected=process.env.AEGIS_CAPTURE_SCENES?.split(',');if(selected){try{captures=JSON.parse(await readFile(`${dir}/capture-manifest.json`,'utf8')).captures.filter(c=>!selected.includes(c.name));}catch{}}
async function shot(page,name){await page.screenshot({path:`${dir}/screenshots/${name}.png`});return snapshot(page);}
async function pilot(page){await page.evaluate(()=>{const p=window.__AEGIS__.player;p.form='pilot';p.suitUp(0);p.sync(0);p.present(1);});}
async function wall(page){return page.evaluate(()=>{const q=window.__AEGIS__,b=q.city.layout.buildings.find(b=>b.style==='financial');q.teleport(q.player.position.clone().set(b.x-b.w/2-12,6,b.z));q.player.state='HOVER';q.camera.yaw=Math.PI/2;q.camera.pitch=0;return {id:b.id,wall:b.x-b.w/2};});}
async function run(name,range,action){
 if(selected&&!selected.includes(name))return;
 const context=await browser.newContext({viewport:{width:1280,height:720},recordVideo:{dir:`${dir}/videos/raw`,size:{width:1280,height:720}}}),page=await context.newPage(),observed=observe(page);
 await boot(page,'LOW',range);await weather(page);const started=new Date().toISOString();const evidence=await action(page);const end=await shot(page,name);const video=page.video();await context.close();
 await video.saveAs(`${dir}/videos/${name}.webm`);const raw=await video.path();if(resolve(raw).startsWith(resolve(`${dir}/videos/raw`)))await unlink(raw);
 captures.push({name,started,evidence,end,errors:observed.errors,assets:[...observed.assets],video:`${dir}/videos/${name}.webm`,screenshot:`${dir}/screenshots/${name}.png`});
 await writeFile(`${dir}/capture-manifest.json`,JSON.stringify({date:new Date().toISOString(),project:resolve('.'),baseURL,browser:browser.version(),quality:'LOW',viewport:[1280,720],notes:'Actual merged-game browser recordings. QA initializes positions/forms and selected controlled targets; movement, transformations and weapons use keyboard input. Combat and LOW encounter AI remain active. HUD and hero stay visible.',captures},null,2));console.log(`${name}: ${observed.errors.length} errors`);
}
await run('01-pilot-spawn-walking',false,async page=>{
 await pilot(page);await position(page,[128,.3,-320],'GROUND');await page.waitForTimeout(500);const spawn=await shot(page,'pilot-city-street');
 await key(page,'w',1200);await page.keyboard.down('ShiftLeft');await key(page,'w',2100);await page.keyboard.up('ShiftLeft');await key(page,'d',900);
 const building=await page.evaluate(()=>{const q=window.__AEGIS__,b=q.city.layout.buildings.find(b=>b.style==='residential');q.teleport(q.player.position.clone().set(b.x-b.w/2-3,.3,b.z));q.camera.yaw=Math.PI/2;return {wall:b.x-b.w/2};});await key(page,'w',2200);return {spawn,building,collision:await snapshot(page)};
});
await run('02-city-suit-transformation',false,async page=>{
 await pilot(page);await position(page,[128,.3,-320],'GROUND');await page.waitForFunction(()=>window.__AEGIS__.player.body.grounded);await key(page,'t');await page.waitForTimeout(1700);const midway=await shot(page,'transformation-midway');
 await page.waitForFunction(()=>window.__AEGIS__.player.form==='armor'&&!window.__AEGIS__.player.changingForm);await page.waitForTimeout(700);return {midway};
});
await run('03-takeoff-skyline-climb',false,async page=>{
 await position(page,[128,.3,-320],'GROUND');await page.waitForFunction(()=>window.__AEGIS__.player.body.grounded);await key(page,'e');await key(page,'Space',28000);await page.evaluate(()=>{window.__AEGIS__.camera.pitch=-.65;});await page.waitForTimeout(900);return {afterClimb:await shot(page,'armored-high-altitude')};
});
await run('04-high-speed-district-traversal',false,async page=>{
 await position(page,[128,330,-460],'CRUISE',0);await page.evaluate(()=>window.__AEGIS__.player.velocity.set(0,0,29));const before=await snapshot(page);
 await page.keyboard.down('w');await page.keyboard.down('ShiftLeft');await page.waitForTimeout(6500);const boost=await shot(page,'boost-between-districts');await page.keyboard.up('ShiftLeft');await page.waitForTimeout(29000);await page.keyboard.up('w');return {before,boost,after:await snapshot(page)};
});
await run('05-rooftop-impact-landing',false,async page=>{
 const roof=await page.evaluate(()=>{const q=window.__AEGIS__,b=q.city.layout.buildings.filter(b=>b.style==='deco'&&b.district==='financial').sort((a,b)=>(a.x-130)**2+(a.z+450)**2-((b.x-130)**2+(b.z+450)**2))[0];q.teleport(q.player.position.clone().set(b.x+b.w*.15,b.h+22,b.z-b.d*.16));q.player.state='FALL';q.player.velocity.set(0,-18,0);q.camera.yaw=Math.atan2(328-q.player.position.x,-496-q.player.position.z);q.player.object.rotation.y=q.camera.yaw;q.camera.pitch=-.12;return {id:b.id,height:b.h};});
 await page.waitForFunction(h=>{const p=window.__AEGIS__.player;return p.body.grounded&&Math.abs(p.position.y-h)<.2;},roof.height);const landing=await shot(page,'armored-rooftop-landing');await page.waitForTimeout(1600);return {roof,landing};
});
await run('06-normal-movement-melee',true,async page=>{
 await page.evaluate(()=>{const q=window.__AEGIS__,at=q.encounter.enemies[1].position.clone();at.z+=3.2;q.teleport(at);});await key(page,'w',350);
 await page.keyboard.down('b');await page.waitForTimeout(900);await page.keyboard.up('b');for(let i=0;i<4;i++){await key(page,'j');await page.waitForTimeout(160);}await key(page,'k');await page.waitForTimeout(900);return {combat:await snapshot(page)};
});
await run('07-guided-missiles-and-city-los',true,async page=>{
 await freezeEnemies(page);await page.evaluate(()=>{const q=window.__AEGIS__;q.teleport(q.player.position.clone().set(128,.3,-304));q.encounter.enemies.forEach((e,i)=>e.body.teleport(e.position.clone().set(120+i*8,.03,-354)));});await aim(page);await key(page,'Tab');const lock=await shot(page,'missile-target-lock');await key(page,'f');await page.waitForTimeout(3200);const guided=await snapshot(page);
 await page.evaluate(()=>window.__AEGIS__.start(true));await freezeEnemies(page);const building=await wall(page);await page.evaluate(()=>{const q=window.__AEGIS__,b=q.city.layout.buildings.find(b=>b.style==='financial');q.encounter.enemies.forEach((e,i)=>{e.body.teleport(e.position.clone().set(b.x+b.w/2+12,6,b.z+i*3));});q.encounter.targeting.reset();});await page.waitForTimeout(700);const hidden=await shot(page,'city-blocked-target');await key(page,'f');await page.waitForTimeout(2100);return {lock,guided,building,hidden,blockedShot:await snapshot(page),controlledTargets:true};
});
await run('08-repulsor-and-laser-surfaces',false,async page=>{
 const building=await wall(page);await key(page,'z',1600);const repulsor=await shot(page,'repulsor-building-impact');await page.waitForTimeout(500);await page.keyboard.down('l');await page.waitForTimeout(1700);const laser=await shot(page,'laser-building-impact');await page.keyboard.up('l');await page.waitForTimeout(400);return {building,repulsor,laser};
});
await run('09-current-tactical-hud',true,async page=>{
 await freezeEnemies(page);await aim(page);await key(page,'Tab');await key(page,'F3');await page.waitForTimeout(1300);const diagnostics=await shot(page,'current-hud-diagnostics');await key(page,'F3');await key(page,'f');await page.waitForTimeout(1800);return {diagnostics,note:'Current HUD preserved; unfinished Phase 5 features are not claimed complete.'};
});
await run('10-weather-day-night-sunset',false,async page=>{
 await position(page,[128,70,-320]);const states=[];for(const [preset,hour,name] of [['heavy-rain',12,'day-rain'],['thunderstorm',23,'night-storm'],['clear',17.5,'sunset'],['clear',12,'daylight']]){
  if(name==='sunset')await position(page,[128,330,-320],'HOVER',-Math.PI/2,0);
  await weather(page,preset,hour);if(preset==='thunderstorm')await page.evaluate(()=>window.__AEGIS__.city.triggerLightning());await page.waitForTimeout(1600);states.push({preset,hour,...await shot(page,name)});
 }return {states};
});
await run('11-low-weather-active-enemies',true,async page=>{
 await weather(page,'heavy-rain',22);const before=await snapshot(page);await page.keyboard.down('b');await key(page,'d',1300);await key(page,'w',900);await key(page,'j');await page.waitForTimeout(800);await page.keyboard.up('b');await key(page,'z',1100);await key(page,'f');await page.waitForTimeout(1500);return {before,after:await snapshot(page)};
});
await browser.close();
