import {Vector3} from 'three';
import {City} from '../City';import {PlayerController,MovementReference} from '../../player/PlayerController';import {InputController} from '../../input/InputController';import {CameraRig} from '../../camera/CameraRig';import {AudioSystem} from '../../audio/AudioSystem';import {Missiles} from '../../combat/Missiles';import {BreachPlan,planBreach} from './BreachPlan';import {TITAN_CONFIG} from './TitanConfig';
/** Stationary weapon choreography. Movement and the normal player capsule are never commandeered. */
export class TitanBreachBarrage {
 private route:BreachPlan|null=null;private token:number|null=null;private pending=false;private cooldown=0;private age=0;private phaseAge=0;private wave=-1;private impacts=0;private waveStart=0;private epoch=0;private text='';private messageAge=0;private element:HTMLElement;private marker:HTMLElement;private disposed=false;private anchor=new Vector3();
 state:'ready'|'preparing'|'acquiring'|'deploying'|'entrance'|'interior'|'exit'|'verifying'|'aftermath'|'cooldown'='ready';entries=0;exits=0;completed=0;
 readonly events:{time:number;kind:string;wave?:number;position?:number[]}[]=[];private clock=0;
 constructor(private city:City,private player:PlayerController,private camera:CameraRig,private missiles:Missiles,private audio:AudioSystem,status?:HTMLElement){
  this.element=status??document.createElement('div');this.element.setAttribute('role','status');this.element.setAttribute('aria-live','polite');Object.assign(this.element.style,{position:'fixed',right:'28px',bottom:'148px',font:'11px monospace',letterSpacing:'.08em',color:'#d8e4df',background:'#101d26dc',padding:'10px 14px',pointerEvents:'none',display:'none'});if(!status)document.body.append(this.element);
  this.marker=document.createElement('div');Object.assign(this.marker.style,{position:'fixed',width:'96px',height:'72px',border:'1px solid #efba79',boxShadow:'0 0 16px #eda65255',transform:'translate(-50%,-50%)',pointerEvents:'none',display:'none',color:'#efc190',font:'10px monospace',textAlign:'center',paddingTop:'26px',boxSizing:'border-box'});document.body.append(this.marker);
  missiles.onBarrageImpact=(p,n,shot,collider)=>{const hit=this.city.architecture?.barrageImpact(shot.token,shot.wave,p,n,collider);if(!hit)this.city.architecture?.blast(p,3,70,n.clone().negate(),{kind:'missile'});if(shot.token===this.token){this.impacts++;this.events.push({time:this.clock,kind:'impact',wave:shot.wave,position:p.toArray()});this.camera.addShake(.16);this.audio.cue('missileHit',1.2);}};
 }
 private say(text:string){this.text=text;this.messageAge=4;}
 update(dt:number,input:InputController,reference:MovementReference){
  if(this.disposed)return;if(this.events.length>96)this.events.splice(0,this.events.length-96);this.clock+=dt;this.cooldown=Math.max(0,this.cooldown-dt);this.messageAge=Math.max(0,this.messageAge-dt);
  if(input.anyTap(this.player.controls.demolition)){if(!this.player.suited)this.say('DEMOLITION · ARMOR REQUIRED');else{this.missiles.demolition=!this.missiles.demolition;this.say(this.missiles.demolition?'STRUCTURAL DEMOLITION · 3 MISSILES / 14 ENERGY EACH':'STANDARD MISSILES');}}
  if(input.anyTap(this.player.controls.breakthrough)){if(this.route||this.pending)this.cancel('BREACH · CANCELLED');else void this.activate(reference.forward);}
  if(!this.route){this.state=this.pending?'preparing':this.cooldown>0?'cooldown':'ready';return;}
  if(!this.player.suited||this.player.ragdoll.active||this.player.changingForm||this.player.health<=0){this.cancel('BREACH · INTERRUPTED');return;}
  this.age+=dt;this.phaseAge+=dt;if(this.age>TITAN_CONFIG.breakthrough.timeout){this.cancel('BREACH · PATH BLOCKED / ATTACK ENDED');return;}
  if(this.state==='acquiring'&&this.phaseAge>=TITAN_CONFIG.breakthrough.acquire){this.missiles.deployBarrage();this.state='deploying';this.phaseAge=0;this.audio.cue('podServo',1);}
  else if(this.state==='deploying'&&this.phaseAge>=TITAN_CONFIG.breakthrough.deploy)this.startWave(0);
  else if(['entrance','interior','exit'].includes(this.state)&&!this.missiles.barrageBusy&&this.impacts-this.waveStart>=TITAN_CONFIG.breakthrough.waves[this.wave]){if(this.wave<2)this.startWave(this.wave+1);else{this.state='verifying';this.phaseAge=0;}}
  else if(this.state==='verifying'){
   if(this.city.architecture?.finishBarrage(this.token!)){this.completed++;this.entries++;this.exits++;this.state='aftermath';this.phaseAge=0;this.say('BREACH COMPLETE — PATH OPEN');this.events.push({time:this.clock,kind:'verified'});this.missiles.endBarrage();this.audio.cue('lock',1.2);}
   else if(this.phaseAge>2.5)this.cancel('BREACH · ROUTE OBSTRUCTED — RETARGET');
  }else if(this.state==='aftermath'&&this.phaseAge>.6){this.release();this.state='cooldown';}
 }
 private startWave(wave:number){this.wave=wave;this.phaseAge=0;this.waveStart=this.impacts;this.state=(['entrance','interior','exit'] as const)[wave];const token=this.token!;
  this.missiles.barrageWave(Array.from({length:TITAN_CONFIG.breakthrough.waves[wave]},(_,slot)=>({token,wave,target:()=>this.city.architecture?.barrageTarget(token,slot)??this.route!.exit.clone()})));
  this.events.push({time:this.clock,kind:'wave',wave});this.say(['BREACH / 1 — ENTRANCE','BREACH / 2 — INTERIOR','BREACH / 3 — EXIT'][wave]);
 }
 private async activate(direction:Vector3){
  const c=TITAN_CONFIG.breakthrough;if(!this.player.suited||this.player.ragdoll.active||this.player.changingForm){this.say('BREACH · ARMOR REQUIRED');return;}if(this.cooldown>0){this.say(`BREACH · ${Math.ceil(this.cooldown)}s COOLDOWN`);return;}if(this.player.energy<c.energy){this.say('BREACH · 48 ENERGY REQUIRED');return;}if(!this.missiles.barrageAvailable){this.say('BREACH · CLEAR LAUNCHERS BEFORE BREACH');return;}
  const cameraOrigin=this.camera.camera.position.clone().addScaledVector(direction,this.camera.camera.position.distanceTo(this.player.position.clone().add(new Vector3(0,1.6,0)))+1.5);const target=this.city.architecture?.targetBuilding(cameraOrigin,direction,c.range);if(!target){this.say('BREACH · AIM AT AN UNOBSTRUCTED BUILDING');return;}
  const building=this.city.layout.buildings.find(b=>b.id===target.id)!;const height=!this.player.isFlying&&this.player.position.y<2?c.halfHeight+.12:Math.max(c.halfHeight+.12,Math.min(building.h-c.halfHeight-.12,target.point.y));const ground=height<c.halfHeight+.4,origin=this.player.position.clone().setY(height),aim=target.point.clone().sub(origin);aim.y=0;aim.normalize();
  const plan=planBreach([building],origin,aim,c.range,c.maxDepth,c.radius,c.halfHeight);if(!plan||plan.buildingId!==target.id){this.say('BREACH · NO SAFE ENTRANCE-TO-EXIT ROUTE');return;}plan.ground=ground;
  this.pending=true;this.state='preparing';this.say('BREACH · RESERVING CORRIDOR');this.anchor.copy(this.player.position);const epoch=++this.epoch;
  try{const token=await this.city.architecture?.reserveBarrage(plan,this.player.position.clone().add(new Vector3(0,1.7,0)));if(this.disposed||epoch!==this.epoch){if(token)this.city.architecture?.releaseBarrage(token);return;}if(!token||!this.player.suited||this.player.changingForm||this.player.ragdoll.active||this.player.health<=0||this.player.position.distanceTo(plan.entry)>c.range+10||this.player.energy<c.energy||!this.missiles.barrageAvailable){if(token)this.city.architecture?.releaseBarrage(token);this.cancel('BREACH · PASSAGE OR RESOURCES UNAVAILABLE');return;}
   if(!this.missiles.beginBarrage(plan.entry,false)){this.city.architecture?.releaseBarrage(token);this.cancel('BREACH · LAUNCHERS UNAVAILABLE');return;}this.route=plan;this.token=token;this.player.energy-=c.energy;this.cooldown=c.cooldown;this.age=this.phaseAge=this.impacts=0;this.wave=-1;this.state='acquiring';this.player.object.rotation.y=Math.atan2(aim.x,aim.z);this.events.push({time:this.clock,kind:'acquire',position:this.player.position.toArray()});this.say('TITAN BREACH · 8 ROUNDS RESERVED / 48 ENERGY');this.audio.cue('lock');
  }catch{this.cancel('BREACH · PREPARATION UNAVAILABLE');}finally{if(epoch===this.epoch)this.pending=false;}
 }
 present(){const text=this.messageAge>0?this.text:this.route?'TITAN BREACH BARRAGE':this.missiles.demolition?`STRUCTURAL DEMOLITION${this.missiles.demolitionReady?'':` · ${Math.ceil(this.missiles.demolitionRemaining)}s`}`:'';this.element.textContent=text;this.element.style.display=text?'block':'none';this.marker.style.display='none';
  if(this.route&&this.state!=='aftermath'){const p=this.route.entry.clone().project(this.camera.camera);if(p.z<1){this.marker.style.display='block';this.marker.style.left=`${(p.x*.5+.5)*innerWidth}px`;this.marker.style.top=`${(-p.y*.5+.5)*innerHeight}px`;this.marker.textContent=`${this.wave<0?'LOCK':`WAVE ${this.wave+1}`} / ${this.impacts} HITS`;}}
 }
 private release(){if(this.token!==null)this.city.architecture?.releaseBarrage(this.token);this.token=null;this.route=null;this.missiles.endBarrage();}
 private cancel(message:string){this.epoch++;this.pending=false;this.release();this.say(message);}
 reset(){this.cancel('');this.cooldown=this.age=this.entries=this.exits=this.completed=this.messageAge=0;this.events.length=0;this.clock=0;this.state='ready';this.say('Y TITAN BREACH BARRAGE · O STRUCTURAL DEMOLITION');this.present();}
 diagnostics(){return {state:this.state,entries:this.entries,exits:this.exits,completed:this.completed,cooldown:this.cooldown,preparing:this.pending,building:this.route?.buildingId??null,wave:this.wave,impacts:this.impacts,playerDisplacement:this.route?this.player.position.distanceTo(this.anchor):0,events:this.events.slice(-24)};}
 dispose(){this.disposed=true;this.reset();this.missiles.onBarrageImpact=undefined;this.element.remove();this.marker.remove();}
}
