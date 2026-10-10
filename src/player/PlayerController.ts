import { MathUtils, Object3D, Vector3 } from 'three';
import { InputController } from '../input/InputController';
import { CharacterBody, PhysicsWorld, RAPIER } from '../physics/PhysicsWorld';
import { Ragdoll } from '../physics/Ragdoll';
import { SPAWN } from '../world/City';
import { AegisSuit } from './AegisSuit';
import { FlightState } from './FlightState';

export interface MovementReference {forward:Vector3;right:Vector3;}
export interface PlayerTelemetry {state:FlightState;speed:number;altitude:number;energy:number;boostActive:boolean;flightActive:boolean;health:number;ragdoll:boolean;}
export class PlayerController {
  readonly suit=new AegisSuit();
  readonly object:Object3D=this.suit.group;
  readonly velocity=new Vector3();
  readonly body:CharacterBody;
  readonly ragdoll:Ragdoll;
  state=FlightState.Ground;
  energy=100;
  health=100;
  boostActive=false;
  block=false;
  blockTime=0;
  dodgeTime=0;
  recovering=0;
  attackTime=0;
  crashCount=0;
  landed=false;
  onCollision?:(speed:number,p:Vector3,n:Vector3,c:RAPIER.Collider)=>void;
  onDamage?:(amount:number)=>void;
  private bank=0;
  private groundedTime=0;
  private wasBlocked=false;
  private readonly dodgeDirection=new Vector3();
  constructor(readonly physics:PhysicsWorld) {
    this.body=new CharacterBody(physics,SPAWN);this.ragdoll=new Ragdoll(this.suit,physics);
    this.object.position.copy(SPAWN);this.object.rotation.y=Math.PI;
  }
  get position():Vector3 {return this.ragdoll.active?this.ragdoll.position:this.body.position;}
  get isFlying():boolean {return ![FlightState.Ground,FlightState.Jump].includes(this.state)&&!this.ragdoll.active;}
  getSpeed():number {return this.ragdoll.active?this.ragdoll.speed:this.velocity.length();}
  get forward():Vector3 {return new Vector3(Math.sin(this.object.rotation.y),0,Math.cos(this.object.rotation.y));}
  control(dt:number,input:InputController,reference:MovementReference,enabled:boolean):void {
    this.attackTime=Math.max(0,this.attackTime-dt);this.dodgeTime=Math.max(0,this.dodgeTime-dt);this.recovering=Math.max(0,this.recovering-dt);
    if(this.ragdoll.active){
      if(this.health>0&&this.ragdoll.canRecover()){
        const p=this.ragdoll.recover();this.body.teleport(p);this.body.setEnabled(true);this.velocity.set(0,0,0);this.state=FlightState.Ground;this.recovering=.75;
      }return;
    }
    if(!enabled||this.health<=0){this.velocity.set(0,0,0);return;}
    const move=input.getMoveAxes(),vertical=input.getVerticalAxis(),flight=input.consumeTap('KeyE');
    this.block=input.isHeld('Mouse2')||input.isHeld('KeyB');
    this.blockTime=this.block?this.blockTime+dt:0;
    if(this.block&&!this.wasBlocked)this.suit.playAction('guard');this.wasBlocked=this.block;
    const boost=input.isHeld('ShiftLeft')||input.isHeld('ShiftRight');
    if(input.consumeTap('KeyX')&&this.energy>=12&&this.dodgeTime===0) {
      this.dodgeTime=.35;this.energy-=12;this.dodgeDirection.copy(reference.right).multiplyScalar(move.x||1);this.suit.playAction('dodge');
    }
    if(flight){
      if(this.isFlying)this.state=this.state===FlightState.Landing?FlightState.Hover:FlightState.Landing;
      else{this.state=FlightState.Takeoff;this.velocity.y=8;this.suit.playAction('takeoff');}
    }
    if(this.isFlying) {
      const brake=input.isHeld('KeyQ')||move.y<-.2;
      this.boostActive=boost&&!brake&&this.energy>2&&this.state!==FlightState.Landing;
      const maxSpeed=this.boostActive?52:29;
      const desired=new Vector3().addScaledVector(reference.forward,Math.max(0,move.y)).addScaledVector(reference.right,move.x*.8);
      if(this.state===FlightState.Landing){
        this.velocity.x*=Math.exp(-dt*3);this.velocity.z*=Math.exp(-dt*3);
        this.velocity.y=MathUtils.damp(this.velocity.y,-6,3,dt);
      }else if(brake){this.velocity.multiplyScalar(Math.exp(-dt*4.8));this.state=FlightState.Brake;}
      else {
        const hasIntent=desired.lengthSq()>.02;
        if(hasIntent) {
          desired.normalize().multiplyScalar(maxSpeed);
          // Acceleration is bounded; steering authority falls with speed, so turns preserve momentum.
          const acceleration=desired.sub(this.velocity).multiplyScalar(1.6).clampLength(0,this.boostActive?25:19);
          this.velocity.addScaledVector(acceleration,dt);
        }else {this.velocity.x*=Math.exp(-dt*.72);this.velocity.z*=Math.exp(-dt*.72);}
        const targetY=(hasIntent?reference.forward.y*Math.max(0,move.y)*maxSpeed:0)+vertical*13;
        this.velocity.y=MathUtils.damp(this.velocity.y,targetY,hasIntent?1.4:3,dt);
        this.velocity.clampLength(0,maxSpeed*1.15);
        this.state=this.boostActive?FlightState.Boost:this.velocity.length()>7?FlightState.Cruise:FlightState.Hover;
      }
      this.energy=MathUtils.clamp(this.energy+(this.boostActive?-15:7)*dt,0,100);
    }else {
      this.boostActive=false;
      const desired=reference.forward.clone().setY(0).normalize().multiplyScalar(move.y).addScaledVector(reference.right,move.x);
      const speed=(boost?7.3:3.9)*(this.block?.42:1)*(this.attackTime>0?.38:1)*(this.recovering>0?0:1);
      if(desired.lengthSq()>0)desired.normalize().multiplyScalar(speed);
      this.velocity.x=MathUtils.damp(this.velocity.x,desired.x,12,dt);this.velocity.z=MathUtils.damp(this.velocity.z,desired.z,12,dt);
      if(input.consumeTap('Space')&&this.groundedTime<.12){this.velocity.y=7.2;this.state=FlightState.Jump;this.suit.playAction('takeoff');this.groundedTime=1;}
      this.velocity.y-=20*dt;this.energy=Math.min(100,this.energy+12*dt);
    }
    if(this.dodgeTime>0){this.velocity.x=this.dodgeDirection.x*14;this.velocity.z=this.dodgeDirection.z*14;}
    this.body.move(this.velocity,dt,this.isFlying,(speed,p,n,c)=>{
      this.onCollision?.(speed,p,n,c);
      if(speed>16&&this.recovering<=0)this.crash(this.velocity.clone().addScaledVector(n,speed*.3),Math.min(25,(speed-13)*.9));
    });
    if(this.body.grounded&&this.velocity.y<=.1){
      this.groundedTime=0;
      if(this.state!==FlightState.Ground){this.landed=true;this.state=FlightState.Ground;this.velocity.y=0;this.suit.playAction('land');}
    }else this.groundedTime+=dt;
    if(!this.isFlying&&this.groundedTime>.15&&this.state===FlightState.Ground)this.state=FlightState.Jump;
    const flat=new Vector3(this.velocity.x,0,this.velocity.z);
    if(flat.length()> .2 && this.dodgeTime<=0) {
      const target=Math.atan2(flat.x,flat.z),difference=Math.atan2(Math.sin(target-this.object.rotation.y),Math.cos(target-this.object.rotation.y));
      this.object.rotation.y+=difference*(1-Math.exp(-dt*(this.isFlying?4:11)));
      this.bank=MathUtils.damp(this.bank,MathUtils.clamp(difference*2,-1,1),5,dt);
    }else this.bank=MathUtils.damp(this.bank,0,6,dt);
  }
  sync(dt:number):void {this.body.sync();if(this.ragdoll.active)this.ragdoll.update(dt);else this.object.position.copy(this.body.position);}
  animate(dt:number):void {
    this.suit.animate(dt,this.state,Math.min(1,Math.hypot(this.velocity.x,this.velocity.z)/4),this.bank,this.getSpeed());
    this.ragdoll.blendRecovery(dt);this.suit.damage(1-this.health/100);
  }
  damage(amount:number,direction:Vector3,heavy=false):boolean {
    if(this.health<=0||this.dodgeTime>0||this.recovering>.3)return false;
    const actual=this.block?amount*.18:amount;this.health=Math.max(0,this.health-actual);this.onDamage?.(actual);
    if((heavy&&!this.block)||this.health===0)this.crash(direction.clone().multiplyScalar(10).add(new Vector3(0,5,0)),0);
    else this.suit.playAction(this.block?'guard':'hit');return true;
  }
  crash(velocity:Vector3,damage:number):void {
    if(this.ragdoll.active)return;this.health=Math.max(0,this.health-damage);this.boostActive=false;this.crashCount++;
    this.body.setEnabled(false);this.ragdoll.start(velocity,new Vector3());this.velocity.set(0,0,0);
  }
  telemetry():PlayerTelemetry {return {state:this.state,speed:this.getSpeed(),altitude:Math.max(0,this.position.y),energy:this.energy,boostActive:this.boostActive,flightActive:this.isFlying,health:this.health,ragdoll:this.ragdoll.active};}
  reset():void {
    this.ragdoll.reset();this.body.setEnabled(true);this.body.teleport(SPAWN);this.object.position.copy(SPAWN);this.object.rotation.set(0,Math.PI,0);
    this.velocity.set(0,0,0);this.health=this.energy=100;this.state=FlightState.Ground;this.boostActive=this.block=false;
    this.dodgeTime=this.recovering=this.attackTime=this.crashCount=this.groundedTime=0;this.landed=false;this.suit.assembly(1);
  }
}
