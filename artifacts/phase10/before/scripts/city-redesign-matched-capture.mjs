import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const stage=process.env.CITY_CAPTURE_STAGE??'after',base=process.env.AEGIS_BASE_URL??'http://127.0.0.1:5192',dir=`artifacts/city-redesign/${stage}/matched`;
await mkdir(dir,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
await page.addInitScript(()=>localStorage.setItem('aegis-quality','MEDIUM'));await page.goto(`${base}/?qa=1&${process.env.PHASE7_QUERY??''}`);await page.waitForFunction(()=>window.__AEGIS__,null,{timeout:120000});
const poses=[
 ['01-night-skyline',[50,215,-190],[165,80,-535],[128,160,-320],'clear',23],
 ['02-day-rooftop',[128,170,-370],[328,130,-496],[128,160,-320],'clear',12],
 ['03-gothic-street',[-576,3.2,-258],[-605,16,-348],[-576,1,-260],'clear',17],
 ['04-downtown-rain',[128,3.2,-268],[128,8,-420],[128,.3,-280],'heavy-rain',23],
 ['05-glass-closeup',[271,37,-497],[296,42,-500],[256,40,-496],'clear',12],
 ['06-gothic-facade',[-615,6,-304],[-640,15,-331],[-576,7,-260],'clear',16],
 ['07-roof-detail',[0,180,-445],[28,174,-487],[0,180,-445],'clear',12],
 ['08-industrial',[716,14,555],[780,22,665],[704,28,512],'partly-cloudy',17],
 ['09-altitude',[190,650,80],[0,70,-340],[128,600,-320],'clear',12],
 ['10-sunset',[340,250,-145],[90,130,-650],[328,280,-496],'clear',17.5],
];const captures=[];
for(const [name,eye,look,point,preset,hour] of poses){
 await page.evaluate(async({eye,look,point,preset,hour})=>{const q=window.__AEGIS__;q.start();q.teleport(q.player.position.clone().fromArray(point));q.player.state='HOVER';q.player.root.visible=false;q.camera.camera.parent?.traverse(o=>{if(o.name==="AEGIS thruster jets")o.material.visible=false;});q.city.prepareAt(q.player.position);await q.city.assets.idle?.();q.city.prepareAt(q.player.position);await q.city.assets.idle?.();q.city.setWeather(preset,0);q.city.weather.setTime(hour);q.city.weather.wetness=preset.includes('rain')?1:0;q.city.setCaptureView(eye,look);},{eye,look,point,preset,hour});await page.waitForTimeout(1200);
 await page.screenshot({path:`${dir}/${name}.png`});captures.push({name,eye,look,point,preset,hour,quality:'MEDIUM',fov:57,diagnostics:await page.evaluate(()=>window.aegisDiagnostics())});console.log(stage,name);
}
await writeFile(`${dir}/capture-manifest.json`,JSON.stringify({stage,project:process.cwd(),viewport:[1600,900],heroHiddenForArchitectureComparison:true,note:'The identical fixed camera can overlap the character, so both before and after architecture captures hide only the hero root. Gameplay and destruction videos retain the visible hero.',captures,errors},null,2));await browser.close();
