import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const server = process.env.AEGIS_BASE_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1200,height:1000},deviceScaleFactor:1});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
await page.goto(`${server}/scripts/character-preview.html`,{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>window.ready===true,{timeout:60000});
const report=await page.evaluate(()=>{
 const s=window.suit;
 let visibleMeshes=0, hiddenSourceMeshes=0, shadowMeshes=0;
 s.model.traverse(o=>{if(o.isMesh&&!o.visible)hiddenSourceMeshes++});
 s.group.traverse(o=>{if(o.isMesh&&o.visible){visibleMeshes++;if(o.castShadow)shadowMeshes++}});
 return {clips:s.clipNames.length,modelScale:s.model.scale.x,bones:s.bones.size,
   visibleMeshes,hiddenSourceMeshes,shadowMeshes,thrusterMounts:s.thrusterMounts.length};
});
assert.equal(errors.length,0,`Browser errors: ${errors.join('; ')}`);
assert.ok(report.visibleMeshes>100,'Expected substantive replacement armor geometry');
assert.ok(report.hiddenSourceMeshes>=1,'Old source meshes were not hidden');
assert.ok(report.bones>=100,'Expected existing skinned skeleton');
assert.equal(report.thrusterMounts,6,'Expected two back, two palm, two foot thrusters');
await fs.mkdir('artifacts/markII-qa',{recursive:true});
for(const name of ['threequarter','front','side','back','helmet','chest','hands','boots','thrusters']){
 await page.evaluate(name=>window.setView(name),name);
 await page.screenshot({path:`artifacts/markII-qa/${name}.png`});
}
for(const light of ['dark','studio','bright']){
 await page.evaluate(light=>{window.setView('threequarter');window.setLighting(light)},light);
 await page.screenshot({path:`artifacts/markII-qa/lighting-${light}.png`});
}
await fs.writeFile('artifacts/markII-qa/report.json',JSON.stringify({report,errors},null,2));
console.log(JSON.stringify({report,errors},null,2));
await browser.close();
