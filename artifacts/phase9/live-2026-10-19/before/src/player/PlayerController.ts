import { Group, MathUtils, Object3D, Vector3 } from 'three';
import { InputController } from '../input/InputController';
import { Controls, loadControls } from '../input/Controls';
import { CharacterBody, PhysicsWorld, RAPIER } from '../physics/PhysicsWorld';
import { Ragdoll } from '../physics/Ragdoll';
import { SPAWN } from '../world/City';
import { AegisSuit } from './AegisSuit';
import { SuitAssembly } from './SuitAssembly';
import { FlightState } from './FlightState';

export interface MovementReference {forward:Vector3;right:Vector3;}
export interface PlayerTelemetry {state:FlightState;speed:number;altitude:number;energy:number;boostActive:boolean;flightActive:boolean;health:number;ragdoll:boolean;suited:boolean;}
export type PlayerForm='pilot'|'armor';
/** How hard a touchdown was: decides the landing animation, recovery time and effects. */
export type LandingTier='soft'|'medium'|'heavy'|'extreme';
export interface LandingEvent {tier:LandingTier;speed:number;position:Vector3;}
/** Free fall: gravity, terminal speed and how little the body can steer without thrust (m/s, m/s²). */
const FALL={gravity:24,terminal:62,airbrakeTerminal:30,steer:9,prepSeconds:.42};
/** Downward impact speed at which each landing tier starts, per form. Above `ragdoll` the fall is not survived upright. */
const IMPACT={armor:{medium:7.5,heavy:15,extreme:44,ragdoll:58},pilot:{medium:6.5,heavy:10,extreme:10,ragdoll:10}};
/** Flight steering: view pitch ignored around level (rad), and how much of it steers in the hover. */
const STEER={deadband:.05,hoverShare:.3};
/** Takeoff: total time, the crouch before lift-off, the climb rate it builds to and how briskly. */
const TAKEOFF={seconds:.6,crouch:.12,climb:11,response:8};
const RECOVERY:Record<LandingTier,number>={soft:.1,medium:.55,heavy:1.2,extreme:1.45};
export class PlayerController {
  /** Scene root holding both playable forms; each form's group is positioned in world space. */
  readonly root=new Group();
  readonly controls:Controls=loadControls();
  readonly armor=new AegisSuit();
  readonly pilot:AegisSuit|null=AegisSuit.hasPilot?new AegisSuit({variant:'pilot'}):null;
  form:PlayerForm='armor';
  readonly velocity=new Vector3();
  readonly body:CharacterBody;
  private readonly ragdolls:{armor:Ragdoll;pilot:Ragdoll|null};
  /** Part-by-part armour assembly (T key and intro). */
  readonly assembly:SuitAssembly;
  /** Form the running transformation will end in. */
  private pendingForm:PlayerForm|null=null;
  state=FlightState.Ground;
  energy=100;
  health=100;
  boostActive=false;
  block=false;
  blockTime=0;
  /** Seconds left in which a strike out of a successful block is a counter. */
  counterWindow=0;
  /** While an aerial strike is under way he faces what he is hitting, wherever the view points (radians, or null). */
  strikeHeading:number|null=null;
  dodgeTime=0;
  recovering=0;
  attackTime=0;
  crashCount=0;
  landed=false;
  onCollision?:(speed:number,p:Vector3,n:Vector3,c:RAPIER.Collider)=>void;
  onDamage?:(amount:number)=>void;
  /** Fired once per touchdown from the air, with the measured impact speed. */
  onLanding?:(event:LandingEvent)=>void;
  /** The most recent touchdown, for systems that poll instead of subscribing. */
  lastLanding:LandingEvent|null=null;
  landings=0;
  /** Seconds until ground contact at the current rate of fall (Infinity when not falling). */
  timeToImpact=Infinity;
  private airTime=0;
  /** Seconds left of the takeoff: a short crouch, then the lift builds. */
  private takeoffTime=0;
  /** Heading the player is steering toward (the view), and how fast it is swinging round, rad/s. */
  private steer=Math.PI;
  private steerRate=0;
  private bank=0;
  private groundedTime=0;
  private wasBlocked=false;
  private readonly dodgeDirection=new Vector3();
  /** Body position after the last two physics steps; the character is drawn between them. */
  private readonly stepFrom=new Vector3();
  private readonly stepTo=new Vector3();
  constructor(readonly physics:PhysicsWorld) {
    this.body=new CharacterBody(physics,SPAWN);
    this.ragdolls={armor:new Ragdoll(this.armor,physics),pilot:this.pilot?new Ragdoll(this.pilot,physics):null};
    this.root.name='AEGIS player';this.root.add(this.armor.group);if(this.pilot)this.root.add(this.pilot.group);
    this.assembly=new SuitAssembly(this.armor,this.pilot,this.root);
    this.object.position.copy(SPAWN);this.object.rotation.y=Math.PI;this.suitUp(1);
    this.stepFrom.copy(SPAWN);this.stepTo.copy(SPAWN);
  }
  /** The form currently driven by physics, input and animation. */
  get suit():AegisSuit {return this.form==='pilot'&&this.pilot?this.pilot:this.armor;}
  get object():Object3D {return this.suit.group;}
  get ragdoll():Ragdoll {return this.form==='pilot'&&this.ragdolls.pilot?this.ragdolls.pilot:this.ragdolls.armor;}
  get suited():boolean {return this.form==='armor';}
  get changingForm():boolean {return this.assembly.active!==null;}
  /**
   * Scrub the suit-up sequence: 0 = pilot only, 1 = armour assembled and powered.
   * Used by the intro; the T key plays the same sequence in real time.
   */
  suitUp(t:number):void {
    this.syncForms();
    if(t>=1)this.assembly.snap('armor');else if(t<=0&&this.pilot)this.assembly.snap('pilot');
    else this.assembly.seek('suit',t*this.assembly.seconds.suit);
  }
  /** 0..1 through the running transformation (1 when none is running). */
  get suitProgress():number {return this.assembly.progress;}
  get bankAmount():number {return this.bank;}
  private syncForms():void {
    const other=this.suit===this.armor?this.pilot:this.armor;
    if(other){other.group.position.copy(this.object.position);other.group.rotation.copy(this.object.rotation);}
  }
  private updateFormChange(dt:number):void {
    if(!this.assembly.active){this.assembly.update(dt);return;}
    this.syncForms();
    if(this.assembly.update(dt))this.completeFormChange();
  }
  /** Land in the target form immediately; safe at any point of the sequence. */
  private completeFormChange():void {
    const target:PlayerForm|null=this.assembly.active?(this.assembly.active==='suit'?'armor':'pilot'):this.pendingForm;
    if(!target)return;
    const position=this.object.position.clone(),rotation=this.object.rotation.y;
    this.pendingForm=null;this.form=target;this.assembly.snap(target);
    this.object.position.copy(position);this.object.rotation.set(0,rotation,0);
  }
  get position():Vector3 {return this.ragdoll.active?this.ragdoll.position:this.body.position;}
  /** In the air under the flight system: powered flight or the free fall out of it. */
  get isFlying():boolean {return ![FlightState.Ground,FlightState.Jump].includes(this.state)&&!this.ragdoll.active;}
  /** Falling under gravity with propulsion off. */
  get falling():boolean {return this.state===FlightState.Fall||this.state===FlightState.Landing;}
  /** Thrusters are holding him up. */
  get powered():boolean {return this.isFlying&&!this.falling;}
  /** Cut propulsion and drop (also the entry to a ground slam, with `push` m/s of downward thrust). */
  dropOut(push=0):void {
    if(!this.isFlying&&this.state!==FlightState.Jump)return;
    this.state=FlightState.Fall;this.boostActive=false;if(push>0)this.velocity.y=Math.min(this.velocity.y,-push);
  }
  getSpeed():number {return this.ragdoll.active?this.ragdoll.speed:this.velocity.length();}
  get forward():Vector3 {return new Vector3(Math.sin(this.object.rotation.y),0,Math.cos(this.object.rotation.y));}
  control(dt:number,input:InputController,reference:MovementReference,enabled:boolean):void {
    this.counterWindow=Math.max(0,this.counterWindow-dt);this.attackTime=Math.max(0,this.attackTime-dt);this.dodgeTime=Math.max(0,this.dodgeTime-dt);this.recovering=Math.max(0,this.recovering-dt);
    if(this.ragdoll.active){
      if(this.health>0&&this.ragdoll.canRecover()){
        const p=this.ragdoll.recover();this.body.teleport(p);this.body.setEnabled(true);this.velocity.set(0,0,0);this.state=FlightState.Ground;this.recovering=.75;
      }return;
    }
    if(!enabled||this.health<=0){this.velocity.set(0,0,0);return;}
    // T: suit up / step out of the armour (on the ground only)
    if(input.anyTap(this.controls.suit)&&this.pilot&&!this.assembly.active&&this.state===FlightState.Ground&&this.body.grounded){
      this.pendingForm=this.suited?'pilot':'armor';this.suit.playAction('idle');this.syncForms();this.assembly.start(this.suited?'unsuit':'suit');
    }
    this.updateFormChange(dt);
    if(this.assembly.active){this.velocity.x=this.velocity.z=0;this.velocity.y-=20*dt;this.body.move(this.velocity,dt,false,()=>{});if(this.body.grounded)this.velocity.y=0;return;}
    const move=input.getMoveAxes(),vertical=input.getVerticalAxis(),flight=input.anyTap(this.controls.flight)&&this.suited;
    const heading=Math.atan2(reference.forward.x,reference.forward.z);
    this.steerRate=MathUtils.damp(this.steerRate,Math.atan2(Math.sin(heading-this.steer),Math.cos(heading-this.steer))/dt,9,dt);this.steer=heading;
    this.block=input.isHeld('Mouse2')||input.isHeld('KeyB');
    this.blockTime=this.block?this.blockTime+dt:0;
    // the guard is held for as long as the key is: forearms up, weight low
    if(this.block!==this.wasBlocked){this.suit.hold(this.block&&this.suited&&!this.isFlying?'aegis_guard':null);if(this.block&&(!this.suited||this.isFlying))this.suit.playAction('guard');}this.wasBlocked=this.block;
    const boost=input.isHeld('ShiftLeft')||input.isHeld('ShiftRight');
    if(input.consumeTap('KeyX')&&this.energy>=12&&this.dodgeTime===0) {
      // the way the stick points; with no direction held he gives ground
      const flat=new Vector3(reference.forward.x,0,reference.forward.z).normalize(),facing=this.forward;
      this.dodgeDirection.copy(reference.right).multiplyScalar(move.x).addScaledVector(flat,move.y);
      if(this.dodgeDirection.lengthSq()<.01)this.dodgeDirection.copy(facing).negate();this.dodgeDirection.normalize();
      const side=this.dodgeDirection.x*facing.z-this.dodgeDirection.z*facing.x,along=this.dodgeDirection.dot(facing);
      this.dodgeTime=.35;this.energy-=12;
      if(this.powered){this.suit.spin(side>=0?1:-1);}
      else this.suit.playAction(!this.suited?'dodge':Math.abs(side)>Math.abs(along)?(side>0?'dodge_l':'dodge_r'):along<0?'dodge_back':side>0?'dodge_l':'dodge_r');
    }
    if(flight&&this.recovering<=0){
      // E in powered flight cuts the thrusters; E again while falling catches him if there is room
      if(this.falling){if(this.timeToImpact>.25){this.state=FlightState.Hover;this.suit.playAction('idle');}}
      else if(this.isFlying)this.dropOut();
      else{this.state=FlightState.Takeoff;this.takeoffTime=TAKEOFF.seconds;this.suit.playAction('takeoff');}
    }
    this.timeToImpact=Infinity;
    if(this.falling) {
      // Free fall. Nothing here moves him directly: gravity changes the velocity and the
      // character controller resolves the motion against the world.
      this.boostActive=false;
      const airbrake=input.isHeld('KeyQ');
      this.velocity.y=Math.max(this.velocity.y-FALL.gravity*dt,-(airbrake?FALL.airbrakeTerminal:FALL.terminal));
      if(airbrake&&this.velocity.y<-FALL.airbrakeTerminal+1)this.velocity.y=MathUtils.damp(this.velocity.y,-FALL.airbrakeTerminal,2.5,dt);
      const drag=Math.exp(-dt*(airbrake?1.4:.16));this.velocity.x*=drag;this.velocity.z*=drag;
      // without thrust the body can only trim its path a little
      const wish=new Vector3().addScaledVector(reference.forward,move.y).addScaledVector(reference.right,move.x).setY(0);
      if(wish.lengthSq()>.02){wish.normalize();const flat=Math.hypot(this.velocity.x,this.velocity.z);this.velocity.addScaledVector(wish,FALL.steer*dt);
        const limit=Math.max(flat,12),now=Math.hypot(this.velocity.x,this.velocity.z);if(now>limit){this.velocity.x*=limit/now;this.velocity.z*=limit/now;}}
      const height=this.physics.groundDistance(this.body.position,80);
      this.timeToImpact=this.velocity.y<-1?height/-this.velocity.y:Infinity;
      this.state=this.timeToImpact<FALL.prepSeconds?FlightState.Landing:FlightState.Fall;
      this.energy=Math.min(100,this.energy+5*dt);
    }else if(this.takeoffTime>0) {
      // Takeoff: he gathers himself, the thrusters light, and the lift builds from nothing.
      this.takeoffTime-=dt;this.boostActive=false;
      const lifting=this.takeoffTime<TAKEOFF.seconds-TAKEOFF.crouch;
      this.velocity.y=lifting?MathUtils.damp(this.velocity.y,TAKEOFF.climb+vertical*3,TAKEOFF.response,dt):0;
      this.velocity.x*=Math.exp(-dt*5);this.velocity.z*=Math.exp(-dt*5);
      this.state=FlightState.Takeoff;
    }else if(this.isFlying) {
      const brake=input.isHeld('KeyQ')||move.y<-.2;
      this.boostActive=boost&&!brake&&this.energy>2;
      const maxSpeed=this.boostActive?52:29,speedNow=this.velocity.length();
      if(brake){this.velocity.multiplyScalar(Math.exp(-dt*4.8));this.state=FlightState.Brake;}
      else {
        // Forward flight goes where the view points, in three dimensions: look up and he
        // climbs, look down and he dives. In the hover the view is free: only part of its
        // pitch steers until he has built some speed, and a small dead band keeps level
        // flight from needing a perfectly level view.
        const look=Math.asin(MathUtils.clamp(reference.forward.y,-1,1));
        const pitch=Math.sign(look)*Math.max(0,Math.abs(look)-STEER.deadband)*MathUtils.lerp(STEER.hoverShare,1,MathUtils.smoothstep(speedNow,4,16));
        const ahead=new Vector3(Math.sin(heading)*Math.cos(pitch),Math.sin(pitch),Math.cos(heading)*Math.cos(pitch));
        const desired=ahead.multiplyScalar(Math.max(0,move.y)).addScaledVector(reference.right,move.x*.8);
        const hasIntent=desired.lengthSq()>.02;
        if(hasIntent) {
          desired.normalize().multiplyScalar(maxSpeed);desired.y+=vertical*13;
          // Acceleration is bounded; steering authority falls with speed, so turns preserve momentum.
          const acceleration=desired.sub(this.velocity).multiplyScalar(1.6).clampLength(0,this.boostActive?27:21);
          this.velocity.addScaledVector(acceleration,dt);
        }else {this.velocity.x*=Math.exp(-dt*.72);this.velocity.z*=Math.exp(-dt*.72);this.velocity.y=MathUtils.damp(this.velocity.y,vertical*13,3,dt);}
        this.velocity.clampLength(0,maxSpeed*1.15);
        // cruise is about covering distance in any direction; rising on the spot is still a hover
        const flatSpeed=Math.hypot(this.velocity.x,this.velocity.z);
        this.state=this.boostActive?FlightState.Boost:flatSpeed>7||(speedNow>9&&move.y>0)?FlightState.Cruise:FlightState.Hover;
      }
      this.energy=MathUtils.clamp(this.energy+(this.boostActive?-15:7)*dt,0,100);
    }else {
      this.boostActive=false;
      const desired=reference.forward.clone().setY(0).normalize().multiplyScalar(move.y).addScaledVector(reference.right,move.x);
      // walk and sprint at the pace of the captured gaits, so the feet do not slide
      const speed=(boost?this.suit.runSpeed*(this.suited?1.36:1.16):this.suit.walkSpeed*(this.suited?1.04:1.1))*(this.block?.2:1)*(this.attackTime>0?.38:1)*(this.recovering>0?0:1);
      if(desired.lengthSq()>0)desired.normalize().multiplyScalar(speed);
      // heavier armour takes longer to get moving than to stop
      const grip=desired.lengthSq()>this.velocity.x*this.velocity.x+this.velocity.z*this.velocity.z?(this.suited?6.5:8):(this.suited?8.5:10);
      this.velocity.x=MathUtils.damp(this.velocity.x,desired.x,grip,dt);this.velocity.z=MathUtils.damp(this.velocity.z,desired.z,grip,dt);
      if(input.consumeTap('Space')&&this.groundedTime<.12&&this.recovering<=0){this.velocity.y=7.2;this.state=FlightState.Jump;this.suit.playAction('jump');this.groundedTime=1;}
      this.velocity.y-=20*dt;this.energy=Math.min(100,this.energy+12*dt);
      // a jump or a step off a ledge that turns into a real drop is a fall like any other
      if(this.state===FlightState.Jump&&(this.velocity.y<-11||this.airTime>.9))this.state=FlightState.Fall;
    }
    // on the ground a dodge is a sidestep of a couple of metres; in the air, a thruster burst
    if(this.dodgeTime>0){const pace=this.suited&&!this.isFlying?7:14;this.velocity.x=this.dodgeDirection.x*pace;this.velocity.z=this.dodgeDirection.z*pace;}
    const descent=Math.max(0,-this.velocity.y),unpowered=this.falling||this.state===FlightState.Jump,limits=IMPACT[this.form];
    this.body.move(this.velocity,dt,this.isFlying,(speed,p,n,c)=>{
      this.onCollision?.(speed,p,n,c);
      // coming down feet-first onto the ground is a landing, however hard; hitting anything else at speed is a crash
      const touchdown=unpowered&&n.y>.6&&speed<limits.ragdoll;
      if(speed>16&&this.recovering<=0&&!touchdown)this.crash(this.velocity.clone().addScaledVector(n,speed*.3),Math.min(25,(speed-13)*.9));
    });
    if(this.ragdoll.active)return;
    if(this.body.grounded&&this.velocity.y<=.1&&this.takeoffTime<=0){
      this.groundedTime=0;this.airTime=0;
      if(this.state!==FlightState.Ground){this.touchDown(descent);}
    }else{this.groundedTime+=dt;this.airTime+=dt;}
    if(!this.isFlying&&this.groundedTime>.15&&this.state===FlightState.Ground)this.state=FlightState.Jump;
    const flat=new Vector3(this.velocity.x,0,this.velocity.z);
    if(this.powered&&this.takeoffTime<=0&&this.dodgeTime<=0) {
      // In flight he flies where the pilot looks. The nose follows the view, and he rolls
      // into the turn by how hard the view is swinging round and how much he is still
      // sliding sideways, so a look to one side reads as a banked turn, not a flat spin.
      const face=this.strikeHeading??heading;
      const difference=Math.atan2(Math.sin(face-this.object.rotation.y),Math.cos(face-this.object.rotation.y));
      this.object.rotation.y+=difference*(1-Math.exp(-dt*(this.strikeHeading===null?5:16)));
      const slip=(this.velocity.x*reference.right.x+this.velocity.z*reference.right.z)/30;
      this.bank=MathUtils.damp(this.bank,MathUtils.clamp(difference*1.5+this.steerRate*.5-slip*.9,-1,1),4.5,dt);
    }else if(flat.length()> .2 && this.dodgeTime<=0) {
      const target=Math.atan2(flat.x,flat.z),difference=Math.atan2(Math.sin(target-this.object.rotation.y),Math.cos(target-this.object.rotation.y));
      this.object.rotation.y+=difference*(1-Math.exp(-dt*(this.isFlying?4:this.suited?7:8.5)));
      this.bank=MathUtils.damp(this.bank,MathUtils.clamp(difference*2,-1,1),5,dt);
    }else this.bank=MathUtils.damp(this.bank,0,6,dt);
  }
  /** Ground contact from the air: grade the impact by the speed he was actually falling at. */
  private touchDown(speed:number):void {
    const limits=IMPACT[this.form];
    const tier:LandingTier=speed>=limits.extreme?'extreme':speed>=limits.heavy?'heavy':speed>=limits.medium?'medium':'soft';
    this.landed=true;this.state=FlightState.Ground;this.velocity.y=0;this.boostActive=false;
    // the harder the landing, the more of the run-in speed the legs have to absorb
    const keep=tier==='soft'?.85:tier==='medium'?.35:0;this.velocity.x*=keep;this.velocity.z*=keep;
    this.recovering=RECOVERY[tier];
    this.suit.playAction(tier==='soft'?'land_soft':tier==='medium'?'land_medium':'land_heavy');
    if(tier==='extreme'){const hurt=(speed-limits.extreme)*1.6+6;this.health=Math.max(1,this.health-hurt);this.onDamage?.(hurt);}
    else if(!this.suited&&tier!=='soft'){const hurt=(speed-limits.medium)*3+4;this.health=Math.max(1,this.health-hurt);this.onDamage?.(hurt);}
    this.lastLanding={tier,speed,position:this.body.position.clone()};this.landings++;this.onLanding?.(this.lastLanding);
  }
  sync(dt:number):void {
    this.body.sync();
    if(this.ragdoll.active){this.ragdoll.update(dt);return;}
    this.stepFrom.copy(this.stepTo);this.stepTo.copy(this.body.position);
    if(this.stepFrom.distanceToSquared(this.stepTo)>9)this.stepFrom.copy(this.stepTo);   // teleport: nothing to draw between
    this.object.position.copy(this.body.position);
  }
  /**
   * Place the character for this display frame. Physics advances in fixed 60 Hz steps;
   * drawn at the raw step positions he would move unevenly against the camera on any
   * display that is not 60 Hz, so he is drawn between the last two steps instead.
   */
  present(alpha:number):void {
    if(this.ragdoll.active)return;
    this.object.position.lerpVectors(this.stepFrom,this.stepTo,MathUtils.clamp(alpha,0,1));
    if(this.assembly.active)this.syncForms();
  }
  /** Where the character is drawn this frame (what the camera should follow). */
  get renderPosition():Vector3 {return this.ragdoll.active?this.ragdoll.position:this.object.position;}
  animate(dt:number):void {
    // in the air the pose follows ground speed and rate of climb separately
    const flat=Math.hypot(this.velocity.x,this.velocity.z),travelling=this.state===FlightState.Cruise||this.state===FlightState.Boost;
    this.suit.animate(dt,this.state,Math.min(1,flat/4),this.bank,this.isFlying&&!travelling?flat:this.getSpeed(),
      {vertical:this.velocity.y,boost:this.boostActive,climb:travelling?Math.atan2(this.velocity.y,Math.max(flat,.5)):0});
    // the other form only needs animating while both are on screen (suit-up / intro)
    const other=this.suit===this.armor?this.pilot:this.armor;
    if(other?.group.visible)other.animate(dt,FlightState.Ground,0,0,0);
    this.ragdoll.blendRecovery(dt);this.armor.damage(1-this.health/100);
  }
  damage(amount:number,direction:Vector3,heavy=false):boolean {
    if(this.health<=0||this.dodgeTime>0||this.recovering>.3)return false;
    // without the armour every hit lands much harder
    if(this.block)this.counterWindow=.75;
    const actual=(this.block?amount*.18:amount)*(this.suited?1:2.2);this.health=Math.max(0,this.health-actual);this.onDamage?.(actual);
    if((heavy&&!this.block)||this.health===0)this.crash(direction.clone().multiplyScalar(10).add(new Vector3(0,5,0)),0);
    else this.suit.playAction(this.block?'guard':'hit');return true;
  }
  crash(velocity:Vector3,damage:number):void {
    if(this.ragdoll.active)return;this.takeoffTime=0;if(this.assembly.active)this.completeFormChange();this.health=Math.max(0,this.health-damage);this.boostActive=false;this.crashCount++;
    this.body.setEnabled(false);this.ragdoll.start(velocity,new Vector3());this.velocity.set(0,0,0);
  }
  telemetry():PlayerTelemetry {return {state:this.state,speed:this.getSpeed(),altitude:Math.max(0,this.position.y),energy:this.energy,boostActive:this.boostActive,flightActive:this.powered,health:this.health,ragdoll:this.ragdoll.active,suited:this.suited};}
  reset():void {
    this.ragdolls.armor.reset();this.ragdolls.pilot?.reset();this.form='armor';this.pendingForm=null;
    this.body.setEnabled(true);this.body.teleport(SPAWN);this.object.position.copy(SPAWN);this.object.rotation.set(0,Math.PI,0);this.stepFrom.copy(SPAWN);this.stepTo.copy(SPAWN);
    this.velocity.set(0,0,0);this.health=this.energy=100;this.state=FlightState.Ground;this.boostActive=this.block=false;
    this.dodgeTime=this.recovering=this.attackTime=this.crashCount=this.groundedTime=this.airTime=this.landings=0;this.landed=false;this.lastLanding=null;this.strikeHeading=null;this.timeToImpact=Infinity;this.takeoffTime=0;this.suitUp(1);
  }
}
