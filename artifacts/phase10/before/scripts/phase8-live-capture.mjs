import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
if(process.env.PHASE8_LIVE_VERIFICATION!=='1')throw new Error('Explicit live-verification authorization is required.');
const stage=process.env.PHASE8_CAPTURE_STAGE??'after',base=process.env.AEGIS_BASE_URL??(stage==='before'?'http://127.0.0.1:5206':'http://127.0.0.1:5192');
const dir=`artifacts/phase8/live-2026-10-18/${stage}`,quality=process.env.PHASE8_QUALITY??'MEDIUM',section=process.env.PHASE8_CAPTURE_SECTION??'all';await mkdir(dir+'/videos',{recursive:true});
const records=[],errors=[],browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900},...(stage==='after'?{recordVideo:{dir:dir+'/videos',size:{width:1440,height:900}}}:{})}),page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
await page.addInitScript(q=>localStorage.setItem('aegis-quality',q),quality);
async function shot(name,method,extra={}){await page.screenshot({path:`${dir}/${name}.png`});records.push({name,method,...extra,diagnostics:await page.evaluate(()=>window.aegisDiagnostics()),weapons:await page.evaluate(()=>{const q=window.__AEGIS__,m=q.encounter.missiles;return {launches:m.launches,demolition:m.demolition??false,demolitionRemaining:m.demolitionRemaining??0,beamSeconds:q.encounter.hands.beamSeconds,scars:q.city.architecture.effects.serialize?.()??[]};})});console.log(stage,name);}
async function tower(){
 await page.evaluate(async()=>{const q=window.__AEGIS__;q.start();q.player.root.visible=true;
 const b=q.city.layout.buildings.find(b=>b.id===235),f=q.city.assets.catalog.families.find(f=>f.id===b.family);await q.city.assets.ensure(b.family,b.assetHeight,'near');
 const c=q.city.assets.catalog.components.filter(c=>c.family===b.family&&c.kind==='glass'&&c.side===0).sort((a,b)=>Math.abs(a.floor-4)-Math.abs(b.floor-4))[0],p=q.player.position.clone().fromArray(c.center).multiply(q.player.position.clone().set(b.w/f.width,b.h/b.assetHeight,b.d/f.depth)).add(q.player.position.clone().set(b.x,0,b.z)),eye=p.clone().add(q.player.position.clone().set(7,3,36)),actor=p.clone().add(q.player.position.clone().set(0,-2,26)),aim=p.clone().sub(eye).normalize();
 q.teleport(actor);q.player.state='HOVER';q.camera.yaw=Math.atan2(aim.x,aim.z);q.camera.pitch=Math.asin(aim.y);q.city.setCaptureView(eye.toArray(),p.toArray());q.city.prepareAt(actor);await q.city.assets.idle();q.city.prepareAt(actor);await q.city.assets.idle();q.city.setWeather('clear',0);q.city.weather.setTime(20);q.encounter.missiles.mode='OFF';
 window.phase8Impacts=[];const m=q.encounter.missiles;m.phase8OriginalImpact??=m.onImpact;m.onImpact=(p,s,hit,mode,n)=>{window.phase8Impacts.push({t:performance.now(),p:p.toArray(),s,hit,mode});m.phase8OriginalImpact?.(p,s,hit,mode,n);};
 });await page.waitForTimeout(700);
}
try{
 await page.goto(base+'/?qa=1');await page.waitForFunction(()=>window.__AEGIS__,null,{timeout:180000});
 if(section==='all'||section==='streets'){
 const views=[
 ['01-downtown',[248,2.5,-430],[232,9,-496],[248,.3,-430],'clear',14],
 ['02-sidewalk',[249,1.1,-435],[250,.6,-447],[248,.3,-435],'clear',14],
 ['03-intersection',[246,3,-473],[222,5,-513],[248,.3,-474],'clear',16],
 ['04-night-street',[248,2.5,-430],[232,9,-496],[248,.3,-430],'clear',23],
 ['05-rain-night',[248,2.5,-430],[232,9,-496],[248,.3,-430],'heavy-rain',23],
 ['06-rooftops',[218,95,-350],[170,45,-430],[218,90,-350],'clear',16],
 ['07-skyline',[630,380,200],[-100,75,-350],[480,320,260],'clear',16],
 ['08-gothic',[-505,5,-370],[-540,50,-416],[-505,.3,-370],'clear',17],
 ['09-industrial',[696,3,690],[652,8,748],[697,.3,687],'partly-cloudy',16],
 ];
 for(const [name,eye,look,point,weather,hour] of views){await page.evaluate(async p=>{const q=window.__AEGIS__;q.start();q.teleport(q.player.position.clone().fromArray(p.point));q.player.state=p.point[1]>1?'HOVER':'GROUND';q.player.root.visible=false;q.city.prepareAt(q.player.position);await q.city.assets.idle();q.city.prepareAt(q.player.position);await q.city.assets.idle();q.city.setWeather(p.weather,0);q.city.weather.setTime(p.hour);q.city.weather.wetness=p.weather.includes('rain')?1:0;q.city.setCaptureView(p.eye,p.look);},{eye,look,point,weather,hour});await page.waitForTimeout(1100);await shot(name,'Actual main-game render; fixed QA architecture camera, hero hidden for the matched architectural photo.',{eye,look,point,weather,hour});}
 }
 if(stage==='after'&&(section==='all'||section==='weapons')){
 await tower();await shot('10-glass-intact','Main game source facade before actual F input.');await page.keyboard.press('f');await page.waitForFunction(()=>window.phase8Impacts.length>0);await shot('11-standard-impact','Actual standard F shoulder-missile impact.');await page.waitForTimeout(1100);await shot('12-standard-aftermath','Actual F impact, persistent facade damage, fire and smoke.');records.push({name:'standard-input-events',impacts:await page.evaluate(()=>window.phase8Impacts)});
 await tower();await page.keyboard.press('o');await page.waitForFunction(()=>window.__AEGIS__.encounter.missiles.demolition);await page.keyboard.press('f');await page.waitForFunction(()=>window.phase8Impacts.length>0);await shot('13-demolition-impact','Actual O then F: 5× demolition missile.');await page.waitForTimeout(1100);await shot('14-demolition-aftermath','Actual demolition missile damage and smoke.');records.push({name:'demolition-input-events',impacts:await page.evaluate(()=>window.phase8Impacts)});
 await tower();await page.keyboard.down('l');await page.waitForFunction(()=>window.__AEGIS__.encounter.hands.beamSeconds>.4);await shot('15-laser-hot','Actual sustained L input; exact beam-contact heat.');await page.waitForFunction(()=>window.__AEGIS__.city.architecture.totalBroken>0,null,{timeout:5000});await page.keyboard.up('l');await page.waitForTimeout(700);await shot('16-laser-cooling','L released; actual penetration and thermal material cooling.');await page.waitForTimeout(10000);await shot('17-laser-scorch','L released for more than ten seconds; persistent damage/scorch.');
 records.push({name:'weapon-state',impacts:await page.evaluate(()=>window.phase8Impacts),save:await page.evaluate(()=>window.__AEGIS__.city.exportDestruction())});
 }
 if(stage==='after'&&(section==='all'||section==='titan')){
 for(const f of [{name:'midrise',id:287,point:[172,11,-220],yaw:0},{name:'glass',id:235,point:[172,23,-132.4416],yaw:Math.PI},{name:'gothic',id:211,point:[-540,23,-341.41985],yaw:Math.PI}]){
 await page.evaluate(async f=>{const q=window.__AEGIS__;q.start();q.player.root.visible=true;q.teleport(q.player.position.clone().fromArray(f.point));q.player.state='HOVER';q.camera.yaw=f.yaw;q.camera.pitch=0;const b=q.city.layout.buildings.find(b=>b.id===f.id);q.city.prepareAt(q.player.position);await q.city.assets.ensure(b.family,b.assetHeight,'near');await q.city.assets.idle();q.city.setWeather('clear',0);q.city.weather.setTime(17);window.phase8Motion=[];window.phase8Sampling=true;const sample=()=>{if(!window.phase8Sampling)return;window.phase8Motion.push({t:performance.now(),steps:q.physics.steps,p:q.player.position.toArray(),bodyEnabled:q.player.body.body.isEnabled(),energy:q.player.energy,...q.titan.diagnostics()});requestAnimationFrame(sample);};requestAnimationFrame(sample);},f);
 await shot(`18-${f.name}-approach`,'QA sets only the starting fixture; W and Y drive all subsequent traversal.');await page.keyboard.down('w');await page.waitForTimeout(2200);await page.keyboard.press('y');await page.waitForFunction(()=>window.__AEGIS__.titan.entries===1,null,{timeout:10000});await shot(`19-${f.name}-entry`,'Actual Y activation and entry impact with the normal player/camera.');await page.waitForTimeout(100);await shot(`20-${f.name}-interior`,'Continuous simulated player motion; no traversal teleport or disabled capsule.');await page.waitForFunction(()=>window.__AEGIS__.titan.exits===1,null,{timeout:10000});await page.keyboard.up('w');await page.keyboard.down('q');await shot(`21-${f.name}-exit`,'Actual breakthrough exit; Q brakes after completion.');await page.waitForTimeout(200);await page.keyboard.up('q');
 records.push({name:`${f.name}-trajectory`,method:'Starting position is a QA fixture; W/Y/Q input performs the entire traversal.',samples:await page.evaluate(()=>{window.phase8Sampling=false;return window.phase8Motion;}),save:await page.evaluate(()=>window.__AEGIS__.city.exportDestruction())});
 await page.evaluate(()=>{const q=window.__AEGIS__;q.teleport(q.player.position.clone().set(740,150,700));q.player.state='HOVER';});await page.waitForTimeout(500);
 for(const side of ['entry','exit']){await page.evaluate(async side=>{const q=window.__AEGIS__,plan=q.city.exportDestruction().breaches[0],p=q.player.position.clone().fromArray(plan[side]),d=q.player.position.clone().fromArray(plan.direction).multiplyScalar(side==='entry'?-1:1),eye=p.clone().addScaledVector(d,18).add(q.player.position.clone().set(8,3,0)),look=p.clone().addScaledVector(d,-6);q.teleport(p.clone().addScaledVector(d,22).add(q.player.position.clone().set(6,0,0)));q.player.state='HOVER';q.city.setCaptureView(eye.toArray(),look.toArray());q.city.prepareAt(q.player.position);await q.city.assets.idle();},side);await page.waitForTimeout(500);await shot(`21b-${f.name}-${side}-persistent`,'Exterior QA photo after physically completing the strike and leaving/returning through district streaming.');}
 }
 }
 if(stage==='after'&&(section==='all'||section==='collapse')){
 await page.evaluate(async()=>{const q=window.__AEGIS__;q.start();q.player.root.visible=true;q.teleport(q.player.position.clone().set(258,45,-150));q.player.state='HOVER';q.city.prepareAt(q.player.position);await q.city.assets.ensure('aer_glass',168,'near');await q.city.assets.idle();q.city.setCaptureView([270,70,-120],[172,75,-256]);q.city.weather.setTime(17);q.city.setWeather('clear',0);});await page.waitForTimeout(800);await shot('22-tower-before-collapse','Intact authored tower in main game before scripted support damage.');
 await page.evaluate(()=>window.__AEGIS__.city.architecture.demonstrate(235,'structure'));await page.waitForTimeout(1000);await shot('23-partial-collapse','Scripted QA support hits use the gameplay support/collapse path; this is not recorded F input.');await page.waitForFunction(()=>!window.__AEGIS__.city.architecture.diagnostics().states.find(s=>s.id===235).collapsePending,null,{timeout:20000});await shot('24-partial-remains','Completed one-sided support cascade.');
 await page.evaluate(()=>window.__AEGIS__.city.architecture.demonstrate(235,'collapse'));await page.waitForTimeout(1000);await shot('25-major-collapse','Scripted QA low-floor support damage; staged full collapse.');await page.waitForFunction(()=>!window.__AEGIS__.city.architecture.diagnostics().states.find(s=>s.id===235).collapsePending,null,{timeout:20000});await shot('26-ruin','Persistent completed collapse state.');
 }
 records.push({name:'complete',errors});
}catch(e){records.push({name:'failed',error:e.stack});console.error(e.stack);process.exitCode=1;}
finally{
 const video=page.video();await context.close();if(video)await video.saveAs(`${dir}/videos/${section}-gameplay.webm`);await browser.close();await writeFile(`${dir}/captures-${section}.json`,JSON.stringify({stage,quality,base,viewport:[1440,900],records,errors},null,2));
}
