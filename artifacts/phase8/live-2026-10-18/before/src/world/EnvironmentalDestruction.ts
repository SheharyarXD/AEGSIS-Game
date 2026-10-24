import { Box3, Group, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import { PhysicsWorld,RAPIER } from '../physics/PhysicsWorld';
import { ArchitectureDestruction } from './ArchitectureDestruction';
const ZERO=new Matrix4().makeScale(0,0,0);
const TYPES:Record<string,{size:Vector3;hp:number;collision?:boolean}>={lamp:{size:new Vector3(.3,5,.3),hp:65},bench:{size:new Vector3(2,.8,.8),hp:75},tree:{size:new Vector3(.7,6,.7),hp:160},container:{size:new Vector3(2.5,2.6,6),hp:200},car:{size:new Vector3(1.8,1.5,4),hp:140},crane:{size:new Vector3(7,30,7),hp:600},ph_lamp_bracket_mid:{size:new Vector3(.45,1.7,.9),hp:50},ph_aircon_unit_near:{size:new Vector3(1,1.2,.6),hp:70}};
for(const [type,w,h,d,hp] of [['titan_historic_lamp',.45,4.3,.7,100],['titan_lobby_portal',2.9,3.6,.4,180],['titan_stoop',3,.18,1.8,180],['titan_bike_rack',1.2,.9,.5,80],['titan_courtyard_wall',2.4,1.7,.6,190],['titan_courtyard_gate',4.5,4.3,.7,160],['titan_railing',2.2,1.9,.1,90],['realism_newspaper',.55,1.2,.48,65],['realism_dumpster',2,1.35,1.1,140],['realism_fence',2.4,2.1,.4,80],['realism_canopy',5.1,.4,1.35,100],['realism_planter',1.85,1.1,.8,130],['realism_pedestrian_signal',.35,3.4,.35,90],['realism_signpost',.45,3.6,.15,70],['realism_vent',2,.75,1.1,100],['realism_tree',.5,4.6,.5,140],['urban_bin',.7,1.13,.6,60],['urban_bin_round',.62,.92,.62,60],['urban_bollard',.13,.8,.13,110],['urban_hydrant',.47,.93,.44,110],['urban_mailbox',.47,1.1,.68,75],['urban_barrier',1.9,.8,.43,160],['urban_cone',.31,.5,.31,15],['urban_lamp',.35,4.1,.35,65],['urban_bench',1.35,.9,.65,75],['urban_bag',.55,.48,.55,10],['urban_signal',.35,4.8,.35,100],['urban_meter',.23,1.45,.23,65],['urban_utility',.8,1.1,.42,100],['urban_busstop',4.2,2.9,1.8,160]] as const)TYPES[type]={size:new Vector3(w,h,d),hp};
TYPES.titan_lobby_portal.collision=false;TYPES.titan_courtyard_gate.collision=false;
interface Prop {id:string;type:string;point:Vector3;size:Vector3;hp:number;collider:RAPIER.Collider|null;broken:boolean;}
/** Shared instance damage records; props do not acquire dynamic physics until hit. */
export class EnvironmentalDestruction {
 private props=new Map<string,Prop>();private owners=new Map<number,string>();private live=new Map<string,{mesh:InstancedMesh;index:number}[]>();
 private removedInstances:{mesh:InstancedMesh;index:number;matrix:Matrix4}[]=[];
 private removedInfrastructure:{index:number;point:Vector3;size:Vector3;rotation:Quaternion}[]=[];
 private debris:(point:Vector3,size:number[])=>void;
 private scanned=new WeakMap<InstancedMesh,number>();
 constructor(private root:Group,private physics:PhysicsWorld,architecture:ArchitectureDestruction,private infrastructureColliders:RAPIER.Collider[]=[]){this.debris=(p,s)=>architecture.propDebris(p,s);}
 update(){
  this.root.updateMatrixWorld(true);
  this.root.traverse(o=>{if(!(o instanceof InstancedMesh)||!TYPES[o.name])return;const type=o.name,definition=TYPES[type];
   const version=o.instanceMatrix.version;if(type!=='car'&&this.scanned.get(o)===version)return;this.scanned.set(o,version);
   for(const [key,refs] of this.live){const remaining=refs.filter(r=>r.mesh!==o);if(remaining.length)this.live.set(key,remaining);else this.live.delete(key);}
   for(let i=0;i<o.count;i++){
    const matrix=new Matrix4();o.getMatrixAt(i,matrix);const scale=new Vector3().setFromMatrixScale(matrix);if(scale.lengthSq()<.00001)continue;const point=new Vector3().setFromMatrixPosition(matrix).applyMatrix4(o.matrixWorld);if(point.y<-20)continue;
    const id=type==='car'?(o.userData.aegisPropIds?.[i]??`car:${i}`):`${type}:${point.x.toFixed(1)}:${point.y.toFixed(1)}:${point.z.toFixed(1)}`;if(type==='realism_canopy')point.y+=2.75*scale.y;let prop=this.props.get(id);
    if(!prop){const size=definition.size.clone().multiply(scale),center=point.clone().add(new Vector3(0,size.y/2,0));const collider=type==='crane'||definition.collision===false?null:this.physics.box(center,size);prop={id,type,point,size,hp:definition.hp,collider,broken:false};this.props.set(id,prop);if(collider){collider.setRotation(new Quaternion().setFromRotationMatrix(matrix));this.owners.set(collider.handle,id);}}
    if(!prop.collider&&!prop.broken&&type!=='crane'&&definition.collision!==false){prop.collider=this.physics.box(point.clone().add(new Vector3(0,prop.size.y/2,0)),prop.size);prop.collider.setRotation(new Quaternion().setFromRotationMatrix(matrix));this.owners.set(prop.collider.handle,id);}
    prop.point.copy(point);const list=this.live.get(id)??[];list.push({mesh:o,index:i});this.live.set(id,list);
    if(prop.broken){o.setMatrixAt(i,ZERO);o.instanceMatrix.needsUpdate=true;}else if(type==='car'){prop.collider?.setTranslation(point.clone().add(new Vector3(0,prop.size.y/2,0)));prop.collider?.setRotation(new Quaternion().setFromRotationMatrix(matrix));}
   }
  });
  for(const [id,refs] of this.live){const valid=refs.filter(r=>r.mesh.parent&&r.index<r.mesh.count);if(valid.length)this.live.set(id,valid);else this.live.delete(id);}
  for(const prop of this.props.values())if(prop.type!=='crane'&&prop.collider&&!this.live.has(prop.id)){this.owners.delete(prop.collider.handle);this.physics.removeCollider(prop.collider);prop.collider=null;}
 }
 hit(collider:RAPIER.Collider,strength:number,point:Vector3):boolean{const prop=this.props.get(this.owners.get(collider.handle)??'');if(!prop)return false;return this.damage(prop,strength,point);}
 blast(point:Vector3,radius:number,strength:number){for(const prop of this.props.values())if(!prop.broken){const size=prop.type==='crane'?new Vector3(16,46,48):prop.size,box=new Box3(prop.point.clone().add(new Vector3(-size.x/2,0,-size.z/2)),prop.point.clone().add(new Vector3(size.x/2,size.y,size.z/2))),d=box.distanceToPoint(point);if(d<radius)this.damage(prop,strength*(1-d/(radius+.01)),point);}}
 private damage(prop:Prop,strength:number,point:Vector3){if(prop.broken)return false;prop.hp-=strength;if(prop.hp>0)return false;prop.broken=true;if(prop.type==='crane')for(let index=0;index<this.infrastructureColliders.length;index++){const c=this.infrastructureColliders[index];if(!c.isValid())continue;const p=c.translation();if(p.y>0&&p.y<46&&Math.abs(p.x-prop.point.x)<9&&Math.abs(p.z-prop.point.z)<24){const half=(c.shape as RAPIER.Cuboid).halfExtents,r=c.rotation();this.removedInfrastructure.push({index,point:new Vector3(p.x,p.y,p.z),size:new Vector3(half.x*2,half.y*2,half.z*2),rotation:new Quaternion(r.x,r.y,r.z,r.w)});this.physics.removeCollider(c);}}if(prop.collider){this.owners.delete(prop.collider.handle);this.physics.removeCollider(prop.collider);prop.collider=null;}for(const {mesh,index} of this.live.get(prop.id)??[]){const matrix=new Matrix4();mesh.getMatrixAt(index,matrix);this.removedInstances.push({mesh,index,matrix});mesh.setMatrixAt(index,ZERO);mesh.instanceMatrix.needsUpdate=true;}this.debris(point,prop.size.toArray());return true;}
 reset(restore=true){for(const prop of this.props.values())if(prop.collider)this.physics.removeCollider(prop.collider);if(restore){for(const {mesh,index,matrix} of this.removedInstances){mesh.setMatrixAt(index,matrix);mesh.instanceMatrix.needsUpdate=true;}for(const record of this.removedInfrastructure){const c=this.physics.box(record.point,record.size);c.setRotation(record.rotation);this.infrastructureColliders[record.index]=c;}}this.removedInstances.length=0;this.removedInfrastructure.length=0;this.props.clear();this.owners.clear();this.live.clear();this.scanned=new WeakMap();}
 diagnostics(){return {registered:this.props.size,broken:[...this.props.values()].filter(p=>p.broken).length};}
 dispose(){this.reset(false);}
}
