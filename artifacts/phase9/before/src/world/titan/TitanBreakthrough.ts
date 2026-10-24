import {Vector3} from 'three';import {City} from '../City';import {PlayerController,MovementReference} from '../../player/PlayerController';import {InputController} from '../../input/InputController';import {CameraRig} from '../../camera/CameraRig';import {AudioSystem} from '../../audio/AudioSystem';import {Missiles} from '../../combat/Missiles';import {BreachPlan,planBreach} from './BreachPlan';import {TITAN_CONFIG} from './TitanConfig';
/** Intentional ability. The existing capsule, flight controller and camera sweep remain active. */
export class TitanBreakthrough {
 private route:BreachPlan|null=null;private pending=false;private cooldown=0;private age=0;private entered=false;private nextRumble=0;private epoch=0;private text='';private messageAge=0;private element:HTMLElement;private disposed=false;
 state:'ready'|'preparing'|'approach'|'inside'|'cooldown'='ready';entries=0;exits=0;
 constructor(private city:City,private player:PlayerController,private camera:CameraRig,private missiles:Missiles,private audio:AudioSystem,status?:HTMLElement){this.element=status??document.createElement('div');this.element.setAttribute('role','status');this.element.setAttribute('aria-live','polite');Object.assign(this.element.style,{position:'fixed',right:'28px',bottom:'148px',font:'11px monospace',letterSpacing:'.08em',color:'#d8e4df',background:'#101d26cc',padding:'8px 12px',pointerEvents:'none',display:'none'});if(!status)document.body.append(this.element);}
 private say(text:string){this.text=text;this.messageAge=3;}
 update(dt:number,input:InputController,reference:MovementReference){if(this.disposed)return;this.cooldown=Math.max(0,this.cooldown-dt);this.messageAge=Math.max(0,this.messageAge-dt);
  if(input.anyTap(this.player.controls.demolition)){if(!this.player.suited){this.say('DEMOLITION · ARMOR REQUIRED');}else{this.missiles.demolition=!this.missiles.demolition;this.say(this.missiles.demolition?'DEMOLITION 5× · 22 ENERGY / SHOT':'STANDARD MISSILES · 3× BUILDING DAMAGE');}}
  if(this.missiles.demolition&&input.anyHeld(this.player.controls.missiles)){if(this.player.energy<22)this.say('DEMOLITION · INSUFFICIENT ENERGY');else if(!this.missiles.demolitionReady)this.say(`DEMOLITION · ${Math.ceil(this.missiles.demolitionRemaining)}s COOLDOWN`);}
  if(input.anyTap(this.player.controls.breakthrough)){if(this.route||this.pending){this.cancel('TITAN · STRIKE CANCELLED');}else void this.activate(reference.forward);}
  if(!this.route){this.state=this.pending?'preparing':this.cooldown>0?'cooldown':'ready';return;}
  if(!this.player.suited||!this.player.isFlying||this.player.ragdoll.active){this.cancel('TITAN · STRIKE INTERRUPTED');return;}
  this.age+=dt;const center=this.player.position.clone().add(new Vector3(0,this.player.body.height,0)),progress=center.clone().sub(this.route.entry).dot(this.route.direction);
  if(progress>=(this.route.exitTrigger??this.route.length-4)&&!this.route.exitOpen)this.city.architecture?.openBreachExit(this.route);
  if(progress>this.route.length+.8){this.exits++;this.camera.addShake(.3);this.audio.cue('impact',1.4);this.route=null;this.player.strikeHeading=null;this.state='cooldown';this.say('TITAN · BREAKTHROUGH COMPLETE');return;}
  if(this.age>TITAN_CONFIG.breakthrough.timeout){this.cancel('TITAN · STRIKE ENDED');return;}
  if(progress>=-.6&&!this.entered){this.entered=true;this.entries++;this.state='inside';this.city.architecture?.breachImpact(this.route);this.camera.addShake(.38);this.player.armor.jolt(.06);this.audio.cue('landing',1.2);}
  if(this.entered&&progress>=this.nextRumble){this.nextRumble=progress+5;this.audio.cue('impact',.28);this.camera.addShake(.08);}
  this.player.velocity.copy(this.route.direction).multiplyScalar(TITAN_CONFIG.breakthrough.speed);this.player.strikeHeading=Math.atan2(this.route.direction.x,this.route.direction.z);
 }
 private async activate(direction:Vector3){const c=TITAN_CONFIG.breakthrough;if(!this.player.suited||!this.player.isFlying||this.player.ragdoll.active){this.say('TITAN · ARMORED FLIGHT REQUIRED');return;}if(this.cooldown>0){this.say(`TITAN · ${Math.ceil(this.cooldown)}s COOLDOWN`);return;}if(this.player.velocity.length()<c.minSpeed){this.say('TITAN · BUILD FORWARD SPEED');return;}if(this.player.velocity.clone().normalize().dot(direction.clone().normalize())<.65){this.say('TITAN · ALIGN FORWARD FLIGHT');return;}if(this.player.energy<c.energy){this.say('TITAN · INSUFFICIENT ENERGY');return;}
 const plan=planBreach(this.city.layout.buildings,this.player.position.clone().add(new Vector3(0,this.player.body.height,0)),direction,c.range,c.maxDepth,c.radius,c.halfHeight);if(!plan){this.say('TITAN · NO CLEAR BUILDING PASSAGE');return;}
 this.pending=true;this.state='preparing';this.say('TITAN · PREPARING STRIKE');const epoch=++this.epoch;
 const valid=()=>!this.disposed&&epoch===this.epoch&&this.player.suited&&this.player.isFlying&&!this.player.ragdoll.active;
 const aligned=()=>{const center=this.player.position.clone().add(new Vector3(0,this.player.body.height,0)),offset=center.sub(plan.entry),along=offset.dot(plan.direction);return along<=1&&offset.addScaledVector(plan.direction,-along).length()<=plan.radius;};
 try{const prepared=await this.city.architecture?.prepareBreach(plan,{valid,begin:()=>{if(!valid()||!aligned()||this.player.energy<c.energy)return false;this.player.energy-=c.energy;this.cooldown=c.cooldown;return true;}});if(this.disposed||epoch!==this.epoch)return;if(!prepared||!valid()||!aligned()){this.cancel('TITAN · PASSAGE UNAVAILABLE');return;}
 this.route=plan;this.entered=false;this.nextRumble=4;this.age=0;this.state='approach';this.say('TITAN · BREAKTHROUGH');this.audio.cue('boost',1.1);this.camera.kick(2);
 }catch{this.say('TITAN · PASSAGE UNAVAILABLE');}finally{if(epoch===this.epoch)this.pending=false;}}
 present(){const status=this.messageAge>0?this.text:this.route?'TITAN · BREAKTHROUGH':this.missiles.demolition?`DEMOLITION 5×${this.missiles.demolitionReady?'':` · ${Math.ceil(this.missiles.demolitionRemaining)}s`}`:'';if(this.element.textContent!==status)this.element.textContent=status;this.element.style.display=status?'block':'none';}
 private cancel(message:string){if(this.route&&this.entered)this.city.architecture?.openBreachExit(this.route);this.epoch++;this.pending=false;this.route=null;this.player.strikeHeading=null;this.say(message);}
 reset(){this.cancel('');this.cooldown=this.age=this.entries=this.exits=this.messageAge=0;this.state='ready';const key=(codes:string[])=>codes.map(c=>c.replace('Key','')).join('/');this.say(`${key(this.player.controls.breakthrough)||'UNBOUND'} TITAN · ${key(this.player.controls.demolition)||'UNBOUND'} DEMOLITION`);this.present();}
 diagnostics(){return {state:this.state,entries:this.entries,exits:this.exits,cooldown:this.cooldown,preparing:this.pending,building:this.route?.buildingId??null};}
 dispose(){this.disposed=true;this.reset();this.element.remove();}
}
