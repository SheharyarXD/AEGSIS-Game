# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: integration.browser.spec.mjs >> intact source buildings occlude targeting; sustained weapons open persistent holes
- Location: tests\integration.browser.spec.mjs:35:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
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
          - strong: Breach the checkpoint
        - paragraph: J punches · R heavy · G grabs and throws · B guards · X dodges. Defeated bodies can also be thrown.
        - generic: 3/3 ENFORCERS · ○ THROW · ○ BREACH
      - generic:
        - generic: W
        - generic: "240"
        - generic: "N"
        - generic: "300"
        - generic: "N"
      - generic:
        - generic: ◇
        - text: 225 M
      - generic:
        - generic:
          - generic: AER–7
          - generic: HOVER
        - generic:
          - generic: ARMOR INTEGRITY
          - generic: "100"
        - generic:
          - generic: REACTOR
          - generic: 78%
      - generic:
        - generic:
          - generic: "000"
          - generic: KM/H
        - generic:
          - text: ALT
          - strong: "006"
          - text: M
        - text: MSL 7 · OFF
      - generic:
        - generic: E Flight
        - generic: SHIFT Boost
        - generic: Q Brake
        - generic: H Controls
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | async function boot(page,range=false){
  3  |   await page.addInitScript(()=>localStorage.setItem('aegis-quality','LOW'));
  4  |   await page.goto('/?qa=1');await page.waitForFunction(()=>window.__AEGIS__);
  5  |   await page.evaluate(r=>window.__AEGIS__.start(r),range);await page.waitForTimeout(500);
  6  | }
  7  | async function key(page,key,ms=80){await page.keyboard.down(key);await page.waitForTimeout(ms);await page.keyboard.up(key);}
  8  | 
  9  | test('latest pilot walks and runs into authored city collision and stands on an industrial roof',async({page})=>{
  10 |   await boot(page);await key(page,'t');await page.waitForFunction(()=>window.__AEGIS__.player.form==='pilot'&&!window.__AEGIS__.player.changingForm);
  11 |   const setup=await page.evaluate(async()=>{const {RAPIER}=await import('/src/physics/PhysicsWorld.ts');const q=window.__AEGIS__,b=q.city.layout.buildings.find(b=>b.style==='residential');
  12 |     q.teleport(q.player.position.clone().set(b.x-b.w/2-3,.3,b.z));q.camera.yaw=Math.PI/2;
  13 |     q.physics.world.step();const handles=new Set(q.city.collision.byBuilding.get(b.id).map(c=>c.handle)),origin=q.player.position.clone().add(q.player.position.clone().set(0,1.3,0));const hit=q.physics.world.castRayAndGetNormal(new RAPIER.Ray(origin,{x:1,y:0,z:0}),50,true,undefined,undefined,undefined,q.player.body.body,c=>handles.has(c.handle));
  14 |     return {wall:q.player.position.x+(hit?.timeOfImpact??3),start:q.player.position.x};});
  15 |   await key(page,'w',650);await page.keyboard.down('ShiftLeft');await key(page,'w',2300);await page.keyboard.up('ShiftLeft');
  16 |   const walk=await page.evaluate(()=>({x:window.__AEGIS__.player.position.x,form:window.__AEGIS__.player.form,grounded:window.__AEGIS__.player.body.grounded}));
  17 |   expect(walk.form).toBe('pilot');expect(walk.x).toBeGreaterThan(setup.start+1.2);expect(walk.x).toBeLessThan(setup.wall-.2);expect(walk.x).toBeGreaterThan(setup.wall-1.5);expect(walk.grounded).toBe(true);
  18 |   const roof=await page.evaluate(()=>{const q=window.__AEGIS__,b=q.city.layout.buildings.find(b=>b.style==='industrial');
  19 |     q.teleport(q.player.position.clone().set(b.x+b.w*.15,b.h+.8,b.z-b.d*.16));q.player.state='FALL';return b.h;});
  20 |   await page.waitForFunction(h=>{const p=window.__AEGIS__.player;return p.body.grounded&&Math.abs(p.position.y-h)<.2&&!p.ragdoll.active;},roof);
  21 | });
  22 | 
  23 | test('real climb passes the old ceiling, powered recovery works, and the world edge returns safely',async({page})=>{
  24 |   await boot(page);await page.evaluate(()=>{const q=window.__AEGIS__;q.teleport(q.player.position.clone().set(128,.3,-320));});
  25 |   await page.waitForFunction(()=>window.__AEGIS__.player.body.grounded);await key(page,'e');await key(page,'Space',15000);
  26 |   expect(await page.evaluate(()=>window.__AEGIS__.player.position.y)).toBeGreaterThan(175);
  27 |   await key(page,'e');await page.waitForTimeout(350);expect(await page.evaluate(()=>window.__AEGIS__.player.falling)).toBe(true);
  28 |   await key(page,'e');await page.waitForTimeout(500);expect(await page.evaluate(()=>window.__AEGIS__.player.powered)).toBe(true);
  29 |   await page.evaluate(()=>{const q=window.__AEGIS__;q.player.body.teleport(q.player.position.clone().set(1220,300,-320));});
  30 |   await page.waitForFunction(()=>window.__AEGIS__.city.recovery.recoveries>0);
  31 |   const result=await page.evaluate(()=>({point:window.__AEGIS__.player.position.toArray(),mode:window.aegisDiagnostics().mode}));
  32 |   expect(Math.abs(result.point[0])).toBeLessThan(1024);expect(result.point[1]).toBeGreaterThan(-.1);expect(result.mode).toBe('play');
  33 | });
  34 | 
  35 | test('intact source buildings occlude targeting; sustained weapons open persistent holes',async({page},info)=>{
  36 |   const errors=[];page.on('pageerror',e=>errors.push(e.message));await boot(page);
  37 |   const setup=await page.evaluate(async()=>{const {RAPIER}=await import('/src/physics/PhysicsWorld.ts');const q=window.__AEGIS__;q.start(true);const b=q.city.layout.buildings.find(b=>b.id===235),enemy=q.encounter.enemies[1];
  38 |     // Freeze the range actors before asynchronous asset loading can run combat.
  39 |     for(const e of q.encounter.enemies){e.update=()=>{};if(e!==enemy)e.health=0;}
  40 |     await q.city.assets.ensure(b.family,b.assetHeight,'near');
  41 |     // Place the target behind the near facade, before the far facade/core, so this
  42 |     // checks one persistent penetration rather than assuming a whole-building hole.
  43 |     enemy.body.teleport(enemy.position.clone().set(b.x-b.w/2+8,6,b.z));
  44 |     q.teleport(q.player.position.clone().set(b.x-b.w/2-12,6,b.z));q.player.state='HOVER';q.camera.yaw=Math.PI/2;q.camera.pitch=0;
  45 |     q.encounter.targeting.reset();q.encounter.missiles.mode='OFF';window.integrationImpacts=[];
  46 |     for(const system of [q.encounter.missiles,q.encounter.projectiles]){const original=system.onImpact;system.onImpact=(point,...args)=>{window.integrationImpacts.push(point.toArray());original?.(point,...args);};}
  47 |     q.physics.world.step();const handles=new Set(q.city.collision.byBuilding.get(b.id).map(c=>c.handle)),origin=q.player.position.clone().add(q.player.position.clone().set(0,1.3,0)),hit=q.physics.world.castRayAndGetNormal(new RAPIER.Ray(origin,{x:1,y:0,z:0}),50,true,undefined,undefined,undefined,q.player.body.body,c=>handles.has(c.handle));return {wall:origin.x+(hit?.timeOfImpact??12)};});
  48 |   await page.waitForFunction(()=>{const e=window.__AEGIS__.encounter;return !!e.targeting.contact(e.enemies[1]);});const sight=await page.evaluate(()=>{const e=window.__AEGIS__.encounter;return {soft:!!e.targeting.soft,visible:e.targeting.contact(e.enemies[1])?.visible};});
  49 |   expect(sight.visible).toBe(false);expect(sight.soft).toBe(false);
  50 |   await key(page,'f');await page.waitForFunction(()=>window.__AEGIS__.encounter.missiles.launches===2);await page.waitForTimeout(1000);
  51 |   await key(page,'z',1100);await page.waitForTimeout(300);await key(page,'l',1400);
  52 |   const result=await page.evaluate(()=>{const q=window.__AEGIS__,e=q.encounter;return {health:e.enemies[1].health,hits:e.missiles.hits,shots:e.hands.shots,beam:e.hands.beamSeconds,end:e.hands.beamEnd.toArray(),impacts:window.integrationImpacts,broken:q.city.architecture.diagnostics().brokenComponents};});
  53 |   await info.attach('weapon-impact-coordinates',{body:JSON.stringify({setup,result}),contentType:'application/json'});
  54 |   expect(result.broken).toBeGreaterThan(0);expect(result.health).toBeLessThan(95);expect(result.hits).toBe(0);expect(result.shots).toBeGreaterThan(1);expect(result.beam).toBeGreaterThan(.3);
> 55 |   expect(result.impacts.length).toBeGreaterThan(2);expect(result.impacts.some(p=>Math.abs(p[0]-setup.wall)<.5)).toBe(true);expect(errors).toEqual([]);
     |                                                                                                                 ^ Error: expect(received).toBe(expected) // Object.is equality
  56 | });
  57 | 
  58 | test('all ten weather presets, audio toggle and repeated world construction/disposal coexist with the current hero',async({page})=>{
  59 |   const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  60 |   await page.addInitScript(()=>localStorage.setItem('aegis-quality','LOW'));await page.goto('/?qa=1');await page.waitForFunction(()=>window.__AEGIS__);
  61 |   await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('#audio-toggle').uncheck();
  62 |   expect(await page.evaluate(()=>window.__AEGIS__.city.audio.enabled)).toBe(false);await page.getByRole('button',{name:'Close dialog'}).click();
  63 |   await page.evaluate(()=>{const q=window.__AEGIS__;q.start();q.teleport(q.player.position.clone().set(128,80,-320));q.player.state='HOVER';});
  64 |   for(const weather of ['clear','partly-cloudy','overcast','light-rain','heavy-rain','thunderstorm','fog','light-snow','heavy-snow','windy']){
  65 |     await page.evaluate(w=>{const c=window.__AEGIS__.city;c.setWeather(w,0);c.weather.setTime(23);if(w==='thunderstorm')c.triggerLightning();},weather);await page.waitForTimeout(120);
  66 |     expect(await page.evaluate(()=>window.__AEGIS__.city.diagnostics().weather)).toBe(weather);
  67 |   }
  68 |   const loads=await page.evaluate(async()=>{
  69 |     const [{City},{PhysicsWorld},{Scene},{getQualitySettings}]=await Promise.all([import('/src/world/City.ts'),import('/src/physics/PhysicsWorld.ts'),import('/node_modules/.vite/deps/three.js'),import('/src/config.ts')]);const out=[];
  70 |     for(let i=0;i<3;i++){const physics=new PhysicsWorld(),city=new City(new Scene(),getQualitySettings('LOW'),physics);await city.ready;const before=physics.world.colliders.len(),covered=city.collision.byBuilding.size,planned=city.layout.buildings.length;city.dispose();city.dispose();out.push({before,covered,planned,after:physics.world.colliders.len(),parts:city.assets.parts.size});physics.dispose();}
  71 |     return out;
  72 |   });expect(loads.every(x=>x.covered===x.planned&&x.before<x.planned*8&&x.after===0&&x.parts===0)).toBe(true);expect(errors).toEqual([]);
  73 | });
  74 | 
  75 | test('flight passes under the authored bridge and a fast fall lands on an industrial crane platform',async({page})=>{
  76 |   await boot(page);await page.evaluate(()=>{const q=window.__AEGIS__;q.teleport(q.player.position.clone().set(928,10,483));q.player.state='CRUISE';q.camera.yaw=0;q.camera.pitch=0;});
  77 |   await page.keyboard.down('w');await page.waitForFunction(()=>window.__AEGIS__.player.position.z>535,null,{timeout:6000});await page.keyboard.up('w');const under=await page.evaluate(()=>({point:window.__AEGIS__.player.position.toArray(),crashes:window.__AEGIS__.player.crashCount}));
  78 |   expect(under.point[2]).toBeGreaterThan(535);expect(under.point[1]).toBeGreaterThan(8);expect(under.point[1]).toBeLessThan(14);expect(under.crashes).toBe(0);
  79 |   await page.evaluate(()=>{const q=window.__AEGIS__;q.teleport(q.player.position.clone().set(781.5,40,654));q.player.state='FALL';q.player.velocity.set(0,-30,0);});
  80 |   await page.waitForFunction(()=>{const p=window.__AEGIS__.player;return p.body.grounded&&Math.abs(p.position.y-31)<.2;});
  81 |   const fall=await page.evaluate(()=>{const p=window.__AEGIS__.player;return {landing:p.lastLanding?.tier,speed:p.lastLanding?.speed,ragdoll:p.ragdoll.active};});
  82 |   expect(fall.speed).toBeGreaterThan(30);expect(fall.landing).toBe('heavy');expect(fall.ragdoll).toBe(false);
  83 | });
  84 | 
```