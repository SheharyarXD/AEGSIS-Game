import {Group,InstancedMesh,Matrix4,Vector3,Quaternion} from 'three';
import {AssetLibrary} from '../environment/AssetLibrary';import {PhysicsWorld,RAPIER} from '../../physics/PhysicsWorld';import {BreachPlan} from './BreachPlan';
/** Prepared frames and a thin traversable floor; the original source geometry supplies the surrounding room. */
export class BreachInteriors {
 readonly group=new Group();private records:{plan:BreachPlan;colliders:RAPIER.Collider[]}[]=[];private meshes:InstancedMesh[]=[];private dirty=true;private cell='';
 constructor(private assets:AssetLibrary,private physics:PhysicsWorld){}
 add(plan:BreachPlan){if(this.records.length>=64)return;const colliders:RAPIER.Collider[]=[],angle=Math.atan2(plan.direction.x,plan.direction.z),count=Math.max(1,Math.ceil(plan.length/5)),width=plan.radius*2+.6;
 for(let i=0;i<count;i++){const p=plan.entry.clone().addScaledVector(plan.direction,(i+.5)*plan.length/count);p.y-=plan.halfHeight+.24;const c=this.physics.box(p,new Vector3(width,.16,plan.length/count+.04));c.setRotation(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),angle));colliders.push(c);}this.records.push({plan,colliders});this.dirty=true;}
 update(target:Vector3){const cell=`${Math.floor(target.x/24)},${Math.floor(target.z/24)}`;if(!this.dirty&&cell===this.cell)return;this.cell=cell;this.dirty=false;for(const m of this.meshes){m.dispose();m.removeFromParent();}this.meshes=[];const matrices:Matrix4[]=[];
 for(const {plan} of this.records.filter(r=>r.plan.entry.distanceToSquared(target)<240**2).slice(-12)){const angle=Math.atan2(plan.direction.x,plan.direction.z),count=Math.min(12,Math.max(2,Math.ceil(plan.length/5)));for(let i=0;i<count;i++){const p=plan.entry.clone().addScaledVector(plan.direction,i*plan.length/(count-1));p.y-=plan.halfHeight+.32;matrices.push(new Matrix4().compose(p,new Quaternion().setFromAxisAngle(new Vector3(0,1,0),angle),new Vector3(plan.radius/1.65,1,1)));}}
 if(matrices.length&&this.assets.parts.has('titan_breach_frame'))this.meshes=this.assets.instance('titan_breach_frame',matrices,this.group,false);}
 removeBuilding(id:number){for(const r of this.records)if(r.plan.buildingId===id)for(const c of r.colliders)this.physics.removeCollider(c);this.records=this.records.filter(r=>r.plan.buildingId!==id);this.dirty=true;}
 reset(){for(const r of this.records)for(const c of r.colliders)this.physics.removeCollider(c);this.records=[];for(const m of this.meshes){m.dispose();m.removeFromParent();}this.meshes=[];this.dirty=true;}
 dispose(){this.reset();this.group.removeFromParent();}
}
