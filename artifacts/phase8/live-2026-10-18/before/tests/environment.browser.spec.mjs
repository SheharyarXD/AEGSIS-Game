import {test,expect} from '@playwright/test';
async function boot(page,extra=''){
 await page.addInitScript(()=>localStorage.setItem('aegis-quality','LOW'));
 await page.goto(`/?qa=1${extra}`);await page.waitForFunction(()=>window.__AEGIS__);await page.evaluate(()=>window.__AEGIS__.start());
}
test('all districts, precipitation, sky and material shaders render without errors',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await boot(page);
 for(const [x,z,preset,hour] of [[128,-320,'clear',12],[-576,-260,'partly-cloudy',0],[704,624,'heavy-rain',18],[128,350,'thunderstorm',23],[-512,480,'heavy-snow',10]]){
  await page.evaluate(({x,z,preset,hour})=>{const q=window.__AEGIS__;q.player.body.teleport(q.player.position.clone().set(x,7,z));q.player.state='HOVER';q.city.prepareAt(q.player.position);q.city.setWeather(preset,0);q.city.weather.setTime(hour);},{x,z,preset,hour});
  await page.waitForTimeout(350);
  const d=await page.evaluate(()=>window.__AEGIS__.city.diagnostics());expect(d.tiles).toBeLessThanOrEqual(d.maxTiles);expect(d.pending).toBe(0);expect(d.weather).toBe(preset);
 }
 expect(errors).toEqual([]);
});
test('weather transition, solar lighting, effects cleanup and restart',async({page})=>{
 await boot(page);const result=await page.evaluate(()=>{
  const city=window.__AEGIS__.city;city.weather.setTime(12);city.setWeather('clear',0);city.update(window.__AEGIS__.player.position,100,window.__AEGIS__.camera.camera);
  const day={light:city.sun.intensity,windows:city.materials.uniforms.night.value};city.weather.setTime(0);city.setWeather('heavy-rain',.1);
  for(let i=1;i<=60;i++)city.update(window.__AEGIS__.player.position,100+i/60,window.__AEGIS__.camera.camera);
  const night={light:city.sun.intensity,windows:city.materials.uniforms.night.value},rain=city.diagnostics();
  city.setWeather('heavy-snow',0);city.update(window.__AEGIS__.player.position,102,window.__AEGIS__.camera.camera);const snow=city.diagnostics();
  window.__AEGIS__.reset();return {day,night,rain,snow,reset:city.diagnostics()};
 });
 expect(result.day.light).toBeGreaterThan(result.night.light);expect(result.night.windows).toBeGreaterThan(result.day.windows);expect(result.rain.particles).toBeGreaterThan(500);expect(result.snow.particles).toBeGreaterThan(500);expect(result.reset.particles).toBe(0);expect(result.reset.snowCover).toBe(0);expect(result.reset.wetness).toBe(0);
});
test('repeated cross-city traversal and restarts keep GPU and physics resources bounded',async({page})=>{
 await boot(page);const counts=[];
 // Warm the same route before counting lazily uploaded, frustum-visible GPU buffers.
 for(let loop=-1;loop<3;loop++){
  for(const [x,z] of [[-800,-700],[500,-700],[750,700],[-700,700],[0,58]]){
   await page.evaluate(async({x,z})=>{const q=window.__AEGIS__;q.teleport(q.player.position.clone().set(x,120,z));q.player.state='HOVER';q.city.prepareAt(q.player.position);await q.city.assets.idle();q.city.prepareAt(q.player.position);await q.city.assets.idle();},{x,z});await page.waitForTimeout(150);
  }
  if(loop>=0)counts.push(await page.evaluate(()=>({game:window.aegisDiagnostics(),env:window.__AEGIS__.city.diagnostics(),colliders:window.__AEGIS__.physics.world.colliders.len()})));
 }
 expect(counts[2].game.geometries).toBeLessThanOrEqual(counts[0].game.geometries+2);expect(counts[2].game.textures).toBeLessThanOrEqual(counts[0].game.textures+2);expect(counts[2].colliders).toBe(counts[0].colliders);expect(counts[2].env.tiles).toBeLessThanOrEqual(9);expect(counts[2].env.unloads).toBeGreaterThan(20);
});
test('rooftop landing and swept fast flight work with authored buildings',async({page})=>{
 await boot(page);const result=await page.evaluate(()=>{
  const q=window.__AEGIS__,b=q.city.layout.buildings.find(b=>b.district==='financial');
  q.player.body.teleport(q.player.position.clone().set(b.x+b.w*.15,b.h+5,b.z-b.d*.16));q.player.state='LANDING';q.player.velocity.set(0,-6,0);q.city.prepareAt(q.player.position);return {h:b.h,id:b.id};
 });
 await page.waitForFunction(h=>window.__AEGIS__.player.body.grounded&&Math.abs(window.__AEGIS__.player.position.y-h)<.2,result.h,{timeout:6000});
 const collision=await page.evaluate(()=>{
  const q=window.__AEGIS__,b=q.city.layout.buildings.find(b=>b.district==='industrial');const point=q.player.position.clone().set(b.x-b.w/2-8,b.h*.4,b.z);
  q.player.body.teleport(point);q.physics.world.step();for(let i=0;i<20;i++){q.player.body.move(q.player.velocity.clone().set(200,0,0),1/60,true);q.physics.world.step();q.player.body.sync();}return {x:q.player.position.x,wall:b.x-b.w/2};
 });expect(collision.x).toBeLessThan(collision.wall-.2);
});
test('quality changes preserve layout and collision and debug UI is opt-in',async({page})=>{
 await boot(page);await expect(page.locator('.environment-debug')).toHaveCount(0);
 const results=await page.evaluate(()=>{const q=window.__AEGIS__,signature=q.city.layout.signature(),colliders=q.physics.world.colliders.len();return ['LOW','MEDIUM','HIGH','ULTRA'].map(quality=>{q.city.setQuality(quality);q.city.prepareAt(q.player.position);return {same:q.city.layout.signature()===signature,colliders:q.physics.world.colliders.len()===colliders,tiles:q.city.diagnostics().tiles,max:q.city.diagnostics().maxTiles};});});
 expect(results.every(r=>r.same&&r.colliders&&r.tiles<=r.max)).toBe(true);await page.goto('/?qa=1&envDebug=1');await page.waitForFunction(()=>window.__AEGIS__);await expect(page.locator('.environment-debug')).toBeVisible();
});
test('bridge landing, ramp traversal and environment disposal preserve hero-owned physics',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await boot(page);
 await page.evaluate(()=>{const q=window.__AEGIS__;q.player.body.teleport(q.player.position.clone().set(249,2,-410));q.player.state='LANDING';q.player.velocity.set(0,-6,0);});
 await page.waitForFunction(()=>window.__AEGIS__.player.body.grounded&&Math.abs(window.__AEGIS__.player.position.y-.15)<.08);
 await page.evaluate(()=>{const q=window.__AEGIS__;q.player.body.teleport(q.player.position.clone().set(784,30,512));q.player.state='LANDING';q.player.velocity.set(0,-6,0);q.city.prepareAt(q.player.position);});
 await page.waitForFunction(()=>window.__AEGIS__.player.body.grounded&&Math.abs(window.__AEGIS__.player.position.y-24.75)<.2);
 const ramp=await page.evaluate(()=>{
  const q=window.__AEGIS__;q.player.body.teleport(q.player.position.clone().set(455,4,512));q.physics.world.step();
  for(let i=0;i<660;i++){q.player.body.move(q.player.velocity.clone().set(10,-4,0),1/60,false);q.physics.world.step();q.player.body.sync();}
  return q.player.position.toArray();
 });expect(ramp[0]).toBeGreaterThan(530);expect(ramp[1]).toBeGreaterThan(18);
 const disposal=await page.evaluate(()=>{const q=window.__AEGIS__,before=q.physics.world.colliders.len(),hero=q.player.body.collider.handle,checkpoint=q.destruction.pieces[0].collider.handle;q.city.dispose();q.city.dispose();return {before,after:q.physics.world.colliders.len(),hero:!!q.physics.world.getCollider(hero),checkpoint:!!q.physics.world.getCollider(checkpoint),loaded:q.city.streaming.loaded.size};});
 expect(disposal.after).toBeLessThan(disposal.before-1800);expect(disposal.hero).toBe(true);expect(disposal.checkpoint).toBe(true);expect(disposal.loaded).toBe(0);await page.waitForTimeout(100);expect(errors).toEqual([]);
});
