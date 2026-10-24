import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
if(process.env.PHASE9_LIVE_VERIFICATION!=='1')throw new Error('Explicit live-verification authorization is required.');
const stage=process.env.PHASE9_CAPTURE_STAGE??'before',base=process.env.AEGIS_BASE_URL??(stage==='before'?'http://127.0.0.1:5206':'http://127.0.0.1:5192');
const dir=`artifacts/phase9/${stage}`,quality=process.env.PHASE9_QUALITY??'MEDIUM',section=process.env.PHASE9_CAPTURE_SECTION??'streets';await mkdir(dir+'/videos',{recursive:true});
const records=[],errors=[],browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900},...(stage==='after'?{recordVideo:{dir:dir+'/videos',size:{width:1440,height:900}}}:{})}),page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
await page.addInitScript(q=>localStorage.setItem('aegis-quality',q),quality);
async function shot(name,method,extra={}){await page.screenshot({path:`${dir}/${name}.png`});records.push({name,method,...extra,diagnostics:await page.evaluate(()=>window.aegisDiagnostics()),weapons:await page.evaluate(()=>{const q=window.__AEGIS__,m=q.encounter.missiles;return {launches:m.launches,demolition:m.demolition??false,demolitionRemaining:m.demolitionRemaining??0,beamSeconds:q.encounter.hands.beamSeconds,scars:q.city.architecture.effects.serialize?.()??[]};})});console.log(stage,name);}

try{
 await page.goto(base+'/?qa=1');await page.waitForFunction(()=>window.__AEGIS__,null,{timeout:180000});
 if(section!=='streets')throw new Error('This script captures paired streets only; use phase9-live-acceptance.mjs for real-input destruction.');
 {
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
 records.push({name:'complete',errors});
}catch(e){records.push({name:'failed',error:e.stack});console.error(e.stack);process.exitCode=1;}
finally{
 const video=page.video();await context.close();if(video)await video.saveAs(`${dir}/videos/${section}-gameplay.webm`);await browser.close();await writeFile(`${dir}/captures-${section}.json`,JSON.stringify({stage,quality,base,viewport:[1440,900],records,errors},null,2));
}
