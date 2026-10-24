import {test,expect} from '@playwright/test';
async function boot(page,range=false){
  await page.addInitScript(()=>localStorage.setItem('aegis-quality','LOW'));
  await page.goto('/?qa=1');await page.waitForFunction(()=>window.__AEGIS__);
  await page.evaluate(r=>window.__AEGIS__.start(r),range);await page.waitForTimeout(500);
}
async function key(page,key,ms=80){await page.keyboard.down(key);await page.waitForTimeout(ms);await page.keyboard.up(key);}

test('latest pilot walks and runs into authored city collision and stands on an industrial roof',async({page})=>{
  await boot(page);await key(page,'t');await page.waitForFunction(()=>window.__AEGIS__.player.form==='pilot'&&!window.__AEGIS__.player.changingForm);
  const setup=await page.evaluate(async()=>{const {RAPIER}=await import('/src/physics/PhysicsWorld.ts');const q=window.__AEGIS__,b=q.city.layout.buildings.find(b=>b.style==='residential');
    q.teleport(q.player.position.clone().set(b.x-b.w/2-3,.3,b.z));q.camera.yaw=Math.PI/2;
    q.physics.world.step();const handles=new Set(q.city.collision.byBuilding.get(b.id).map(c=>c.handle)),origin=q.player.position.clone().add(q.player.position.clone().set(0,1.3,0));const hit=q.physics.world.castRayAndGetNormal(new RAPIER.Ray(origin,{x:1,y:0,z:0}),50,true,undefined,undefined,undefined,q.player.body.body,c=>handles.has(c.handle));
    return {wall:q.player.position.x+(hit?.timeOfImpact??3),start:q.player.position.x};});
  await key(page,'w',650);await page.keyboard.down('ShiftLeft');await key(page,'w',2300);await page.keyboard.up('ShiftLeft');
  const walk=await page.evaluate(()=>({x:window.__AEGIS__.player.position.x,form:window.__AEGIS__.player.form,grounded:window.__AEGIS__.player.body.grounded}));
  expect(walk.form).toBe('pilot');expect(walk.x).toBeGreaterThan(setup.start+1.2);expect(walk.x).toBeLessThan(setup.wall-.2);expect(walk.x).toBeGreaterThan(setup.wall-1.5);expect(walk.grounded).toBe(true);
  const roof=await page.evaluate(()=>{const q=window.__AEGIS__,b=q.city.layout.buildings.find(b=>b.style==='industrial');
    q.teleport(q.player.position.clone().set(b.x+b.w*.15,b.h+.8,b.z-b.d*.16));q.player.state='FALL';return b.h;});
  await page.waitForFunction(h=>{const p=window.__AEGIS__.player;return p.body.grounded&&Math.abs(p.position.y-h)<.2&&!p.ragdoll.active;},roof);
});

test('real climb passes the old ceiling, powered recovery works, and the world edge returns safely',async({page})=>{
  await boot(page);await page.evaluate(()=>{const q=window.__AEGIS__;q.teleport(q.player.position.clone().set(128,.3,-320));});
  await page.waitForFunction(()=>window.__AEGIS__.player.body.grounded);await key(page,'e');await key(page,'Space',15000);
  expect(await page.evaluate(()=>window.__AEGIS__.player.position.y)).toBeGreaterThan(175);
  await key(page,'e');await page.waitForTimeout(350);expect(await page.evaluate(()=>window.__AEGIS__.player.falling)).toBe(true);
  await key(page,'e');await page.waitForTimeout(500);expect(await page.evaluate(()=>window.__AEGIS__.player.powered)).toBe(true);
  await page.evaluate(()=>{const q=window.__AEGIS__;q.player.body.teleport(q.player.position.clone().set(1220,300,-320));});
  await page.waitForFunction(()=>window.__AEGIS__.city.recovery.recoveries>0);
  const result=await page.evaluate(()=>({point:window.__AEGIS__.player.position.toArray(),mode:window.aegisDiagnostics().mode}));
  expect(Math.abs(result.point[0])).toBeLessThan(1024);expect(result.point[1]).toBeGreaterThan(-.1);expect(result.mode).toBe('play');
});

test('intact source buildings occlude targeting; sustained weapons open persistent holes',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await boot(page);
  const setup=await page.evaluate(async()=>{const {RAPIER}=await import('/src/physics/PhysicsWorld.ts');const q=window.__AEGIS__;q.start(true);const b=q.city.layout.buildings.find(b=>b.id===235),enemy=q.encounter.enemies[1];
    // Freeze the range actors before asynchronous asset loading can run combat.
    for(const e of q.encounter.enemies){e.update=()=>{};if(e!==enemy)e.health=0;}
    await q.city.assets.ensure(b.family,b.assetHeight,'near');
    // Place the target behind the near facade, before the far facade/core, so this
    // checks one persistent penetration rather than assuming a whole-building hole.
    enemy.body.teleport(enemy.position.clone().set(b.x-b.w/2+8,6,b.z));
    q.teleport(q.player.position.clone().set(b.x-b.w/2-12,6,b.z));q.player.state='HOVER';q.camera.yaw=Math.PI/2;q.camera.pitch=0;
    q.encounter.targeting.reset();q.encounter.missiles.mode='OFF';window.integrationImpacts=[];
    for(const system of [q.encounter.missiles,q.encounter.projectiles]){const original=system.onImpact;system.onImpact=(point,...args)=>{window.integrationImpacts.push(point.toArray());original?.(point,...args);};}
    q.physics.world.step();const handles=new Set(q.city.collision.byBuilding.get(b.id).map(c=>c.handle)),origin=q.player.position.clone().add(q.player.position.clone().set(0,1.3,0)),hit=q.physics.world.castRayAndGetNormal(new RAPIER.Ray(origin,{x:1,y:0,z:0}),50,true,undefined,undefined,undefined,q.player.body.body,c=>handles.has(c.handle));return {wall:origin.x+(hit?.timeOfImpact??12)};});
  await page.waitForFunction(()=>{const e=window.__AEGIS__.encounter;return !!e.targeting.contact(e.enemies[1]);});const sight=await page.evaluate(()=>{const e=window.__AEGIS__.encounter;return {soft:!!e.targeting.soft,visible:e.targeting.contact(e.enemies[1])?.visible};});
  expect(sight.visible).toBe(false);expect(sight.soft).toBe(false);
  await key(page,'f');await page.waitForFunction(()=>window.__AEGIS__.encounter.missiles.launches===2);await page.waitForTimeout(1000);
  await key(page,'z',1100);await page.waitForTimeout(300);await key(page,'l',1400);
  const result=await page.evaluate(()=>{const q=window.__AEGIS__,e=q.encounter;return {health:e.enemies[1].health,hits:e.missiles.hits,shots:e.hands.shots,beam:e.hands.beamSeconds,end:e.hands.beamEnd.toArray(),impacts:window.integrationImpacts,broken:q.city.architecture.diagnostics().brokenComponents};});
  expect(result.broken).toBeGreaterThan(0);expect(result.health).toBeLessThan(95);expect(result.hits).toBe(0);expect(result.shots).toBeGreaterThan(1);expect(result.beam).toBeGreaterThan(.3);
  expect(result.impacts.length).toBeGreaterThan(2);expect(result.impacts.some(p=>Math.abs(p[0]-setup.wall)<.5)).toBe(true);expect(errors).toEqual([]);
});

test('all ten weather presets, audio toggle and repeated world construction/disposal coexist with the current hero',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>localStorage.setItem('aegis-quality','LOW'));await page.goto('/?qa=1');await page.waitForFunction(()=>window.__AEGIS__);
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('#audio-toggle').uncheck();
  expect(await page.evaluate(()=>window.__AEGIS__.city.audio.enabled)).toBe(false);await page.getByRole('button',{name:'Close dialog'}).click();
  await page.evaluate(()=>{const q=window.__AEGIS__;q.start();q.teleport(q.player.position.clone().set(128,80,-320));q.player.state='HOVER';});
  for(const weather of ['clear','partly-cloudy','overcast','light-rain','heavy-rain','thunderstorm','fog','light-snow','heavy-snow','windy']){
    await page.evaluate(w=>{const c=window.__AEGIS__.city;c.setWeather(w,0);c.weather.setTime(23);if(w==='thunderstorm')c.triggerLightning();},weather);await page.waitForTimeout(120);
    expect(await page.evaluate(()=>window.__AEGIS__.city.diagnostics().weather)).toBe(weather);
  }
  const loads=await page.evaluate(async()=>{
    const [{City},{PhysicsWorld},{Scene},{getQualitySettings}]=await Promise.all([import('/src/world/City.ts'),import('/src/physics/PhysicsWorld.ts'),import('/node_modules/.vite/deps/three.js'),import('/src/config.ts')]);const out=[];
    for(let i=0;i<3;i++){const physics=new PhysicsWorld(),city=new City(new Scene(),getQualitySettings('LOW'),physics);await city.ready;const before=physics.world.colliders.len(),covered=city.collision.byBuilding.size,planned=city.layout.buildings.length;city.dispose();city.dispose();out.push({before,covered,planned,after:physics.world.colliders.len(),parts:city.assets.parts.size});physics.dispose();}
    return out;
  });expect(loads.every(x=>x.covered===x.planned&&x.before<x.planned*8&&x.after===0&&x.parts===0)).toBe(true);expect(errors).toEqual([]);
});

test('flight passes under the authored bridge and a fast fall lands on an industrial crane platform',async({page})=>{
  await boot(page);await page.evaluate(()=>{const q=window.__AEGIS__;q.teleport(q.player.position.clone().set(928,10,483));q.player.state='CRUISE';q.camera.yaw=0;q.camera.pitch=0;});
  await page.keyboard.down('w');await page.waitForFunction(()=>window.__AEGIS__.player.position.z>535,null,{timeout:6000});await page.keyboard.up('w');const under=await page.evaluate(()=>({point:window.__AEGIS__.player.position.toArray(),crashes:window.__AEGIS__.player.crashCount}));
  expect(under.point[2]).toBeGreaterThan(535);expect(under.point[1]).toBeGreaterThan(8);expect(under.point[1]).toBeLessThan(14);expect(under.crashes).toBe(0);
  await page.evaluate(()=>{const q=window.__AEGIS__;q.teleport(q.player.position.clone().set(781.5,40,654));q.player.state='FALL';q.player.velocity.set(0,-30,0);});
  await page.waitForFunction(()=>{const p=window.__AEGIS__.player;return p.body.grounded&&Math.abs(p.position.y-31)<.2;});
  const fall=await page.evaluate(()=>{const p=window.__AEGIS__.player;return {landing:p.lastLanding?.tier,speed:p.lastLanding?.speed,ragdoll:p.ragdoll.active};});
  expect(fall.speed).toBeGreaterThan(30);expect(fall.landing).toBe('heavy');expect(fall.ragdoll).toBe(false);
});
