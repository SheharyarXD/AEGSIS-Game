import { Box3, BufferAttribute, BufferGeometry, DynamicDrawUsage, Group, InstancedMesh, Mesh, Object3D, Quaternion, Vector3 } from 'three';
import { PhysicsWorld, RAPIER } from '../physics/PhysicsWorld';
import { Destruction } from '../physics/Destruction';
import { ImpactVfx } from '../vfx/ImpactVfx';
import { AssetLibrary } from './environment/AssetLibrary';
import { Building, CityLayout, profilesFor, familyOf } from './CityLayout';
import { WorldCollision } from './WorldCollision';
import { WorldStreaming } from './WorldStreaming';
import { ArchitectureImpactEffects } from './environment/ArchitectureImpactEffects';
import { DamageIndex } from './DamageIndex';
import { collisionTriangles } from './CollisionTriangles';
import { TITAN_CONFIG, WorldAttack, worldAttackScale } from './titan/TitanConfig';
import { DamageMaterial, materialFor } from './titan/ThermalDamage';
import { BreachPlan, sweptSection, exitOpeningProgress } from './titan/BreachPlan';
import { BreachInteriors } from './titan/BreachInteriors';
import { SupportGraph } from './titan/SupportGraph';
import { DestructionScheduler } from './titan/DestructionScheduler';
type Kind='glass'|'wall'|'slab'|'roof'|'support'|'decoration';
interface Component {id:number;family:string;key:string;kind:Kind;floor:number;side:number;center:number[];size:number[];hp:number;structural?:boolean;collisionBoxes?:{center:number[];size:number[]}[];}
interface Batch {mesh:Mesh;original:Uint32Array|Uint16Array;ranges:Map<number,[number,number][]>;damageIndex:DamageIndex;}
interface FloorSurface {vertices:Float32Array;index:DamageIndex<Uint32Array>;collider:RAPIER.Collider|null;dirty:boolean;}
interface Damage {building:Building;broken:Set<number>;hp:Map<number,number>;colliders:Map<number,RAPIER.Collider[]>;surfaces:Map<number,FloorSurface>;activeFloors:Set<number>;coarse:RAPIER.Collider[];coarseFloors:Map<number,RAPIER.Collider[]>;batches:Batch[];group:Group;cold:boolean;dirty:boolean;collapse:{floor:number;sector:boolean;xSign:number;zSign:number;next:number;pieces?:Component[];cursor?:number}|null;stage:'local'|'partial'|'collapsed';}
interface Fragment {body:RAPIER.RigidBody|null;collider:RAPIER.Collider|null;object:Object3D;glass:boolean;age:number;source?:boolean;material?:DamageMaterial;}
/** Sparse damage state and selectively activated component collision. Intact architecture is batched. */
export class ArchitectureDestruction {
 readonly group=new Group();readonly states=new Map<number,Damage>();
 readonly fragments:Fragment[]=[];private pools:InstancedMesh[]=[];private poolMaterials:DamageMaterial[]=[];
 readonly effects=new ArchitectureImpactEffects();readonly scheduler=new DestructionScheduler();
 private breaches:BreachPlan[]=[];private interiors:BreachInteriors;private graphs=new Map<string,SupportGraph>();
 private templates=new Map<string,Component[]>();private hitOwners=new Map<number,{building:number;component:number}>();
 private componentsById=new Map<string,Map<number,Component>>();
 private componentsByFloor=new Map<string,Map<number,Component[]>>();
 private buildingsById=new Map<number,Building>();
 private linked?:Destruction;private elapsed=0;private cap=24;private fragmentCap=80;private workQuality='LOW';private requestedQuality='LOW';private pressure=0;private calm=0;private adaptive=false;
 private epoch=0;private dead=false;private collapseCursor=0;
 maxActivationMs=0;lastActivationMs=0;totalBroken=0;
 constructor(readonly layout:CityLayout,readonly assets:AssetLibrary,readonly physics:PhysicsWorld,public collision:WorldCollision,readonly streaming:WorldStreaming,catalog:{components:Component[]}){
  for(const b of layout.buildings)this.buildingsById.set(b.id,b);
  for(const c of catalog.components){const list=this.templates.get(c.family)??[];list.push(c);this.templates.set(c.family,list);const ids=this.componentsById.get(c.family)??new Map();ids.set(c.id,c);this.componentsById.set(c.family,ids);const floors=this.componentsByFloor.get(c.family)??new Map<number,Component[]>(),floor=floors.get(c.floor)??[];floor.push(c);floors.set(c.floor,floor);this.componentsByFloor.set(c.family,floors);}
  for(const [family,components] of this.templates)this.graphs.set(family,new SupportGraph(components));
  this.interiors=new BreachInteriors(assets,physics);this.group.add(this.interiors.group);
  this.rebindCollision(collision);
  this.group.add(this.effects.group,this.effects.explosions.group);
  this.effects.setSurfaceResolver((id,p,n)=>{
   // Remote detailed colliders are asleep; their absence must not erase a saved scorch.
   if(this.states.get(id)?.cold)return {p:p.clone().addScaledVector(n,-.035),n:n.clone()};
   const tangent=new Vector3().crossVectors(n,new Vector3(0,1,0));if(tangent.lengthSq()<.01)tangent.set(1,0,0);tangent.normalize();
   // Query only surviving surfaces owned by this building. Try the nearby rim when the impact opens a hole.
   for(const [u,v] of [[0,0],[0,-.8],[-.8,0],[.8,0],[0,.8],[0,-1.8],[-1.8,0],[1.8,0],[0,1.8],[0,-3.5],[-3.5,0],[3.5,0],[0,3.5],[0,-6],[-6,0],[6,0],[0,6]]){
    const origin=p.clone().addScaledVector(n,.6).addScaledVector(tangent,u).add(new Vector3(0,v,0)),ray=new RAPIER.Ray(origin,n.clone().negate());
    const hit=this.physics.world.castRayAndGetNormal(ray,14,true,undefined,undefined,undefined,undefined,c=>this.hitOwners.get(c.handle)?.building===id);
    if(hit){const normal=new Vector3(hit.normal.x,hit.normal.y,hit.normal.z);if(normal.dot(n)<.3)continue;return {p:origin.addScaledVector(n,-hit.timeOfImpact),n:normal};}
   }return null;
  });
  for(const kind of ['stone','glass','concrete','brick','steel','composite'] as DamageMaterial[]){const key='titan_fragment_'+kind,parts=assets.parts.get(key)??assets.parts.get(kind==='glass'?'fracture_glass':'fracture_stone')!;for(const part of parts){const pool=new InstancedMesh(part.geometry,assets.materials.get(part.material),this.fragmentCap);pool.count=0;pool.instanceMatrix.setUsage(DynamicDrawUsage);pool.castShadow=true;pool.receiveShadow=true;this.group.add(pool);this.pools.push(pool);this.poolMaterials.push(kind);}}
 }
 setQuality(q:string){this.requestedQuality=q;this.adaptive=false;this.pressure=this.calm=0;this.applyBudget(q);}
 private applyBudget(q:string){this.workQuality=q;this.scheduler.setQuality(q);this.cap=q==='LOW'?16:q==='MEDIUM'?24:q==='HIGH'?32:40;this.effects.setQuality(q);while(this.fragments.filter(f=>f.body).length>this.cap){const i=this.fragments.findIndex(f=>f.body);this.forget(this.fragments[i]);this.fragments.splice(i,1);}}
 adapt(frameMs:number){this.pressure=this.pressure*.94+Math.min(150,frameMs)*.06;this.calm=frameMs<23?this.calm+frameMs/1000:0;if(!this.adaptive&&this.pressure>34){this.adaptive=true;this.applyBudget('LOW');}else if(this.adaptive&&this.calm>3){this.adaptive=false;this.applyBudget(this.requestedQuality);}}
 rebindCollision(collision:WorldCollision){this.collision=collision;this.hitOwners.clear();for(const b of this.layout.buildings)if(b.family&&this.templates.has(b.family))for(const c of collision.byBuilding.get(b.id)??[])this.hitOwners.set(c.handle,{building:b.id,component:-1});}
 connect(combat:Destruction,_vfx:ImpactVfx){this.linked=combat;combat.onWorldHit=(collider,strength,point,direction,attack)=>this.hit(collider,strength,point,direction,attack);combat.onWorldBlast=(p,r,s,d,attack)=>this.blast(p,r,s,d,attack);}
 propDebris(point:Vector3,size:number[]){this.spawn(point,size,false,new Vector3(0,1,1));this.effects.fragmentBurst(point,new Vector3(0,1,0),'concrete');}
 private activate(b:Building):Damage{
  const existing=this.states.get(b.id);if(existing){if(existing.cold)this.hydrate(existing);return existing;}const start=performance.now();
  const group=new Group();group.name=`Damaged architecture ${b.id} / ${b.family}`;group.position.set(b.x,0,b.z);group.scale.set(b.w,b.h,b.d);this.group.add(group);
  group.rotation.y=b.angle??0;
  const state:Damage={building:b,broken:new Set(),hp:new Map(),colliders:new Map(),surfaces:new Map(),activeFloors:new Set(),coarse:[],coarseFloors:new Map(),batches:[],group,cold:false,dirty:true,collapse:null,stage:'local'};this.states.set(b.id,state);
  this.streaming.hideBuilding(b.id);for(const old of this.collision.byBuilding.get(b.id)??[])this.hitOwners.delete(old.handle);this.collision.removeBuilding(b.id);
  this.hydrate(state);
  this.rebuildCoarse(state);
  this.lastActivationMs=performance.now()-start;this.maxActivationMs=Math.max(this.maxActivationMs,this.lastActivationMs);return state;
 }
 private hydrate(state:Damage){
  const b=state.building,group=state.group;state.cold=false;state.dirty=true;group.visible=true;this.effects.invalidate(b.id);this.streaming.setDamageProxy(b.id,false,state.stage);
  for(const part of this.assets.parts.get(`${b.family}_${b.assetHeight??b.h}_near`)??[]){
   // Stable Blender component IDs survive triangle reordering during Meshopt compression.
   const source=part.geometry,cid=source.getAttribute('_cid'),sourceIndex=source.index;if(!cid||!sourceIndex)throw new Error('Building lacks authored component IDs: '+b.family);
   const merged=new BufferGeometry();for(const [name,attribute] of Object.entries(source.attributes))merged.setAttribute(name,attribute);merged.setIndex(sourceIndex.clone());merged.index!.setUsage(DynamicDrawUsage);merged.boundingBox=source.boundingBox?.clone()??null;merged.boundingSphere=source.boundingSphere?.clone()??null;
   const ranges=part.componentRanges!;
   const original=sourceIndex.array as Uint32Array|Uint16Array,damageIndex=new DamageIndex(merged.index!.array as Uint32Array|Uint16Array,ranges);
   for(const id of state.broken)damageIndex.remove(id);merged.setDrawRange(0,damageIndex.count*3);
   const mesh=new Mesh(merged,this.assets.materials.get(part.material));mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);state.batches.push({mesh,original,ranges,damageIndex});
  }
  const floors=[...state.activeFloors];state.activeFloors.clear();for(const floor of floors)this.ensureFloor(state,floor);this.commitSurfaces(state);
 }
 private cool(state:Damage){
  state.cold=true;state.group.visible=false;for(const b of state.batches){this.disposeBatch(b);b.mesh.removeFromParent();}state.batches=[];
  for(const list of state.colliders.values())for(const c of list){this.hitOwners.delete(c.handle);this.physics.removeCollider(c);}state.colliders.clear();
  this.clearSurfaces(state);
  this.streaming.setDamageProxy(state.building.id,true,state.stage);
 }
 private rebuildCoarse(state:Damage){
  for(const c of state.coarse){this.hitOwners.delete(c.handle);this.physics.removeCollider(c);}state.coarse=[];state.coarseFloors.clear();const b=state.building;
  const source=familyOf(b);
  if(source&&'collisionContours' in source){
   source.collisionContours.forEach((contour,floor)=>{if(state.activeFloors.has(floor)||contour.length<3)return;const vertices:number[]=[],angle=b.angle??0,low=floor*4*this.scale(b),high=Math.min(b.h,(floor+1)*4*this.scale(b));for(const y of [low,high])for(const [x,z] of contour){const xx=x*b.w,zz=z*b.d;vertices.push(xx*Math.cos(angle)+zz*Math.sin(angle),y,-xx*Math.sin(angle)+zz*Math.cos(angle));}const desc=RAPIER.ColliderDesc.convexHull(new Float32Array(vertices));if(desc){const c=this.physics.world.createCollider(desc.setTranslation(b.x,0,b.z).setFriction(.8));this.physics.surfaces.set(c.handle,{kind:'world'});state.coarse.push(c);state.coarseFloors.set(floor,[c]);this.hitOwners.set(c.handle,{building:b.id,component:-1});}});
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
 private ensureFloor(state:Damage,floor:number,removing?:Set<number>){
  if(state.activeFloors.has(floor))return;state.activeFloors.add(floor);const b=state.building,source=familyOf(b);
  if(source&&'collisionContours' in source){const owned=state.coarseFloors.get(floor)??[];for(const c of owned){this.hitOwners.delete(c.handle);this.physics.removeCollider(c);}state.coarse=state.coarse.filter(c=>!owned.includes(c));state.coarseFloors.delete(floor);}else this.rebuildCoarse(state);
  const triangles=new Set<number>();
  for(const c of this.componentsByFloor.get(b.family!)?.get(floor)??[]){if(c.kind==='decoration'||state.broken.has(c.id)||removing?.has(c.id))continue;
   if(!c.collisionBoxes){triangles.add(c.id);continue;}
   const boxes=c.kind==='glass'?[{center:c.center,size:c.size}]:c.collisionBoxes??[],colliders:RAPIER.Collider[]=[];
   for(const box of boxes){if(c.kind!=='glass'&&Math.min(...box.size)<.18)continue;const p=new Vector3(...box.center as [number,number,number]).multiply(this.scaleVector(b)).applyAxisAngle(new Vector3(0,1,0),b.angle??0).add(new Vector3(b.x,0,b.z)),size=new Vector3(...box.size as [number,number,number]).multiply(this.scaleVector(b));const collider=this.physics.box(p,size);collider.setRotation(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),b.angle??0));colliders.push(collider);this.hitOwners.set(collider.handle,{building:b.id,component:c.id});}state.colliders.set(c.id,colliders);
  }
  if(triangles.size){const surface=collisionTriangles(state.batches.map(batch=>({geometry:batch.mesh.geometry,original:batch.original,ranges:batch.ranges})),triangles,[b.w,b.h,b.d]);state.surfaces.set(floor,{...surface,collider:null,dirty:true});}
 }
 private commitSurfaces(state:Damage){
  const b=state.building;
  for(const surface of state.surfaces.values())if(surface.dirty){
   if(surface.collider){this.hitOwners.delete(surface.collider.handle);this.physics.removeCollider(surface.collider);surface.collider=null;}
   if(surface.index.count){const desc=RAPIER.ColliderDesc.trimesh(surface.vertices,surface.index.array.subarray(0,surface.index.count*3)).setTranslation(b.x,0,b.z).setRotation(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),b.angle??0)).setFriction(.8);surface.collider=this.physics.world.createCollider(desc);this.physics.surfaces.set(surface.collider.handle,{kind:'world'});this.hitOwners.set(surface.collider.handle,{building:b.id,component:-1});}
   surface.dirty=false;
  }
 }
 private clearSurfaces(state:Damage){for(const surface of state.surfaces.values())if(surface.collider){this.hitOwners.delete(surface.collider.handle);this.physics.removeCollider(surface.collider);}state.surfaces.clear();}
 private scale(b:Building){return b.h/(b.assetHeight??b.h);}
 private scaleVector(b:Building){const f=familyOf(b)!;return new Vector3(b.w/f.width,b.h/(b.assetHeight??b.h),b.d/f.depth);}
 private position(b:Building,c:Component){return new Vector3(...c.center as [number,number,number]).multiply(this.scaleVector(b)).applyAxisAngle(new Vector3(0,1,0),b.angle??0).add(new Vector3(b.x,0,b.z));}
 private distance(b:Building,c:Component,p:Vector3){const f=familyOf(b)!,sx=b.w/f.width,sy=this.scale(b),sz=b.d/f.depth,a=b.angle??0,co=Math.cos(a),si=Math.sin(a),x=c.center[0]*sx,z=c.center[2]*sz,hx=(Math.abs(co)*c.size[0]*sx+Math.abs(si)*c.size[2]*sz)/2,hz=(Math.abs(si)*c.size[0]*sx+Math.abs(co)*c.size[2]*sz)/2,dx=Math.max(0,Math.abs(b.x+x*co+z*si-p.x)-hx),dy=Math.max(0,Math.abs(c.center[1]*sy-p.y)-c.size[1]*sy/2),dz=Math.max(0,Math.abs(b.z-x*si+z*co-p.z)-hz);return Math.hypot(dx,dy,dz);}
 hit(collider:RAPIER.Collider,strength:number,point:Vector3,direction:Vector3,attack?:WorldAttack):boolean{
  const owner=this.hitOwners.get(collider.handle);if(!owner)return false;const b=this.buildingsById.get(owner.building)!;
  const hitNormal=attack?.normal?new Vector3().fromArray(attack.normal):direction.clone().negate();const thermal=attack?.kind==='laser';if(thermal){let nearest:Component|undefined,dist=Infinity;for(const c of this.componentsByFloor.get(b.family!)?.get(Math.floor(point.y/this.scale(b)/4))??[]){const d=this.distance(b,c,point);if(d<dist){nearest=c;dist=d;}}if(this.effects.heatSurface(point,hitNormal,strength,b.id,materialFor(nearest?.kind??'wall',b.family!))<.7)return true;}else this.effects.impact(point,direction.clone().negate(),strength,b.id);
  if(!this.states.has(b.id)&&strength<24&&(this.effects.scars.find(s=>s.id===b.id&&s.p.distanceToSquared(point)<6)?.hits??0)<5)return true;
  if(!(this.assets.available?.(`${b.family}_${b.assetHeight??b.h}_near`)??this.assets.parts.has(`${b.family}_${b.assetHeight??b.h}_near`))){const epoch=this.epoch;void this.assets.ensure(b.family!,b.assetHeight??b.h,'near').then(()=>{if(!this.dead&&epoch===this.epoch)this.blast(point.clone(),1.4,strength,direction);}).catch(()=>{});return false;}
  const state=this.activate(b);let component=owner.component>=0?this.componentsById.get(b.family!)!.get(owner.component):undefined;
  if(owner.component<0){let nearest=Infinity;for(const c of this.templates.get(b.family!)!)if(!state.broken.has(c.id)){const distance=this.distance(b,c,point);if(distance<nearest){nearest=distance;component=c;}}}
  if(component&&state.broken.has(component.id))return false;
  if(!component)return false;const broken=this.damage(state,component,thermal?strength*.4:strength,direction);this.commitSurfaces(state);return broken;
 }
 blast(point:Vector3,radius:number,strength:number,direction=new Vector3(0,0,1),attack?:WorldAttack):void{
  const multipliers=worldAttackScale(attack);radius*=multipliers.radius;
  for(const b of this.layout.buildings){if(!b.family||!this.templates.has(b.family))continue;
   const a=b.angle??0,hx=(Math.abs(Math.cos(a))*b.w+Math.abs(Math.sin(a))*b.d)/2,hz=(Math.abs(Math.sin(a))*b.w+Math.abs(Math.cos(a))*b.d)/2;
   const box=new Box3(new Vector3(b.x-hx,0,b.z-hz),new Vector3(b.x+hx,b.h+13,b.z+hz));if(box.distanceToPoint(point)>radius)continue;
   this.effects.impact(point,direction.clone().negate(),strength*multipliers.vfx,b.id,true);
   if(!(this.assets.available?.(`${b.family}_${b.assetHeight??b.h}_near`)??this.assets.parts.has(`${b.family}_${b.assetHeight??b.h}_near`))){const epoch=this.epoch;void this.assets.ensure(b.family,b.assetHeight??b.h,'near').then(()=>{if(!this.dead&&epoch===this.epoch)this.blastBuilding(b,point.clone(),radius,strength,direction,attack);}).catch(()=>{});continue;}
   this.blastBuilding(b,point,radius,strength,direction,attack);
  }
 }
 private blastBuilding(b:Building,point:Vector3,radius:number,strength:number,direction:Vector3,attack?:WorldAttack){const state=this.activate(b),scale=worldAttackScale(attack),dir=direction.clone().multiplyScalar(scale.impulse);for(const c of this.templates.get(b.family!)!)if(!state.broken.has(c.id)){const d=this.distance(b,c,point);if(d<radius)this.scheduler.enqueue(b.id,()=>{if(!this.dead)this.damage(state,c,strength*(c.kind==='support'?scale.structure:scale.environment)*(1-d/(radius+.01)),dir);});}state.dirty=true;}
 private damage(state:Damage,c:Component,strength:number,direction:Vector3):boolean{
  if(state.broken.has(c.id))return false;const hp=(state.hp.get(c.id)??c.hp)-Math.max(0,strength);state.hp.set(c.id,hp);
  if(hp>0)return false;
  this.remove(state,c,direction,true);if(c.kind==='support')this.checkSupport(state,c.floor,direction);return true;
 }
 private remove(state:Damage,c:Component,direction:Vector3,debris:boolean){
  if(state.broken.has(c.id))return;if(!state.cold)this.ensureFloor(state,c.floor,new Set([c.id]));state.broken.add(c.id);this.totalBroken++;
  for(const batch of state.batches)batch.damageIndex.remove(c.id);
  const surface=state.surfaces.get(c.floor);if(surface){surface.index.remove(c.id);surface.dirty=true;}
  for(const collider of state.colliders.get(c.id)??[]){this.hitOwners.delete(collider.handle);this.physics.removeCollider(collider);}state.colliders.delete(c.id);
  state.dirty=true;this.effects.invalidate(state.building.id);
  if(debris&&!state.cold){if(c.kind==='wall'||c.kind==='glass'||c.kind==='roof')this.spawnSource(state,c,direction);this.spawn(this.position(state.building,c),c.size,c.kind==='glass',direction,materialFor(c.kind,state.building.family!));this.effects.fragmentBurst(this.position(state.building,c),direction.clone().normalize(),materialFor(c.kind,state.building.family!));}
 }
 private checkSupport(state:Damage,floor:number,direction=new Vector3(0,0,1)){
  if(state.building.damageClass!=='major'&&state.building.damageClass!=='full')return;
  const supports=this.templates.get(state.building.family!)!.filter(c=>c.kind==='support'&&c.floor===floor&&(c.structural===true||c.structural===undefined&&(c.size[0]>4||c.size[0]<1&&c.size[2]<1))),lost=supports.filter(c=>state.broken.has(c.id)).length;
  const integrity=this.graphs.get(state.building.family!)!.status(floor,state.broken);if(lost<2||!integrity.partial)return;const complete=state.building.damageClass==='full'&&integrity.complete&&floor<state.building.h/16;
  if(complete)this.interiors.removeBuilding(state.building.id);
  const lostPosts=supports.filter(c=>state.broken.has(c.id)&&c.size[0]<1),xs=lostPosts.reduce((n,c)=>n+c.center[0],0),zs=lostPosts.reduce((n,c)=>n+c.center[2],0);if(state.stage==='local')this.effects.structural(new Vector3(state.building.x,floor*4*this.scale(state.building)+1,state.building.z+state.building.d*.48),Math.min(24,state.building.w*.6),state.building.id);state.stage=complete?'collapsed':'partial';state.collapse={floor,sector:!complete,xSign:Math.abs(xs)>1?Math.sign(xs):Math.abs(direction.x)>Math.abs(direction.z)?Math.sign(direction.x):0,zSign:Math.abs(zs)>1?Math.sign(zs):Math.abs(direction.z)>=Math.abs(direction.x)?Math.sign(direction.z)||1:0,next:this.elapsed};
 }
 private spawn(point:Vector3,size:number[],glass:boolean,direction:Vector3,material:DamageMaterial=glass?'glass':'concrete'){
  for(let n=0;n<(glass?3:2);n++){
   while(this.fragments.filter(f=>f.body).length>=this.cap){const index=this.fragments.findIndex(f=>f.body);this.forget(this.fragments[index]);this.fragments.splice(index,1);}
   while(this.fragments.length>=this.fragmentCap){this.forget(this.fragments[0]);this.fragments.shift();}
   const scale=new Vector3(Math.min(2.2,size[0]*.38),Math.min(1.6,size[1]*.4),Math.min(1.7,Math.max(glass?.12:.28,size[2]*.35)));const p=point.clone().add(new Vector3((n-.5)*.5,.1,.3));
   const body=this.physics.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x,p.y,p.z).setLinearDamping(.22).setAngularDamping(.8).setCcdEnabled(true));
   const collider=this.physics.world.createCollider(RAPIER.ColliderDesc.cuboid(scale.x/2,scale.y/2,scale.z/2).setDensity(glass?260:650).setFriction(.9).setRestitution(.04),body);this.physics.surfaces.set(collider.handle,{kind:'debris'});
   body.setLinvel(direction.clone().multiplyScalar(4).add(new Vector3(n-.5,2,1)),true);body.setAngvel({x:n-.4,y:.8,z:.3},true);
   const object=new Object3D();object.position.copy(p);object.scale.copy(scale);this.fragments.push({body,collider:null,object,glass,material,age:0});
  }
 }
 private spawnSource(state:Damage,c:Component,direction:Vector3){
  // Falling panels retain the actual authored facade, original UVs and material.
  const existing=this.fragments.filter(f=>f.source);if(existing.length>=6){const old=existing[0];this.forget(old);this.fragments.splice(this.fragments.indexOf(old),1);}
  const b=state.building,p=this.position(b,c),a=b.angle??0,co=Math.cos(a),si=Math.sin(a),group=new Group();let triangles=0;
  for(const batch of state.batches){const source=batch.mesh.geometry,ranges=batch.ranges.get(c.id);if(!ranges)continue;const count=ranges.reduce((n,r)=>n+r[1],0);if(count>7500)continue;const geometry=new BufferGeometry();
   for(const [key,attr] of Object.entries(source.attributes)){
    if(key==='_cid')continue;const values=new Float32Array(count*attr.itemSize);let offset=0;
    for(const [start,length] of ranges)for(let i=start;i<start+length;i++){
     const index=batch.original[i];
     if(key==='position'){const x=attr.getX(index)*b.w,y=attr.getY(index)*b.h,z=attr.getZ(index)*b.d;values[offset++]=x*co+z*si+b.x-p.x;values[offset++]=y-p.y;values[offset++]=z*co-x*si+b.z-p.z;}
     else if(key==='normal'){const x=attr.getX(index)/b.w,y=attr.getY(index)/b.h,z=attr.getZ(index)/b.d,inv=1/(Math.hypot(x,y,z)||1);values[offset++]=(x*co+z*si)*inv;values[offset++]=y*inv;values[offset++]=(z*co-x*si)*inv;}
     else for(let n=0;n<attr.itemSize;n++)values[offset++]=n===0?attr.getX(index):n===1?attr.getY(index):n===2?attr.getZ(index):attr.getW(index);
    }
    geometry.setAttribute(key,new BufferAttribute(values,attr.itemSize));
   }
   geometry.computeBoundingSphere();const mesh=new Mesh(geometry,batch.mesh.material);mesh.castShadow=false;mesh.receiveShadow=true;group.add(mesh);triangles+=count/3;
  }
  if(!triangles)return;group.position.copy(p);this.group.add(group);const size=new Vector3(...c.size as [number,number,number]).multiply(this.scaleVector(b));
  while(this.fragments.filter(f=>f.body).length>=this.cap){const index=this.fragments.findIndex(f=>f.body);this.forget(this.fragments[index]);this.fragments.splice(index,1);}
  const body=this.physics.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x,p.y,p.z).setLinearDamping(.5).setAngularDamping(1.1).setCcdEnabled(true));const collider=this.physics.world.createCollider(RAPIER.ColliderDesc.cuboid(Math.max(.08,size.x/2),Math.max(.08,size.y/2),Math.max(.08,size.z/2)).setDensity(260).setFriction(.9),body);this.physics.surfaces.set(collider.handle,{kind:'debris'});body.setLinvel(direction.clone().multiplyScalar(-2.5).add(new Vector3(.3,1.6,.6)),true);body.setAngvel({x:.16,y:.34,z:.2},true);this.fragments.push({body,collider:null,object:group,glass:c.kind==='glass',age:0,source:true});
 }
 private forget(f:Fragment){this.retire(f);if(f.source){f.object.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});f.object.removeFromParent();}}
 private retire(f:Fragment){if(f.body){f.object.position.copy(f.body.translation());f.object.quaternion.copy(f.body.rotation());this.physics.removeBody(f.body);f.body=null;}if(f.collider){this.physics.removeCollider(f.collider);f.collider=null;}}
 async prepareBreach(plan:BreachPlan,transaction?:{begin:()=>boolean;valid:()=>boolean}):Promise<boolean>{
  const b=this.buildingsById.get(plan.buildingId);if(!b?.family)return false;const epoch=this.epoch;await this.assets.ensure(b.family,b.assetHeight??b.h,'near',-10);if(this.dead||epoch!==this.epoch||transaction&&!transaction.begin())return false;const state=this.activate(b),components=this.templates.get(b.family)!,scale=this.scaleVector(b),angle=b.angle??0,co=Math.abs(Math.cos(angle)),si=Math.abs(Math.sin(angle));
  const interior:Component[]=[],exitBoxes:Box3[]=[];
  for(const c of components){if(state.broken.has(c.id))continue;const half=new Vector3((co*c.size[0]*scale.x+si*c.size[2]*scale.z)/2,c.size[1]*scale.y/2,(si*c.size[0]*scale.x+co*c.size[2]*scale.z)/2),box=new Box3(this.position(b,c).sub(half),this.position(b,c).add(half));if(!sweptSection(box,plan))continue;if(this.position(b,c).sub(plan.entry).dot(plan.direction)<plan.length-3.8)interior.push(c);else exitBoxes.push(box);}
  plan.exitOpen=false;plan.exitTrigger=exitOpeningProgress(exitBoxes,plan,TITAN_CONFIG.breakthrough.speed);
  for(const floor of new Set(interior.map(c=>c.floor))){if(this.dead||epoch!==this.epoch||transaction&&!transaction.valid())return false;this.ensureFloor(state,floor);await new Promise(r=>setTimeout(r,0));}
  for(let i=0;i<interior.length;i+=12){if(this.dead||epoch!==this.epoch||transaction&&!transaction.valid())return false;for(const c of interior.slice(i,i+12))this.remove(state,c,plan.direction,false);this.commitSurfaces(state);await new Promise(r=>setTimeout(r,0));}
  if(this.dead||epoch!==this.epoch||transaction&&!transaction.valid())return false;
  this.commitSurfaces(state);this.breaches.push(plan);this.interiors.add(plan);return true;
 }
 openBreachExit(plan:BreachPlan){if(plan.exitOpen)return;const state=this.states.get(plan.buildingId);if(!state)return;const b=state.building,scale=this.scaleVector(b),angle=b.angle??0,co=Math.abs(Math.cos(angle)),si=Math.abs(Math.sin(angle));for(const c of this.templates.get(b.family!)??[]){if(state.broken.has(c.id))continue;const half=new Vector3((co*c.size[0]*scale.x+si*c.size[2]*scale.z)/2,c.size[1]*scale.y/2,(si*c.size[0]*scale.x+co*c.size[2]*scale.z)/2);if(sweptSection(new Box3(this.position(b,c).sub(half),this.position(b,c).add(half)),plan))this.remove(state,c,plan.direction,false);}this.commitSurfaces(state);plan.exitOpen=true;this.breachImpact(plan,true);}
 breachImpact(plan:BreachPlan,exit=false){const p=exit?plan.exit:plan.entry,n=plan.direction.clone().multiplyScalar(exit?1:-1);this.effects.explosions.detonate(p,n,1.6);this.effects.structural(p,5,plan.buildingId);for(let i=0;i<3;i++){const side=new Vector3().crossVectors(plan.direction,new Vector3(0,1,0)).normalize().multiplyScalar((i%2?1:-1)*(plan.radius+.7));this.spawn(p.clone().add(side),[.7,.5,.4],i===0,n);}}
 /** QA damage stages use the same hit/strength/support path as gameplay. */
 demonstrate(id:number,stage:'windows'|'wall'|'structure'|'collapse'){
  const b=this.layout.buildings.find(b=>b.id===id);if(!b?.family||!this.templates.has(b.family))throw new Error('No authored destruction family for '+id);if(!(this.assets.available?.(`${b.family}_${b.assetHeight??b.h}_near`)??this.assets.parts.has(`${b.family}_${b.assetHeight??b.h}_near`))){const epoch=this.epoch;void this.assets.ensure(b.family,b.assetHeight??b.h,'near',-5).then(()=>{if(!this.dead&&epoch===this.epoch)this.demonstrate(id,stage);});return [b.x,stage==='collapse'?2:26,b.z];}const state=this.activate(b),components=this.templates.get(b.family)!;
  if(stage==='windows'||stage==='wall'){
   const target=components.filter(c=>c.kind==='glass'&&c.side===0).sort((a,b)=>Math.abs(a.floor-4)-Math.abs(b.floor-4))[0]??components.find(c=>c.kind==='glass');if(!target)throw new Error('Source model has no glass components: '+b.family);const p=this.position(b,target);
   if(stage==='windows'){this.effects.impact(p,new Vector3(0,0,1),40,b.id);for(const c of components.filter(c=>c.kind==='glass'&&c.side===target.side&&Math.abs(c.floor-target.floor)<=1&&Math.abs(c.center[0]-target.center[0])<5))this.damage(state,c,40,new Vector3(0,0,1));this.commitSurfaces(state);}
   else this.blast(p,5.4,650,new Vector3(0,0,1));return p.toArray();
  }
  const floor=stage==='collapse'?0:6;for(const c of components.filter(c=>c.kind==='support'&&c.floor===floor&&(c.structural===true||c.structural===undefined&&(c.size[0]>4||c.size[0]<1&&c.size[2]<1))).slice(0,stage==='collapse'?5:2))this.damage(state,c,1000,new Vector3(0,0,1));
  this.commitSurfaces(state);
  return [b.x,4*floor+2,b.z];
 }
 update(dt:number,target:Vector3,active:boolean){
  if(!active)return;this.elapsed+=dt;const workStart=performance.now(),budget=TITAN_CONFIG.budgets[this.workQuality as keyof typeof TITAN_CONFIG.budgets]??TITAN_CONFIG.budgets.LOW;let worked=this.scheduler.update();this.interiors.update(target);
  this.effects.update(dt,target);
  const states=[...this.states.values()],offset=this.collapseCursor++%Math.max(1,states.length);
  for(let n=0;n<states.length;n++){const state=states[(n+offset)%states.length];
   // Damage visuals and collision remain independent of intact tile lifetimes.
   const distance=Math.hypot(state.building.x-target.x,state.building.z-target.z);
   if(distance>330&&!state.cold)this.cool(state);else if(distance<220&&state.cold)this.hydrate(state);
   const collapse=state.collapse;if(collapse&&this.elapsed>=collapse.next&&worked<budget.components&&(worked===0||performance.now()-workStart<budget.workMs)){
    const floor=collapse.floor;
    if(!collapse.pieces){collapse.pieces=(this.componentsByFloor.get(state.building.family!)?.get(floor)??[]).filter(c=>(!collapse.sector||(collapse.xSign===0||c.center[0]*collapse.xSign>0)&&(collapse.zSign===0||c.center[2]*collapse.zSign>0)));collapse.cursor=0;if(!state.cold)this.ensureFloor(state,floor,new Set(collapse.pieces.map(c=>c.id)));if(!state.cold&&floor%8===0)this.effects.structural(new Vector3(state.building.x,floor*4*this.scale(state.building),state.building.z+state.building.d*.46),Math.min(16,state.building.w*.45),state.building.id);}
    while((collapse.cursor??0)<collapse.pieces.length&&worked<budget.components&&(worked===0||performance.now()-workStart<budget.workMs)){const i=collapse.cursor!++;this.remove(state,collapse.pieces[i],new Vector3(collapse.xSign*.8,-.4,collapse.zSign||1),i%24===0);worked++;}
    collapse.next=this.elapsed;if(collapse.cursor===collapse.pieces.length){collapse.floor++;collapse.pieces=undefined;collapse.cursor=0;collapse.next+=.018;}
    if(collapse.floor>(state.building.assetHeight??state.building.h)/4){state.collapse=null;if(state.stage==='collapsed'){for(const c of state.coarse){this.hitOwners.delete(c.handle);this.physics.removeCollider(c);}state.coarse=[];for(const list of state.colliders.values())for(const c of list){this.hitOwners.delete(c.handle);this.physics.removeCollider(c);}state.colliders.clear();this.clearSurfaces(state);}if(state.cold)this.streaming.setDamageProxy(state.building.id,true,state.stage);this.effects.structural(new Vector3(state.building.x,2,state.building.z),20,state.building.id);}

   }
   if(state.dirty&&!state.cold){
    this.commitSurfaces(state);
    // Commit changed triangle slots once per frame, without repacking the intact facade.
    for(const batch of state.batches){batch.mesh.geometry.setDrawRange(0,batch.damageIndex.count*3);const range=batch.damageIndex.updates();if(range){const index=batch.mesh.geometry.index!;index.clearUpdateRanges();index.addUpdateRange(range.start,range.count);index.needsUpdate=true;}}state.dirty=false;
   }
  }
  for(const f of this.fragments){f.age+=dt;const far=f.object.position.distanceToSquared(target)>240*240;if(f.body){f.object.position.copy(f.body.translation());f.object.quaternion.copy(f.body.rotation());if(f.body.isSleeping()||far||f.age>9&&f.object.position.y<3){this.retire(f);if(!far&&!f.source){const s=f.object.scale,p=f.object.position;f.collider=this.physics.world.createCollider(RAPIER.ColliderDesc.cuboid(s.x/2,s.y/2,s.z/2).setTranslation(p.x,p.y,p.z).setRotation(f.object.quaternion).setFriction(.9));this.physics.surfaces.set(f.collider.handle,{kind:'debris'});}}}if(f.source)f.object.visible=!far;}
  for(let i=0;i<this.pools.length;i++){const pool=this.pools[i],fragments=this.fragments.filter(f=>!f.source&&(f.material??(f.glass?'glass':'concrete'))===this.poolMaterials[i]&&f.object.position.distanceToSquared(target)<260*260);pool.count=fragments.length;fragments.forEach((f,n)=>{f.object.updateMatrix();pool.setMatrixAt(n,f.object.matrix);});pool.instanceMatrix.needsUpdate=true;pool.computeBoundingSphere();}
 }
 serialize(){return {version:2,scars:this.effects.serialize(),breaches:this.breaches.map(p=>({...p,entry:p.entry.toArray(),exit:p.exit.toArray(),direction:p.direction.toArray()})),rubble:this.fragments.filter(f=>!f.source&&!f.body).slice(-80).map(f=>({p:f.object.position.toArray(),q:f.object.quaternion.toArray(),s:f.object.scale.toArray(),glass:f.glass,material:f.material})),buildings:[...this.states.values()].map(s=>({id:s.building.id,broken:[...s.broken],hp:[...s.hp],stage:s.stage,collapse:s.collapse?{floor:s.collapse.floor,sector:s.collapse.sector,xSign:s.collapse.xSign,zSign:s.collapse.zSign}:null}))};}
 async restore(snapshot:ReturnType<ArchitectureDestruction['serialize']>){
  if(snapshot.version!==2)throw new Error('Unsupported architecture save version');this.reset();const epoch=this.epoch;
  for(const row of snapshot.buildings){const b=this.buildingsById.get(row.id);if(!b?.family)continue;await this.assets.ensure(b.family,b.assetHeight??b.h,'near',-5);if(this.dead||epoch!==this.epoch)return;const state=this.activate(b);for(const id of row.broken){const c=this.componentsById.get(b.family)?.get(id);if(c)this.remove(state,c,new Vector3(0,0,1),false);}state.hp=new Map(row.hp.filter(([id,hp])=>Number.isFinite(hp)&&this.componentsById.get(b.family!)?.has(id)));state.stage=row.stage;state.collapse=row.collapse?{...row.collapse,next:this.elapsed}:null;this.commitSurfaces(state);await new Promise(r=>setTimeout(r,0));}
  this.effects.restore(snapshot.scars??[]);for(const row of snapshot.breaches??[]){const plan={...row,entry:new Vector3().fromArray(row.entry),exit:new Vector3().fromArray(row.exit),direction:new Vector3().fromArray(row.direction)};this.breaches.push(plan);if(this.states.get(plan.buildingId)?.stage!=='collapsed')this.interiors.add(plan);}
  for(const row of (snapshot.rubble??[]).slice(-80)){const object=new Object3D();object.position.fromArray(row.p);object.quaternion.fromArray(row.q);object.scale.fromArray(row.s);if(row.p.length!==3||row.q.length!==4||row.s.length!==3||![...row.p,...row.s,...row.q].every(Number.isFinite)||row.s.some(n=>n<=0||n>10))continue;object.quaternion.normalize();const c=this.physics.box(object.position,object.scale,{kind:'debris'});c.setRotation(object.quaternion);this.fragments.push({body:null,collider:c,object,glass:row.glass,material:row.material,age:10});}
 }
 diagnostics(){return {adaptiveDestruction:this.adaptive,destructionQuality:this.workQuality,scheduler:{pending:this.scheduler.pending,maxMs:this.scheduler.maxMs},breaches:this.breaches.length,effects:this.effects.diagnostics(),coldStates:[...this.states.values()].filter(s=>s.cold).length,collapseShowcases:this.layout.buildings.filter(b=>b.damageClass==='full').length,supportedBuildings:this.layout.buildings.filter(b=>b.family&&this.templates.has(b.family)).length,damagedBuildings:this.states.size,brokenComponents:this.totalBroken,activeDebris:this.fragments.filter(f=>f.body).length,staticDebris:this.fragments.filter(f=>f.collider).length,debrisCap:this.cap,maxActivationMs:this.maxActivationMs,states:[...this.states.values()].map(s=>({id:s.building.id,family:s.building.family,broken:s.broken.size,stage:s.stage,collapsePending:!!s.collapse,integrity:Math.min(1,...[...this.graphs.get(s.building.family!)!.floors.keys()].map(f=>this.graphs.get(s.building.family!)!.status(f,s.broken).integrity)),colliders:[...s.colliders.values()].reduce((n,c)=>n+c.length,0)+[...s.surfaces.values()].filter(surface=>surface.collider).length}))};}
 private disposeBatch(batch:Batch){const geometry=batch.mesh.geometry;for(const name of Object.keys(geometry.attributes))geometry.deleteAttribute(name);geometry.dispose();}
 reset(){this.interiors.reset();this.epoch++;this.scheduler.clear();this.breaches=[];for(const f of this.fragments)this.forget(f);this.fragments.length=0;for(const pool of this.pools)pool.count=0;for(const s of this.states.values()){for(const c of s.coarse)this.physics.removeCollider(c);for(const list of s.colliders.values())for(const c of list)this.physics.removeCollider(c);this.clearSurfaces(s);for(const b of s.batches)this.disposeBatch(b);s.group.removeFromParent();}this.states.clear();this.hitOwners.clear();this.streaming.hiddenBuildings.clear();this.totalBroken=0;this.elapsed=0;this.effects.reset();}
 dispose(){this.dead=true;this.reset();if(this.linked){this.linked.onWorldHit=undefined;this.linked.onWorldBlast=undefined;}this.effects.dispose();this.interiors.dispose();for(const p of this.pools)p.dispose();this.group.removeFromParent();this.group.clear();}
}
