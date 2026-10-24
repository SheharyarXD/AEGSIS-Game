import {MathUtils,Vector3} from 'three';
import {City} from '../City';
import {PlayerController,MovementReference} from '../../player/PlayerController';
import {FlightState} from '../../player/FlightState';
import {InputController} from '../../input/InputController';
import {CameraRig} from '../../camera/CameraRig';
import {AudioSystem,Cue} from '../../audio/AudioSystem';
import {Missiles} from '../../combat/Missiles';
import {BreachPlan,planBreach} from './BreachPlan';
import {TITAN_CONFIG} from './TitanConfig';
import {CINEMATIC,flightEntry,flightExit,sweepFlight,validateExterior} from './CinematicRoute';
import {CinematicCamera} from './CinematicCamera';
import {BreachAnimation} from './BreachAnimation';

export type AssaultState='IDLE'|'PREPARING'|'ACQUIRING'|'DEPLOYING'|'BARRAGE'|'ENTRY_CONFIRMED'|'ACCELERATING'|'INTERIOR_TRAVERSAL'|'EXIT_IMPACT'|'RECOVERY'|'COMPLETE'|'ABORTED';
type Event={time:number;kind:string;wave?:number;position?:number[];state?:AssaultState};
/** One owner coordinates real impacts, source damage, ordinary capsule motion and the additive camera. */
export class TitanCinematicAssault {
 state:AssaultState='IDLE';completed=0;entries=0;exits=0;readonly events:Event[]=[];
 readonly motion:{time:number;p:number[];state:AssaultState;enabled:boolean;speed:number}[]=[];
 private route:BreachPlan|null=null;private token:number|null=null;private pending=false;private disposed=false;private epoch=0;
 private cooldown=0;private age=0;private phaseAge=0;private clock=0;private wave=-1;private waveStart=0;private impacts=0;
 private anchor=new Vector3();private previous=new Vector3();private stalled=0;private interiorMarker=0;private text='';private messageAge=0;
 private element:HTMLElement;private marker:HTMLElement;readonly director:CinematicCamera;readonly animation:BreachAnimation;
 constructor(private city:City,private player:PlayerController,private camera:CameraRig,private missiles:Missiles,private audio:AudioSystem,status?:HTMLElement){
  this.director=new CinematicCamera(camera,player);
  this.animation=new BreachAnimation(player.armor);
  this.element=status??document.createElement('div');this.element.setAttribute('role','status');this.element.setAttribute('aria-live','polite');
  Object.assign(this.element.style,{position:'fixed',right:'28px',bottom:'148px',font:'11px monospace',letterSpacing:'.08em',color:'#d8e4df',background:'#101d26dc',padding:'10px 14px',pointerEvents:'none',display:'none'});if(!status)document.body.append(this.element);
  this.marker=document.createElement('div');Object.assign(this.marker.style,{position:'fixed',width:'104px',height:'80px',border:'1px solid #efba79',boxShadow:'0 0 16px #eda65255',transform:'translate(-50%,-50%)',pointerEvents:'none',display:'none',color:'#efc190',font:'10px monospace',textAlign:'center',paddingTop:'29px',boxSizing:'border-box'});document.body.append(this.marker);
  missiles.onBarrageImpact=(p,n,shot,collider)=>{
   const hit=this.city.architecture?.barrageImpact(shot.token,shot.wave,p,n,collider);
   if(!hit)this.city.architecture?.blast(p,3,70,n.clone().negate(),{kind:'missile'});
   if(shot.token===this.token){if(!hit){this.interrupt('BREACH IMPACT MISSED RESERVED CORRIDOR');return;}this.impacts++;this.record('impact',shot.wave,p);this.camera.addShake(this.director.reduced?.03:.16);this.sound('missileHit',p,1.2);}
  };
 }
 get ownsInput(){return this.pending||this.route!==null;}
 get ownsCamera(){return this.route!==null;}
 private say(text:string){this.text=text;this.messageAge=4;}
 private sound(cue:Cue,point:Vector3,strength=1){const offset=point.clone().sub(this.player.position),distance=offset.length(),right=new Vector3().crossVectors(this.route?.direction??this.player.forward,new Vector3(0,1,0));this.audio.cue(cue,strength,{distance,pan:distance>.01?MathUtils.clamp(offset.dot(right)/distance,-1,1):0});}
 private record(kind:string,wave?:number,p?:Vector3){this.events.push({time:this.clock,kind,wave,position:p?.toArray(),state:this.state});if(this.events.length>128)this.events.shift();}
 private enter(state:AssaultState){this.state=state;this.phaseAge=0;this.record(state,undefined,this.player.position);}
 update(dt:number,input:InputController,reference:MovementReference){
  if(this.disposed)return;this.clock+=dt;this.cooldown=Math.max(0,this.cooldown-dt);this.messageAge=Math.max(0,this.messageAge-dt);
  if(!this.ownsInput&&input.anyTap(this.player.controls.demolition)){
   if(!this.player.suited)this.say('DEMOLITION · ARMOR REQUIRED');else{this.missiles.demolition=!this.missiles.demolition;this.say(this.missiles.demolition?'STRUCTURAL DEMOLITION · 3 MISSILES / 14 ENERGY EACH':'STANDARD MISSILES');}
  }
  if(input.anyTap(this.player.controls.breakthrough)){if(!this.ownsInput)void this.activate(reference.forward.clone(),input);}
  if(!this.route){
   if(this.pending){this.phaseAge+=dt;if(!this.player.suited||this.player.ragdoll.active||this.player.changingForm||this.player.health<=0)this.interrupt('BREACH � PREPARATION INTERRUPTED');else if(this.phaseAge>8)this.interrupt('BREACH � ASSET PREPARATION TIMED OUT');}
   return;
  }
  if(!this.player.suited||this.player.ragdoll.active||this.player.changingForm||this.player.health<=0){this.interrupt('BREACH · INTERRUPTED');return;}
  if(!this.city.architecture?.barrageReserved(this.token!)){this.interrupt('BREACH · WORLD RESERVATION LOST');return;}
  this.age+=dt;this.phaseAge+=dt;
  if(this.age>18){this.interrupt('BREACH · TIMEOUT / SAFE STOP');return;}
  this.motion.push({time:this.clock,p:this.player.position.toArray(),state:this.state,enabled:this.player.body.body.isEnabled(),speed:this.player.getSpeed()});if(this.motion.length>1024)this.motion.shift();
  const p=this.route;
  if(this.state==='ACQUIRING'&&this.phaseAge>=.4){this.missiles.deployBarrage();this.enter('DEPLOYING');this.audio.cue('podServo');}
  else if(this.state==='DEPLOYING'&&this.missiles.deployed>=.99)this.startWave(0);
  else if(this.state==='BARRAGE'&&!this.missiles.barrageBusy&&this.impacts-this.waveStart>=TITAN_CONFIG.breakthrough.waves[this.wave]){
   if(this.wave<2)this.startWave(this.wave+1);
   else if(this.city.architecture.finishBarrage(this.token!,true)){this.enter('ENTRY_CONFIRMED');this.say('PASSAGE VERIFIED · THRUST COMMIT');this.missiles.endBarrage();this.audio.cue('thrusterStart',1.6);}
   else if(this.phaseAge>5)this.interrupt('BREACH · ROUTE OBSTRUCTED / SAFE STOP');
  }else if(this.state==='ENTRY_CONFIRMED'&&this.phaseAge>.1){
   if(validateExterior(this.player.physics,p,this.player.position,this.player.body.body,this.player.body.height)){this.interrupt('BREACH · APPROACH CHANGED / SAFE STOP');return;}
   this.player.state=FlightState.Cruise;this.player.strikeHeading=Math.atan2(p.direction.x,p.direction.z);this.enter('ACCELERATING');this.previous.copy(this.player.position);
  }
  if(['ACQUIRING','DEPLOYING','BARRAGE','ENTRY_CONFIRMED'].includes(this.state)){
   this.player.velocity.multiplyScalar(Math.exp(-dt*18));this.player.body.move(this.player.velocity,dt,this.player.isFlying);return;
  }
  if(this.state==='ACCELERATING'){
   const end=flightEntry(p,this.player.body.height);if(this.player.position.distanceTo(end)<.55){this.entries++;this.enter('INTERIOR_TRAVERSAL');this.audio.cue('impact',1.1);this.say('TITAN BREACH · INTERIOR TRANSIT');}
   else this.moveToward(end,CINEMATIC.entrySpeed*MathUtils.smoothstep(this.phaseAge+.2,0,.6),dt);
  }
  if(this.state==='INTERIOR_TRAVERSAL'){
   const along=this.player.position.clone().sub(flightEntry(p,this.player.body.height)).dot(p.direction),exit=flightExit(p,this.player.body.height);
   if(along>=p.length-.25){this.exits++;this.enter('EXIT_IMPACT');this.city.architecture.breachImpact(p,true);this.city.architecture.effects.cinematicExit(p.exit,p.direction,p.lining??'concrete',p.buildingId);this.audio.cue('missileHit',2.2);this.audio.cue('boost',1.7);this.say('TITAN BREACH · EXIT SHOCK');this.record('exit-blast',undefined,p.exit);}
   else{
    this.moveToward(exit,MathUtils.clamp(p.length/CINEMATIC.interiorSeconds,16,58),dt);
    const marker=Math.floor(Math.max(0,along)/7);
    if(marker>this.interiorMarker){this.interiorMarker=marker;const impact=this.player.position.clone().add(new Vector3(0,2.3,0)).addScaledVector(new Vector3().crossVectors(p.direction,new Vector3(0,1,0)),marker%2?2.4:-2.4);this.city.architecture.effects.fragmentBurst(impact,p.direction,p.lining==='stone'?'stone':p.lining==='glass'?'steel':'concrete');this.camera.addShake(this.director.reduced?.015:.07);this.sound('impact',impact,.45);this.record('interior-marker',undefined,impact);}
   }
  }
  if(this.state==='EXIT_IMPACT'){
   const end=flightExit(p,this.player.body.height).addScaledVector(p.direction,CINEMATIC.runway-4);
   if(this.player.position.distanceTo(end)<.45||this.phaseAge>.8){this.enter('RECOVERY');this.say('BREACH COMPLETE · FLIGHT CONTROL RETURNING');}
   else this.moveToward(end,8+(CINEMATIC.exitSpeed-8)*Math.exp(-this.phaseAge*5),dt);
  }else if(this.state==='RECOVERY'){
   // A bounded coast within the validated runway; recovery never continues through the next block.
   const end=flightExit(p,this.player.body.height).addScaledVector(p.direction,CINEMATIC.runway);
   this.moveToward(end,MathUtils.lerp(8,5,Math.min(1,this.phaseAge/CINEMATIC.recovery)),dt);
   if(this.route&&this.phaseAge>=CINEMATIC.recovery){this.completed++;this.enter('COMPLETE');this.player.velocity.copy(p.direction).multiplyScalar(12);this.release(input);this.say('TITAN BREACH COMPLETE · FLIGHT CONTROL RESTORED');}
  }
 }
 private moveToward(end:Vector3,speed:number,dt:number){
  if(!this.route)return;const delta=end.clone().sub(this.player.position),distance=delta.length();if(distance<.02){this.player.velocity.set(0,0,0);return;}
  const move=delta.normalize().multiplyScalar(Math.min(distance,speed*dt)),next=this.player.position.clone().add(move);
  if(sweepFlight(this.player.physics,this.player.position,next,this.player.body.body,this.player.body.height)){this.interrupt('BREACH · NEW OBSTRUCTION / SAFE STOP');return;}
  this.stalled=this.player.position.distanceToSquared(this.previous)<.00004?this.stalled+dt:0;this.previous.copy(this.player.position);
  if(this.stalled>.45){this.interrupt('BREACH · MOTION BLOCKED / SAFE STOP');return;}
  this.player.state=FlightState.Boost;this.player.boostActive=true;this.player.velocity.copy(move).divideScalar(dt);this.player.body.move(this.player.velocity,dt,true,()=>this.interrupt('BREACH · COLLISION / SAFE STOP'));
 }
 private startWave(wave:number){this.wave=wave;this.waveStart=this.impacts;this.enter('BARRAGE');const token=this.token!;
  if(!this.missiles.barrageWave(Array.from({length:TITAN_CONFIG.breakthrough.waves[wave]},(_,slot)=>({token,wave,target:()=>this.city.architecture?.barrageTarget(token,slot)??this.route!.exit.clone()})))){this.interrupt('BREACH · LAUNCHERS INTERRUPTED');return;}
  this.record('wave',wave);this.say(['BREACH / 1 · ENTRANCE','BREACH / 2 · STRUCTURE','BREACH / 3 · EXIT'][wave]);
 }
 private async activate(direction:Vector3,input:InputController){
  const c=TITAN_CONFIG.breakthrough;
  if(!this.player.suited||this.player.ragdoll.active||this.player.changingForm||this.player.health<=0){this.say('BREACH · ARMOR REQUIRED');return;}
  if(this.cooldown>0){this.say(`BREACH · ${Math.ceil(this.cooldown)}s COOLDOWN`);return;}
  if(this.player.energy<c.energy){this.say('BREACH · 48 ENERGY REQUIRED');return;}
  if(!this.missiles.barrageAvailable){this.say('BREACH · CLEAR LAUNCHERS FIRST');return;}
  const cameraOrigin=this.camera.camera.position.clone().addScaledVector(direction,this.camera.camera.position.distanceTo(this.player.position.clone().add(new Vector3(0,1.6,0)))+1.5);
  const target=this.city.architecture?.targetBuilding(cameraOrigin,direction,c.range);if(!target){this.say('BREACH · AIM AT AN UNOBSTRUCTED BUILDING');return;}
  const building=this.city.layout.buildings.find(b=>b.id===target.id);if(!building)return;
  const height=!this.player.isFlying&&this.player.position.y<2?c.halfHeight+.12:Math.max(c.halfHeight+.12,Math.min(building.h-c.halfHeight-.12,target.point.y));
  const origin=this.player.position.clone().setY(height),aim=target.point.clone().sub(origin).setY(0).normalize();
  const plan=planBreach(this.city.layout.buildings,origin,aim,c.range,c.maxDepth,c.radius,c.halfHeight);
  if(!plan||plan.buildingId!==building.id){this.say('BREACH · NO SAFE ENTRANCE-TO-EXIT ROUTE');return;}plan.ground=height<c.halfHeight+.4;
  const reason=validateExterior(this.player.physics,plan,this.player.position,this.player.body.body,this.player.body.height);
  if(reason){this.say('BREACH · '+reason);return;}
  const interior=building.style==='gothic'?'stone':building.style==='industrial'?'utility':'office';
  if(!this.city.assets.parts.has('titan10_interior_'+interior)){this.say('BREACH � INTERIOR ASSET UNAVAILABLE');return;}
  this.pending=true;this.enter('PREPARING');this.say('TITAN BREACH · PREPARING SAFE PASSAGE');this.anchor.copy(this.player.position);const epoch=++this.epoch;
  try{
   // Predictive preparation does not relocate the actor or make an unvalidated route passable.
   this.city.prepareAt(this.player.position,plan.direction.clone().multiplyScalar(46));
   const token=await this.city.architecture?.reserveBarrage(plan,this.player.position.clone().add(new Vector3(0,1.7,0)));
   if(this.disposed||epoch!==this.epoch){if(token)this.city.architecture?.releaseBarrage(token);return;}
   if(!token||this.player.position.distanceTo(this.anchor)>2||!this.player.suited||this.player.changingForm||this.player.ragdoll.active||this.player.health<=0||this.player.energy<c.energy||validateExterior(this.player.physics,plan,this.player.position,this.player.body.body,this.player.body.height)){
    if(token)this.city.architecture?.releaseBarrage(token);this.interrupt('BREACH · PASSAGE OR RESOURCES UNAVAILABLE');return;
   }
   if(!this.missiles.beginBarrage(plan.entry,false)){this.city.architecture?.releaseBarrage(token);this.interrupt('BREACH · LAUNCHERS UNAVAILABLE');return;}
   this.route=plan;this.token=token;this.player.energy-=c.energy;this.cooldown=c.cooldown;this.age=this.phaseAge=this.impacts=this.interiorMarker=this.stalled=0;this.wave=-1;this.motion.length=0;this.director.reset();input.reset();this.enter('ACQUIRING');this.audio.cue('lock');
  }catch{this.interrupt('BREACH · PREPARATION UNAVAILABLE');}finally{if(epoch===this.epoch)this.pending=false;}
 }
 cameraUpdate(dt:number){if(!this.route)return false;this.director.update(dt,this.route,this.state,this.phaseAge);return true;}
 animate(dt:number){this.animation.update(dt,this.state,this.phaseAge,!!this.route);}
 present(){
  if(this.route){const yaw=Math.atan2(this.route.direction.x,this.route.direction.z),difference=Math.atan2(Math.sin(yaw-this.player.object.rotation.y),Math.cos(yaw-this.player.object.rotation.y));this.player.object.rotation.y+=difference*.18;}
  this.element.textContent=this.messageAge>0?this.text:this.route?'TITAN BREACH · CINEMATIC ASSAULT':this.missiles.demolition?'STRUCTURAL DEMOLITION · O / F':'';this.element.style.display=this.element.textContent?'block':'none';this.marker.style.display='none';
  if(this.route&&['ACQUIRING','DEPLOYING','BARRAGE'].includes(this.state)){const p=this.route.entry.clone().project(this.camera.camera);if(p.z<1){this.marker.style.display='block';this.marker.style.left=`${(p.x*.5+.5)*innerWidth}px`;this.marker.style.top=`${(-p.y*.5+.5)*innerHeight}px`;this.marker.textContent=this.wave<0?'TARGET LOCK':`WAVE ${this.wave+1} · ${this.impacts}/8`;}}
 }
 private release(input?:InputController){
  if(this.route){this.camera.yaw=Math.atan2(this.route.direction.x,this.route.direction.z);this.camera.pitch=0;}
  if(this.token!==null)this.city.architecture?.releaseBarrage(this.token);this.token=null;this.route=null;this.missiles.endBarrage();this.player.strikeHeading=null;this.player.boostActive=false;this.player.armor.combatReady=false;input?.reset();
 }
 interrupt(message='BREACH · INTERRUPTED'){
  const active=this.ownsInput;this.epoch++;this.pending=false;
  if(active&&!this.player.ragdoll.active){this.player.velocity.set(0,0,0);if(this.player.isFlying)this.player.state=FlightState.Hover;}
  this.release();if(active){this.enter('ABORTED');this.say(message);}
 }
 reset(){this.interrupt('');this.cooldown=this.age=this.entries=this.exits=this.completed=this.messageAge=0;this.events.length=this.motion.length=0;this.clock=0;this.state='IDLE';this.director.reset();this.animation.reset();}
 diagnostics(){return {state:this.state,entries:this.entries,exits:this.exits,completed:this.completed,cooldown:this.cooldown,preparing:this.pending,ownsInput:this.ownsInput,building:this.route?.buildingId??null,wave:this.wave,impacts:this.impacts,playerDisplacement:this.player.position.distanceTo(this.anchor),age:this.age,events:this.events.slice(-48),cameraCorrections:this.director.collisionCorrections,reducedCameraMotion:this.director.reduced,message:this.text};}
 dispose(){this.reset();this.animation.dispose();this.disposed=true;this.missiles.onBarrageImpact=undefined;this.element.remove();this.marker.remove();}
}
