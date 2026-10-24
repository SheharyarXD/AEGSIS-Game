import {chromium} from '@playwright/test';import {mkdir,writeFile} from 'node:fs/promises';
const dir='artifacts/city-redesign/after/views';await mkdir(dir,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.addInitScript(()=>localStorage.setItem('aegis-quality','MEDIUM'));await page.goto('http://127.0.0.1:5192/?qa=1');await page.waitForFunction(()=>window.__AEGIS__,null,{timeout:90000});
const landmarks=await page.evaluate(()=>window.__AEGIS__.city.layout.buildings.filter(b=>b.id===211||b.family==='city_meridian_arcade'));const gothic=landmarks.find(b=>b.id===211),arcade=landmarks.filter(b=>b.family==='city_meridian_arcade'&&b.district==='residential').sort((a,b)=>Math.hypot(a.x+570,a.z-430)-Math.hypot(b.x+570,b.z-430))[0];
const poses=[
 ['01-downtown-street',[248,2.65,-405],[232,12,-590],[248,.3,-410],'clear',12],
 ['02-sidewalk-detail',[249,1.2,-435],[249,.5,-453],[248,.3,-435],'clear',12],
 ['03-source-rooftop',[194,197,-220],[172,184,-256],[172,194,-230],'clear',12],
 ['04-skyline-aerial',[700,450,200],[120,70,-520],[700,410,160],'clear',12],
 ['05-gothic-civic',[gothic.x,5,gothic.z+52],[gothic.x,42,gothic.z],[gothic.x,3,gothic.z+40],'clear',17],
 ['06-industrial',[696,7,690],[650,9,748],[697,3,687],'partly-cloudy',17],
 ['07-rain-at-night',[248,2.65,-405],[232,12,-590],[248,.3,-410],'heavy-rain',23],
 ['08-civic-arcade',[arcade.x,3,arcade.z+arcade.d/2+16],[arcade.x,10,arcade.z],[arcade.x,3,arcade.z+arcade.d/2+17],'clear',16],
 ['09-roof-traversal',[134,214,-237],[200,130,-520],[172,192,-230],'clear',17],
 ['10-dawn',[580,235,-210],[190,90,-550],[580,220,-210],'dawn',6.5],
];const captures=[];
for(const [name,eye,look,point,preset,hour] of poses){await page.evaluate(async({eye,look,point,preset,hour})=>{const q=window.__AEGIS__;q.start();q.teleport(q.player.position.clone().fromArray(point));q.player.state='HOVER';q.player.root.visible=false;q.camera.camera.parent?.traverse(o=>{if(o.name==='AEGIS thruster jets')o.material.visible=false;});q.city.prepareAt(q.player.position);await q.city.assets.idle();q.city.prepareAt(q.player.position);await q.city.assets.idle();q.city.setWeather(preset,0);q.city.weather.setTime(hour);q.city.weather.wetness=preset.includes('rain')?1:0;q.city.setCaptureView(eye,look);},{eye,look,point,preset,hour});await page.waitForTimeout(1200);await page.screenshot({path:`${dir}/${name}.png`});captures.push({name,eye,look,point,preset,hour,quality:'MEDIUM',diagnostics:await page.evaluate(()=>window.aegisDiagnostics())});console.log(name);}
await writeFile(dir+'/manifest.json',JSON.stringify({browser:browser.version(),viewport:[1600,900],heroHiddenForArchitecturePhotos:true,captures,errors},null,2));await browser.close();
