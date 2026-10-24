import { Box3, BufferGeometry, DynamicDrawUsage, Group, InstancedMesh, Mesh, Object3D, Quaternion, Vector3 } from 'three';
import { PhysicsWorld, RAPIER } from '../physics/PhysicsWorld';
import { Destruction } from '../physics/Destruction';
import { ImpactVfx } from '../vfx/ImpactVfx';
import { AssetLibrary } from './environment/AssetLibrary';
import { Building, CityLayout, profilesFor, familyOf } from './CityLayout';
import { WorldCollision } from './WorldCollision';
import { WorldStreaming } from './WorldStreaming';
type Kind='glass'|'wall'|'slab'|'roof'|'support'|'decoration';
interface Component {id:number;family:string;key:string;kind:Kind;floor:number;side:number;center:number[];size:number[];hp:number;structural?:boolean;collisionBoxes?:{center:number[];size:number[]}[];}
interface Batch {mesh:Mesh;original:Uint32Array|Uint16Array;ranges:Map<number,[number,number][]>;}
interface Damage {building:Building;broken:Set<number>;hp:Map<number,number>;colliders:Map<number,RAPIER.Collider[]>;activeFloors:Set<number>;coarse:RAPIER.Collider[];batches:Batch[];group:Group;collapse:{floor:number;sector:boolean;xSign:number;zSign:number;next:number}|null;stage:'local'|'partial'|'collapsed';}
interface Fragment {body:RAPIER.RigidBody|null;collider:RAPIER.Collider|null;object:Object3D;glass:boolean;age:number;}
/** Sparse damage state and selectively activated component collision. Intact architecture is batched. */
export class ArchitectureDestruction {
 readonly group=new Group();readonly states=new Map<number,Damage>();
 readonly fragments:Fragment[]=[];private pools:InstancedMesh[]=[];
 private templates=new Map<string,Component[]>();private hitOwners=new Map<number,{building:number;component:number}>();
 private vfx?:ImpactVfx;private linked?:Destruction;private elapsed=0;private cap=24;private fragmentCap=80;
 private epoch=0;private dead=false;
 maxActivationMs=0;lastActivationMs=0;totalBroken=0;
 constructor(readonly layout:CityLayout,readonly assets:AssetLibrary,readonly physics:PhysicsWorld,public collision:WorldCollision,readonly streaming:WorldStreaming,catalog:{components:Component[]}){
  for(const c of catalog.components){const list=this.templates.get(c.family)??[];list.push(c);this.templates.set(c.family,list);}
  this.rebindCollision(collision);
  for(const key of ['fracture_stone','fracture_glass']){const part=assets.parts.get(key)![0],pool=new InstancedMesh(part.geometry,assets.materials.get(part.material),this.fragmentCap);pool.count=0;pool.instanceMatrix.setUsage(DynamicDrawUsage);pool.castShadow=true;pool.receiveShadow=true;this.group.add(pool);this.pools.push(pool);}
 }
 setQuality(q:string){this.cap=q==='LOW'?24:q==='MEDIUM'?32:48;}
 rebindCollision(collision:WorldCollision){this.collision=collision;this.hitOwners.clear();for(const b of this.layout.buildings)if(b.family&&this.templates.has(b.family))for(const c of collision.byBuilding.get(b.id)??[])this.hitOwners.set(c.handle,{building:b.id,component:-1});}
 connect(combat:Destruction,vfx:ImpactVfx){this.linked=combat;this.vfx=vfx;combat.onWorldHit=(collider,strength,point,direction)=>this.hit(collider,strength,point,direction);combat.onWorldBlast=(p,r,s,d)=>this.blast(p,r,s,d);}
 propDebris(point:Vector3,size:number[]){this.spawn(point,size,false,new Vector3(0,1,1));this.vfx?.burst(point,1.2);}
 private activate(b:Building):Damage{
  const existing=this.states.get(b.id);if(existing)return existing;const start=performance.now();
  const group=new Group();group.name=`Damaged architecture ${b.id} / ${b.family}`;group.position.set(b.x,0,b.z);group.scale.set(b.w,b.h,b.d);this.group.add(group);
  group.rotation.y=b.angle??0;
  const state:Damage={building:b,broken:new Set(),hp:new Map(),colliders:new Map(),activeFloors:new Set(),coarse:[],batches:[],group,collapse:null,stage:'local'};this.states.set(b.id,state);
  this.streaming.hideBuilding(b.id);for(const old of this.collision.byBuilding.get(b.id)??[])this.hitOwners.delete(old.handle);this.collision.removeBuilding(b.id);
  for(const part of this.assets.parts.get(`${b.family}_${b.assetHeight??b.h}_near`)??[]){
   // Stable Blender component IDs survive triangle reordering during Meshopt compression.
   const source=part.geometry,cid=source.getAttribute('_cid'),sourceIndex=source.index;if(!cid||!sourceIndex)throw new Error('Building lacks authored component IDs: '+b.family);
   const merged=new BufferGeometry();for(const [name,attribute] of Object.entries(source.attributes))merged.setAttribute(name,attribute);merged.setIndex(sourceIndex.clone());merged.index!.setUsage(DynamicDrawUsage);merged.boundingBox=source.boundingBox?.clone()??null;merged.boundingSphere=source.boundingSphere?.clone()??null;
   const ranges=part.componentRanges!;
   const original=merged.index!.array.slice() as Uint32Array|Uint16Array;
   const mesh=new Mesh(merged,this.assets.materials.get(part.material));mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);state.batches.push({mesh,original,ranges});
  }
  this.rebuildCoarse(state);
  this.lastActivationMs=performance.now()-start;this.maxActivationMs=Math.max(this.maxActivationMs,this.lastActivationMs);return state;
 }
 private rebuildCoarse(state:Damage){
  for(const c of state.coarse){this.hitOwners.delete(c.handle);this.physics.removeCollider(c);}state.coarse=[];const b=state.building;
  const source=familyOf(b);
  if(source&&'collisionContours' in source){
   source.collisionContours.forEach((contour,floor)=>{if(state.activeFloors.has(floor)||contour.length<3)return;const vertices:number[]=[],angle=b.angle??0,low=floor*4*this.scale(b),high=Math.min(b.h,(floor+1)*4*this.scale(b));for(const y of [low,high])for(const [x,z] of contour){const xx=x*b.w,zz=z*b.d;vertices.push(xx*Math.cos(angle)+zz*Math.sin(angle),y,-xx*Math.sin(angle)+zz*Math.cos(angle));}const desc=RAPIER.ColliderDesc.convexHull(new Float32Array(vertices));if(desc){const c=this.physics.world.createCollider(desc.setTranslation(b.x,0,b.z).setFriction(.8));this.physics.surfaces.set(c.handle,{kind:'world'});state.coarse.push(c);this.hitOwners.set(c.handle,{building:b.id,component:-1});}});
   return;
  }
  for(const [start,portion,w,d] of profilesFor(b)){
   const first=Math.round(start*(b.assetHeight??b.h)/4),last=Math.round((start+portion)*(b.assetHeight??b.h)/4);let begin=-1;
   for(let floor=first;floor<=last;floor++){
    const solid=floor<last&&!state.activeFloors.has(floor);if(solid&&begin<0)begin=floor;
    if(!solid&&begin>=0){const c=this.physics.box(new Vector3(b.x,(begin+floor)*2*this.scale(b),b.z),new Vector3(b.w*w,(floor-begin)*4*this.scale(b),b.d*d));state.coarse.push(c);this.hitOwners.set(c.handle,{building:b.id,component:-1});begin=-1;}
   }
  }
 }
 private ensureFloor(state:Damage,floor:number){
  if(state.activeFloors.has(floor))return;state.activeFloors.add(floor);this.rebuildCoarse(state);const b=state.building;
  for(const c of this.templates.get(b.family!)!){if(c.floor!==floor||c.kind==='decoration'||state.broken.has(c.id))continue;
   if(!c.collisionBoxes){
    const vertices:number[]=[],indices:number[]=[];
    for(const batch of state.batches){const position=batch.mesh.geometry.getAttribute('position');for(const [start,count] of batch.ranges.get(c.id)??[])for(let i=start;i<start+count;i++){const index=batch.original[i];vertices.push(position.getX(index)*b.w,position.getY(index)*b.h,position.getZ(index)*b.d);indices.push(indices.length);}}
    if(vertices.length){const collider=this.physics.world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(vertices),new Uint32Array(indices)).setTranslation(b.x,0,b.z).setRotation(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),b.angle??0)).setFriction(.8));this.physics.surfaces.set(collider.handle,{kind:'world'});state.colliders.set(c.id,[collider]);this.hitOwners.set(collider.handle,{building:b.id,component:c.id});}continue;
   }
   const boxes=c.kind==='glass'?[{center:c.center,size:c.size}]:c.collisionBoxes??[],colliders:RAPIER.Collider[]=[];
   for(const box of boxes){if(c.kind!=='glass'&&Math.min(...box.size)<.18)continue;const p=new Vector3(...box.center as [number,number,number]).multiply(this.scaleVector(b)).applyAxisAngle(new Vector3(0,1,0),b.angle??0).add(new Vector3(b.x,0,b.z)),size=new Vector3(...box.size as [number,number,number]).multiply(this.scaleVector(b));const collider=this.physics.box(p,size);collider.setRotation(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),b.angle??0));colliders.push(collider);this.hitOwners.set(collider.handle,{building:b.id,component:c.id});}state.colliders.set(c.id,colliders);
  }
 }
 private scale(b:Building){return b.h/(b.assetHeight??b.h);}
 private scaleVector(b:Building){const f=familyOf(b)!;return new Vector3(b.w/f.width,b.h/(b.assetHeight??b.h),b.d/f.depth);}
 private position(b:Building,c:Component){return new Vector3(...c.center as [number,number,number]).multiply(this.scaleVector(b)).applyAxisAngle(new Vector3(0,1,0),b.angle??0).add(new Vector3(b.x,0,b.z));}
 private distance(b:Building,c:Component,p:Vector3){const half=new Vector3(...c.size as [number,number,number]).multiply(this.scaleVector(b)).multiplyScalar(.5);return new Box3(this.position(b,c).sub(half),this.position(b,c).add(half)).distanceToPoint(p);}
 hit(collider:RAPIER.Collider,strength:number,point:Vector3,direction:Vector3):boolean{
  const owner=this.hitOwners.get(collider.handle);if(!owner)return false;const b=this.layout.buildings.find(b=>b.id===owner.building)!;
  if(!this.assets.parts.has(`${b.family}_${b.assetHeight??b.h}_near`)){const epoch=this.epoch;void this.assets.ensure(b.family!,b.assetHeight??b.h,'near').then(()=>{if(!this.dead&&epoch===this.epoch)this.blast(point.clone(),1.4,strength,direction);}).catch(()=>{});return false;}
  const state=this.activate(b);const available=this.templates.get(b.family!)!.filter(c=>!state.broken.has(c.id));
  const component=owner.component>=0?available.find(c=>c.id===owner.component):available.sort((a,c)=>this.distance(b,a,point)-this.distance(b,c,point))[0];
  if(!component)return false;return this.damage(state,component,strength,direction);
 }
 blast(point:Vector3,radius:number,strength:number,direction=new Vector3(0,0,1)):void{
  for(const b of this.layout.buildings){if(!b.family||!this.templates.has(b.family))continue;
   const box=new Box3(new Vector3(b.x-b.w/2,0,b.z-b.d/2),new Vector3(b.x+b.w/2,b.h+13,b.z+b.d/2));if(box.distanceToPoint(point)>radius)continue;
   if(!this.assets.parts.has(`${b.family}_${b.assetHeight??b.h}_near`)){const epoch=this.epoch;void this.assets.ensure(b.family,b.assetHeight??b.h,'near').then(()=>{if(!this.dead&&epoch===this.epoch)this.blast(point.clone(),radius,strength,direction);}).catch(()=>{});continue;}
   const state=this.activate(b);for(const c of this.templates.get(b.family)!)if(!state.broken.has(c.id)){const d=this.distance(b,c,point);if(d<radius)this.damage(state,c,strength*(1-d/(radius+.01)),direction);}
  }
 }
 private damage(state:Damage,c:Component,strength:number,direction:Vector3):boolean{
  if(state.broken.has(c.id))return false;const hp=(state.hp.get(c.id)??c.hp)-Math.max(0,strength);state.hp.set(c.id,hp);
  if(hp>0){this.vfx?.mark(this.position(state.building,c),direction.clone().negate(),.6);return false;}
  this.remove(state,c,direction,true);if(c.kind==='support')this.checkSupport(state,c.floor);return true;
 }
 private remove(state:Damage,c:Component,direction:Vector3,debris:boolean){
  if(state.broken.has(c.id))return;this.ensureFloor(state,c.floor);state.broken.add(c.id);this.totalBroken++;
  for(const collider of state.colliders.get(c.id)??[]){this.hitOwners.delete(collider.handle);this.physics.removeCollider(collider);}state.colliders.delete(c.id);
  for(const batch of state.batches){const index=batch.mesh.geometry.index!;for(const [start,count] of batch.ranges.get(c.id)??[]){index.array.fill(0,start,start+count);index.addUpdateRange(start,count);index.needsUpdate=true;}}
  if(debris){this.spawn(this.position(state.building,c),c.size,c.kind==='glass',direction);this.vfx?.burst(this.position(state.building,c),c.kind==='glass'?.45:1.2,new Vector3(0,1,0),c.kind!=='glass');}
 }
 private checkSupport(state:Damage,floor:number){
  const supports=this.templates.get(state.building.family!)!.filter(c=>c.kind==='support'&&c.floor===floor&&(c.structural===true||c.structural===undefined&&(c.size[0]>4||c.size[0]<1&&c.size[2]<1))),lost=supports.filter(c=>state.broken.has(c.id)).length;
  if(lost<2)return;const complete=lost>=4&&floor<state.building.h/16;
  const lostPosts=supports.filter(c=>state.broken.has(c.id)&&c.size[0]<1),xs=lostPosts.reduce((n,c)=>n+c.center[0],0),zs=lostPosts.reduce((n,c)=>n+c.center[2],0);state.stage=complete?'collapsed':'partial';state.collapse={floor,sector:!complete,xSign:Math.abs(xs)>1?Math.sign(xs):0,zSign:Math.abs(zs)>1?Math.sign(zs):0,next:this.elapsed};
 }
 private spawn(point:Vector3,size:number[],glass:boolean,direction:Vector3){
  for(let n=0;n<(glass?3:2);n++){
   while(this.fragments.filter(f=>f.body).length>=this.cap){const index=this.fragments.findIndex(f=>f.body);this.retire(this.fragments[index]);this.fragments.splice(index,1);}
   while(this.fragments.length>=this.fragmentCap){this.retire(this.fragments[0]);this.fragments.shift();}
   const scale=new Vector3(Math.min(2.2,size[0]*.38),Math.min(1.6,size[1]*.4),Math.min(1.7,Math.max(glass?.12:.28,size[2]*.35)));const p=point.clone().add(new Vector3((n-.5)*.5,.1,.3));
   const body=this.physics.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x,p.y,p.z).setLinearDamping(.22).setAngularDamping(.8).setCcdEnabled(true));
   const collider=this.physics.world.createCollider(RAPIER.ColliderDesc.cuboid(scale.x/2,scale.y/2,scale.z/2).setDensity(glass?260:650).setFriction(.9).setRestitution(.04),body);this.physics.surfaces.set(collider.handle,{kind:'debris'});
   body.setLinvel(direction.clone().multiplyScalar(4).add(new Vector3(n-.5,2,1)),true);body.setAngvel({x:n-.4,y:.8,z:.3},true);
   const object=new Object3D();object.position.copy(p);object.scale.copy(scale);this.fragments.push({body,collider:null,object,glass,age:0});
  }
 }
 private retire(f:Fragment){if(f.body){f.object.position.copy(f.body.translation());f.object.quaternion.copy(f.body.rotation());this.physics.removeBody(f.body);f.body=null;}if(f.collider){this.physics.removeCollider(f.collider);f.collider=null;}}
 /** QA damage stages use the same hit/strength/support path as gameplay. */
 demonstrate(id:number,stage:'windows'|'wall'|'structure'|'collapse'){
  const b=this.layout.buildings.find(b=>b.id===id);if(!b?.family||!this.templates.has(b.family))throw new Error('No authored destruction family for '+id);const state=this.activate(b),components=this.templates.get(b.family)!;
  if(stage==='windows'||stage==='wall'){
   const target=components.filter(c=>c.kind==='glass'&&c.side===0).sort((a,b)=>Math.abs(a.floor-4)-Math.abs(b.floor-4))[0]??components.find(c=>c.kind==='glass');if(!target)throw new Error('Source model has no glass components: '+b.family);const p=this.position(b,target);
   if(stage==='windows')for(const c of components.filter(c=>c.kind==='glass'&&c.side===target.side&&Math.abs(c.floor-target.floor)<=1&&Math.abs(c.center[0]-target.center[0])<5))this.damage(state,c,40,new Vector3(0,0,1));
   else this.blast(p,5.4,650,new Vector3(0,0,1));return p.toArray();
  }
  const floor=stage==='collapse'?0:6;for(const c of components.filter(c=>c.kind==='support'&&c.floor===floor&&(c.structural===true||c.structural===undefined&&(c.size[0]>4||c.size[0]<1&&c.size[2]<1))).slice(0,stage==='collapse'?5:2))this.damage(state,c,1000,new Vector3(0,0,1));
  return [b.x,4*floor+2,b.z];
 }
 update(dt:number,target:Vector3,active:boolean){
  if(!active)return;this.elapsed+=dt;
  for(const state of this.states.values()){
   // Damage visuals and collision remain independent of intact tile lifetimes.
   state.group.visible=Math.hypot(state.building.x-target.x,state.building.z-target.z)<1800;
   const collapse=state.collapse;if(collapse&&this.elapsed>=collapse.next){
    const floor=collapse.floor++;collapse.next=this.elapsed+.065;const pieces=this.templates.get(state.building.family!)!.filter(c=>c.floor===floor&&(!collapse.sector||(collapse.xSign===0||c.center[0]*collapse.xSign>0)&&(collapse.zSign===0||c.center[2]*collapse.zSign>0)));
    for(let i=0;i<pieces.length;i++)this.remove(state,pieces[i],new Vector3(.8,-.4,1),i%12===0);
    if(floor>(state.building.assetHeight??state.building.h)/4){state.collapse=null;this.vfx?.burst(new Vector3(state.building.x,2,state.building.z),5);}
   }
  }
  for(const f of this.fragments){f.age+=dt;if(f.body){f.object.position.copy(f.body.translation());f.object.quaternion.copy(f.body.rotation());if(f.body.isSleeping()||f.age>9&&f.object.position.y<3){this.retire(f);const s=f.object.scale,p=f.object.position;f.collider=this.physics.world.createCollider(RAPIER.ColliderDesc.cuboid(s.x/2,s.y/2,s.z/2).setTranslation(p.x,p.y,p.z).setRotation(f.object.quaternion).setFriction(.9));this.physics.surfaces.set(f.collider.handle,{kind:'debris'});}}}
  for(let i=0;i<2;i++){const pool=this.pools[i],fragments=this.fragments.filter(f=>f.glass===(i===1));pool.count=fragments.length;fragments.forEach((f,n)=>{f.object.updateMatrix();pool.setMatrixAt(n,f.object.matrix);});pool.instanceMatrix.needsUpdate=true;pool.computeBoundingSphere();}
 }
 diagnostics(){return {supportedBuildings:this.layout.buildings.filter(b=>b.family&&this.templates.has(b.family)).length,damagedBuildings:this.states.size,brokenComponents:this.totalBroken,activeDebris:this.fragments.filter(f=>f.body).length,staticDebris:this.fragments.filter(f=>f.collider).length,debrisCap:this.cap,maxActivationMs:this.maxActivationMs,states:[...this.states.values()].map(s=>({id:s.building.id,family:s.building.family,broken:s.broken.size,stage:s.stage,colliders:[...s.colliders.values()].reduce((n,c)=>n+c.length,0)}))};}
 reset(){this.epoch++;for(const f of this.fragments)this.retire(f);this.fragments.length=0;for(const pool of this.pools)pool.count=0;for(const s of this.states.values()){for(const c of s.coarse)this.physics.removeCollider(c);for(const list of s.colliders.values())for(const c of list)this.physics.removeCollider(c);for(const b of s.batches)b.mesh.geometry.dispose();s.group.removeFromParent();}this.states.clear();this.hitOwners.clear();this.streaming.hiddenBuildings.clear();this.totalBroken=0;this.elapsed=0;}
 dispose(){this.dead=true;this.reset();if(this.linked){this.linked.onWorldHit=undefined;this.linked.onWorldBlast=undefined;}for(const p of this.pools)p.dispose();this.group.removeFromParent();this.group.clear();}
}
