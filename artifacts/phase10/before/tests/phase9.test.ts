import {strict as assert} from 'node:assert';import {test} from 'node:test';import {Group,PerspectiveCamera,Vector3} from 'three';
import {architectureFixture} from './helpers/architecture-fixture';import {CharacterBody,RAPIER} from '../src/physics/PhysicsWorld';import {planBreach} from '../src/world/titan/BreachPlan';import {TITAN_CONFIG} from '../src/world/titan/TitanConfig';import {TitanBreachBarrage} from '../src/world/titan/TitanBreachBarrage';import {DEFAULT_CONTROLS} from '../src/input/Controls';
import {Missiles} from '../src/combat/Missiles';import {PhysicsWorld} from '../src/physics/PhysicsWorld';
const nextTask=()=>new Promise(r=>setTimeout(r,0));

for(const [name,id,ground] of [['office',287,true],['glass',235,false],['Gothic',211,false]] as const)test(`reserved ${name} corridor changes only on impacts and passes a real enabled capsule after all three waves`,async()=>{
 const f=await architectureFixture(id),b=f.building,center=ground?2.42:11,origin=new Vector3(b.x,center,b.z+b.d/2+16),direction=new Vector3(0,0,-1),plan=planBreach([b],origin,direction,180,80,2.75,2.3)!;assert.ok(plan);plan.ground=ground;
 f.physics.box(new Vector3(b.x,-.1,b.z),new Vector3(220,.2,220));f.physics.world.step();
 try{const token=await f.architecture.reserveBarrage(plan);assert.ok(token);assert.equal(f.architecture.totalBroken,0);assert.equal(f.architecture.states.size,0);
  for(let wave=0;wave<3;wave++)for(let n=0;n<TITAN_CONFIG.breakthrough.waves[wave];n++){
   const aim=f.architecture.barrageTarget(token!,n),start=plan.entry.clone().addScaledVector(direction,-10),delta=aim.clone().sub(start),distance=delta.length();delta.normalize();const hit=f.physics.ray(start,delta,distance+.3),point=hit?start.addScaledVector(delta,hit.timeOfImpact):aim;
   assert.equal(f.architecture.barrageImpact(token!,wave,point,delta.clone().negate(),hit?.collider),true);for(let i=0;i<20;i++){f.physics.world.step();f.architecture.update(1/60,origin,true);}
   if(wave===0)assert.equal(plan.exitOpen,undefined);
  }
  let ready=false;for(let i=0;i<300&&!ready;i++){f.physics.world.step();f.architecture.update(1/60,origin,true);ready=f.architecture.finishBarrage(token!);}assert.equal(ready,true,JSON.stringify((f.architecture as any).lastBarrageClearance));assert.equal(plan.exitOpen,true);
  const actor=new CharacterBody(f.physics,new Vector3(b.x,ground?.02:center-1.05,plan.entry.z+2)),velocity=new Vector3(0,ground?-.6:0,-(ground?2:7));
  for(let i=0;i<1800&&actor.position.z>plan.exit.z-3;i++){actor.move(velocity,1/60,!ground);f.physics.world.step();actor.sync();f.architecture.update(1/60,actor.position,true);velocity.set(0,ground?-.6:0,-(ground?2:7));}
  assert.ok(actor.position.z<plan.exit.z-2,`Normal capsule stopped at ${actor.position.toArray()} before ${plan.exit.toArray()}`);assert.equal(actor.body.isEnabled(),true);actor.dispose();
  const saved=f.architecture.serialize();await f.architecture.restore(saved);assert.equal(f.architecture.serialize().breaches[0].exitOpen,true);assert.equal(f.architecture.serialize().buildings[0].broken.length,saved.buildings[0].broken.length);
 }finally{f.dispose();}
});

test('reservation rejects a neighboring obstacle at walking height before changing any source geometry',async()=>{
 const f=await architectureFixture(287),b=f.building,origin=new Vector3(b.x,11,b.z+b.d/2+16),direction=new Vector3(0,0,-1),plan=planBreach([b],origin,direction,180,80,2.75,2.3)!;
 try{const p=plan.entry.clone().addScaledVector(direction,1).setY(8.6);f.physics.box(p,new Vector3(6,1,1));f.physics.world.step();assert.equal(await f.architecture.reserveBarrage(plan),null);assert.equal(f.architecture.states.size,0);assert.equal(f.architecture.totalBroken,0);}finally{f.dispose();}
});

test('heavy impact transmits damage to real supports beyond the blast radius and leaves collidable persistent ruins',async()=>{
 const f=await architectureFixture(235),b=f.building,origin=new Vector3(b.x,3.5,b.z+b.d/2+30),direction=new Vector3(0,0,-1);f.architecture.setQuality('MEDIUM');
 try{let shots=0;for(;shots<9&&f.architecture.states.get(b.id)?.stage!=='collapsed';shots++){f.physics.world.step();const hit=f.physics.world.castRayAndGetNormal(new RAPIER.Ray(origin,direction),160,true,RAPIER.QueryFilterFlags.ONLY_FIXED,undefined,undefined,undefined,c=>f.physics.surfaces.get(c.handle)?.kind!=='debris');assert.ok(hit);const p=origin.clone().addScaledVector(direction,hit.timeOfImpact);f.architecture.blast(p,3,70,direction,{kind:'missile',mode:'demolition'});for(let i=0;i<30;i++){f.physics.world.step();f.architecture.update(1/60,origin,true);}}
  const state=f.architecture.states.get(b.id)!;assert.equal(state.stage,'collapsed');assert.ok(shots<=9);assert.ok([...state.hp].some(([id,hp])=>f.catalog.components.some((c:any)=>c.family===b.family&&c.id===id&&c.structural===true&&hp<c.hp)));
  for(let i=0;i<1200&&(state.collapse||f.architecture.diagnostics().collapsePresentation.active);i++){f.physics.world.step();f.architecture.update(1/60,origin,true);assert.ok(f.architecture.diagnostics().activeDebris<=24);}
  assert.equal(f.architecture.diagnostics().collapsePresentation.ruins,1);assert.equal(f.architecture.diagnostics().collapsePresentation.ruinColliders,3);assert.equal(state.group.visible,false);
  let boundedPatches=0;f.architecture.group.traverse((o:any)=>{if(o.name==='Ruin source fragment'){boundedPatches++;assert.ok(o.geometry.boundingSphere&&o.geometry.boundingBox,'Shared source buffers require explicit subset bounds before rendering');assert.ok(o.geometry.boundingSphere.radius<.5,'A small facade patch must not inherit whole-tower bounds');}});assert.ok(boundedPatches>0);
  const saved=f.architecture.serialize();await f.architecture.restore(saved);f.architecture.update(1/60,origin,true);f.physics.world.step();assert.equal(f.architecture.diagnostics().collapsePresentation.ruins,1);assert.equal(f.architecture.diagnostics().collapsePresentation.ruinColliders,3);
  const top=f.physics.ray(new Vector3(b.x,80,b.z),new Vector3(0,-1,0),100);assert.ok(top&&top.timeOfImpact<79,'Major ruins must retain collision above the original ground');
 }finally{f.dispose();}
});

test('real launcher pool permits an eight-round barrage alongside four prior missiles without retargeting them or charging ordinary ammo',async()=>{
 await PhysicsWorld.init();const physics=new PhysicsWorld(),group=new Group(),mounts=[-1,1].map(side=>{const m=new Group();m.position.set(side*.3,1.5,0);m.rotation.x=Math.PI/2;m.userData.side=side;group.add(m);return m;}),armor={group,missileMounts:mounts,groupIndex:()=>0,groupPivot:(_:number,p:Vector3)=>p.set(0,1.5,0)},m=new Missiles(physics,{burst(){},shockwave(){}} as never,armor as never),aim=new Vector3(0,2,-1000),velocity=new Vector3();let drained=0,maxAirborne=0;
 const tick=(frames:number)=>{for(let i=0;i<frames;i++){m.update(1/60,[],velocity,aim,n=>{drained+=n;return true;});maxAirborne=Math.max(maxAirborne,m.airborne);}};
 try{assert.equal(m.fire([null,null,null,null],aim),true);tick(90);assert.equal(m.airborne,4);assert.equal(m.ammo,4);assert.equal(m.barrageAvailable,true);const prior=(m as any).pool.filter((p:any)=>p.life>0).map((p:any)=>({p,aim:p.aim.clone()}));assert.equal(m.beginBarrage(new Vector3(500,20,-1000)),true);for(const p of prior)assert.ok(p.p.aim.equals(p.aim));assert.equal(m.fire([null],aim),false);
  for(let wave=0;wave<3;wave++){assert.equal(m.barrageWave(Array.from({length:[3,3,2][wave]},()=>({token:1,wave,target:()=>new Vector3(500,20,-1000)}))),true);tick(90);if(wave===0){assert.equal(m.airborne,7);assert.equal(m.barrageWave([]),false);}tick(400);}
  assert.equal(m.launchLog.filter(l=>l.token===1).length,8);assert.equal(m.launches,12);assert.equal(m.barrageRounds,0);assert.equal(m.ammo,4);assert.equal(drained,28);assert.ok(maxAirborne<=8);
 }finally{m.reset();m.group.traverse((o:any)=>{o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach((v:any)=>v.dispose());else o.material?.dispose();});physics.dispose();}
});

function harness(deferred=false){
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document'),element=()=>({setAttribute(){},style:{},textContent:'',remove(){}});Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:element,body:{append(){}}}});
 const building={id:7,x:0,z:-30,w:20,d:20,h:40,family:'test'},position=new Vector3(0,0,0),player={suited:true,isFlying:false,changingForm:false,health:100,ragdoll:{active:false},position,body:{height:1.05},object:new Group(),velocity:new Vector3(),energy:100,controls:DEFAULT_CONTROLS};let resolve!:(n:number)=>void,reservations=0,released=0,begin=0,deployed=0;
 const architecture={targetBuilding:()=>({id:7,point:new Vector3(0,2,-20)}),reserveBarrage:()=>{reservations++;return deferred?new Promise<number>(r=>{resolve=r;}):Promise.resolve(1);},releaseBarrage:()=>{released++;}};
 const missiles={demolition:false,barrageAvailable:true,barrageBusy:false,beginBarrage:()=>{begin++;return true;},deployBarrage:()=>{deployed++;},endBarrage(){},barrageWave(){return true;}};
 const ability=new TitanBreachBarrage({layout:{buildings:[building]},architecture} as never,player as never,{camera:new PerspectiveCamera()} as never,missiles as never,{cue(){}} as never,element() as never);let tap='';const tick=(key='',dt=1/60)=>{tap=key;ability.update(dt,{anyTap:(keys:string[])=>keys.includes(tap)} as never,{forward:new Vector3(0,0,-1)} as never);};
 return {player,ability,architecture,missiles,tick,resolve:()=>resolve(1),stats:()=>({reservations,released,begin,deployed}),dispose(){ability.dispose();if(previous)Object.defineProperty(globalThis,'document',previous);else Reflect.deleteProperty(globalThis,'document');}};
}
test('stationary ground acquisition reserves a finite attack atomically without changing player velocity or position',async()=>{
 const h=harness();try{h.tick('KeyY');await nextTask();assert.equal(h.ability.state,'acquiring');assert.equal(h.player.energy,52);assert.deepEqual(h.player.velocity.toArray(),[0,0,0]);assert.deepEqual(h.player.position.toArray(),[0,0,0]);assert.equal(h.stats().begin,1);h.tick('',.45);assert.equal(h.ability.state,'deploying');assert.equal(h.stats().deployed,1);assert.equal(h.player.energy,52);}finally{h.dispose();}
});
test('invalid armor and insufficient energy do not reserve or spend an attack',()=>{const h=harness();try{h.player.suited=false;h.tick('KeyY');h.player.suited=true;h.player.energy=20;h.tick('KeyY');assert.equal(h.stats().reservations,0);assert.equal(h.stats().begin,0);assert.equal(h.player.energy,20);}finally{h.dispose();}});
test('cancelling during asynchronous reservation releases late resources without damage or energy cost',async()=>{const h=harness(true);try{h.tick('KeyY');assert.equal(h.ability.state,'preparing');h.tick('KeyY');h.resolve();await nextTask();assert.equal(h.stats().released,1);assert.equal(h.stats().begin,0);assert.equal(h.player.energy,100);assert.equal(h.ability.diagnostics().preparing,false);}finally{h.dispose();}});
