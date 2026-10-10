import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
async function boot(page){await page.goto('/?qa=1');await page.waitForFunction(()=>window.__AEGIS__);}
async function start(page,range=false){await page.evaluate(r=>window.__AEGIS__.start(r),range);await page.waitForTimeout(150);}
async function key(page,k,ms=70){await page.keyboard.down(k);await page.waitForTimeout(ms);await page.keyboard.up(k);}
async function diagnostics(page){return page.evaluate(()=>window.aegisDiagnostics());}

test('menu, real input traversal, takeoff, braking, pause and resume',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await boot(page);
  await expect(page.getByRole('button',{name:/DEPLOY OPERATIVE/})).toBeVisible();
  await page.getByRole('button',{name:'Controls',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'Close dialog'}).click();
  await page.getByRole('button',{name:/DEPLOY OPERATIVE/}).click();await key(page,'Enter');await page.waitForTimeout(300);
  const initial=await diagnostics(page);await key(page,'d',600);const right=await diagnostics(page);expect(right.position[0]).toBeGreaterThan(initial.position[0]+.8);
  await key(page,'e');await key(page,'Space',600);const up=await diagnostics(page);expect(up.position[1]).toBeGreaterThan(3);
  await key(page,'w',1200);const cruise=await diagnostics(page);expect(cruise.position[2]).toBeLessThan(up.position[2]-8);
  await key(page,'q',1000);const slow=await diagnostics(page);expect(slow.state).toBe('BRAKE');
  await key(page,'Escape');expect((await diagnostics(page)).mode).toBe('paused');const paused=await diagnostics(page);await page.waitForTimeout(200);expect((await diagnostics(page)).position).toEqual(paused.position);
  await page.getByRole('button',{name:/Resume operation/}).click();expect((await diagnostics(page)).mode).toBe('play');expect(errors).toEqual([]);
  await page.screenshot({path:'artifacts/qa-flight.png'});
});

test('heavy punch transfers to jointed ragdoll, wall collision, then recovers',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await boot(page);await start(page,true);
  await page.evaluate(()=>{const q=window.__AEGIS__;q.player.body.teleport(q.player.position.clone().set(-15.8,.22,-66));q.player.object.rotation.y=-Math.PI/2;q.camera.yaw=-Math.PI/2;
    q.encounter.enemies.forEach((e,i)=>{e.body.teleport(e.position.clone().set(i===0?-18.7:10+i*3,.22,i===0?-66:-70));e.health=95;});});
  await key(page,'r');await page.waitForTimeout(900);
  const rag=await page.evaluate(()=>{const e=window.__AEGIS__.encounter.enemies[0];return {hp:e.health,active:e.ragdoll.active,segments:e.ragdoll.segments.map(s=>Object.values(s.body.translation())),x:e.position.x};});
  expect(rag.hp).toBe(53);expect(rag.active).toBe(true);expect(rag.segments.length).toBe(11);expect(rag.segments.flat().every(Number.isFinite)).toBe(true);expect(rag.x).toBeGreaterThan(-22.5);
  await page.screenshot({path:'artifacts/qa-ragdoll-wall.png'});
  await page.waitForTimeout(5500);const after=await page.evaluate(()=>{const e=window.__AEGIS__.encounter.enemies[0];return {active:e.ragdoll.active,position:e.position.toArray()};});expect(after.active).toBe(false);expect(after.position[1]).toBeGreaterThan(-.05);expect(errors).toEqual([]);
});

test('grab, throw, persistent fracture and restart body cleanup',async({page})=>{
  await boot(page);await start(page,true);
  await page.evaluate(()=>{const q=window.__AEGIS__;q.player.body.teleport(q.player.position.clone().set(0,.04,-75));q.player.object.rotation.y=Math.PI;q.camera.yaw=Math.PI;
    q.encounter.enemies.forEach((e,i)=>e.body.teleport(e.position.clone().set(i===0?0:10+i*3,.04,i===0?-77:-68)));});
  await key(page,'g');await page.waitForTimeout(400);const grabbed=await page.evaluate(()=>window.__AEGIS__.encounter.enemies[0].held);expect(grabbed).toBe(true);
  await key(page,'g');await page.waitForTimeout(1500);const data=await diagnostics(page);expect(data.throws).toBe(1);expect(data.broken).toBeGreaterThan(0);expect(data.debris).toBeLessThanOrEqual(56);
  await page.screenshot({path:'artifacts/qa-destruction.png'});
  await page.evaluate(()=>window.__AEGIS__.reset());const reset=await diagnostics(page);expect(reset.bodies).toBe(1);expect(reset.broken).toBe(0);expect(reset.debris).toBe(0);expect(reset.throws).toBe(0);
});

test('flight collision crashes into physical ragdoll and returns control',async({page})=>{
  await boot(page);await start(page);
  await page.evaluate(()=>{const q=window.__AEGIS__;q.player.body.teleport(q.player.position.clone().set(-16,7,-66));q.player.state='CRUISE';q.player.velocity.set(-45,0,0);q.camera.yaw=-Math.PI/2;});
  await page.waitForTimeout(450);const hit=await diagnostics(page);expect(hit.crashes).toBeGreaterThan(0);expect(hit.health).toBeLessThan(100);
  await page.waitForTimeout(6500);const recovered=await page.evaluate(()=>({ragdoll:window.__AEGIS__.player.ragdoll.active,health:window.__AEGIS__.player.health,p:window.__AEGIS__.player.position.toArray()}));expect(recovered.health).toBeGreaterThan(0);expect(recovered.ragdoll).toBe(false);expect(recovered.p.every(Number.isFinite)).toBe(true);
});

test('mission transitions, missiles, boss phases, finisher and clean restart',async({page})=>{
  await boot(page);await start(page,true);
  // Set up milestones through actual damage/throw counters; detailed interactions are tested above.
  await page.evaluate(()=>{const q=window.__AEGIS__;q.encounter.enemies.forEach(e=>e.hit(100,e.position.clone().set(0,0,-1),true));q.encounter.throws=1;q.destruction.blast(q.player.position.clone().set(0,2,-81),10,300);});
  await page.waitForTimeout(300);expect((await diagnostics(page)).stage).toBe('air');
  await page.waitForFunction(()=>window.aegisDiagnostics().missiles>0,null,{timeout:6000});
  await page.evaluate(()=>{const q=window.__AEGIS__;q.encounter.drones.forEach(d=>d.hit(100,d.position.clone().set(0,0,-1)));});
  await page.waitForTimeout(5000);expect((await diagnostics(page)).stage).toBe('boss');
  await page.screenshot({path:'artifacts/qa-boss.png'});
  await page.evaluate(()=>{const b=window.__AEGIS__.encounter.boss;b.weakTime=5;b.hit(185,b.position.clone());});await page.waitForTimeout(300);expect((await diagnostics(page)).bossPhase).toBe(2);
  await page.evaluate(()=>{const q=window.__AEGIS__,b=q.encounter.boss;b.weakTime=5;b.hit(200,b.position.clone());q.player.ragdoll.reset();q.player.body.setEnabled(true);q.player.body.teleport(b.position.clone().add(q.player.position.clone().set(0,0,8)));});
  await page.waitForTimeout(200);await key(page,'v');await page.waitForTimeout(6800);expect((await diagnostics(page)).mode).toBe('complete');
  await expect(page.getByRole('button',{name:/Restart operation/})).toBeVisible();await page.getByRole('button',{name:/Restart operation/}).click();await key(page,'Enter');expect((await diagnostics(page)).bodies).toBe(1);
});

test('hardware frame measurement and bounded repeated restart',async({page,browser})=>{
  await boot(page);await start(page,true);await page.waitForTimeout(1200);
  const samples=await page.evaluate(async()=>{const times=[];let previous=performance.now();await new Promise(resolve=>{function frame(t){times.push(t-previous);previous=t;if(times.length<360)requestAnimationFrame(frame);else resolve();}requestAnimationFrame(frame);});return times.slice(1);});
  const data=await diagnostics(page);const gpu=await page.evaluate(()=>{const gl=document.querySelector('canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);});
  samples.sort((a,b)=>a-b);await writeFile('artifacts/performance.json',JSON.stringify({date:'2026-10-10',browser:browser.version(),gpu,viewport:[1440,900],headless:true,scenario:'Ground encounter, three pursuing enforcers; camera stationary',samples:samples.length,meanMs:samples.reduce((a,b)=>a+b)/samples.length,p95Ms:samples[Math.floor(samples.length*.95)],diagnostics:data},null,2));
  const counts=[];for(let i=0;i<4;i++){await start(page,true);await page.waitForTimeout(300);await page.evaluate(()=>window.__AEGIS__.reset());await page.waitForTimeout(100);counts.push(await diagnostics(page));}
  expect(counts.every(c=>c.bodies===1&&c.debris===0)).toBe(true);expect(counts.at(-1).textures).toBeLessThanOrEqual(counts[0].textures+2);expect(counts.at(-1).geometries).toBeLessThanOrEqual(counts[0].geometries+2);
});
