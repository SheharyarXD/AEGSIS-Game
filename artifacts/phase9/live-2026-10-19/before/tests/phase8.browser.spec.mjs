import {test,expect} from '@playwright/test';

const root='artifacts/phase8/live-2026-10-18';
test.afterEach(async({page},info)=>{if(info.status===info.expectedStatus)return;try{const data=await page.evaluate(()=>({samples:window.phase8Motion,crashes:window.phase8Crashes,titan:window.__AEGIS__?.titan.diagnostics(),message:window.__AEGIS__?.titan.text,d:window.aegisDiagnostics?.()}));await info.attach('failure-diagnostics',{body:JSON.stringify(data),contentType:'application/json'});}catch{}});
async function boot(page){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>localStorage.setItem('aegis-quality','LOW'));await page.goto('/?qa=1');await page.waitForFunction(()=>window.__AEGIS__,null,{timeout:180000});
 await page.evaluate(()=>window.__AEGIS__.start());return errors;
}
async function tower(page){
 return page.evaluate(async()=>{
  const q=window.__AEGIS__,b=q.city.layout.buildings.find(b=>b.id===235),family=q.city.assets.catalog.families.find(f=>f.id===b.family);
  await q.city.assets.ensure(b.family,b.assetHeight,'near');
  const c=q.city.assets.catalog.components.filter(c=>c.family===b.family&&c.kind==='glass'&&c.side===0).sort((a,b)=>Math.abs(a.floor-4)-Math.abs(b.floor-4))[0];
  const p=q.player.position.clone().fromArray(c.center).multiply(q.player.position.clone().set(b.w/family.width,b.h/b.assetHeight,b.d/family.depth)).add(q.player.position.clone().set(b.x,0,b.z));
  const eye=p.clone().add(q.player.position.clone().set(7,3,36)),actor=p.clone().add(q.player.position.clone().set(0,-2,26)),aim=p.clone().sub(eye).normalize();
  q.teleport(actor);q.player.state='HOVER';q.camera.yaw=Math.atan2(aim.x,aim.z);q.camera.pitch=Math.asin(aim.y);q.city.setCaptureView(eye.toArray(),p.toArray());
  q.city.prepareAt(actor);await q.city.assets.idle();q.city.prepareAt(actor);await q.city.assets.idle();q.city.weather.setTime(20);q.city.setWeather('clear',0);q.encounter.missiles.mode='OFF';
  return {point:p.toArray(),actor:actor.toArray()};
 });
}

// The three retired auto-traversal Y cases are replaced by stationary real-input cases in phase9.browser.spec.mjs.

test('Phase 8 real L input heats and cuts source geometry, then cools without losing saved damage',async({page},info)=>{
 const errors=await boot(page);await tower(page);await page.waitForTimeout(800);await page.keyboard.down('l');await page.waitForFunction(()=>window.__AEGIS__.city.architecture.totalBroken>0,null,{timeout:5000});
 const hot=await page.evaluate(()=>{const q=window.__AEGIS__;return {beam:q.encounter.hands.beamSeconds,scars:q.city.architecture.effects.serialize(),broken:q.city.architecture.totalBroken};});await page.keyboard.up('l');
 expect(hot.beam).toBeGreaterThan(.25);expect(hot.scars.some(s=>s.energy>0)).toBe(true);expect(hot.broken).toBeGreaterThan(0);
 await page.waitForTimeout(10000);const cold=await page.evaluate(()=>window.__AEGIS__.city.exportDestruction());expect(cold.scars.length).toBeGreaterThan(0);expect(Math.max(...cold.scars.map(s=>s.energy))).toBeLessThan(.25);expect(cold.buildings[0].broken.length).toBeGreaterThan(0);expect(errors).toEqual([]);await info.attach('thermal-state',{body:JSON.stringify({hot,cold}),contentType:'application/json'});
});

test('Phase 8 real O/F inputs latch demolition, increase building damage and respect cooldown',async({page},info)=>{
 const errors=await boot(page);await tower(page);
 await page.keyboard.press('f');await page.waitForFunction(()=>window.__AEGIS__.encounter.missiles.launches===2);await page.waitForFunction(()=>window.__AEGIS__.city.architecture.totalBroken>0);
 const standard=await page.evaluate(()=>({launches:window.__AEGIS__.encounter.missiles.launches,broken:window.__AEGIS__.city.architecture.totalBroken,effects:window.__AEGIS__.city.architecture.effects.diagnostics()}));expect(standard.effects.explosions.emitters).toBeGreaterThan(0);
 await page.waitForTimeout(850);await page.keyboard.press('o');await page.waitForFunction(()=>window.__AEGIS__.encounter.missiles.demolition);await page.keyboard.press('f');await page.waitForFunction(()=>window.__AEGIS__.encounter.missiles.launches===5);await page.waitForTimeout(450);
 const heavy=await page.evaluate(()=>{const q=window.__AEGIS__;return {launches:q.encounter.missiles.launches,remaining:q.encounter.missiles.demolitionRemaining,broken:q.city.architecture.totalBroken,energy:q.player.energy};});await page.keyboard.press('f');await page.waitForTimeout(500);expect(await page.evaluate(()=>window.__AEGIS__.encounter.missiles.launches)).toBe(5);expect(heavy.remaining).toBeGreaterThan(2.8);expect(heavy.broken).toBeGreaterThan(standard.broken);expect(errors).toEqual([]);await info.attach('missile-state',{body:JSON.stringify({standard,heavy}),contentType:'application/json'});
});

test('Phase 8 progressive collapse during rain stays bounded and survives a city snapshot restore',async({page},info)=>{
 const errors=await boot(page);await tower(page);const sample=await page.evaluate(async()=>{const q=window.__AEGIS__,a=q.city.architecture;q.city.setWeather('heavy-rain',0);q.city.weather.setTime(23);q.city.weather.wetness=1;a.demonstrate(235,'structure');await new Promise(r=>setTimeout(r,500));const partial=a.diagnostics();a.demonstrate(235,'collapse');const samples=[];const until=performance.now()+12000;while(performance.now()<until&&a.diagnostics().states.some(s=>s.collapsePending)){samples.push(a.diagnostics());await new Promise(r=>setTimeout(r,50));}const save=q.city.exportDestruction();await q.city.restoreDestruction(save);return {partial,samples,after:a.diagnostics(),save};});
 expect(sample.partial.states.find(s=>s.id===235).stage).toBe('partial');expect(sample.samples.every(s=>s.activeDebris<=s.debrisCap&&s.effects.particles<=s.effects.particleCap)).toBe(true);expect(sample.after.states.find(s=>s.id===235).stage).toBe('collapsed');expect(sample.after.states.find(s=>s.id===235).collapsePending).toBe(false);expect(errors).toEqual([]);await info.attach('collapse-state',{body:JSON.stringify(sample),contentType:'application/json'});
});

test('Phase 8 demolition missiles retain the original direct enemy damage',async({page},info)=>{
 const errors=await boot(page);
 await page.evaluate(()=>{const q=window.__AEGIS__;q.start(true);const target=q.encounter.enemies[1];for(const enemy of q.encounter.enemies){enemy.update=()=>{};if(enemy!==target)enemy.health=0;}
  window.phase8EnemyHits=[];const hit=target.hit.bind(target);target.hit=(amount,direction)=>{window.phase8EnemyHits.push(amount);hit(amount,direction);};
  const delta=target.position.clone().sub(q.player.position);q.camera.yaw=Math.atan2(delta.x,delta.z);q.camera.pitch=0;q.encounter.targeting.lock(target);q.encounter.missiles.mode='HARD';
 });await page.waitForTimeout(600);await page.keyboard.press('o');await page.waitForFunction(()=>window.__AEGIS__.encounter.missiles.demolition);await page.keyboard.press('f');await page.waitForFunction(()=>window.__AEGIS__.encounter.missiles.hits>0,null,{timeout:8000});
 const data=await page.evaluate(()=>({hits:window.phase8EnemyHits,demolition:window.__AEGIS__.encounter.missiles.demolition,launches:window.__AEGIS__.encounter.missiles.launches}));expect(data.demolition).toBe(true);expect(data.hits.length).toBeGreaterThan(0);expect(data.hits.every(n=>n===38)).toBe(true);expect(errors).toEqual([]);await info.attach('enemy-damage',{body:JSON.stringify(data),contentType:'application/json'});
});
