import {Box3,BufferAttribute,BufferGeometry,Group,Matrix4,Mesh,Quaternion,Sphere,Vector3} from 'three';
import {AssetLibrary} from '../environment/AssetLibrary';import {Building} from '../CityLayout';import {PhysicsWorld,RAPIER} from '../../physics/PhysicsWorld';
interface SourceBatch {mesh:Mesh;original:Uint32Array|Uint16Array;ranges:Map<number,[number,number][]>;}
interface SourceComponent {id:number;floor:number;kind?:string;side?:number;center?:number[];size?:number[];}
interface FallingBand {group:Group;start:number;half:number;delay:number;landed:boolean;seed:number;collider:RAPIER.Collider|null;}
interface Ruin {building:Building;group:Group;remnants:Group;lod:number;colliders:RAPIER.Collider[];bands:FallingBand[];age:number;running:boolean;}
/** Original facade bands move as masses. Settled Blender ruins use inexpensive hulls and distance LODs. */
export class CollapsePresentation {
 readonly group=new Group();private records=new Map<number,Ruin>();
 constructor(private assets:AssetLibrary,private physics:PhysicsWorld){}
 get active(){return [...this.records.values()].filter(r=>r.running).length;}
 has(id:number){return this.records.has(id);}
 begin(building:Building,batches:SourceBatch[],components:readonly SourceComponent[],broken:ReadonlySet<number>=new Set()){
  if(this.records.has(building.id))return;const r:Ruin={building,group:new Group(),remnants:new Group(),lod:-1,colliders:[],bands:[],age:0,running:this.active<2};this.records.set(building.id,r);this.group.add(r.group,r.remnants);this.sourceRemnants(r,batches,components);
  if(!r.running)return;
  const bands=4,maxFloor=Math.max(1,(building.assetHeight??building.h)/4),ids=Array.from({length:bands},()=>new Set<number>());
  for(const c of components)if(!broken.has(c.id))ids[Math.min(bands-1,Math.floor(c.floor/maxFloor*bands))].add(c.id);
  for(let i=0;i<bands;i++){
   const center=building.h*(i+.5)/bands,outer=new Group(),inner=new Group();outer.position.set(building.x,center,building.z);outer.rotation.y=building.angle??0;inner.scale.set(building.w,building.h,building.d);inner.position.y=-center;outer.add(inner);this.group.add(outer);
   for(const batch of batches){let count=0;for(const id of ids[i])for(const [,length] of batch.ranges.get(id)??[])count+=length;if(!count)continue;
    const index=new Uint32Array(count);let at=0;for(const id of ids[i])for(const [start,length] of batch.ranges.get(id)??[]){index.set(batch.original.subarray(start,start+length),at);at+=length;}
    const geometry=new BufferGeometry();for(const [key,a] of Object.entries(batch.mesh.geometry.attributes))geometry.setAttribute(key,a);geometry.setIndex(new BufferAttribute(index,1));geometry.boundingSphere=batch.mesh.geometry.boundingSphere?.clone()??null;const mesh=new Mesh(geometry,batch.mesh.material);mesh.receiveShadow=true;inner.add(mesh);
   }const collider=this.physics.box(outer.position,new Vector3(building.w*.88,building.h/bands*.96,building.d*.88),{kind:'world'});r.bands.push({group:outer,start:center,half:building.h/(bands*2),delay:.45+i*.8,landed:false,seed:(building.id+i*17)%19,collider});
  }
 }
 restore(building:Building,batches:SourceBatch[],components:readonly SourceComponent[]){if(!this.records.has(building.id)){const r:Ruin={building,group:new Group(),remnants:new Group(),lod:-1,colliders:[],bands:[],age:10,running:false};this.records.set(building.id,r);this.group.add(r.group,r.remnants);this.sourceRemnants(r,batches,components);}}
 private sourceRemnants(r:Ruin,batches:SourceBatch[],components:readonly SourceComponent[]){
  const b=r.building,candidates=components.filter(c=>(c.kind==='glass'||c.kind==='wall')&&c.floor>0&&(!c.size||Math.max(...c.size)<7)),selected:typeof candidates=[];
  for(let i=0;i<12&&candidates.length;i++){const c=candidates[Math.floor((i+.37)*candidates.length/12)%candidates.length];if(!selected.includes(c))selected.push(c);}
  for(let i=0;i<selected.length;i++){
   const chosen=selected[i],ids=components.filter(c=>c.floor===chosen.floor&&c.side===chosen.side&&(c.kind==='glass'||c.kind==='wall')&&(!c.size||Math.max(...c.size)<7)&&(!c.center||!chosen.center||Math.hypot(c.center[0]-chosen.center[0],c.center[2]-chosen.center[2])<5.5)).map(c=>c.id),bounds=new Box3(),group=new Group(),inner=new Group(),p=new Vector3();let triangles=0;
   for(const batch of batches){const ranges=ids.flatMap(id=>batch.ranges.get(id)??[]),count=ranges.reduce((n,r)=>n+r[1],0);if(!count||count>60000)continue;const index=new Uint32Array(count);let at=0;for(const [start,len] of ranges){index.set(batch.original.subarray(start,start+len),at);at+=len;}
    const g=new BufferGeometry();for(const [key,a] of Object.entries(batch.mesh.geometry.attributes))g.setAttribute(key,a);g.setIndex(new BufferAttribute(index,1));const position=g.getAttribute('position'),partBounds=new Box3();for(const n of index)partBounds.expandByPoint(p.fromBufferAttribute(position,n));bounds.union(partBounds);g.boundingBox=partBounds;g.boundingSphere=partBounds.getBoundingSphere(new Sphere());const mesh=new Mesh(g,batch.mesh.material);mesh.name='Ruin source fragment';mesh.receiveShadow=true;inner.add(mesh);triangles+=count/3;
   }if(!triangles)continue;const center=bounds.getCenter(new Vector3()),size=bounds.getSize(new Vector3()).multiply(new Vector3(b.w,b.h,b.d)),angle=i*2.399+b.id*.13,tilt=(i%2?1:-1)*(i%3===0?.42:1.14),radius=i%3===0?.18:.36;
   inner.scale.set(b.w,b.h,b.d);inner.position.set(-center.x*b.w,-center.y*b.h,-center.z*b.d);group.add(inner);group.position.set(b.x+Math.cos(angle)*b.w*radius,2+Math.abs(Math.cos(tilt))*size.y/2+Math.abs(Math.sin(tilt))*size.z/2,b.z+Math.sin(angle)*b.d*radius);group.rotation.set(tilt,(b.angle??0)+i*.19,i%2?.22:-.14);r.remnants.add(group);
  }
 }
 private visual(r:Ruin,lod:number){
  if(r.lod===lod)return;for(const o of [...r.group.children]){o.traverse(child=>{if('isInstancedMesh' in child)(child as import('three').InstancedMesh).dispose();});o.removeFromParent();}
  const b=r.building,kind=b.style==='gothic'?'gothic':b.style==='industrial'?'industrial':'glass',key=`titan9_ruin_${kind}_${lod}`;
  if(this.assets.parts.has(key)){const holder=new Group();holder.position.set(b.x,0,b.z);holder.rotation.y=b.angle??0;holder.scale.set(b.w,Math.min(40,Math.max(12,b.h*.3)),b.d);r.group.add(holder);this.assets.instance(key,[new Matrix4()],holder,false);}r.lod=lod;
 }
 update(dt:number,point:Vector3,onImpact:(point:Vector3,size:number,id:number)=>void){
  for(const r of this.records.values()){
   const b=r.building,distance=Math.hypot(point.x-b.x,point.z-b.z);r.age+=dt;
   if(r.running){let done=true;for(const band of r.bands){const t=Math.max(0,r.age-band.delay),tilt=Math.min(.46,t*.14)*(band.seed%2?1:-1),rest=band.half*Math.cos(tilt)+Math.max(b.w,b.d)*.25*Math.abs(Math.sin(tilt)),y=Math.max(rest,band.start-11*t*t);band.group.position.y=y;band.group.position.x=b.x+Math.sin(band.seed)*Math.min(5,t*t*.7);band.group.rotation.x=tilt;band.group.rotation.z=tilt*.37;
     if(band.collider){band.collider.setTranslation(band.group.position);band.collider.setRotation(band.group.quaternion);}
     if(y<=rest+.01){if(!band.landed){band.landed=true;if(band.collider){this.physics.removeCollider(band.collider);band.collider=null;}onImpact(new Vector3(b.x+Math.sin(band.seed)*4,1,b.z),Math.min(30,b.w*.8),b.id);}}else done=false;band.group.visible=distance<430&&!band.landed;
    }if(done&&r.age>2){r.running=false;this.disposeBands(r);}
   }
   const landed=!r.running||r.bands.some(b=>b.landed);r.group.visible=distance<1350&&landed;r.remnants.visible=distance<210&&landed;if(r.group.visible)this.visual(r,distance<170?0:distance<430?1:2);
   if(distance<240&&!r.colliders.length&&landed){
    const height=Math.min(13,Math.max(4,b.h*.065));for(const [x,z,h] of [[-.24,-.22,.50],[.23,.19,.65],[0,0,1]] as const){const vertices=[];for(const y of [0,height*h])for(const [u,v] of [[-1,-1],[1,-1],[1,1],[-1,1]])vertices.push((x+u*.21*(y? .62:1))*b.w,y,(z+v*.22*(y?.68:1))*b.d);const desc=RAPIER.ColliderDesc.convexHull(new Float32Array(vertices));if(desc){const c=this.physics.world.createCollider(desc.setTranslation(b.x,0,b.z).setRotation(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),b.angle??0)).setFriction(.95));this.physics.surfaces.set(c.handle,{kind:'world'});r.colliders.push(c);}}
   }else if(distance>330&&r.colliders.length){for(const c of r.colliders)this.physics.removeCollider(c);r.colliders=[];}
  }
 }
 private disposeBands(r:Ruin){for(const band of r.bands){if(band.collider)this.physics.removeCollider(band.collider);band.group.traverse(o=>{if(o instanceof Mesh){for(const key of Object.keys(o.geometry.attributes))o.geometry.deleteAttribute(key);o.geometry.dispose();}});band.group.removeFromParent();}r.bands=[];}
 diagnostics(){return {ruins:this.records.size,fallingMasses:[...this.records.values()].reduce((n,r)=>n+r.bands.length,0),active:this.active,ruinColliders:[...this.records.values()].reduce((n,r)=>n+r.colliders.length,0)};}
 reset(){for(const r of this.records.values()){this.disposeBands(r);for(const c of r.colliders)this.physics.removeCollider(c);r.group.traverse(o=>{if('isInstancedMesh' in o)(o as import('three').InstancedMesh).dispose();});r.remnants.traverse(o=>{if(o instanceof Mesh){for(const key of Object.keys(o.geometry.attributes))o.geometry.deleteAttribute(key);o.geometry.dispose();}});r.remnants.removeFromParent();r.group.removeFromParent();}this.records.clear();}
 dispose(){this.reset();this.group.removeFromParent();}
}
