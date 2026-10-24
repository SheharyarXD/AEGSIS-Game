import {strict as assert} from 'node:assert';import {test} from 'node:test';import {Vector3,Box3} from 'three';
import {AssetQueue} from '../src/world/streaming/AssetQueue';import {prepareGeometry} from '../src/world/streaming/GeometryPreparation';import {FrameProfiler} from '../src/world/streaming/FrameProfiler';import {worldAttackScale,TITAN_CONFIG} from '../src/world/titan/TitanConfig';import {thermalIntensity,materialFor} from '../src/world/titan/ThermalDamage';import {explosionEnvelope} from '../src/world/titan/ExplosionEffects';import {SupportGraph} from '../src/world/titan/SupportGraph';import {planBreach,sweptSection} from '../src/world/titan/BreachPlan';import {cutCorner,historicFrontages,STREET_STANDARDS} from '../src/world/titan/StreetStandards';import {CityLayout} from '../src/world/CityLayout';import {architectureFixture} from './helpers/architecture-fixture';import {CharacterBody} from '../src/physics/PhysicsWorld';
import {TitanBreakthrough} from '../src/world/titan/TitanBreakthrough';
import {DEFAULT_CONTROLS,loadControls} from '../src/input/Controls';
import {GeometryWorker} from '../src/world/streaming/GeometryWorker';
import {ArchitectureImpactEffects} from '../src/world/environment/ArchitectureImpactEffects';
import {familyOf} from '../src/world/CityLayout';
import {BoxGeometry,MeshStandardMaterial,Scene,PerspectiveCamera,InstancedMesh} from 'three';
import {AssetLibrary} from '../src/world/environment/AssetLibrary';

test('asset work is deduplicated, bounded and priority-promoted while active jobs finish',async()=>{const q=new AssetQueue(1),order:string[]=[];let release!:()=>void;const a=q.request('a',10,()=>new Promise<void>(r=>{release=()=>{order.push('a');r();};})),b=q.request('b',50,async()=>{order.push('b');}),c=q.request('c',20,async()=>{order.push('c');});assert.equal(q.request('b',0,async()=>{}),b);assert.equal(q.stats().active,1);release();await Promise.all([a,b,c]);assert.deepEqual(order,['a','b','c']);q.close();});
test('interleaved quantized GLB attributes preserve stride, normalization, transform and component IDs',()=>{const raw=new Uint16Array([0,65535,32768,42,65535,0,0,43]),r=prepareGeometry({attributes:[{name:'position',array:raw,size:3,normalized:true,stride:4,offset:0},{name:'_cid',array:new Float32Array([42,43]),size:1,normalized:false}],index:new Uint16Array([0,1,0]),matrix:[2,0,0,0,0,3,0,0,0,0,4,0,10,20,30,1],damage:true});const p=r.attributes.find(a=>a.name==='position')!.array;assert.equal(p.length,6);assert.ok(Array.from(p).every(Number.isFinite));assert.equal(p[0],10);assert.equal(p[1],23);assert.equal(p[3],12);assert.equal(r.ranges.get(42)![0][1],3);});
test('telemetry reports tail latency rather than hiding a rare stall in the mean',()=>{const f=new FrameProfiler();for(let i=0;i<99;i++)f.frame(16);f.frame(1100);assert.equal(f.stats().p50Ms,16);assert.equal(f.stats().worstMs,1100);assert.equal(f.stats().over50,1);});
test('standard and heavy building multipliers stay separate from general world hits',()=>{assert.equal(worldAttackScale({kind:'missile'}).environment,3);assert.equal(worldAttackScale({kind:'missile',mode:'demolition'}).structure,5);assert.equal(worldAttackScale({kind:'laser'}).environment,1);assert.equal(worldAttackScale().environment,1);assert.equal(TITAN_CONFIG.missiles.demolition.energy,22);});
test('thermal response cools to black and steel retains heat longer than glass',()=>{assert.ok(thermalIntensity(1,2,'steel')>thermalIntensity(1,2,'glass'));assert.ok(thermalIntensity(1,40,'steel')<.0001);assert.equal(materialFor('glass','aer_gothic'),'glass');assert.equal(materialFor('support','city_modern'),'steel');});
test('explosion expands quickly and dissipates instead of leaving a static flame card',()=>{assert.ok(explosionEnvelope(.25).expansion>explosionEnvelope(.01).expansion);assert.equal(explosionEnvelope(1).opacity,0);assert.ok(explosionEnvelope(.05).heat>explosionEnvelope(.5).heat);});
test('facade loss alone does not change support connectivity; one-sided support loss does',()=>{const g=new SupportGraph(Array.from({length:5},(_,i)=>({id:i,floor:0,kind:'support',structural:true,center:[i%2?5:-5,2,i<2?5:-5],size:[.6,4,.6]})));assert.equal(g.status(0,new Set([100,101])).integrity,1);assert.equal(g.status(0,new Set([0,1])).partial,true);assert.equal(g.status(0,new Set([0,1,2,3])).complete,true);});
test('cut paving corners leave the corner tip clear and use upward-facing triangles',()=>{for(const sx of [-1,1])for(const sz of [-1,1]){const v=cutCorner(0,0,5,sx,sz,1.5);assert.equal(v.length,27);for(let i=0;i<v.length;i+=9){const a=new Vector3().fromArray(v,i),b=new Vector3().fromArray(v,i+3),c=new Vector3().fromArray(v,i+6);assert.ok(b.sub(a).cross(c.sub(a)).y>0);}assert.ok(!v.some((_,i)=>i%3===0&&v[i]===0&&v[i+2]===0));}assert.equal(STREET_STANDARDS.financial.sidewalk,6);});
test('saved Gothic frontages generate actual connections without crossing a road-width gap',()=>{const city=new CityLayout(),links=historicFrontages(city.buildings);assert.ok(links.length>0);assert.ok(links.every(l=>l.end-l.begin<15&&l.end>l.begin));});
test('breach plans reject inside starts, blocked exits and impossible pitch',()=>{const b=new CityLayout().buildings.find(b=>b.id===287)!;const origin=new Vector3(b.x,11,b.z+b.d/2+15),d=new Vector3(0,0,-1),p=planBreach([b],origin,d,125,110,1.65,1.4);assert.ok(p);assert.ok(sweptSection(new Box3(new Vector3(b.x-2,10,b.z-1),new Vector3(b.x+2,12,b.z+1)),p));assert.equal(planBreach([b],new Vector3(b.x,11,b.z),d,125,110,1.65,1.4),null);assert.equal(planBreach([b],origin,new Vector3(0,.7,-.7),125,110,1.65,1.4),null);});
test('actual authored mid-rise opens entry then exit, keeps the real capsule enabled and restores both holes',async()=>{const f=await architectureFixture(),b=f.building,origin=new Vector3(b.x,11,b.z+b.d/2+15),plan=planBreach([b],origin,new Vector3(0,0,-1),125,110,1.65,1.4)!;try{assert.ok(plan);assert.equal(await f.architecture.prepareBreach(plan),true);assert.equal(plan.exitOpen,false);f.architecture.openBreachExit(plan);assert.equal(plan.exitOpen,true);const actor=new CharacterBody(f.physics,plan.entry.clone().add(new Vector3(0,-1.05,2))),velocity=new Vector3(0,0,-70);for(let i=0;i<80;i++){actor.move(velocity,1/60,true);f.physics.world.step();actor.sync();}assert.ok(actor.position.z<plan.exit.z-1,`Capsule stopped at ${actor.position.toArray()} before ${plan.exit.toArray()}`);assert.equal(actor.body.isEnabled(),true);const snapshot=f.architecture.serialize();assert.ok(snapshot.buildings[0].broken.length>0);await f.architecture.restore(snapshot);assert.equal(f.architecture.serialize().buildings[0].broken.length,snapshot.buildings[0].broken.length);assert.equal(f.architecture.serialize().breaches[0].exitOpen,true);actor.dispose();}finally{f.dispose();}});

test('nearby invalid structures block distant breakthrough targets and zero direction is rejected',()=>{
 const target=new CityLayout().buildings.find(b=>b.id===287)!;
 const wall={...target,id:-1,z:target.z+40,d:6,h:160,family:undefined};
 const origin=new Vector3(target.x,11,target.z+65);
 assert.equal(planBreach([target,wall],origin,new Vector3(0,0,-1),125,110,1.65,1.4),null);
 assert.equal(planBreach([target],origin,new Vector3(),125,110,1.65,1.4),null);
});

test('new key bindings yield to existing combat remaps and never take movement keys',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 try{
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>JSON.stringify({laser:['KeyY'],demolition:['KeyW']})}});
  const controls=loadControls();assert.deepEqual(controls.laser,['KeyY']);assert.deepEqual(controls.breakthrough,[]);assert.deepEqual(controls.demolition,[]);assert.deepEqual(controls.missiles,['KeyF']);
 }finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else Reflect.deleteProperty(globalThis,'localStorage');}
});

const payload=()=>({attributes:[{name:'position',array:new Float32Array([0,0,0,1,0,0,0,1,0]),size:3,normalized:false}],index:new Uint16Array([0,1,2]),matrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],damage:false});
test('denied or failed geometry workers cannot strand requests; disposal rejects later work',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'Worker');
 try{
  Object.defineProperty(globalThis,'Worker',{configurable:true,value:class {constructor(){throw new Error('Worker blocked');}}});
  const denied=new GeometryWorker();assert.equal((await denied.prepare(payload())).index!.length,3);denied.dispose();await assert.rejects(denied.prepare(payload()),/disposed/);
  let worker:{onerror:()=>void}|undefined;
  Object.defineProperty(globalThis,'Worker',{configurable:true,value:class {onerror=()=>{};constructor(){worker=this;}postMessage(){}terminate(){}}});
  const failed=new GeometryWorker(),request=failed.prepare(payload());worker!.onerror();await assert.rejects(request,/worker failed/);
  assert.equal((await failed.prepare(payload())).attributes[0].array.length,9);failed.dispose();
 }finally{if(previous)Object.defineProperty(globalThis,'Worker',previous);else Reflect.deleteProperty(globalThis,'Worker');}
});

function abilityHarness(f:Awaited<ReturnType<typeof architectureFixture>>,travel=new Vector3(0,0,-1),phase=0){
 const b=f.building,actor=new CharacterBody(f.physics,new Vector3(b.x,9.95,b.z-travel.z*(b.d/2+15+phase)));
 const player={suited:true,isFlying:true,ragdoll:{active:false},position:actor.position,body:actor,velocity:travel.clone().multiplyScalar(24),energy:100,controls:DEFAULT_CONTROLS,strikeHeading:null as number|null,armor:{jolt:()=>{}}};
 let tap='';const input={anyTap:(codes:string[])=>codes.includes(tap),anyHeld:()=>false};
 const status={setAttribute:()=>{},style:{},textContent:'',remove:()=>{}};
 const missiles={demolition:false,demolitionReady:true,demolitionRemaining:0};
 const ability=new TitanBreakthrough({layout:{buildings:[b]},architecture:f.architecture} as never,player as never,{addShake:()=>{},kick:()=>{}} as never,missiles as never,{cue:()=>{}} as never,status as unknown as HTMLElement);
 const tick=(code='')=>{tap=code;ability.update(1/60,input as never,{forward:travel.clone()} as never);tap='';};
 return {actor,player,ability,missiles,status,tick,dispose(){ability.dispose();actor.dispose();}};
}
const nextTask=()=>new Promise(r=>setTimeout(r,0));
test('intentional Titan activation enforces gates, charges once, crosses real collision and preserves the exit',async()=>{
 const f=await architectureFixture(),h=abilityHarness(f);
 try{
  h.player.suited=false;h.tick('KeyY');h.tick('KeyO');assert.equal(h.missiles.demolition,false);
  h.player.suited=true;h.player.velocity.set(0,0,0);h.tick('KeyY');
  h.player.velocity.set(0,0,24);h.tick('KeyY');
  h.player.velocity.set(0,0,-24);h.player.energy=2;h.tick('KeyY');
  assert.equal(f.architecture.states.size,0);assert.equal(h.player.energy,2);
  h.player.energy=100;h.tick('KeyY');
  for(let i=0;i<200&&h.ability.diagnostics().preparing;i++)await nextTask();
  assert.equal(h.ability.state,'approach');assert.equal(h.player.energy,68);
  assert.equal(f.architecture.serialize().breaches[0].exitOpen,false);
  let largestStep=0;
  for(let i=0;i<100&&h.ability.exits===0;i++){
   const before=h.actor.position.clone();h.tick();h.actor.move(h.player.velocity,1/60,true);f.physics.world.step();h.actor.sync();
   largestStep=Math.max(largestStep,before.distanceTo(h.actor.position));f.architecture.update(1/60,h.actor.position,true);
  }
  assert.equal(h.ability.entries,1);assert.equal(h.ability.exits,1);assert.ok(largestStep<=70/60+.002,`Unexpected motion step ${largestStep}`);assert.equal(h.actor.body.isEnabled(),true);
  assert.equal(f.architecture.serialize().breaches[0].exitOpen,true);assert.equal(h.player.strikeHeading,null);
  h.tick('KeyY');assert.equal(h.player.energy,68);assert.equal(h.ability.state,'cooldown');
  h.tick('KeyO');assert.equal(h.missiles.demolition,true);
 }finally{h.dispose();f.dispose();}
});
test('cancelling before deferred asset preparation causes neither free damage nor an energy charge',async()=>{
 const f=await architectureFixture(),h=abilityHarness(f);let release!:()=>void;
 f.architecture.assets.ensure=()=>new Promise<void>(r=>{release=r;});
 try{h.tick('KeyY');assert.equal(h.ability.state,'preparing');h.tick('KeyY');release();await nextTask();h.tick();assert.equal(f.architecture.states.size,0);assert.equal(h.player.energy,100);assert.equal(h.ability.diagnostics().preparing,false);}
 finally{h.dispose();f.dispose();}
});

test('authored glass tower collapse advances within LOW work/debris caps and finishes with no solid shell',async()=>{
 const f=await architectureFixture(235);f.architecture.setQuality('LOW');
 try{
  f.architecture.demonstrate(235,'structure');assert.equal(f.architecture.states.get(235)!.stage,'partial');
  const initial=f.architecture.totalBroken;f.architecture.update(1/60,new Vector3(f.building.x,15,f.building.z),true);assert.ok(f.architecture.totalBroken-initial<=12);
  f.architecture.demonstrate(235,'collapse');assert.equal(f.architecture.states.get(235)!.stage,'collapsed');
  let frames=0;while(f.architecture.states.get(235)!.collapse&&frames++<2500){const before=f.architecture.totalBroken;f.architecture.update(1/60,new Vector3(f.building.x,15,f.building.z),true);assert.ok(f.architecture.totalBroken-before<=12);assert.ok(f.architecture.diagnostics().activeDebris<=16);}
  const state=f.architecture.states.get(235)!;assert.equal(state.collapse,null);assert.equal(state.coarse.length,0);assert.equal(state.surfaces.size,0);assert.equal(state.colliders.size,0);assert.ok(state.batches.every(b=>b.mesh.geometry.drawRange.count===0));assert.ok(frames>20);
 }finally{f.dispose();}
});
test('simultaneous authored tower collapses share one frame work budget and both make progress',async()=>{
 const f=await architectureFixture(235,true);f.architecture.setQuality('LOW');
 try{f.architecture.demonstrate(235,'collapse');f.architecture.demonstrate(-235,'collapse');const initial=[...f.architecture.states.values()].map(s=>s.broken.size);
  for(let i=0;i<50;i++){const before=f.architecture.totalBroken;f.architecture.update(1/60,new Vector3(f.building.x,15,f.building.z),true);assert.ok(f.architecture.totalBroken-before<=12);}
  [...f.architecture.states.values()].forEach((s,i)=>assert.ok(s.broken.size>initial[i]));
 }finally{f.dispose();}
});
for(const [name,id] of [['Gothic',211],['glass tower',235]] as const)test(`${name} source geometry supports persistent capsule-sized breach openings`,async()=>{
 const f=await architectureFixture(id),h=abilityHarness(f);
 try{h.tick('KeyY');for(let i=0;i<250&&h.ability.diagnostics().preparing;i++)await nextTask();assert.equal(h.ability.state,'approach');
  for(let i=0;i<110&&h.ability.exits===0;i++){h.tick();h.actor.move(h.player.velocity,1/60,true);f.physics.world.step();h.actor.sync();f.architecture.update(1/60,h.actor.position,true);}
  assert.equal(h.ability.exits,1);const save=f.architecture.serialize();assert.ok(save.buildings[0].broken.length>0);await f.architecture.restore(save);assert.equal(f.architecture.serialize().breaches[0].exitOpen,true);
 }finally{h.dispose();f.dispose();}
});
test('saving and restoring a hot steel impact preserves energy without amplifying its heat',()=>{
 const source=new ArchitectureImpactEffects(),restored=new ArchitectureImpactEffects(),point=new Vector3(0,4,0),normal=new Vector3(0,0,1);
 try{source.heatSurface(point,normal,100,1,'steel');source.update(.4,point);const before=source.serialize();restored.restore(before);const after=restored.serialize();assert.equal(after[0].energy,before[0].energy);restored.update(40,point);const cooled=restored.serialize();assert.ok(cooled[0].energy<.0001);assert.equal(cooled.length,1);}
 finally{source.dispose();restored.dispose();}
});
test('sustained laser hits cut actual authored glass geometry through the normal damage path',async()=>{
 const f=await architectureFixture(235),b=f.building,family=familyOf(b)!,component=f.catalog.components.find((c:{family:string;kind:string;floor:number;side:number})=>c.family===b.family&&c.kind==='glass'&&c.floor===4&&c.side===0);
 try{assert.ok(component);const center=new Vector3(...component.center as [number,number,number]).multiply(new Vector3(b.w/family.width,b.h/(b.assetHeight??b.h),b.d/family.depth)).applyAxisAngle(new Vector3(0,1,0),b.angle??0).add(new Vector3(b.x,0,b.z));
  const normal=new Vector3(0,0,1).applyAxisAngle(new Vector3(0,1,0),b.angle??0),origin=center.clone().addScaledVector(normal,12),direction=normal.clone().negate();
  for(let i=0;i<100;i++){f.physics.world.step();const hit=f.physics.ray(origin,direction,30);if(hit){const p=origin.clone().addScaledVector(direction,hit.timeOfImpact);f.architecture.hit(hit.collider,26,p,direction,{kind:'laser',normal:[hit.normal.x,hit.normal.y,hit.normal.z]});}f.architecture.update(1/60,origin,true);}
  assert.ok(f.architecture.totalBroken>0);assert.ok(f.architecture.states.get(235)!.batches.some(p=>p.mesh.geometry.drawRange.count<p.original.length));assert.ok(f.architecture.effects.serialize().some(s=>s.energy>0));
  const scars=f.architecture.effects.serialize().length,broken=f.architecture.totalBroken;
  for(let i=0;i<10;i++)f.architecture.update(.25,origin.clone().add(new Vector3(600,0,0)),true);
  assert.equal(f.architecture.states.get(235)!.cold,true);assert.equal(f.architecture.effects.serialize().length,scars);assert.equal(f.architecture.totalBroken,broken);
 }finally{f.dispose();}
});

test('street shaders are warmed with isolated materials and concurrent jobs cannot replace readiness state',async()=>{
 const originals=new Map(['source','mailbox','streetNames'].map(name=>{const m=new MeshStandardMaterial();m.name=name;return [name,m] as const;}));
 const library=new AssetLibrary({get:(name:string)=>originals.get(name)!} as never),calls:{key:string;instanced:boolean;color:boolean}[]=[];let active=0,maxActive=0,disposed=0;
 for(const [key,material] of [['city_test_180_near','source'],['urban_mailbox','mailbox'],['realism_sign_label','streetNames']])library.parts.set(key,[{geometry:new BoxGeometry(),material}]);
 library.setRenderer({compileAsync:async(group:Scene)=>{active++;maxActive=Math.max(maxActive,active);assert.equal(group.children.length,1);const mesh=group.children[0] as InstancedMesh,material=mesh.material as MeshStandardMaterial;assert.notEqual(material.uuid,originals.get(material.name)!.uuid);material.addEventListener('dispose',()=>disposed++);calls.push({key:mesh.name,instanced:mesh instanceof InstancedMesh,color:!!mesh.instanceColor});await new Promise(r=>setTimeout(r,1));active--;}} as never,new Scene(),new PerspectiveCamera());
 try{await Promise.all([library.warmInitial(),library.warmInitial()]);assert.equal(maxActive,1);assert.equal(calls.length,4);assert.deepEqual(calls.filter(c=>c.key==='city_test_180_near').map(c=>[c.instanced,c.color]),[[false,false],[true,false]]);assert.ok(calls.some(c=>c.key==='urban_mailbox'&&c.instanced));assert.ok(calls.some(c=>c.key==='realism_sign_label'&&c.instanced));}
 finally{library.dispose();for(const m of originals.values())m.dispose();}assert.equal(disposed,4);
});

test('breakthrough never strikes its own closed exit collider at different approach phases',async()=>{
 for(const sign of [-1,1])for(const phase of [0,.2,.4]){
  const f=await architectureFixture(),h=abilityHarness(f,new Vector3(0,0,sign),phase),impacts:number[]=[];
  try{h.tick('KeyY');for(let i=0;i<200&&h.ability.diagnostics().preparing;i++)await nextTask();assert.equal(h.ability.state,'approach');
   for(let i=0;i<100&&h.ability.exits===0;i++){h.tick();h.actor.move(h.player.velocity,1/60,true,speed=>{if(speed>16)impacts.push(speed);});f.physics.world.step();h.actor.sync();f.architecture.update(1/60,h.actor.position,true);}
   assert.equal(h.ability.exits,1);assert.equal(impacts.length,0,`Direction ${sign}, phase ${phase} hit the prepared route at ${impacts}`);
  }finally{h.dispose();f.dispose();}
 }
});

test('offscreen shader preparation restores the live render target before waiting for compilation',async()=>{
 const material=new MeshStandardMaterial(),library=new AssetLibrary({get:()=>material} as never),target={} as never,liveTarget={} as never;
 let current:unknown=liveTarget,release!:(value:Scene)=>void,compiled=false;
 library.parts.set('urban_test',[{geometry:new BoxGeometry(),material:'test'}]);
 library.setRenderer({getRenderTarget:()=>current,setRenderTarget:(value:unknown)=>{current=value;},compileAsync:()=>{assert.equal(current,target);compiled=true;return new Promise<Scene>(r=>{release=r;});}} as never,new Scene(),new PerspectiveCamera(),target);
 try{const ready=library.warmInitial();await nextTask();assert.equal(compiled,true);assert.equal(current,liveTarget);release(new Scene());await ready;assert.equal(current,liveTarget);}finally{library.dispose();material.dispose();}
});
