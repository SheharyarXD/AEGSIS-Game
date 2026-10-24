import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1000,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await page.goto('http://127.0.0.1:5173/scripts/character-preview.html');await page.waitForFunction(()=>window.ready,{timeout:30000});await page.screenshot({path:'artifacts/character-front.png'});
const report=await page.evaluate(()=>window.report);await fs.writeFile('artifacts/character-rig.json',JSON.stringify({report,errors},null,2));
await page.evaluate(()=>{window.camera.position.set(3,2.1,-5);window.camera.lookAt(0,1,0);window.renderStill()});await page.screenshot({path:'artifacts/character-back.png'});
const validation=await page.evaluate(()=>{
 const suit=window.suit, failures=[];const bounds=new window.T.Box3().setFromObject(suit.group,true);
 const minimumFootHeight=bounds.min.y;
 for(const clip of suit.clipNames){suit.playAction(clip);for(let i=0;i<50;i++)suit.animate(1/60,'GROUND',0,0,0);for(const bone of new Set(suit.bones.values()))if(![...bone.position.toArray(),...bone.quaternion.toArray()].every(Number.isFinite))failures.push(clip+': '+bone.name)}
 for(let i=0;i<600;i++)suit.animate(1/60,'GROUND',1,0,5.4);
 const root=suit.bones.get('root').position.toArray();
 suit.stopAnimation();const q=suit.bones.get('hips').quaternion.clone();suit.animate(.1,'BOOST',1,1,50);const frozen=q.angleTo(suit.bones.get('hips').quaternion)<1e-6;
 suit.restartAnimation();suit.animate(1/60,'GROUND',0,0,0);
 return {minimumFootHeight,root,clips:suit.clipNames.length,finiteBoneFailures:failures,ragdollFreeze:frozen};
});
assert.equal(errors.length,0,errors.join('\n'));assert.equal(validation.finiteBoneFailures.length,0);assert.ok(Math.abs(validation.minimumFootHeight)<.01);assert.ok(Math.abs(validation.root[0])<.001&&Math.abs(validation.root[2])<.001);assert.ok(validation.ragdollFreeze);
await fs.writeFile('artifacts/character-validation.json',JSON.stringify({browser:browser.version(),validation,errors},null,2));
console.log(JSON.stringify({scale:report.scale,offset:report.offset,validation,errors},null,2));await browser.close();
