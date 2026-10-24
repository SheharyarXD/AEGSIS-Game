import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
async function boot(page){await page.addInitScript(()=>localStorage.setItem('aegis-quality','LOW'));await page.goto('/?qa=1');await page.waitForFunction(()=>window.__AEGIS__,null,{timeout:90000});}
async function start(page,range=false){await page.evaluate(r=>window.__AEGIS__.start(r),range);await page.waitForTimeout(150);}
async function key(page,k,ms=70){await page.keyboard.down(k);await page.waitForTimeout(ms);await page.keyboard.up(k);}
async function diagnostics(page){return page.evaluate(()=>window.aegisDiagnostics());}

test('menu, real input traversal, takeoff, braking, pause and resume',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await boot(page);
  await expect(page.getByRole('button',{name:/DEPLOY OPERATIVE/})).toBeVisible();
  await page.getByRole('button',{name:'Controls',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'Close dialog'}).click();
  await page.getByRole('button',{name:/DEPLOY OPERATIVE/}).click();await page.getByRole('button',{name:/Skip sequence/}).click();await page.waitForFunction(()=>window.aegisDiagnostics().mode==='play');await page.waitForTimeout(300);
  const initial=await diagnostics(page);await page.keyboard.down('d');await page.waitForFunction(x=>window.aegisDiagnostics().position[0]>x+.8,initial.position[0],{timeout:6000});await page.keyboard.up('d');const right=await diagnostics(page);expect(right.position[0]).toBeGreaterThan(initial.position[0]+.8);
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
  await page.evaluate(()=>{const q=window.__AEGIS__,b=q.city.layout.buildings.find(b=>b.id===8004),origin=q.player.position.clone().set(b.x+b.w/2+10,7,b.z);q.physics.world.step();const wall=q.physics.ray(origin,q.player.position.clone().set(-1,0,0),40,q.player.body.body);if(!wall)throw new Error('Source deployment facade has no collision');origin.x-=wall.timeOfImpact-2.5;q.teleport(origin);q.player.state='CRUISE';q.player.velocity.set(-45,0,0);q.camera.yaw=-Math.PI/2;});
  await page.waitForFunction(()=>window.aegisDiagnostics().crashes>0,null,{timeout:3000});const hit=await diagnostics(page);expect(hit.crashes).toBeGreaterThan(0);expect(hit.health).toBeLessThan(100);
  await page.waitForTimeout(6500);const recovered=await page.evaluate(()=>({ragdoll:window.__AEGIS__.player.ragdoll.active,health:window.__AEGIS__.player.health,p:window.__AEGIS__.player.position.toArray()}));expect(recovered.health).toBeGreaterThan(0);expect(recovered.ragdoll).toBe(false);expect(recovered.p.every(Number.isFinite)).toBe(true);
});

test('mission transitions, missiles, boss phases, finisher and clean restart',async({page})=>{
  await boot(page);await start(page,true);
  // Set up milestones through actual damage/throw counters; detailed interactions are tested above.
  await page.evaluate(()=>{const q=window.__AEGIS__;q.encounter.enemies.forEach(e=>e.hit(100,e.position.clone().set(0,0,-1),true));q.encounter.throws=1;q.destruction.blast(q.player.position.clone().set(0,2,-81),10,300);});
  await page.waitForTimeout(300);expect((await diagnostics(page)).stage).toBe('air');
  await page.waitForFunction(()=>window.aegisDiagnostics().missiles>0,null,{timeout:6000});
  await page.evaluate(()=>{const q=window.__AEGIS__;q.encounter.drones.forEach(d=>d.hit(100,d.position.clone().set(0,0,-1)));});
  await page.waitForFunction(()=>window.aegisDiagnostics().stage==='boss',null,{timeout:12000});
  await page.screenshot({path:'artifacts/qa-boss.png'});
  await page.evaluate(()=>{const b=window.__AEGIS__.encounter.boss;b.weakTime=5;b.hit(185,b.position.clone());});await page.waitForTimeout(300);expect((await diagnostics(page)).bossPhase).toBe(2);
  await page.evaluate(()=>{const q=window.__AEGIS__,b=q.encounter.boss;b.weakTime=5;b.hit(200,b.position.clone());q.player.ragdoll.reset();q.player.body.setEnabled(true);q.player.body.teleport(b.position.clone().add(q.player.position.clone().set(0,0,8)));});
  await page.waitForTimeout(200);await key(page,'v');await page.waitForFunction(()=>window.aegisDiagnostics().mode==='complete',null,{timeout:15000});expect((await diagnostics(page)).mode).toBe('complete');
  await expect(page.getByRole('button',{name:/Restart operation/})).toBeVisible();await page.getByRole('button',{name:/Restart operation/}).click();await page.getByRole('button',{name:/Skip sequence/}).click();expect((await diagnostics(page)).bodies).toBe(1);
});

test('hardware frame measurement and bounded repeated restart',async({page,browser})=>{
  await boot(page);await start(page,true);await page.waitForTimeout(1200);
  const samples=await page.evaluate(async()=>{const times=[];let previous=performance.now();await new Promise(resolve=>{function frame(t){times.push(t-previous);previous=t;if(times.length<360)requestAnimationFrame(frame);else resolve();}requestAnimationFrame(frame);});return times.slice(1);});
  const data=await diagnostics(page);const gpu=await page.evaluate(()=>{const gl=document.querySelector('canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);});
  samples.sort((a,b)=>a-b);await writeFile('artifacts/performance.json',JSON.stringify({date:'2026-10-10',browser:browser.version(),gpu,viewport:[1440,900],headless:true,scenario:'Ground encounter, three pursuing enforcers; camera stationary',samples:samples.length,meanMs:samples.reduce((a,b)=>a+b)/samples.length,medianMs:samples[Math.floor(samples.length*.5)],p95Ms:samples[Math.floor(samples.length*.95)],diagnostics:data},null,2));
  const counts=[];for(let i=0;i<4;i++){await start(page,true);await page.waitForTimeout(300);await page.evaluate(()=>window.__AEGIS__.reset());await page.waitForTimeout(100);counts.push(await diagnostics(page));}
  expect(counts.every(c=>c.bodies===1&&c.debris===0)).toBe(true);expect(counts.at(-1).textures).toBeLessThanOrEqual(counts[0].textures+2);expect(counts.at(-1).geometries).toBeLessThanOrEqual(counts[0].geometries+2);
});

test('pilot and armour are both playable: T runs the part-by-part transformation, flight needs the armour',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await boot(page);await start(page);await page.waitForTimeout(500);
  const form=()=>page.evaluate(()=>{const p=window.__AEGIS__.player;return {form:p.form,changing:p.changingForm,progress:p.suitProgress,state:p.state,x:p.position.x,y:p.position.y,armor:p.armor.group.visible,pilot:p.pilot?.group.visible};});
  const settled=name=>page.waitForFunction(n=>{const p=window.__AEGIS__.player;return p.form===n&&!p.changingForm;},name,{timeout:12000});
  await page.evaluate(()=>{const q=window.__AEGIS__;q.camera.yaw=q.player.object.rotation.y+Math.PI*.82;});await page.waitForTimeout(700);
  expect((await form()).form).toBe('armor');await page.screenshot({path:'artifacts/qa-form-armor.png'});
  // step out: components release in reverse order, the pilot is left standing
  await key(page,'t');await page.waitForFunction(()=>{const p=window.__AEGIS__.player;return p.changingForm&&p.suitProgress>.4;},null,{timeout:6000});
  const leaving=await form();expect(leaving.armor).toBe(true);expect(leaving.pilot).toBe(true);await page.screenshot({path:'artifacts/qa-form-stepout.png'});
  await settled('pilot');const pilot=await form();expect(pilot.pilot).toBe(true);expect(pilot.armor).toBe(false);await page.screenshot({path:'artifacts/qa-form-pilot.png'});
  await key(page,'d',700);expect(Math.abs((await form()).x-pilot.x)).toBeGreaterThan(.5);
  await key(page,'e');await page.waitForTimeout(700);const grounded=await form();expect(grounded.state).toBe('GROUND');expect(grounded.y).toBeLessThan(1);
  // suit up: both forms are on screen while the armour docks group by group
  await key(page,'t');await page.waitForFunction(()=>{const p=window.__AEGIS__.player;return p.changingForm&&p.suitProgress>.55;},null,{timeout:8000});
  const docking=await page.evaluate(()=>{const p=window.__AEGIS__.player,fx=p.armor.groupFx,n=p.armor.groups.length;let shown=0;for(let i=0;i<n;i++)if(fx[i].z>.5)shown++;return {shown,total:n};});
  expect(docking.shown).toBeGreaterThan(5);expect(docking.shown).toBeLessThan(docking.total);await page.screenshot({path:'artifacts/qa-form-change.png'});
  await settled('armor');const armor=await form();expect(armor.armor).toBe(true);expect(armor.pilot).toBe(false);
  const whole=await page.evaluate(()=>{const p=window.__AEGIS__.player,fx=p.armor.groupFx,rot=p.armor.groupRot;return p.armor.groups.every((g,i)=>/^missile_pod/.test(g.name)?fx[i].z<.5:fx[i].z>.5&&fx[i].x>.99&&Math.abs(rot[i].w)>.9999);});   // all docked; the missile pods stay stowed
  expect(whole).toBe(true);
  await key(page,'e');await key(page,'Space',600);expect((await form()).y).toBeGreaterThan(3);expect(errors).toEqual([]);
});
test('free fall is gravity-driven, can be caught, and landings are graded by impact speed',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await boot(page);await start(page);await page.waitForTimeout(400);
  const player=()=>page.evaluate(()=>{const p=window.__AEGIS__.player;return {state:p.state,y:p.position.y,vy:p.velocity.y,landings:p.landings,landing:p.lastLanding&&{tier:p.lastLanding.tier,speed:p.lastLanding.speed},ragdoll:p.ragdoll.active,recovering:p.recovering,health:p.health};});
  const grounded=()=>page.waitForFunction(()=>window.__AEGIS__.player.state==='GROUND',null,{timeout:15000});
  const floor=(await player()).y;
  // takeoff builds lift from a crouch: he is still a takeoff state shortly after the key
  await key(page,'e');await page.waitForTimeout(250);expect((await player()).state).toBe('TAKEOFF');
  await key(page,'Space',1800);await page.waitForTimeout(500);const top=await player();expect(top.state).toBe('HOVER');expect(top.y-floor).toBeGreaterThan(5);
  // cut thrust: speed builds under gravity, it is not a constant-rate descent
  await key(page,'e');await page.waitForTimeout(250);const early=await player();expect(early.state).toBe('FALL');
  await page.waitForTimeout(250);const later=await player();expect(later.vy).toBeLessThan(early.vy-3);
  await grounded();await page.waitForTimeout(1800);const down=await player();
  const expected=Math.sqrt(2*24*(top.y-floor));
  expect(down.landings).toBe(1);expect(down.landing.tier).toBe('heavy');expect(Math.abs(down.landing.speed-expected)).toBeLessThan(expected*.15);
  expect(down.ragdoll).toBe(false);expect(down.y-floor).toBeLessThan(.1);expect(down.recovering).toBe(0);expect(down.health).toBe(100);
  await page.screenshot({path:'artifacts/qa-landing.png'});
  // a short drop is a medium landing, a hop is a soft one, and each touchdown is reported once
  await page.evaluate(()=>{const p=window.__AEGIS__.player,at=p.position.clone();at.y+=3.3;p.body.teleport(at);p.state='JUMP';p.dropOut();});
  await page.waitForTimeout(200);await grounded();await page.waitForTimeout(900);
  const medium=await player();expect(medium.landings).toBe(2);expect(medium.landing.tier).toBe('medium');
  await key(page,'Space');await page.waitForTimeout(300);await grounded();await page.waitForTimeout(300);
  const soft=await player();expect(soft.landings).toBe(3);expect(soft.landing.tier).toBe('soft');
  // falling can be caught before the ground
  await key(page,'e');await key(page,'Space',1800);await page.waitForTimeout(300);await key(page,'e');await page.waitForTimeout(350);
  expect((await player()).state).toBe('FALL');await key(page,'e');await page.waitForTimeout(900);
  const caught=await player();expect(caught.state).toBe('HOVER');expect(caught.vy).toBeGreaterThan(-3);expect(caught.landings).toBe(3);expect(errors).toEqual([]);
});
test('shoulder launchers deploy, fire guided and unguided missiles and stow; palms aim before the hand weapons fire',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await boot(page);await start(page,true);await page.waitForTimeout(600);
  // the targets stand still for this one: it is about the weapons, not about being attacked while testing them
  await page.evaluate(()=>{const q=window.__AEGIS__;for(const enemy of q.encounter.enemies)enemy.update=()=>{};const e=q.encounter.enemies[1].position,p=q.player.position;q.camera.yaw=Math.atan2(e.x-p.x,e.z-p.z);q.camera.pitch=0;});await page.waitForTimeout(300);
  const state=()=>page.evaluate(()=>{const q=window.__AEGIS__,e=q.encounter,m=e.missiles,a=q.player.armor;
    const pods=a.groups.map((g,i)=>/^missile_pod/.test(g.name)?a.groupFx[i].z:null).filter(v=>v!==null);
    return {mode:m.mode,ammo:m.ammo,launches:m.launches,hits:m.hits,deployed:m.deployed,airborne:m.airborne,podsShown:pods.filter(v=>v>.5).length,pods:pods.length,
      shots:e.hands.shots,beam:e.hands.beamSeconds,aimR:a.aimWeight('R'),aimL:a.aimWeight('L'),energy:q.player.energy,hurt:e.enemies.filter(x=>x.health<95).length};});
  const idle=await state();expect(idle.pods).toBe(2);expect(idle.podsShown).toBe(0);expect(idle.mode).toBe('SOFT');
  // the pods are hidden until F: they rise before anything is launched
  await key(page,'f');await page.waitForTimeout(260);const rising=await state();expect(rising.deployed).toBeGreaterThan(.3);expect(rising.launches).toBe(0);
  await page.waitForFunction(()=>window.__AEGIS__.encounter.missiles.launches===2,null,{timeout:3000});
  const fired=await state();expect(fired.deployed).toBe(1);expect(fired.podsShown).toBe(2);expect(fired.ammo).toBe(6);
  // soft lock: at least one of the pair finds a target, then the launchers close again
  await page.waitForFunction(()=>window.__AEGIS__.encounter.missiles.hits>0,null,{timeout:5000});
  await page.waitForFunction(()=>window.__AEGIS__.encounter.missiles.deployed===0,null,{timeout:5000});
  await page.waitForTimeout(150);const stowed=await state();expect(stowed.podsShown).toBe(0);expect(stowed.hurt).toBeGreaterThan(0);
  // guidance cycles SOFT -> HARD -> OFF, and with it off a pair still launches
  await key(page,'n');await page.waitForTimeout(120);expect((await state()).mode).toBe('HARD');
  await key(page,'n');await page.waitForTimeout(120);expect((await state()).mode).toBe('OFF');
  await key(page,'f');await page.waitForFunction(()=>window.__AEGIS__.encounter.missiles.launches===4,null,{timeout:3000});
  // repulsors: the arm comes up, then pulses leave alternating palms
  const before=await state();await page.keyboard.down('z');await page.waitForTimeout(450);const aiming=await state();
  expect(Math.max(aiming.aimR,aiming.aimL)).toBeGreaterThan(.6);await page.waitForTimeout(900);await page.keyboard.up('z');
  const pulsed=await state();expect(pulsed.shots).toBeGreaterThan(2);expect(pulsed.energy).toBeLessThan(before.energy+2);
  // focused beam: a short charge, then it burns for as long as it is held
  await page.waitForTimeout(900);expect(Math.max((await state()).aimR,(await state()).aimL)).toBeLessThan(.2);
  await page.keyboard.down('l');await page.waitForTimeout(1400);await page.screenshot({path:'artifacts/qa-beam.png'});await page.keyboard.up('l');
  const burned=await state();expect(burned.beam).toBeGreaterThan(.5);expect(burned.beam).toBeLessThan(2.2);expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------------------- Phase 4
const still=page=>page.evaluate(()=>{const q=window.__AEGIS__;for(const enemy of q.encounter.enemies){enemy.update=()=>{};enemy.health=95;}});
const reticleOn=(page,index)=>page.evaluate(async index=>{const q=window.__AEGIS__,enemy=q.encounter.enemies[index];
  for(let i=0;i<4;i++){const d=enemy.position.clone();d.y+=1;d.sub(q.camera.camera.position);q.camera.yaw=Math.atan2(d.x,d.z);q.camera.pitch=Math.asin(d.y/d.length());await new Promise(r=>setTimeout(r,160));}},index);
const standOff=(page,index,metres,side=0)=>page.evaluate(([index,metres,side])=>{const q=window.__AEGIS__,p=q.player,at=q.encounter.enemies[index].position.clone();at.z+=metres;at.x+=side;at.y=p.position.y;p.body.teleport(at);p.velocity.set(0,0,0);},[index,metres,side]);
test('soft lock reaches useful ranges, respects line of sight, spreads a salvo, and a hard lock survives camera movement',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await boot(page);await start(page,true);await page.waitForTimeout(500);await still(page);
  const lock=()=>page.evaluate(()=>{const e=window.__AEGIS__.encounter,t=e.targeting,c=t.contact(t.soft);return {soft:t.soft?e.enemies.indexOf(t.soft):-1,hard:t.hard?e.enemies.indexOf(t.hard):-1,distance:c?c.distance:0,offset:c?c.offset:9,label:e.targetLabel};});
  // the reticle on a target is a soft lock at 20, 50 and 100 metres, and the aim is exact (no parallax)
  for(const metres of [20,50,100]){
    await standOff(page,1,metres);await reticleOn(page,1);const seen=await lock();
    expect(seen.soft).toBe(1);expect(Math.abs(seen.distance-metres)).toBeLessThan(3);expect(seen.offset).toBeLessThan(.05);expect(seen.label).toContain('SOFT');
  }
  // a pair fired from 100 m both arrive
  await key(page,'f');await page.waitForFunction(()=>window.__AEGIS__.encounter.missiles.launches===2,null,{timeout:4000});
  const leaving=await page.evaluate(()=>{const q=window.__AEGIS__,m=q.encounter.missiles,chest=q.player.position.clone();chest.y+=1.3;return {fromChest:m.lastMuzzle.distanceTo(chest),forward:m.lastDirection.dot(q.player.forward),y:m.lastMuzzle.y-q.player.position.y};});
  // they leave from the shoulders, behind and above the chest, pointing downrange
  expect(leaving.fromChest).toBeLessThan(.75);expect(leaving.fromChest).toBeGreaterThan(.2);expect(leaving.y).toBeGreaterThan(1.35);expect(leaving.forward).toBeGreaterThan(.7);
  await page.waitForFunction(()=>window.__AEGIS__.encounter.missiles.airborne===0,null,{timeout:8000});
  expect(await page.evaluate(()=>window.__AEGIS__.encounter.missiles.hits)).toBe(2);
  // two targets near the reticle: the next pair is shared between them
  await still(page);await page.evaluate(()=>{const e=window.__AEGIS__.encounter;e.enemies[0].position.copy(e.enemies[1].position);e.enemies[0].position.x+=4;e.enemies[2].position.x+=60;});
  await standOff(page,1,60,2);await reticleOn(page,1);await page.waitForTimeout(700);
  await key(page,'f');await page.waitForFunction(()=>window.__AEGIS__.encounter.missiles.launches===4,null,{timeout:4000});
  const shared=await page.evaluate(()=>{const e=window.__AEGIS__.encounter;return e.missiles.flights.map(f=>e.enemies.indexOf(f.target)).sort();});
  expect(shared).toEqual([0,1]);
  await page.waitForFunction(()=>window.__AEGIS__.encounter.missiles.airborne===0,null,{timeout:8000});
  // a hard lock holds while the view swings well away from the target and back
  await still(page);await reticleOn(page,1);await key(page,'Tab');await page.waitForTimeout(150);expect((await lock()).hard).toBe(1);
  await page.evaluate(()=>{window.__AEGIS__.camera.yaw+=.7;});await page.waitForTimeout(900);expect((await lock()).hard).toBe(1);
  await page.evaluate(()=>{window.__AEGIS__.camera.yaw-=1.3;});await page.waitForTimeout(900);const held=await lock();expect(held.hard).toBe(1);expect(held.label).toContain('LOCK');
  // behind a building there is no lock at all, soft or hard
  await page.evaluate(()=>{const q=window.__AEGIS__,p=q.player,enemy=q.encounter.enemies[1],dir=new p.position.constructor(1,0,0);
    // walk the hero sideways until something solid stands between him and the target
    for(let x=10;x<200;x+=5){const at=enemy.position.clone();at.x+=x;at.z+=40;at.y=p.position.y;const to=enemy.position.clone();to.y+=1;to.x-=at.x;to.y-=at.y+1.6;to.z-=at.z;const hit=q.physics.world.castRay({origin:{x:at.x,y:at.y+1.6,z:at.z},dir:to.clone().normalize()},to.length()-1.4,true,6/* fixed scenery only */);if(hit&&hit.timeOfImpact>4){p.body.teleport(at);p.velocity.set(0,0,0);break;}}void dir;});
  await page.waitForTimeout(300);await reticleOn(page,1);
  // Grace is measured in fixed simulation steps; a shader/LOD upload can consume
  // wall-clock time without advancing the complete three-second grace period.
  await page.waitForFunction(()=>{const e=window.__AEGIS__.encounter;return e.targeting.contacts.find(c=>c.target===e.enemies[1])?.visible===false;},null,{timeout:4000});
  await page.waitForFunction(()=>window.__AEGIS__.encounter.targeting.hard===null,null,{timeout:8000});
  const hidden=await lock();expect(hidden.soft).not.toBe(1);expect(hidden.hard).toBe(-1);expect(errors).toEqual([]);
});
test('flight follows the view in three dimensions: climb, dive, banked turn, and a free view in the hover',async({page})=>{
  // flown out of the bay and down the avenue: the climb starts early enough to clear the bay door
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await boot(page);await start(page);await page.waitForTimeout(400);
  const fly=()=>page.evaluate(()=>{const p=window.__AEGIS__.player,a=p.armor;return {state:p.state,y:p.position.y,vy:p.velocity.y,speed:p.velocity.length(),climb:a.climbNow,pitch:a.pitchNow,roll:a.rollNow,ragdoll:p.ragdoll.active};});
  const look=(pitch,yaw=0)=>page.evaluate(([pitch,yaw])=>{const c=window.__AEGIS__.camera;c.pitch=pitch;c.yaw+=yaw;},[pitch,yaw]);
  await key(page,'e');await key(page,'Space',500);await page.waitForTimeout(1500);
  // hover: looking steeply up or down moves nothing and leaves him upright
  const before=await fly();await look(.7);await page.waitForTimeout(600);await look(-.7);await page.waitForTimeout(600);const hover=await fly();
  expect(hover.state).toBe('HOVER');expect(Math.abs(hover.y-before.y)).toBeLessThan(.8);expect(Math.abs(hover.pitch)).toBeLessThan(.2);
  // level cruise lies prone along the path
  await look(0);await page.keyboard.down('w');await page.waitForTimeout(900);const level=await fly();
  expect(level.state).toBe('CRUISE');expect(Math.abs(level.vy)).toBeLessThan(2);expect(level.pitch).toBeGreaterThan(.7);
  // looking up climbs for real, and the nose comes up with the path
  await look(.5);await page.waitForTimeout(1500);const climb=await fly();   // a climb that stays under the skybridge over the avenue
  expect(climb.vy).toBeGreaterThan(7);expect(climb.y).toBeGreaterThan(level.y+6);expect(climb.climb).toBeGreaterThan(.25);expect(climb.pitch).toBeLessThan(.95);   // nose well above the level-flight attitude (about 1.2)
  // looking down dives, and the nose goes down past level
  await look(-.5);await page.waitForTimeout(1250);expect((await fly()).vy).toBeLessThan(-5);
  // the body follows the path round a moment later: nose below the level-flight attitude
  await page.waitForTimeout(400);const dive=await fly();expect(dive.vy).toBeLessThan(-7);expect(dive.climb).toBeLessThan(-.1);expect(dive.pitch).toBeGreaterThan(1.22);
  // a turn of the view rolls him into it; turning back rolls him the other way; then he flies level again
  const swing=(radians,ms)=>page.evaluate(([radians,ms])=>new Promise(resolve=>{const c=window.__AEGIS__.camera,t0=performance.now();let last=t0;
    const f=t=>{c.yaw+=radians*Math.min(t-last,t0+ms-last)/ms;last=t;if(t-t0<ms)requestAnimationFrame(f);else resolve();};requestAnimationFrame(f);}),[radians,ms]);
  await look(.2);await page.waitForTimeout(500);
  await swing(.45,600);const left=await fly();await swing(-.45,600);await page.waitForTimeout(120);const right=await fly();
  expect(Math.abs(left.roll)).toBeGreaterThan(.2);expect(Math.sign(right.roll)).toBe(-Math.sign(left.roll));
  await page.waitForTimeout(1300);const straight=await fly();expect(Math.abs(straight.roll)).toBeLessThan(.15);
  await page.keyboard.up('w');expect(straight.ragdoll).toBe(false);expect(errors).toEqual([]);
});
test('combat: a buffered three-hit combination, hit windows tied to the fist, counter, dash and clean exits',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await boot(page);
  const setup=async gap=>{await start(page,true);await page.waitForTimeout(450);await still(page);await standOff(page,1,gap);
    await page.evaluate(()=>{const q=window.__AEGIS__;q.encounter.enemies.forEach((x,i)=>{if(i!==1)x.health=0;});q.player.object.rotation.y=Math.PI;q.camera.yaw=Math.PI;});await page.waitForTimeout(350);};
  const fight=()=>page.evaluate(()=>{const q=window.__AEGIS__,m=q.encounter.melee,p=q.player;return {move:m.move,time:m.time,combo:m.combo,hits:m.hitsLanded,swings:m.swings,striking:m.striking,health:Math.round(q.encounter.enemies[1].health),attackTime:p.attackTime,counter:p.counterWindow,state:p.state};});
  // jab, cross, hook: each press made during the previous move is buffered and chained
  await setup(2.1);await key(page,'j');await page.waitForTimeout(60);const jab=await fight();expect(jab.move).toBe('jab');
  await page.waitForTimeout(120);await key(page,'j');await page.waitForTimeout(140);expect((await fight()).move).toBe('cross');
  await page.waitForTimeout(140);await key(page,'j');await page.waitForTimeout(220);const hook=await fight();expect(hook.move).toBe('hook');expect(hook.combo).toBe(3);
  await page.waitForTimeout(700);const done=await fight();
  expect(done.move).toBe(null);expect(done.attackTime).toBe(0);expect(done.swings).toBe(3);expect(done.hits).toBe(3);expect(done.health).toBe(95-14-20-30);
  // a single press is a single jab: the combination does not run on by itself
  await setup(2.1);await key(page,'j');await page.waitForTimeout(700);const single=await fight();expect(single.swings).toBe(1);expect(single.health).toBe(81);
  // out of reach, a swing is only a swing
  await setup(5.2);await key(page,'j');await page.waitForTimeout(600);const whiff=await fight();expect(whiff.swings).toBe(1);expect(whiff.hits).toBe(0);expect(whiff.health).toBe(95);
  // the heavy strike hurts only in its active frames, late in the move
  await setup(2.3);await key(page,'k');await page.waitForTimeout(100);const coil=await fight();expect(coil.move).toBe('heavy');expect(coil.striking).toBe(false);expect(coil.health).toBe(95);
  await page.waitForFunction(()=>window.__AEGIS__.encounter.enemies[1].health===53,null,{timeout:3000});expect((await fight()).health).toBe(53);
  // a block opens a counter: the next light press is the counter, not a jab
  await setup(1.9);await page.keyboard.down('b');await page.waitForTimeout(250);
  await page.evaluate(()=>{const q=window.__AEGIS__;q.player.damage(12,q.player.forward.clone().negate());});await page.waitForTimeout(60);await page.keyboard.up('b');
  expect((await fight()).counter).toBeGreaterThan(.4);await key(page,'j');await page.waitForTimeout(120);expect((await fight()).move).toBe('counter');
  await page.waitForTimeout(500);expect((await fight()).health).toBe(95-34);
  // sprint + heavy closes the distance under thrust and lands
  await setup(7.5);await page.keyboard.down('ShiftLeft');await key(page,'k');await page.keyboard.up('ShiftLeft');await page.waitForTimeout(150);expect((await fight()).move).toBe('dash');
  await page.waitForTimeout(950);const dash=await fight();expect(dash.health).toBe(95-54);expect(dash.move).toBe(null);
  // in the air a strike flies in, hits, and leaves him flying or landed, never stuck
  await setup(9);await key(page,'e');await key(page,'Space',220);await page.waitForFunction(()=>window.__AEGIS__.player.state==='HOVER');
  // Keep both combatants in the air; the ground-diving case can crash before fist contact.
  await page.evaluate(()=>{const q=window.__AEGIS__,e=q.encounter.enemies[1],at=e.position.clone();at.y=8;e.body.teleport(at);q.teleport(at.clone().add(q.player.position.clone().set(0,0,9)));q.player.state='HOVER';q.player.object.rotation.y=q.camera.yaw=Math.PI;});await page.waitForTimeout(150);
  await key(page,'j');await page.waitForTimeout(120);expect((await fight()).move).toBe('air');
  await page.waitForTimeout(900);const air=await fight();expect(air.move).toBe(null);expect(air.health).toBeLessThan(95);expect(['HOVER','CRUISE','GROUND','LANDING','FALL']).toContain(air.state);
  expect(errors).toEqual([]);
});
test('weapons in flight and sound lifecycle: palm aims while hovering, the beam ends on what it hits, its tone starts once and stops',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await boot(page);await start(page,true);await page.waitForTimeout(450);await still(page);
  await standOff(page,1,22);await key(page,'e');await key(page,'Space',260);await page.waitForTimeout(800);await reticleOn(page,1);
  const hands=()=>page.evaluate(()=>{const q=window.__AEGIS__,e=q.encounter,h=e.hands,a=q.player.armor,sound=q.audio;const enemy=e.enemies[1].position.clone();enemy.y+=1;
    return {state:q.player.state,shots:h.shots,beam:h.beamSeconds,lasing:h.firingLaser,aimR:a.aimWeight('R'),aimL:a.aimWeight('L'),pitch:a.pitchNow,endToTarget:h.beamEnd.distanceTo(enemy),
      startToPalm:h.beamStart.distanceTo(a.thrusterMounts.find(m=>m.userData.kind==='palm'&&m.userData.side==='R').getWorldPosition(new enemy.constructor())),
      beamAudio:sound.beamActive,beamStarts:sound.beamStarts,played:{...sound.played},health:Math.round(e.enemies[1].health)};});
  // repulsors while hovering: he stays a flyer (no standing pose), an arm comes up, pulses hit
  await page.keyboard.down('z');await page.waitForTimeout(1100);const pulsing=await hands();await page.keyboard.up('z');
  expect(pulsing.state).toBe('HOVER');expect(Math.max(pulsing.aimR,pulsing.aimL)).toBeGreaterThan(.6);expect(pulsing.shots).toBeGreaterThan(2);expect(pulsing.health).toBeLessThan(95);
  expect(pulsing.played.repulsor).toBe(pulsing.shots);expect(pulsing.played.repulsorCharge).toBeGreaterThan(0);
  // the beam: one start, a running tone while it burns, the end point on the target, the start on the palm
  await page.waitForTimeout(900);await still(page);await reticleOn(page,1);
  await page.keyboard.down('l');await page.waitForTimeout(1200);const burning=await hands();
  expect(burning.lasing).toBe(true);expect(burning.beamAudio).toBe(true);expect(burning.beamStarts).toBe(1);expect(burning.endToTarget).toBeLessThan(1.4);expect(burning.startToPalm).toBeLessThan(.25);
  expect(burning.state).toBe('HOVER');await page.screenshot({path:'artifacts/qa-beam-hover.png'});
  await page.keyboard.up('l');await page.waitForTimeout(250);const off=await hands();
  expect(off.lasing).toBe(false);expect(off.beamAudio).toBe(false);expect(off.beamStarts).toBe(1);expect(off.played.laserStop).toBe(1);expect(off.played.laserStart).toBe(1);
  // an interruption (pause) kills the tone at once; so does a restart
  await page.keyboard.down('l');await page.waitForTimeout(700);expect((await hands()).beamAudio).toBe(true);
  await key(page,'Escape');await page.waitForTimeout(150);expect(await page.evaluate(()=>window.__AEGIS__.audio.beamActive)).toBe(false);await page.keyboard.up('l');
  await start(page,true);await page.waitForTimeout(400);const fresh=await hands();expect(fresh.beamAudio).toBe(false);expect(fresh.shots).toBe(0);expect(errors).toEqual([]);
});
