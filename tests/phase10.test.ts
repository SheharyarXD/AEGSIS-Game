import test from 'node:test';import assert from 'node:assert/strict';
import {MeshPhysicalMaterial,Texture,Vector3} from 'three';
import {browserArchitectureMaterial} from '../src/world/environment/SourceMaterialPolicy';
import {CharacterBody,PhysicsWorld} from '../src/physics/PhysicsWorld';
import {CINEMATIC,flightEntry,flightExit,validateExterior,sweepFlight} from '../src/world/titan/CinematicRoute';
import {BreachPlan} from '../src/world/titan/BreachPlan';
import {architectureFixture} from './helpers/architecture-fixture';

const plan=():BreachPlan=>({buildingId:1,entry:new Vector3(0,2.42,-12),exit:new Vector3(0,2.42,-32),direction:new Vector3(0,0,-1),length:20,radius:2.75,halfHeight:2.3});
test('architectural glazing avoids a full-scene transmission pass while preserving supplied maps and color',()=>{
 const source=new MeshPhysicalMaterial({color:'#c6a674',transmission:.79,transparent:true,opacity:.25}),texture=new Texture();source.map=texture;source.normalMap=texture;source.name='supplied stained glass';const glass=browserArchitectureMaterial(source) as any;
 assert.notEqual(glass,source);assert.equal(glass.map,texture);assert.equal(glass.normalMap,texture);assert.equal(glass.color.getHex(),source.color.getHex());assert.equal(glass.name,source.name);assert.equal(glass.transmission,undefined);assert.equal(glass.transparent,false);assert.equal(glass.opacity,1);glass.dispose();texture.dispose();
});
test('stationary ground approach uses the real capsule without falsely intersecting its supporting ground',async()=>{
 await PhysicsWorld.init();const p=new PhysicsWorld(),actor=new CharacterBody(p,new Vector3(0,.0201,0));p.box(new Vector3(0,-.5,0),new Vector3(200,1,200));p.world.step();try{assert.equal(validateExterior(p,plan(),actor.position,actor.body),null);assert.equal(actor.body.isEnabled(),true);}finally{actor.dispose();p.dispose();}
});
test('preflight rejects an obstruction along the approach and beyond the far facade',async()=>{
 await PhysicsWorld.init();const p=new PhysicsWorld(),actor=new CharacterBody(p,new Vector3(0,1.37,0));
 try{const blocker=p.box(new Vector3(0,2,-5),new Vector3(5,6,1));p.world.step();assert.match(validateExterior(p,plan(),actor.position,actor.body)!,/ENTRY/);p.removeCollider(blocker);p.box(new Vector3(0,2,-39),new Vector3(5,6,1));p.world.step();assert.match(validateExterior(p,plan(),actor.position,actor.body)!,/EXIT/);}finally{actor.dispose();p.dispose();}
});
test('preflight rejects invalid world edges and nonfinite plans without moving the actor',async()=>{
 await PhysicsWorld.init();const p=new PhysicsWorld(),actor=new CharacterBody(p,new Vector3(0,1.37,0));try{const b=plan();b.exit.x=1006;assert.match(validateExterior(p,b,actor.position,actor.body)!,/WORLD EDGE/);b.exit.x=NaN;assert.match(validateExterior(p,b,actor.position,actor.body)!,/WORLD EDGE/);assert.deepEqual(actor.position.toArray(),[0,1.37,0]);}finally{actor.dispose();p.dispose();}
});
test('each cinematic movement sweep detects newly appearing solid geometry with collision still enabled',async()=>{
 await PhysicsWorld.init();const p=new PhysicsWorld(),actor=new CharacterBody(p,new Vector3(0,1.37,0));try{p.box(new Vector3(0,2,-1),new Vector3(5,6,.4));p.world.step();assert.ok(sweepFlight(p,actor.position,new Vector3(0,1.37,-2),actor.body));assert.equal(actor.body.isEnabled(),true);assert.deepEqual(actor.position.toArray(),[0,1.37,0]);}finally{actor.dispose();p.dispose();}
});
test('an unused outer-lane fragment does not veto a clear cinematic capsule corridor, but a central fragment does',async()=>{
 const f=await architectureFixture(287),b=f.building,p:BreachPlan={buildingId:b.id,entry:new Vector3(b.x,11,b.z+b.d/2+.8),exit:new Vector3(b.x,11,b.z-b.d/2-.8),direction:new Vector3(0,0,-1),length:b.d+1.6,radius:2.75,halfHeight:2.3};
 try{const token=await f.architecture.reserveBarrage(p);assert.ok(token);for(let wave=0;wave<3;wave++)for(let i=0;i<[3,3,2][wave];i++){f.physics.world.step();f.architecture.barrageImpact(token!,wave,f.architecture.barrageTarget(token!,i),new Vector3(0,0,1));for(let n=0;n<25;n++){f.physics.world.step();f.architecture.update(1/60,p.entry,true);}}
  for(let i=0;i<180&&!f.architecture.finishBarrage(token!,true);i++){f.physics.world.step();f.architecture.update(1/60,p.entry,true);}
  f.physics.box(p.entry.clone().add(new Vector3(2.6,0,-7)),new Vector3(1.3,1,1),{kind:'debris'});f.physics.world.step();assert.equal(f.architecture.finishBarrage(token!),false);assert.equal(f.architecture.finishBarrage(token!,true),true);
  f.physics.box(p.entry.clone().add(new Vector3(0,0,-7)),new Vector3(1,1,1),{kind:'debris'});f.physics.world.step();assert.equal(f.architecture.finishBarrage(token!,true),false);
 }finally{f.dispose();}
});
for(const id of [287,235,211])test(`actual source ${id} remains capsule-traversable along the prepared cinematic height`,async()=>{
 const f=await architectureFixture(id),b=f.building,p: BreachPlan={buildingId:id,entry:new Vector3(b.x,11,b.z+b.d/2+.8),exit:new Vector3(b.x,11,b.z-b.d/2-.8),direction:new Vector3(0,0,-1),length:b.d+1.6,radius:2.75,halfHeight:2.3};let actor:CharacterBody|undefined;
 try{const token=await f.architecture.reserveBarrage(p);assert.ok(token);for(let wave=0;wave<3;wave++)for(let i=0;i<[3,3,2][wave];i++){f.physics.world.step();const target=f.architecture.barrageTarget(token!,i);f.architecture.barrageImpact(token!,wave,target,new Vector3(0,0,1));for(let n=0;n<25;n++){f.physics.world.step();f.architecture.update(1/60,p.entry,true);}}
  for(let i=0;i<180&&!f.architecture.finishBarrage(token!);i++){f.physics.world.step();f.architecture.update(1/60,p.entry,true);}assert.equal(p.exitOpen,true);
  const foot=flightEntry(p);actor=new CharacterBody(f.physics,foot);let teleports=0;actor.teleport=()=>{teleports++;};const velocity=p.direction.clone().multiplyScalar(28),exit=flightExit(p);
  for(let i=0;i<400&&actor.position.clone().sub(exit).dot(p.direction)<1;i++){actor.move(velocity,1/60,true);f.physics.world.step();actor.sync();f.architecture.update(1/60,actor.position,true);velocity.copy(p.direction).multiplyScalar(28);}
  assert.ok(actor.position.clone().sub(exit).dot(p.direction)>=1);assert.equal(actor.body.isEnabled(),true);assert.equal(teleports,0);const saved=f.architecture.serialize();await f.architecture.restore(saved);assert.equal(f.architecture.serialize().breaches[0].exitOpen,true);assert.ok(CINEMATIC.exitSpeed>28);
 }finally{actor?.dispose();f.dispose();}
});
