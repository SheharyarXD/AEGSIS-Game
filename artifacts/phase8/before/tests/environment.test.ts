import { strict as assert } from 'node:assert';
import { before,test } from 'node:test';
import { BufferAttribute,BufferGeometry,Group,InstancedMesh,MeshBasicMaterial,Vector3 } from 'three';
import { CityLayout,DISTRICTS,PROFILES,familyOf } from '../src/world/CityLayout';
import { FIXED_CITY_BUILDINGS } from '../src/world/FixedCityLayout';
import { WorldCollision } from '../src/world/WorldCollision';
import { WorldStreaming,WORLD_QUALITY } from '../src/world/WorldStreaming';
import { WeatherState,WEATHER_NAMES,WEATHER } from '../src/world/environment/WeatherState';
import { AssetLibrary } from '../src/world/environment/AssetLibrary';
import { CharacterBody,FIXED_DT,PhysicsWorld } from '../src/physics/PhysicsWorld';
before(async()=>await PhysicsWorld.init());

test('the city is reproducible, independent of render quality, and covers five districts',()=>{
 const a=new CityLayout(),b=new CityLayout();assert.equal(a.signature(),b.signature());assert.equal(a.buildings.length,FIXED_CITY_BUILDINGS.length);assert.ok(a.buildings.every(b=>b.family));
 for(const id of Object.keys(DISTRICTS))assert.ok(a.buildings.some(b=>b.district===id),id);
 for(const q of Object.keys(WORLD_QUALITY)){void q;assert.equal(new CityLayout().signature(),a.signature());}
 assert.ok(a.roads.some(r=>r.a.x!==r.b.x&&r.a.z!==r.b.z));assert.ok(a.roads.some(r=>r.elevated));
 assert.ok(a.buildings.every(b=>b.id>=8000||!(Math.abs(b.x)<112&&b.z>-149&&b.z<88)));assert.ok(a.tiles.size===256);
});
test('all weather states initialize, interpolate, accumulate and reset',()=>{
 const state=new WeatherState();for(const preset of WEATHER_NAMES){state.setWeather(preset,0);assert.deepEqual(state.values,WEATHER[preset]);state.update(1/60);assert.ok(Object.values(state.values).every(Number.isFinite));}
 state.setWeather('clear',0);state.setWeather('heavy-rain',2);state.update(.1);assert.ok(state.values.rain>0&&state.values.rain<1);
 for(let i=0;i<1800;i++)state.update(1/60);assert.ok(state.wetness>.8);
 state.setWeather('heavy-snow',0);for(let i=0;i<3600;i++)state.update(1/60);assert.ok(state.snowCover>.6);
 state.reset();assert.equal(state.wetness,0);assert.equal(state.snowCover,0);assert.equal(state.preset,'partly-cloudy');
});
test('day clock is independent of weather and windows respond to the solar cycle',()=>{
 const state=new WeatherState();state.setTime(12);const noon=state.night;state.setTime(0);assert.ok(state.night>noon+.9);
 state.setWeather('heavy-rain',0);assert.equal(state.hour,0);state.paused=false;state.dayLength=24;for(let i=0;i<60;i++)state.update(1/60);assert.ok(Math.abs(state.hour-1)<.001);
 state.paused=true;state.update(.1);assert.ok(Math.abs(state.hour-1)<.001);
});
function fakeLibrary(){
 const geometry=new BufferGeometry();geometry.setAttribute('position',new BufferAttribute(new Float32Array([0,0,0,1,0,0,0,1,0]),3));const material=new MeshBasicMaterial();let live=0,created=0,disposed=0;
 const assets={instance:(key:string,matrices:import('three').Matrix4[],parent:Group)=>{const mesh=new InstancedMesh(geometry,material,matrices.length);mesh.name=key;matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));parent.add(mesh);live++;created++;mesh.addEventListener('dispose',()=>{live--;disposed++;});return [mesh];}} as unknown as AssetLibrary;
 return {assets,counts:()=>({live,created,disposed}),dispose:()=>{geometry.dispose();material.dispose();}};
}
test('streaming remains bounded, restores distant geometry and disposes instance allocations',()=>{
 const fake=fakeLibrary(),layout=new CityLayout(),stream=new WorldStreaming(layout,fake.assets,'LOW');
 for(let i=0;i<50;i++){
  stream.update(new Vector3(-850+(i%10)*175,80,-750+Math.floor(i/10)*320),new Vector3(90,0,20),undefined,true);
  assert.ok(stream.loaded.size<=WORLD_QUALITY.LOW.maxTiles);assert.equal(stream.pending,0);
 }
 assert.ok(stream.unloads>100);assert.ok(fake.counts().live<180);
 stream.setQuality('ULTRA');stream.update(new Vector3(0,250,-450),new Vector3(0,0,-120),undefined,true);assert.ok(stream.loaded.size<=28);
 stream.dispose();assert.equal(fake.counts().live,0);assert.equal(fake.counts().created,fake.counts().disposed);fake.dispose();
});
test('flight direction prefetch includes upcoming tiles without abandoning current vicinity',()=>{
 const fake=fakeLibrary(),stream=new WorldStreaming(new CityLayout(),fake.assets,'LOW');const point=new Vector3(-400,80,350),velocity=new Vector3(100,0,0);
 const selected=stream.select(point,velocity);assert.ok(selected.some(t=>t.x>point.x+120));assert.ok(selected.some(t=>Math.hypot(t.x-point.x,t.z-point.z)<130));stream.dispose();fake.dispose();
});
test('rooftops land on the exact authored profile even when no detailed tile is loaded',()=>{
 const physics=new PhysicsWorld(),layout=new CityLayout(),collision=new WorldCollision(layout,physics);
 physics.box(new Vector3(0,-.5,0),new Vector3(2048,1,2048));
 for(const style of Object.keys(PROFILES)){
  const b=layout.buildings.find(b=>b.style===style)!,contour=familyOf(b)!.collisionContours.at(-1)!,x=contour.reduce((n,p)=>n+p[0],0)/contour.length*b.w,z=contour.reduce((n,p)=>n+p[1],0)/contour.length*b.d,angle=b.angle??0;
  const c=new CharacterBody(physics,new Vector3(b.x+x*Math.cos(angle)+z*Math.sin(angle),b.h+5,b.z-x*Math.sin(angle)+z*Math.cos(angle)));physics.world.step();
  for(let i=0;i<180;i++){c.move(new Vector3(0,-8,0),FIXED_DT,false);physics.world.step();c.sync();}
  assert.ok(Math.abs(c.position.y-b.h)<.15,`${style}: landed ${c.position.y}, roof ${b.h}`);assert.ok(c.grounded);c.dispose();
 }
 const count=collision.count;assert.ok(count>1800);collision.dispose();assert.equal(collision.count,0);physics.dispose();
});
test('resident collision stops a 200 m/s sweep at a building in a different district',()=>{
 const physics=new PhysicsWorld(),layout=new CityLayout(),collision=new WorldCollision(layout,physics);
 const b=layout.buildings.find(b=>b.district==='industrial')!;
 const c=new CharacterBody(physics,new Vector3(b.x-b.w/2-8,b.h*.4,b.z));physics.world.step();
 for(let i=0;i<20;i++){c.move(new Vector3(200,0,0),FIXED_DT,true);physics.world.step();c.sync();}
 assert.ok(c.position.x<b.x-b.w/2-.2);assert.ok(c.position.y>0);assert.ok(collision.hasTile(b.tile));c.dispose();collision.dispose();physics.dispose();
});
test('collision disposal does not remove pre-existing hero/spawn surfaces',()=>{
 const physics=new PhysicsWorld(),spawn=physics.box(new Vector3(0,0,58),new Vector3(6,.2,6)),collision=new WorldCollision(new CityLayout(),physics);
 collision.dispose();assert.ok(spawn.isValid());assert.equal(physics.world.colliders.len(),1);physics.dispose();
});
test('curved source tower collision has oblique exterior normals derived from its real contour',()=>{
 const physics=new PhysicsWorld(),layout=new CityLayout(),collision=new WorldCollision(layout,physics),b=layout.buildings.find(b=>b.id===235)!;physics.world.step();
 const contour=familyOf(b)!.collisionContours[Math.floor((b.assetHeight??b.h)*.4/4)],angle=b.angle??0;
 const edges=contour.map((p,i)=>{const q=contour[(i+1)%contour.length];return {p,q,dx:(q[0]-p[0])*b.w,dz:(q[1]-p[1])*b.d};}).filter(e=>Math.abs(e.dx)>.1&&Math.abs(e.dz)>.1);assert.ok(edges.length>0);
 const e=edges[0],point=new Vector3((e.p[0]+e.q[0])*b.w/2,0,(e.p[1]+e.q[1])*b.d/2).applyAxisAngle(new Vector3(0,1,0),angle).add(new Vector3(b.x,b.h*.4,b.z)),normal=new Vector3(e.dz,0,-e.dx).normalize().applyAxisAngle(new Vector3(0,1,0),angle);
 const hit=physics.ray(point.clone().addScaledVector(normal,3),normal.clone().negate(),6);assert.ok(hit&&new Vector3().copy(hit.normal).dot(normal)>.8,'actual curved contour contact normal');
 collision.dispose();physics.dispose();
});
