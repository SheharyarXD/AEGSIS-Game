# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: phase8.browser.spec.mjs >> Phase 8 real O/F inputs latch demolition, increase building damage and respect cooldown
- Location: tests\phase8.browser.spec.mjs:47:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - generic "AEGIS 3D game viewport" [ref=e3]
    - generic:
      - banner:
        - generic: Λ
        - generic:
          - strong: AEGIS
          - generic: RISE OF THE TITAN
      - generic: AER–7 / VANGUARD SYSTEMS
      - generic:
        - generic:
          - text: OPERATION BREAKWATER
          - generic:
            - generic: ◇
            - strong: Fly the calibration corridor
          - paragraph: E to take off. Space climbs. Q brakes. Pass through each gate.
          - generic: 0 / 4 FLIGHT GATES
        - generic:
          - generic: W
          - generic: "240"
          - generic: "N"
          - generic: "300"
          - generic: "N"
        - generic:
          - generic: ◇
          - text: 303 M
        - generic:
          - generic:
            - generic: AER–7
            - generic: HOVER
          - generic:
            - generic: ARMOR INTEGRITY
            - generic: "100"
          - generic:
            - generic: REACTOR
            - generic: 99%
        - generic:
          - generic:
            - generic: "000"
            - generic: KM/H
          - generic:
            - text: ALT
            - strong: "018"
            - text: M
          - text: MSL 6 · OFF
        - generic:
          - generic: E Flight
          - generic: SHIFT Boost
          - generic: Q Brake
          - generic: H Controls
  - status: DEMOLITION 5× · 22 ENERGY / SHOT
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | 
  3  | const root='artifacts/phase8/live-2026-10-18';
  4  | async function boot(page){
  5  |  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  6  |  await page.addInitScript(()=>localStorage.setItem('aegis-quality','LOW'));await page.goto('/?qa=1');await page.waitForFunction(()=>window.__AEGIS__,null,{timeout:180000});
  7  |  await page.evaluate(()=>window.__AEGIS__.start());return errors;
  8  | }
  9  | async function tower(page){
  10 |  return page.evaluate(async()=>{
  11 |   const q=window.__AEGIS__,b=q.city.layout.buildings.find(b=>b.id===235),family=q.city.assets.catalog.families.find(f=>f.id===b.family);
  12 |   await q.city.assets.ensure(b.family,b.assetHeight,'near');
  13 |   const c=q.city.assets.catalog.components.filter(c=>c.family===b.family&&c.kind==='glass'&&c.side===0).sort((a,b)=>Math.abs(a.floor-4)-Math.abs(b.floor-4))[0];
  14 |   const p=q.player.position.clone().fromArray(c.center).multiply(q.player.position.clone().set(b.w/family.width,b.h/b.assetHeight,b.d/family.depth)).add(q.player.position.clone().set(b.x,0,b.z));
  15 |   const eye=p.clone().add(q.player.position.clone().set(7,3,36)),actor=p.clone().add(q.player.position.clone().set(0,-2,26)),aim=p.clone().sub(eye).normalize();
  16 |   q.teleport(actor);q.player.state='HOVER';q.camera.yaw=Math.atan2(aim.x,aim.z);q.camera.pitch=Math.asin(aim.y);q.city.setCaptureView(eye.toArray(),p.toArray());
  17 |   q.city.prepareAt(actor);await q.city.assets.idle();q.city.prepareAt(actor);await q.city.assets.idle();q.city.weather.setTime(20);q.city.setWeather('clear',0);q.encounter.missiles.mode='OFF';
  18 |   return {point:p.toArray(),actor:actor.toArray()};
  19 |  });
  20 | }
  21 | 
  22 | for(const fixture of [
  23 |  {name:'mid-rise',id:287,point:[172,11,-220],yaw:0},
  24 |  {name:'glass tower',id:235,point:[172,23,-132.4416],yaw:Math.PI},
  25 |  {name:'Gothic landmark',id:211,point:[-540,23,-341.41985],yaw:Math.PI},
  26 | ])test(`Phase 8 real Y input crosses ${fixture.name} with the normal controller and persistent holes`,async({page},info)=>{
  27 |  const errors=await boot(page);
  28 |  await page.evaluate(async f=>{const q=window.__AEGIS__,b=q.city.layout.buildings.find(b=>b.id===f.id);q.teleport(q.player.position.clone().fromArray(f.point));q.player.state='HOVER';q.camera.yaw=f.yaw;q.camera.pitch=0;q.city.prepareAt(q.player.position);await q.city.assets.ensure(b.family,b.assetHeight,'near');await q.city.assets.idle();},fixture);
  29 |  await page.keyboard.down('w');await page.waitForTimeout(2200);
  30 |  await page.evaluate(()=>{const q=window.__AEGIS__;window.phase8Motion=[];window.phase8Sampling=true;const sample=()=>{if(!window.phase8Sampling)return;window.phase8Motion.push({t:performance.now(),steps:q.physics.steps,p:q.player.position.toArray(),enabled:q.player.body.body.isEnabled(),energy:q.player.energy,crashes:q.player.crashCount,...q.titan.diagnostics()});requestAnimationFrame(sample);};requestAnimationFrame(sample);});
  31 |  await page.keyboard.press('y');await page.waitForFunction(()=>window.__AEGIS__.titan.exits===1,null,{timeout:10000});await page.keyboard.up('w');await page.keyboard.down('q');await page.waitForTimeout(280);await page.keyboard.up('q');
  32 |  const result=await page.evaluate(()=>{window.phase8Sampling=false;const q=window.__AEGIS__;return {samples:window.phase8Motion,save:q.city.exportDestruction(),crashes:q.player.crashCount};});
  33 |  const samples=result.samples;expect(samples.some(s=>s.state==='inside')).toBe(true);expect(samples.every(s=>s.enabled)).toBe(true);expect(Math.min(...samples.map(s=>s.energy))).toBeLessThan(75);expect(result.crashes).toBe(0);
  34 |  for(let i=1;i<samples.length;i++){const a=samples[i-1],b=samples[i],travel=Math.hypot(...b.p.map((n,j)=>n-a.p[j]));expect(travel).toBeLessThanOrEqual(70*(b.steps-a.steps)/60+.15);}
  35 |  expect(result.save.breaches).toHaveLength(1);expect(result.save.breaches[0].exitOpen).toBe(true);
  36 |  const restored=await page.evaluate(async save=>{const q=window.__AEGIS__;const broken=save.buildings[0].broken.length;q.teleport(q.player.position.clone().set(740,140,700));q.player.state='HOVER';await new Promise(r=>setTimeout(r,350));await q.city.restoreDestruction(save);return {broken,after:q.city.exportDestruction().buildings[0].broken.length,exit:q.city.exportDestruction().breaches[0].exitOpen};},result.save);
  37 |  expect(restored.after).toBe(restored.broken);expect(restored.exit).toBe(true);expect(errors).toEqual([]);await info.attach('physical-trajectory',{body:JSON.stringify(result),contentType:'application/json'});
  38 | });
  39 | 
  40 | test('Phase 8 real L input heats and cuts source geometry, then cools without losing saved damage',async({page},info)=>{
  41 |  const errors=await boot(page);await tower(page);await page.waitForTimeout(800);await page.keyboard.down('l');await page.waitForTimeout(750);
  42 |  const hot=await page.evaluate(()=>{const q=window.__AEGIS__;return {beam:q.encounter.hands.beamSeconds,scars:q.city.architecture.effects.serialize(),broken:q.city.architecture.totalBroken};});await page.keyboard.up('l');
  43 |  expect(hot.beam).toBeGreaterThan(.25);expect(hot.scars.some(s=>s.energy>0)).toBe(true);expect(hot.broken).toBeGreaterThan(0);
  44 |  await page.waitForTimeout(5500);const cold=await page.evaluate(()=>window.__AEGIS__.city.exportDestruction());expect(cold.scars.length).toBeGreaterThan(0);expect(Math.max(...cold.scars.map(s=>s.energy))).toBeLessThan(.25);expect(cold.buildings[0].broken.length).toBeGreaterThan(0);expect(errors).toEqual([]);await info.attach('thermal-state',{body:JSON.stringify({hot,cold}),contentType:'application/json'});
  45 | });
  46 | 
  47 | test('Phase 8 real O/F inputs latch demolition, increase building damage and respect cooldown',async({page},info)=>{
  48 |  const errors=await boot(page);await tower(page);
  49 |  await page.keyboard.press('f');await page.waitForFunction(()=>window.__AEGIS__.encounter.missiles.launches===2);await page.waitForFunction(()=>window.__AEGIS__.city.architecture.totalBroken>0);
  50 |  const standard=await page.evaluate(()=>({launches:window.__AEGIS__.encounter.missiles.launches,broken:window.__AEGIS__.city.architecture.totalBroken,effects:window.__AEGIS__.city.architecture.effects.diagnostics()}));expect(standard.effects.explosions.emitters).toBeGreaterThan(0);
> 51 |  await page.waitForTimeout(850);await page.keyboard.press('o');expect(await page.evaluate(()=>window.__AEGIS__.encounter.missiles.demolition)).toBe(true);await page.keyboard.press('f');await page.waitForFunction(()=>window.__AEGIS__.encounter.missiles.launches===4);await page.waitForTimeout(450);
     |                                                                                                                                                ^ Error: expect(received).toBe(expected) // Object.is equality
  52 |  const heavy=await page.evaluate(()=>{const q=window.__AEGIS__;return {launches:q.encounter.missiles.launches,remaining:q.encounter.missiles.demolitionRemaining,broken:q.city.architecture.totalBroken,energy:q.player.energy};});await page.keyboard.press('f');await page.waitForTimeout(500);expect(await page.evaluate(()=>window.__AEGIS__.encounter.missiles.launches)).toBe(4);expect(heavy.remaining).toBeGreaterThan(6);expect(heavy.broken).toBeGreaterThan(standard.broken);expect(errors).toEqual([]);await info.attach('missile-state',{body:JSON.stringify({standard,heavy}),contentType:'application/json'});
  53 | });
  54 | 
  55 | test('Phase 8 progressive collapse during rain stays bounded and survives a city snapshot restore',async({page},info)=>{
  56 |  const errors=await boot(page);await tower(page);const sample=await page.evaluate(async()=>{const q=window.__AEGIS__,a=q.city.architecture;q.city.setWeather('heavy-rain',0);q.city.weather.setTime(23);q.city.weather.wetness=1;a.demonstrate(235,'structure');await new Promise(r=>setTimeout(r,500));const partial=a.diagnostics();a.demonstrate(235,'collapse');const samples=[];const until=performance.now()+12000;while(performance.now()<until&&a.diagnostics().states.some(s=>s.collapsePending)){samples.push(a.diagnostics());await new Promise(r=>setTimeout(r,50));}const save=q.city.exportDestruction();await q.city.restoreDestruction(save);return {partial,samples,after:a.diagnostics(),save};});
  57 |  expect(sample.partial.states.find(s=>s.id===235).stage).toBe('partial');expect(sample.samples.every(s=>s.activeDebris<=s.debrisCap&&s.effects.particles<=s.effects.particleCap)).toBe(true);expect(sample.after.states.find(s=>s.id===235).stage).toBe('collapsed');expect(sample.after.states.find(s=>s.id===235).collapsePending).toBe(false);expect(errors).toEqual([]);await info.attach('collapse-state',{body:JSON.stringify(sample),contentType:'application/json'});
  58 | });
  59 | 
```