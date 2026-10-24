import { CylinderGeometry, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, Shape, TorusGeometry, Vector3 } from 'three';
import { PhysicsWorld, RAPIER } from '../physics/PhysicsWorld';
import { PlayerController } from '../player/PlayerController';

/** Original compact twin-duct interceptor. Rigid chassis becomes dynamic on destruction. */
export class Drone {
  readonly object=new Group();
  readonly velocity=new Vector3();
  readonly body:RAPIER.RigidBody;
  readonly collider:RAPIER.Collider;
  health=60;
  cooldown=2;
  private time=0;
  private readonly rotors:Mesh[]=[];
  constructor(readonly id:number,position:Vector3,readonly physics:PhysicsWorld) {
    const shell=new MeshStandardMaterial({color:'#424f59',metalness:.8,roughness:.4}),trim=new MeshStandardMaterial({color:'#171e24',metalness:.55,roughness:.6});
    const red=new MeshStandardMaterial({color:'#c9905a',emissive:'#e35923',emissiveIntensity:1.7});
    const shape=new Shape();shape.moveTo(0,1.5);shape.lineTo(-.55,.2);shape.lineTo(-1.6,-.55);shape.lineTo(-.45,-.8);shape.lineTo(.45,-.8);shape.lineTo(1.6,-.55);shape.lineTo(.55,.2);shape.closePath();
    const hull=new Mesh(new ExtrudeGeometry(shape,{depth:.3,bevelEnabled:true,bevelSize:.08,bevelThickness:.05,bevelSegments:1,steps:1}),shell);hull.rotation.x=Math.PI/2;this.object.add(hull);
    for(const side of [-1,1]) {
      const duct=new Mesh(new TorusGeometry(.52,.13,8,24),trim);duct.rotation.x=Math.PI/2;duct.position.set(side*1.15,0,-.3);this.object.add(duct);
      const rotor=new Mesh(new CylinderGeometry(.46,.46,.07,3),shell);rotor.position.copy(duct.position);this.rotors.push(rotor);this.object.add(rotor);
      const nozzle=new Mesh(new CylinderGeometry(.1,.16,.3,10),red);nozzle.position.set(side*.42,-.3,-.4);this.object.add(nozzle);
    }
    const sensor=new Mesh(new CylinderGeometry(.14,.14,.4,10),red);sensor.rotation.x=Math.PI/2;sensor.position.set(0,.03,1.1);this.object.add(sensor);
    this.object.traverse(o=>{if(o instanceof Mesh)o.castShadow=true;});this.object.position.copy(position);
    this.body=physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(position.x,position.y,position.z).setCcdEnabled(true));
    this.collider=physics.world.createCollider(RAPIER.ColliderDesc.ball(.8).setMass(70),this.body);physics.surfaces.set(this.collider.handle,{kind:'actor'});
  }
  get position():Vector3 {return this.object.position;}
  update(dt:number,player:PlayerController,launch:(p:Vector3,direction:Vector3)=>void):void {
    if(this.health<=0)return;this.time+=dt;this.cooldown-=dt;
    const target=player.position.clone().addScaledVector(player.velocity,.4).add(new Vector3(Math.sin(this.time*.5+this.id)*12,9+Math.sin(this.time)*2,Math.cos(this.time*.5+this.id)*12));
    const desired=target.sub(this.position).clampLength(0,13);
    const hit=this.physics.ray(this.position,desired.clone().normalize(),6,this.body);
    if(hit&&this.physics.surfaces.get(hit.collider.handle)?.kind!=='actor'){desired.add(new Vector3(hit.normal.x,hit.normal.y,hit.normal.z).multiplyScalar(18));desired.y+=6;}
    this.velocity.lerp(desired,1-Math.exp(-dt*2));
    const delta=this.velocity.clone().multiplyScalar(dt);
    const obstacle=this.physics.world.castShape(this.position,this.object.quaternion,delta,new RAPIER.Ball(.8),.01,1,true,RAPIER.QueryFilterFlags.ONLY_FIXED,undefined,undefined,this.body);
    if(obstacle){this.velocity.reflect(new Vector3().copy(obstacle.normal1)).multiplyScalar(.4);delta.multiplyScalar(Math.max(0,obstacle.time_of_impact-.01));}
    const p=this.position.clone().add(delta);p.y=Math.max(3,p.y);this.body.setNextKinematicTranslation(p);
    const to=player.position.clone().sub(this.position);this.object.rotation.y=Math.atan2(to.x,to.z);this.object.rotation.z=Math.sin(this.time)*.06;
    this.rotors.forEach(r=>r.rotation.y+=dt*30);
    if(this.cooldown<=0&&to.length()<75){launch(this.position.clone(),to.normalize());this.cooldown=6.5;}
  }
  sync():void {this.object.position.copy(this.body.translation());if(this.health<=0)this.object.quaternion.copy(this.body.rotation());}
  hit(damage:number,direction:Vector3):void {
    if(this.health<=0)return;this.health=Math.max(0,this.health-damage);
    if(this.health===0){this.body.setBodyType(RAPIER.RigidBodyType.Dynamic,true);this.body.setLinvel(this.velocity.clone().addScaledVector(direction,8),true);this.body.setAngvel({x:2,y:1,z:3},true);this.body.setLinearDamping(.2);}
  }
  dispose():void {this.physics.removeBody(this.body);this.object.traverse(o=>{if(o instanceof Mesh){o.geometry.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose();}});this.object.removeFromParent();}
}
