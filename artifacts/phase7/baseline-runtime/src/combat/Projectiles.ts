import { Group, Line3, Mesh, MeshBasicMaterial, Quaternion, SphereGeometry, Vector3 } from 'three';
import { PhysicsWorld, RAPIER } from '../physics/PhysicsWorld';
import { PlayerController } from '../player/PlayerController';
import { ImpactVfx } from '../vfx/ImpactVfx';

export interface Shootable {position:Vector3;health:number;hit:(damage:number,direction:Vector3)=>void;}
interface Projectile {mesh:Mesh;velocity:Vector3;life:number;hostile:boolean;age:number;}
export class Projectiles {
  readonly group=new Group();
  readonly pool:Projectile[]=[];
  launches=0;
  destroyedMissiles=0;
  onImpact?:(p:Vector3,strength:number)=>void;
  constructor(readonly physics:PhysicsWorld,readonly vfx:ImpactVfx) {
    const geometry=new SphereGeometry(.12,6,4),blue=new MeshBasicMaterial({color:'#b5edff'}),hot=new MeshBasicMaterial({color:'#ffd0a0'});
    for(let i=0;i<24;i++){const mesh=new Mesh(geometry,i<8?hot:blue);mesh.visible=false;this.group.add(mesh);this.pool.push({mesh,velocity:new Vector3(),life:0,hostile:i<8,age:0});}
  }
  spawn(position:Vector3,direction:Vector3,hostile:boolean):boolean {
    const p=this.pool.find(p=>p.life<=0&&p.hostile===hostile);if(!p)return false;
    p.life=hostile?8:1.8;p.age=0;p.mesh.visible=true;p.mesh.position.copy(position);p.velocity.copy(direction).normalize().multiplyScalar(hostile?20:95);p.mesh.scale.set(1,1,hostile?3:5);
    if(hostile)this.launches++;return true;
  }
  update(dt:number,player:PlayerController,targets:Shootable[]):void {
    for(const p of this.pool) {
      if(p.life<=0)continue;p.age+=dt;p.life-=dt;
      const old=p.mesh.position.clone();
      if(p.hostile&&p.age>.35) {
        const to=player.position.clone().add(new Vector3(0,1,0)).addScaledVector(player.velocity,.2).sub(old).normalize();
        const current=p.velocity.clone().normalize(),rotation=new Quaternion().setFromUnitVectors(current,to),angle=2*Math.acos(Math.min(1,Math.abs(rotation.w)));
        rotation.slerp(new Quaternion(),1-Math.min(1,dt*1.3/Math.max(.0001,angle)));p.velocity.applyQuaternion(rotation).setLength(Math.min(37,20+p.age*4));
      }
      const delta=p.velocity.clone().multiplyScalar(dt),distance=delta.length();
      const wall=this.physics.world.castRay(new RAPIER.Ray(old,delta.clone().normalize()),distance,true,RAPIER.QueryFilterFlags.ONLY_FIXED);
      const next=old.clone().addScaledVector(delta,wall?wall.timeOfImpact/distance:1);
      const segment=new Line3(old,next),point=new Vector3();
      let impact=false;
      if(p.hostile){
        const center=player.position.clone().add(new Vector3(0,1,0));segment.closestPointToPoint(center,true,point);
        if(point.distanceTo(center)<.9&&p.age>.25){player.damage(16,p.velocity.clone().normalize(),true);impact=true;}
      }else {
        for(const missile of this.pool)if(missile.hostile&&missile.life>0){
          segment.closestPointToPoint(missile.mesh.position,true,point);
          if(point.distanceTo(missile.mesh.position)<1){missile.life=0;missile.mesh.visible=false;this.destroyedMissiles++;impact=true;this.vfx.burst(point,1,new Vector3(0,1,0),false);break;}
        }
        if(!impact)for(const target of targets)if(target.health>0){
          const center=target.position.clone().add(new Vector3(0,1,0));segment.closestPointToPoint(center,true,point);
          if(point.distanceTo(center)<1.2){target.hit(20,p.velocity.clone().normalize());impact=true;break;}
        }
      }
      p.mesh.position.copy(next);p.mesh.quaternion.setFromUnitVectors(new Vector3(0,0,1),p.velocity.clone().normalize());
      this.vfx.trail(next,p.hostile);
      if(wall||impact){this.vfx.burst(next,p.hostile?2:.5,new Vector3(0,1,0),p.hostile);this.onImpact?.(next,p.hostile?90:22);p.life=0;}
      p.mesh.visible=p.life>0;
    }
  }
  get threat():boolean {return this.pool.some(p=>p.hostile&&p.life>0);}
  nearestMissile(position:Vector3):Vector3|null {return this.pool.filter(p=>p.hostile&&p.life>0&&p.mesh.position.distanceTo(position)<45).sort((a,b)=>a.mesh.position.distanceToSquared(position)-b.mesh.position.distanceToSquared(position))[0]?.mesh.position??null;}
  reset():void {this.pool.forEach(p=>{p.life=0;p.mesh.visible=false;});this.launches=this.destroyedMissiles=0;}
}
