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
import { Missiles, MISSILE_DAMAGE } from './Missiles';
import { Targeting } from './Targeting';
import { Melee } from './Melee';
import { Place } from '../audio/AudioSystem';
import { HandWeapons } from './HandWeapons';

export type MissionStage='course'|'ground'|'air'|'boss_intro'|'boss'|'finisher'|'complete';
export class Encounter {
  readonly group=new Group();
  readonly enemies:Enemy[]=[];
  readonly drones:Drone[]=[];
  readonly projectiles:Projectiles;
  readonly missiles:Missiles;
  readonly hands:HandWeapons;
  readonly targeting:Targeting;
  /** The player's view this frame: where the camera is, where the reticle points, half the vertical field of view. */
  private readonly eye=new Vector3();
  private readonly gaze=new Vector3(0,0,-1);
  private readonly earRight=new Vector3(1,0,0);
  private halfFov=.5;
  /** The point the weapons converge on this step. */
  readonly aimPoint=new Vector3();
  /** The boss as a missile and beam target; one object for its whole life so it can be tracked. */
  private bossTarget:Shootable|null=null;
  private time=0;
  stage:MissionStage='course';
  boss:Boss|null=null;
  target:Enemy|Drone|Boss|null=null;
  locked=false;
  courseIndex=0;
  throws=0;
  elapsed=0;
  cinematicTime=0;
  lastCue='';
  readonly melee:Melee;
  /** A strike landed: for the camera. */
  onStrike?:(heavy:boolean)=>void;
  private held:Enemy|null=null;
  private holdBody:RAPIER.RigidBody|null=null;
  private holdJoint:RAPIER.ImpulseJoint|null=null;
  private slam=false;
  private slamFrom=0;
  private lastCrash=0;
  constructor(readonly physics:PhysicsWorld,readonly player:PlayerController,readonly destruction:Destruction,readonly vfx:ImpactVfx,readonly audio:AudioSystem) {
    this.projectiles=new Projectiles(physics,vfx);this.group.add(this.projectiles.group);
    this.projectiles.onImpact=(p,strength)=>{destruction.blast(p,strength>30?3:1.5,strength);audio.cue('impact',.4);};
    this.missiles=new Missiles(physics,vfx,player.armor);this.group.add(this.missiles.group);
    this.missiles.onImpact=(p,strength,struck,mode,normal)=>{destruction.blast(p,3,strength,normal?.clone().negate(),{kind:'missile',mode});audio.cue('missileHit',1.2,this.place(p));this.onBlast?.(p,struck);};
    this.missiles.onEvent=(event,p)=>{
      if(event==='ignite'){audio.cue('missileIgnite',1.1,this.place(p));this.player.armor.jolt(.035);this.onLaunch?.();}
      else audio.cue(({unlock:'podUnlock',deploy:'podServo',ready:'podLatch',retract:'podServo',closed:'podLatch'} as const)[event],event==='closed'?.7:1);
    };
    this.melee=new Melee(player);
    this.melee.onSwing=move=>{audio.cue('whoosh',move==='jab'?.6:1);if(move==='dash'||move==='air'||move==='airHeavy')audio.cue('boost',.7);};
    this.melee.onHit=(point,move)=>{const heavy=move!=='jab'&&move!=='cross';audio.cue(heavy?'punchHeavy':'punch',1,this.place(point));
      vfx.burst(point.clone(),heavy?1.3:.5,this.player.forward,false);this.onStrike?.(heavy);};
    // a heavy strike that reaches the scenery breaks it, as before
    this.melee.onReach=(_fist,direction,heavy)=>{
      const origin=this.player.position.clone().add(new Vector3(0,1,0)),range=heavy?3.9:3;
      const wall=physics.world.castRayAndGetNormal(new RAPIER.Ray(origin,direction),range,true,RAPIER.QueryFilterFlags.ONLY_FIXED);
      if(wall){const p=origin.addScaledVector(direction,wall.timeOfImpact);destruction.hit(wall.collider,heavy?90:25,p,direction);vfx.burst(p,heavy?1.5:.4,new Vector3().copy(wall.normal));audio.cue('impact',heavy?1.5:.7);}
    };
    this.targeting=new Targeting(physics);this.targeting.assigned=target=>this.missiles.assignedTo(target);
    this.hands=new HandWeapons(physics,vfx,player.armor,this.projectiles);this.group.add(this.hands.group);
    this.hands.onShot=()=>audio.cue('repulsor');this.hands.onCharge=()=>audio.cue('repulsorCharge',.8);this.hands.onBurn=p=>audio.cue('energyHit',.5,this.place(p));
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
  /** Missile launch and blast, for the camera. */
  onLaunch?:()=>void;
  onBlast?:(position:Vector3,struck:boolean)=>void;
  /** Tell the encounter where the player is looking from; call once per frame before the simulation steps. */
  setView(eye:Vector3,gaze:Vector3,right:Vector3,fovDegrees:number):void {this.eye.copy(eye);this.gaze.copy(gaze).normalize();this.earRight.copy(right);this.halfFov=fovDegrees*Math.PI/360;}
  /** Where a world position is for the ears. */
  place(position:Vector3):Place {const to=position.clone().sub(this.eye),distance=to.length();return {distance,pan:distance>.5?to.dot(this.earRight)/distance:0};}
  private entity(target:Shootable|null):Enemy|Drone|Boss|null {return !target?null:target===this.bossTarget?this.boss:target as Enemy|Drone;}
  update(dt:number,input:InputController,reference:MovementReference):void {
    this.elapsed+=dt;this.time+=dt;
    if(this.stage==='course') {
      if(this.courseIndex<4&&this.player.position.distanceTo(COURSE[this.courseIndex])<4.8){this.courseIndex++;this.audio.cue('lock');}
      if(this.courseIndex>=4&&this.player.position.distanceTo(COURT)<22&&this.player.position.y<3){this.stage='ground';this.spawnGround();}
    }
    if(this.stage==='ground'&&this.enemies.length&&this.enemies.every(e=>e.health<=0)&&this.throws>0&&this.destruction.broken>0){this.stage='air';this.player.health=Math.max(75,this.player.health);this.spawnAir();}
    if(this.stage==='air'&&this.drones.length>0&&this.drones.every(d=>d.health<=0)){this.stage='boss_intro';this.cinematicTime=0;this.boss=new Boss(this.physics,this.destruction,this.vfx,this.projectiles);{const boss=this.boss;this.bossTarget={get position(){return boss.position.clone().add(new Vector3(0,2.5,0));},get health(){return boss.health;},hit:(d,v)=>boss.hit(d,v)};}this.group.add(this.boss.object,this.boss.telegraph);this.player.health=Math.max(80,this.player.health);this.projectiles.reset();this.release(false);}
    if(this.stage==='boss_intro'){this.cinematicTime+=dt;if(this.cinematicTime>4.4){this.stage='boss';this.targeting.lock(this.bossTarget);}}
    if(this.stage==='finisher') {
      this.cinematicTime+=dt;
      if(this.cinematicTime<1.4){const goal=this.boss!.position.clone().add(new Vector3(0,2,3));this.player.body.teleport(this.player.position.clone().lerp(goal,1-Math.exp(-dt*3)));}
      if(this.cinematicTime>1.4&&this.boss!.health>0){this.player.suit.playAction('finisher');this.boss!.finish();this.vfx.burst(this.boss!.core,6);this.destruction.blast(this.boss!.position,12,180);this.audio.cue('impact',2);}
      if(this.cinematicTime>2&&this.cinematicTime<3.5)this.vfx.burst(this.boss!.core.clone().add(new Vector3(Math.sin(this.elapsed*15)*2,0,Math.cos(this.elapsed*15)*2)),.4,new Vector3(0,1,0),false);
      if(this.cinematicTime>6){this.stage='complete';this.player.body.setEnabled(true);this.player.body.teleport(this.boss!.position.clone().add(new Vector3(0,2,7)));}
    }
    const controllable=!['boss_intro','finisher','complete'].includes(this.stage);
    const targets:Shootable[]=[...this.enemies,...this.drones];if(this.boss&&this.bossTarget)targets.push(this.bossTarget);
    // What the reticle is on: the first solid thing along the view beyond the hero, else a point far out.
    const head=this.player.position.clone().add(new Vector3(0,1.6,0)),clearOfHero=head.distanceTo(this.eye)+1.5;
    const sight=this.physics.world.castRay(new RAPIER.Ray(this.eye,this.gaze),400,true,RAPIER.QueryFilterFlags.ONLY_FIXED);
    this.aimPoint.copy(this.eye).addScaledVector(this.gaze,sight&&sight.timeOfImpact>clearOfHero?sight.timeOfImpact:Math.max(clearOfHero+2,300));
    const hadLock=this.targeting.hard;
    this.targeting.update(dt,this.eye,this.gaze,this.halfFov,head,targets);
    if(hadLock&&!this.targeting.hard&&hadLock.health>0)this.audio.cue('lockLost');
    // the HUD marker and the camera follow the hard lock, else the soft pick while soft guidance is on
    const marked=this.targeting.hard??(this.missiles.mode==='SOFT'?this.targeting.soft:null);
    this.locked=!!this.targeting.hard;this.target=this.entity(marked);
    this.player.armor.lookAt(this.player.suited&&marked&&!this.player.falling?marked.position.clone().add(new Vector3(0,1.2,0)):null);
    let fireRepulsor=false,fireLaser=false;const aim=new Vector3().copy(this.aimPoint),drain=(energy:number):boolean=>{if(this.player.energy<energy)return false;this.player.energy-=energy;return true;};
    if(controllable&&!this.player.ragdoll.active&&this.player.health>0) {
      if(input.consumeTap('Tab')){this.audio.cue(this.targeting.cycle()?'lock':'lockLost');}
      if(this.player.suited){ // strikes, grabs and the pulse cannon are armour systems
      // presses are buffered by the combat system, so they can be made a little early
      if(input.consumeTap('Mouse0')||input.consumeTap('KeyJ'))this.melee.press('light');
      if(input.consumeTap('KeyR')||input.consumeTap('KeyK'))this.melee.press('heavy');
      if(input.consumeTap('KeyG')){if(this.held)this.release(true,reference.forward);else this.grab();}
      const keys=this.player.controls,hard=this.targeting.hard,soft=this.targeting.soft;
      if(input.anyTap(keys.guidance)){this.lastCue=`Missile guidance: ${{SOFT:'soft lock',HARD:'hard lock (Tab selects)',OFF:'off, fires where you aim'}[this.missiles.cycleMode()]}.`;this.audio.cue('lock');}
      if(input.anyTap(keys.missiles)){
        // soft lock spreads a pair over the targets near the reticle; a hard lock commits both to one
        const count=this.missiles.demolition?3:2,picks=this.missiles.mode==='OFF'?Array(count).fill(null):this.missiles.mode==='HARD'?Array(count).fill(hard):this.targeting.distribute(count,MISSILE_DAMAGE);
        if(this.missiles.fire(picks,this.aimPoint)){if(picks[0])this.audio.cue('lock',.8);}
        else if(this.missiles.ammo===0)this.lastCue='Launchers reloading.';
      }
      // hand weapons converge on the aim point; with the reticle nearly on a soft-lock target they take it
      const assist=!hard&&soft&&(this.targeting.contact(soft)?.offset??1)<.14?soft:null,held=hard??assist;
      aim.copy(held?held.position.clone().add(new Vector3(0,1,0)):this.aimPoint);
      // the repulsors also swat incoming missiles out of the air when one is close
      fireRepulsor=input.anyHeld(keys.repulsor);fireLaser=input.anyHeld(keys.laser);
      const incoming=fireRepulsor?this.projectiles.nearestMissile(head):null;if(incoming&&!hard)aim.copy(incoming);
      // ground slam: cut the thrusters and drive downward; the landing itself does the damage
      if(input.consumeTap('KeyC')&&this.player.powered){this.slam=true;this.slamFrom=this.player.landings;this.player.dropOut(30);}
      if(input.consumeTap('KeyV')&&this.boss?.state==='exposed'&&this.player.position.distanceTo(this.boss.position)<18){this.stage='finisher';this.cinematicTime=0;this.player.velocity.set(0,0,0);this.player.body.setEnabled(false);}
      }
    }
    if(this.slam){
      if(this.player.landings>this.slamFrom){this.slam=false;this.vfx.burst(this.player.position,4);this.destruction.blast(this.player.position,7,140);this.enemies.filter(e=>e.position.distanceTo(this.player.position)<7).forEach(e=>e.hit(45,e.position.clone().sub(this.player.position).normalize(),true));}
      else if(!this.player.falling)this.slam=false;   // caught himself, or crashed
    }
    this.melee.update(dt,{enemies:this.enemies,boss:this.boss,held:this.held,sprint:input.isHeld('ShiftLeft')||input.isHeld('ShiftRight')});
    // with an enemy close he stands ready instead of at ease
    this.player.armor.combatReady=this.player.suited&&(this.missiles.barrageActive||!!this.nearest(11));
    if(this.held&&this.holdBody){this.holdBody.setNextKinematicTranslation(this.player.position.clone().addScaledVector(this.player.forward,1.7).add(new Vector3(0,1.7,0)));if(this.player.ragdoll.active)this.release(false);}
    if(this.player.crashCount>this.lastCrash){this.lastCrash=this.player.crashCount;this.lastCue='Stability lost. Allow the armor to recover.';this.release(false);}
    this.enemies.forEach(e=>e.update(dt,this.player));this.drones.forEach(d=>d.update(dt,this.player,(p,direction)=>{this.projectiles.spawn(p,direction,true);this.audio.cue('alarm',.6);}));
    this.boss?.update(dt,this.player);
    const armed=this.player.suited&&!this.player.changingForm&&!this.player.ragdoll.active&&this.player.health>0;
    this.hands.update(dt,armed&&fireRepulsor,armed&&fireLaser,aim,this.player.forward,targets,drain,(collider,point,direction,normal)=>this.destruction.hit(collider,26*dt*60,point,direction,{kind:'laser',normal:normal?[normal.x,normal.y,normal.z]:undefined}));
    if(this.missiles.barrageActive){this.player.armor.aimArm('L',this.missiles.barrageAim);this.player.armor.aimArm('R',this.missiles.barrageAim);}
    this.missiles.update(dt,targets,this.player.velocity,this.aimPoint,drain);
    this.projectiles.update(dt,this.player,targets);
  }
  /** Closest living enemy on foot within `range` metres. */
  private nearest(range:number):Enemy|null {let best:Enemy|null=null,bestDistance=range;for(const enemy of this.enemies){if(enemy.health<=0||enemy===this.held)continue;const d=enemy.position.distanceTo(this.player.position);if(d<bestDistance){bestDistance=d;best=enemy;}}return best;}
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
  animate(dt:number):void {
    this.enemies.forEach(e=>e.animate(dt));
    this.missiles.present(this.player.suited&&!this.player.changingForm,dt);this.hands.present(this.time);
    this.audio.laser(this.hands.firingLaser,1);
  }
  /** One line for the HUD: launcher load and guidance. */
  get weaponStatus():string {return this.player.suited&&this.missiles.available?`MSL ${this.missiles.ammo} · ${this.missiles.mode}`:'';}
  /** Label for the target marker: what kind of lock, and how far. */
  get targetLabel():string {
    const marked=this.targeting.hard??this.targeting.soft,contact=this.targeting.contact(marked);if(!contact)return '';
    return `${this.target instanceof Boss?'TITAN–09 · ':''}${this.targeting.hard?'LOCK':'SOFT'} ${Math.round(contact.distance)} M`;
  }
  get cinematic():boolean{return this.stage==='boss_intro'||this.stage==='finisher';}
  get objective():{title:string;hint:string;progress:string;point:Vector3|null} {
    if(this.stage==='course')return {title:this.courseIndex<4?'Fly the calibration corridor':'Land in the quarantine court',hint:this.courseIndex<4?'E to take off. Space climbs. Q brakes. Pass through each gate.':'E to land. Ground contacts detected at the checkpoint.',progress:`${Math.min(4,this.courseIndex)} / 4 FLIGHT GATES`,point:this.courseIndex<4?COURSE[this.courseIndex]:COURT};
    if(this.stage==='ground')return {title:this.held?'Throw the enforcer':'Breach the checkpoint',hint:this.held?'Aim toward the concrete wall. G releases with momentum.':'J punches · R heavy · G grabs and throws · B guards · X dodges. Defeated bodies can also be thrown.',progress:`${this.enemies.filter(e=>e.health<=0).length}/3 ENFORCERS · ${this.throws?'✓':'○'} THROW · ${this.destruction.broken?'✓':'○'} BREACH`,point:new Vector3(0,2,-81)};
    if(this.stage==='air')return {title:'Clear the airspace',hint:'E takes off. F fires shoulder missiles, hold Z for repulsors (they also swat incoming missiles), L for the beam. Tab locks, N changes guidance.',progress:`${this.drones.filter(d=>d.health<=0).length}/2 INTERCEPTORS`,point:this.drones.find(d=>d.health>0)?.position??null};
    if(this.boss?.state==='exposed')return {title:'Finish TITAN–09',hint:'Core exposed. Approach within 18 m and press V.',progress:'FINAL STRIKE AUTHORIZED',point:this.boss.core};
    return {title:'Bring down TITAN–09',hint:'Move out of marked impact zones. Attack while the core vents after each volley. Tab locks the core; F launches missiles, Z and L fire the hand weapons.',progress:this.boss?.phase===2?'PHASE 02 / AERIAL SIEGE':'PHASE 01 / ARMORED ADVANCE',point:null};
  }
  reset():void {this.release(false);this.enemies.forEach(e=>e.dispose());this.enemies.length=0;this.drones.forEach(d=>d.dispose());this.drones.length=0;this.boss?.dispose();this.boss=null;this.projectiles.reset();this.missiles.reset();this.hands.reset();this.targeting.reset();this.bossTarget=null;this.target=null;this.locked=false;this.stage='course';this.courseIndex=this.throws=this.elapsed=this.cinematicTime=this.lastCrash=0;this.melee.reset();this.slam=false;this.lastCue='';}
}
