import { Group, Vector3 } from 'three';
import { InputController } from '../input/InputController';
import { PhysicsWorld, RAPIER } from '../physics/PhysicsWorld';
import { Destruction } from '../physics/Destruction';
import { PlayerController, MovementReference } from '../player/PlayerController';
import { ImpactVfx } from '../vfx/ImpactVfx';
import { COURSE, COURT } from '../world/City';
import { AudioSystem } from '../audio/AudioSystem';
import { Enemy } from './Enemy';
import { Drone } from './Drone';
import { Projectiles, Shootable } from './Projectiles';
import { Boss } from './Boss';

export type MissionStage='course'|'ground'|'air'|'boss_intro'|'boss'|'finisher'|'complete';
export class Encounter {
  readonly group=new Group();
  readonly enemies:Enemy[]=[];
  readonly drones:Drone[]=[];
  readonly projectiles:Projectiles;
  stage:MissionStage='course';
  boss:Boss|null=null;
  target:Enemy|Drone|Boss|null=null;
  locked=false;
  courseIndex=0;
  throws=0;
  elapsed=0;
  cinematicTime=0;
  lastCue='';
  private attack:{time:number;heavy:boolean;hit:boolean}|null=null;
  private shotCooldown=0;
  private held:Enemy|null=null;
  private holdBody:RAPIER.RigidBody|null=null;
  private holdJoint:RAPIER.ImpulseJoint|null=null;
  private slam=false;
  private lastCrash=0;
  constructor(readonly physics:PhysicsWorld,readonly player:PlayerController,readonly destruction:Destruction,readonly vfx:ImpactVfx,readonly audio:AudioSystem) {
    this.projectiles=new Projectiles(physics,vfx);this.group.add(this.projectiles.group);
    this.projectiles.onImpact=(p,strength)=>{destruction.blast(p,strength>30?3:1.5,strength);audio.cue('impact',.4);};
  }
  begin(range=false):void {
    this.reset();if(range){this.player.body.teleport(COURT.clone().add(new Vector3(0,0,9)));this.spawnGround();this.stage='ground';this.courseIndex=4;}
  }
  private spawnGround():void {
    for(let i=0;i<3;i++){const enemy=new Enemy(i,new Vector3(-5+i*5,.05,-66-(i%2)*5),this.physics);this.enemies.push(enemy);this.group.add(enemy.object,enemy.telegraph);}
  }
  private spawnAir():void {
    for(let i=0;i<2;i++){const drone=new Drone(i,new Vector3(i===0?-9:10,15+i*5,-58-i*15),this.physics);this.drones.push(drone);this.group.add(drone.object);}
    this.lastCue='Interceptors inbound. Take to the air.';this.audio.cue('alarm');
  }
  update(dt:number,input:InputController,reference:MovementReference):void {
    this.elapsed+=dt;this.shotCooldown=Math.max(0,this.shotCooldown-dt);
    if(this.stage==='course') {
      if(this.courseIndex<4&&this.player.position.distanceTo(COURSE[this.courseIndex])<4.8){this.courseIndex++;this.audio.cue('lock');}
      if(this.courseIndex>=4&&this.player.position.distanceTo(COURT)<22&&this.player.position.y<3){this.stage='ground';this.spawnGround();}
    }
    if(this.stage==='ground'&&this.enemies.length&&this.enemies.every(e=>e.health<=0)&&this.throws>0&&this.destruction.broken>0){this.stage='air';this.player.health=Math.max(75,this.player.health);this.spawnAir();}
    if(this.stage==='air'&&this.drones.length>0&&this.drones.every(d=>d.health<=0)){this.stage='boss_intro';this.cinematicTime=0;this.boss=new Boss(this.physics,this.destruction,this.vfx,this.projectiles);this.group.add(this.boss.object,this.boss.telegraph);this.player.health=Math.max(80,this.player.health);this.projectiles.reset();this.release(false);}
    if(this.stage==='boss_intro'){this.cinematicTime+=dt;if(this.cinematicTime>4.4){this.stage='boss';this.locked=true;this.target=this.boss;}}
    if(this.stage==='finisher') {
      this.cinematicTime+=dt;
      if(this.cinematicTime<1.4){const goal=this.boss!.position.clone().add(new Vector3(0,2,3));this.player.body.teleport(this.player.position.clone().lerp(goal,1-Math.exp(-dt*3)));}
      if(this.cinematicTime>1.4&&this.boss!.health>0){this.player.suit.playAction('finisher');this.boss!.finish();this.vfx.burst(this.boss!.core,6);this.destruction.blast(this.boss!.position,12,180);this.audio.cue('impact',2);}
      if(this.cinematicTime>2&&this.cinematicTime<3.5)this.vfx.burst(this.boss!.core.clone().add(new Vector3(Math.sin(this.elapsed*15)*2,0,Math.cos(this.elapsed*15)*2)),.4,new Vector3(0,1,0),false);
      if(this.cinematicTime>6){this.stage='complete';this.player.body.setEnabled(true);this.player.body.teleport(this.boss!.position.clone().add(new Vector3(0,2,7)));}
    }
    const controllable=!['boss_intro','finisher','complete'].includes(this.stage);
    if(controllable&&!this.player.ragdoll.active&&this.player.health>0) {
      const candidates=[...this.enemies,...this.drones,...(this.boss?[this.boss]:[])].filter(e=>e.health>0);
      if(input.consumeTap('Tab')){const ordered=candidates.sort((a,b)=>a.position.distanceToSquared(this.player.position)-b.position.distanceToSquared(this.player.position));const index=ordered.indexOf(this.target!);this.target=ordered[(index+1)%ordered.length]??null;this.locked=!!this.target;this.audio.cue('lock');}
      if(this.target&&this.target.health<=0){this.target=null;this.locked=false;}
      if(!this.locked)this.target=candidates.filter(e=>e.position.distanceTo(this.player.position)<18).sort((a,b)=>a.position.distanceToSquared(this.player.position)-b.position.distanceToSquared(this.player.position))[0]??null;
      if((input.consumeTap('Mouse0')||input.consumeTap('KeyJ'))&&!this.attack&&this.player.attackTime===0)this.beginAttack(false);
      if((input.consumeTap('KeyR')||input.consumeTap('KeyK'))&&!this.attack&&this.player.energy>=10&&this.player.attackTime===0)this.beginAttack(true);
      if(input.consumeTap('KeyG')){if(this.held)this.release(true,reference.forward);else this.grab();}
      if(input.isHeld('KeyF')&&this.shotCooldown===0&&this.player.energy>=6) {
        const origin=this.player.position.clone().add(new Vector3(0,1.5,0)).addScaledVector(this.player.forward,.6);
        const missile=this.projectiles.nearestMissile(origin);
        const aim=missile??(this.locked&&this.target?(this.target instanceof Boss?this.target.core:this.target.position.clone().add(new Vector3(0,1,0))):null);
        const direction=aim?aim.clone().sub(origin):reference.forward.clone();
        this.projectiles.spawn(origin,direction,false);this.player.energy-=6;this.shotCooldown=.32;this.audio.cue('shot');
      }
      if(input.consumeTap('KeyC')&&this.player.isFlying){this.slam=true;this.player.velocity.set(0,-35,0);}
      if(input.consumeTap('KeyV')&&this.boss?.state==='exposed'&&this.player.position.distanceTo(this.boss.position)<18){this.stage='finisher';this.cinematicTime=0;this.player.velocity.set(0,0,0);this.player.body.setEnabled(false);}
    }
    if(this.slam){this.player.velocity.y=-35;if(this.player.position.y<1.5){this.slam=false;this.vfx.burst(this.player.position,4);this.destruction.blast(this.player.position,7,140);this.enemies.filter(e=>e.position.distanceTo(this.player.position)<7).forEach(e=>e.hit(45,e.position.clone().sub(this.player.position).normalize(),true));}}
    if(this.attack){this.attack.time+=dt;const moment=this.attack.heavy?.46:.18;if(!this.attack.hit&&this.attack.time>=moment){this.attack.hit=true;this.strike(this.attack.heavy);}if(this.attack.time>(this.attack.heavy?.9:.46))this.attack=null;}
    if(this.held&&this.holdBody){this.holdBody.setNextKinematicTranslation(this.player.position.clone().addScaledVector(this.player.forward,1.7).add(new Vector3(0,1.7,0)));if(this.player.ragdoll.active)this.release(false);}
    if(this.player.crashCount>this.lastCrash){this.lastCrash=this.player.crashCount;this.lastCue='Stability lost. Allow the armor to recover.';this.release(false);}
    this.enemies.forEach(e=>e.update(dt,this.player));this.drones.forEach(d=>d.update(dt,this.player,(p,direction)=>{this.projectiles.spawn(p,direction,true);this.audio.cue('alarm',.6);}));
    this.boss?.update(dt,this.player);
    const targets:Shootable[]=[...this.enemies,...this.drones];if(this.boss)targets.push({position:this.boss.position.clone().add(new Vector3(0,2.5,0)),health:this.boss.health,hit:(d,v)=>this.boss!.hit(d,v)});
    this.projectiles.update(dt,this.player,targets);
  }
  private beginAttack(heavy:boolean):void {if(this.held)return;this.attack={time:0,heavy,hit:false};this.player.attackTime=heavy?.9:.46;this.player.suit.playAction(heavy?'heavy':'punch');if(heavy)this.player.energy-=10;
    if(this.target&&this.target.position.distanceTo(this.player.position)<5){const to=this.target.position.clone().sub(this.player.position);this.player.object.rotation.y=Math.atan2(to.x,to.z);}}
  private strike(heavy:boolean):void {
    const origin=this.player.position.clone().add(new Vector3(0,1,0)),direction=this.player.forward,range=heavy?3.9:3;
    let hit=false;
    for(const enemy of this.enemies) {
      if(enemy===this.held||enemy.health<=0)continue;const to=enemy.position.clone().add(new Vector3(0,1,0)).sub(origin);
      if(to.length()<range&&to.clone().normalize().dot(direction)>.2){
        const wall=this.physics.world.castRay(new RAPIER.Ray(origin,to.clone().normalize()),to.length(),true,RAPIER.QueryFilterFlags.ONLY_FIXED);
        if(wall)continue;enemy.hit(heavy?42:24,direction,heavy,this.player.velocity.clone().multiplyScalar(.25));this.vfx.burst(origin.clone().addScaledVector(direction,1.4),heavy?1.3:.5,direction,false);hit=true;break;
      }
    }
    if(this.boss&&this.boss.position.distanceTo(this.player.position)<6){this.boss.hit(heavy?55:25,direction);hit=true;}
    const wall=this.physics.world.castRayAndGetNormal(new RAPIER.Ray(origin,direction),range,true,RAPIER.QueryFilterFlags.ONLY_FIXED);
    if(wall){const p=origin.addScaledVector(direction,wall.timeOfImpact);this.destruction.hit(wall.collider,heavy?90:25,p,direction);this.vfx.burst(p,heavy?1.5:.4,new Vector3().copy(wall.normal));hit=true;}
    if(hit)this.audio.cue('impact',heavy?1.5:.7);
  }
  private grab():void {
    const enemy=[...this.enemies].filter(e=>e.position.distanceTo(this.player.position)<3.6).sort((a,b)=>a.position.distanceToSquared(this.player.position)-b.position.distanceToSquared(this.player.position))[0];if(!enemy)return;
    this.held=enemy;enemy.held=true;enemy.body.setEnabled(false);if(!enemy.ragdoll.active)enemy.ragdoll.start(new Vector3(),new Vector3());
    const point=this.player.position.clone().addScaledVector(this.player.forward,1.7).add(new Vector3(0,1.7,0));
    this.holdBody=this.physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(point.x,point.y,point.z));
    this.holdJoint=this.physics.world.createImpulseJoint(RAPIER.JointData.spherical({x:0,y:0,z:0},{x:0,y:.25,z:0}),this.holdBody,enemy.ragdoll.segments[1].body,true);
    this.player.suit.playAction('grab');this.lastCue='Target secured. Aim at the checkpoint and press G to throw.';
  }
  private release(throwing:boolean,direction=this.player.forward):void {
    if(this.holdJoint?.isValid())this.physics.world.removeImpulseJoint(this.holdJoint,true);this.holdJoint=null;
    if(this.holdBody)this.physics.removeBody(this.holdBody);this.holdBody=null;
    if(this.held){this.held.held=false;
      if(throwing){const velocity=direction.clone().normalize().multiplyScalar(23).add(this.player.velocity).add(new Vector3(0,4,0));this.held.ragdoll.segments.forEach(s=>s.body.setLinvel(velocity,true));this.held.health=Math.max(0,this.held.health-55);this.held.ragdoll.age=0;this.throws++;this.player.suit.playAction('throw');this.audio.cue('shot');}
      this.held=null;
    }
  }
  sync(dt:number):void {this.enemies.forEach(e=>e.sync(dt));this.drones.forEach(d=>d.sync());}
  animate(dt:number):void {this.enemies.forEach(e=>e.animate(dt));}
  get cinematic():boolean{return this.stage==='boss_intro'||this.stage==='finisher';}
  get objective():{title:string;hint:string;progress:string;point:Vector3|null} {
    if(this.stage==='course')return {title:this.courseIndex<4?'Fly the calibration corridor':'Land in the quarantine court',hint:this.courseIndex<4?'E to take off. Space climbs. Q brakes. Pass through each gate.':'E to land. Ground contacts detected at the checkpoint.',progress:`${Math.min(4,this.courseIndex)} / 4 FLIGHT GATES`,point:this.courseIndex<4?COURSE[this.courseIndex]:COURT};
    if(this.stage==='ground')return {title:this.held?'Throw the enforcer':'Breach the checkpoint',hint:this.held?'Aim toward the concrete wall. G releases with momentum.':'J punches · R heavy · G grabs and throws · B guards · X dodges. Defeated bodies can also be thrown.',progress:`${this.enemies.filter(e=>e.health<=0).length}/3 ENFORCERS · ${this.throws?'✓':'○'} THROW · ${this.destruction.broken?'✓':'○'} BREACH`,point:new Vector3(0,2,-81)};
    if(this.stage==='air')return {title:'Clear the airspace',hint:'E takes off. Tab locks targets. Hold F to fire; F also intercepts nearby missiles. Turn and brake to evade.',progress:`${this.drones.filter(d=>d.health<=0).length}/2 INTERCEPTORS`,point:this.drones.find(d=>d.health>0)?.position??null};
    if(this.boss?.state==='exposed')return {title:'Finish TITAN–09',hint:'Core exposed. Approach within 18 m and press V.',progress:'FINAL STRIKE AUTHORIZED',point:this.boss.core};
    return {title:'Bring down TITAN–09',hint:'Move out of marked impact zones. Attack while the core vents after each volley. Tab locks the core; F fires.',progress:this.boss?.phase===2?'PHASE 02 / AERIAL SIEGE':'PHASE 01 / ARMORED ADVANCE',point:null};
  }
  reset():void {this.release(false);this.enemies.forEach(e=>e.dispose());this.enemies.length=0;this.drones.forEach(d=>d.dispose());this.drones.length=0;this.boss?.dispose();this.boss=null;this.projectiles.reset();this.target=null;this.locked=false;this.stage='course';this.courseIndex=this.throws=this.elapsed=this.cinematicTime=this.shotCooldown=this.lastCrash=0;this.attack=null;this.slam=false;this.lastCue='';}
}
