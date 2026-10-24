import { strict as assert } from 'node:assert';
import { test, before } from 'node:test';
import { Vector3 } from 'three';
import { CharacterBody, FIXED_DT, PhysicsWorld, RAPIER } from '../src/physics/PhysicsWorld';
import { Destruction } from '../src/physics/Destruction';
import { ImpactVfx } from '../src/vfx/ImpactVfx';
before(async()=>await PhysicsWorld.init());

test('fixed step consumes equal simulation time at 30 and 144 Hz',()=>{
  const run=(hz:number)=>{const p=new PhysicsWorld();for(let i=0;i<hz*3;i++)p.advance(1/hz,()=>{},()=>{});const steps=p.steps;p.dispose();return steps;};
  assert.ok(Math.abs(run(30)-run(144))<=1);
});
test('capsule sweep stops a boosted player before a thin wall and supports ground contact',()=>{
  const p=new PhysicsWorld();p.box(new Vector3(0,-.5,0),new Vector3(50,1,50));p.box(new Vector3(0,4,-5),new Vector3(20,8,.2));
  const c=new CharacterBody(p,new Vector3(0,.04,0));p.world.step();let impacts=0;
  for(let i=0;i<30;i++){const v=new Vector3(0,-1,-52);c.move(v,FIXED_DT,true,()=>impacts++);p.world.step();c.sync();}
  assert.ok(c.position.z>-4.55,`wall penetration: ${c.position.z}`);assert.ok(c.position.y>=-.05);assert.ok(impacts>0);
  c.dispose();p.dispose();
});
test('CCD dynamic body thrown at 90 m/s collides with a thin wall',()=>{
  const p=new PhysicsWorld();p.box(new Vector3(0,2,-3),new Vector3(20,8,.12));p.box(new Vector3(0,-.5,0),new Vector3(30,1,30));
  const body=p.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0,2,0).setCcdEnabled(true));p.world.createCollider(RAPIER.ColliderDesc.ball(.2),body);body.setLinvel({x:0,y:0,z:-90},true);
  for(let i=0;i<120;i++)p.world.step();assert.ok(body.translation().z>-3.1);assert.ok(body.translation().y>=.1);p.dispose();
});
test('fracture removes solid collision, leaves a persistent opening, bounds debris and resets cleanly',()=>{
  const p=new PhysicsWorld(),vfx=new ImpactVfx(50),d=new Destruction(p,vfx,12);p.world.step();const piece=d.pieces[0],id=piece.collider!.handle;
  d.hit(piece.collider!,100,piece.position,new Vector3(0,0,-1));assert.equal(piece.broken,true);assert.equal(piece.mesh.visible,false);assert.equal(p.surfaces.has(id),false);assert.equal(d.debris.length,4);
  d.blast(new Vector3(0,2,-81),30,1000);assert.ok(d.debris.length<=12);assert.ok(d.broken>1);
  for(let i=0;i<1200;i++){p.world.step();d.update(FIXED_DT);}assert.equal(d.debris.length,0);assert.ok(d.broken>1);
  d.reset();assert.equal(d.broken,0);assert.ok(d.pieces.every(piece=>piece.collider?.isValid()&&piece.mesh.visible));assert.equal(p.world.bodies.len(),0);p.dispose();
});
test('long frame is bounded to five physics steps',()=>{const p=new PhysicsWorld();p.advance(2,()=>{},()=>{});assert.ok(p.steps<=5);assert.ok(p.droppedTime>1.9);p.dispose();});
test('camera sphere sweep shortens the boom before a solid wall',()=>{const p=new PhysicsWorld();p.box(new Vector3(0,2,3),new Vector3(10,5,.2));p.world.step();const fraction=p.cameraDistance(new Vector3(0,2,0),new Vector3(0,0,6));assert.ok(fraction>.3&&fraction<.49);p.dispose();});
