import { Mesh, MeshBasicMaterial, MeshStandardMaterial, RingGeometry, Vector3 } from 'three';
import { AegisSuit } from '../player/AegisSuit';
import { FlightState } from '../player/FlightState';
import { PlayerController } from '../player/PlayerController';
import { CharacterBody, PhysicsWorld } from '../physics/PhysicsWorld';
import { Ragdoll } from '../physics/Ragdoll';

export class Enemy {
  readonly suit=new AegisSuit({energy:'#ff4a26',lod:true});
  readonly object=this.suit.group;
  readonly body:CharacterBody;
  readonly ragdoll:Ragdoll;
  readonly velocity=new Vector3();
  readonly telegraph=new Mesh(new RingGeometry(1.5,1.58,40),new MeshBasicMaterial({color:'#d99365',transparent:true,opacity:.65,depthWrite:false}));
  health=95;
  state='patrol';
  held=false;
  attacks=0;
  private timer=0;
  private elapsed=0;
  private recovery=0;
  private readonly attackPoint=new Vector3();
  constructor(readonly id:number,readonly home:Vector3,readonly physics:PhysicsWorld) {
    this.body=new CharacterBody(physics,home,160);this.ragdoll=new Ragdoll(this.suit,physics);this.object.position.copy(home);
    this.telegraph.rotation.x=-Math.PI/2;this.telegraph.visible=false;
    this.object.traverse(o=>{if(o instanceof Mesh){const materials=Array.isArray(o.material)?o.material:[o.material];materials.forEach(m=>{if(m instanceof MeshStandardMaterial){if(m.name==='playerobot')m.color.set('#695c51');if(m.emissive.getHex()!==0)m.emissive.set('#b95e32');}});}});
  }
  get position():Vector3 {return this.ragdoll.active?this.ragdoll.position:this.body.position;}
  update(dt:number,player:PlayerController):void {
    this.elapsed+=dt;this.timer=Math.max(0,this.timer-dt);this.recovery=Math.max(0,this.recovery-dt);
    if(this.ragdoll.active){
      this.state=this.health<=0?'dead':'ragdoll';
      if(!this.held&&this.health>0&&this.ragdoll.canRecover()){
        const p=this.ragdoll.recover();this.body.teleport(p);this.body.setEnabled(true);this.state='recover';this.recovery=1;this.timer=1.2;
      }return;
    }
    if(this.health<=0)return;
    const to=player.position.clone().sub(this.position),distance=to.length();
    if(this.state==='windup') {
      this.velocity.x=this.velocity.z=0;
      if(this.timer===0){
        this.state='cooldown';this.timer=1.1;this.attacks++;this.suit.playAction('punch');
        if(player.position.distanceTo(this.attackPoint)<3.1&&Math.abs(player.position.y-this.position.y)<3){
          if(player.block&&player.blockTime<.3)this.hit(30,to.clone().normalize().multiplyScalar(-1),true);
          else player.damage(12,to.clone().normalize(),this.attacks%3===0);
        }
      }
    }else if(this.recovery>0||this.state==='stagger'&&this.timer>0||this.state==='cooldown'&&this.timer>0) {
      this.velocity.x*=Math.exp(-dt*8);this.velocity.z*=Math.exp(-dt*8);
    }else if(distance<2.5&&Math.abs(to.y)<2.6) {
      this.state='windup';this.timer=.65;this.attackPoint.copy(player.position);this.suit.playAction('heavy');
    }else {
      const pursuing=distance<32&&player.position.y<6;
      this.state=pursuing?'pursue':distance>60?'disengage':'patrol';
      const target=pursuing?player.position:this.home.clone().add(new Vector3(Math.sin(this.elapsed*.25+this.id)*2,0,Math.cos(this.elapsed*.25+this.id)*2));
      const direction=target.clone().sub(this.position).setY(0);if(direction.length()> .3)direction.normalize();else direction.set(0,0,0);
      // Forward and side feelers choose an open local route; the capsule handles the final contact.
      const origin=this.position.clone().add(new Vector3(0,1,0));
      const hit=this.physics.ray(origin,direction,3,this.body.body);
      if(hit&&hit.timeOfImpact<2.6&&this.physics.surfaces.get(hit.collider.handle)?.kind!=='actor') {
        const left=new Vector3(-direction.z,0,direction.x),right=left.clone().negate();
        const clearance=(d:Vector3)=>this.physics.ray(origin,d,3,this.body.body)?.timeOfImpact??3;
        direction.copy(clearance(left)>clearance(right)?left:right);
      }
      if(player.attackTime>0&&distance<4&&this.id%2===1&&this.timer===0){direction.set(-to.z,0,to.x).normalize();this.timer=.5;this.suit.playAction('dodge');}
      const speed=pursuing?2.8:1.25;this.velocity.x=direction.x*speed;this.velocity.z=direction.z*speed;
      if(direction.lengthSq()>.1){const angle=Math.atan2(direction.x,direction.z),difference=Math.atan2(Math.sin(angle-this.object.rotation.y),Math.cos(angle-this.object.rotation.y));this.object.rotation.y+=difference*(1-Math.exp(-dt*9));}
    }
    this.velocity.y=Math.max(-12,this.velocity.y-20*dt);this.body.move(this.velocity,dt,false);
  }
  sync(dt:number):void {this.body.sync();if(this.ragdoll.active)this.ragdoll.update(dt);else this.object.position.copy(this.body.position);this.telegraph.position.copy(this.position).setY(this.position.y+.035);this.telegraph.visible=this.state==='windup';}
  animate(dt:number):void {this.suit.animate(dt,FlightState.Ground,Math.min(1,this.velocity.length()/3),0,Math.hypot(this.velocity.x,this.velocity.z));this.ragdoll.blendRecovery(dt);}
  hit(damage:number,direction:Vector3,heavy=false,carryVelocity=new Vector3()):void {
    if(this.health<=0)return;this.health=Math.max(0,this.health-damage);
    if(heavy||this.health<=0) {
      this.body.setEnabled(false);this.ragdoll.start(direction.clone().multiplyScalar(heavy?15:5).add(carryVelocity).add(new Vector3(0,heavy?4:1,0)),new Vector3());this.state='ragdoll';
    }else{this.suit.playAction('hit');this.state='stagger';this.timer=.45;this.velocity.addScaledVector(direction,3);}
  }
  dispose():void {this.ragdoll.clear();this.body.dispose();this.suit.dispose();this.telegraph.geometry.dispose();(this.telegraph.material as MeshBasicMaterial).dispose();this.telegraph.removeFromParent();}
}
