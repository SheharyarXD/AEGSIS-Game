import { AnimationAction, AnimationMixer, Box3, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, RingGeometry, Vector3, SkinnedMesh } from 'three';
import { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { PhysicsWorld, RAPIER } from '../physics/PhysicsWorld';
import { PlayerController } from '../player/PlayerController';
import { Destruction } from '../physics/Destruction';
import { ImpactVfx } from '../vfx/ImpactVfx';
import { Projectiles } from './Projectiles';

export class Boss {
  private static source:GLTF;
  static async loadAssets():Promise<void> {try{this.source=await new GLTFLoader().loadAsync('/assets/titan-sentinel.glb');}catch(error){throw new Error(`TITAN asset failed to load. Check local assets/titan-sentinel.glb. ${String(error)}`);}}
  readonly object=new Group();
  readonly model:Group;
  readonly mixer:AnimationMixer;
  readonly body:RAPIER.RigidBody;
  readonly telegraph:Mesh;
  health=340;
  maxHealth=340;
  phase=1;
  weakTime=0;
  state='entrance';
  timer=0;
  attacks=0;
  private readonly mark=new Vector3();
  private readonly actions:AnimationAction[]=[];
  private current:AnimationAction|null=null;
  private time=0;
  private attackCooldown=2;
  constructor(readonly physics:PhysicsWorld,private readonly destruction:Destruction,private readonly vfx:ImpactVfx,private readonly projectiles:Projectiles) {
    this.model=clone(Boss.source.scene) as Group;this.object.add(this.model);
    const bounds=new Box3().setFromObject(this.model),scale=6.5/bounds.getSize(new Vector3()).y;
    this.model.scale.setScalar(scale);this.model.position.y=-bounds.min.y*scale;
    this.model.traverse(o=>{if(o instanceof Mesh){o.castShadow=o.receiveShadow=true;o.frustumCulled=false;
      const adapt=(m:MeshStandardMaterial)=>{const n=m.clone();n.envMapIntensity=.9;return n;};o.material=Array.isArray(o.material)?o.material.map(m=>adapt(m as MeshStandardMaterial)):adapt(o.material as MeshStandardMaterial);}});
    this.mixer=new AnimationMixer(this.model);this.actions=Boss.source.animations.map(clip=>this.mixer.clipAction(clip));this.play('idle');
    this.object.position.set(0,38,-92);
    this.body=physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0,41,-92));
    const collider=physics.world.createCollider(RAPIER.ColliderDesc.capsule(1.8,1.3).setMass(2200),this.body);physics.surfaces.set(collider.handle,{kind:'actor'});
    this.telegraph=new Mesh(new RingGeometry(.85,1,64),new MeshBasicMaterial({color:'#df8a58',transparent:true,opacity:.65,depthWrite:false}));this.telegraph.rotation.x=-Math.PI/2;this.telegraph.visible=false;
  }
  get position():Vector3{return this.object.position;}
  get core():Vector3{return this.position.clone().add(new Vector3(0,3.5,0));}
  private play(pattern:string):void {const action=this.actions.find(a=>a.getClip().name.toLowerCase().includes(pattern))??this.actions[0];if(!action||action===this.current)return;action.reset().play();this.current?.crossFadeTo(action,.3,false);this.current=action;}
  update(dt:number,player:PlayerController):void {
    this.time+=dt;this.timer+=dt;this.weakTime=Math.max(0,this.weakTime-dt);this.mixer.update(dt);
    if(this.state==='defeated'){this.object.rotation.z=Math.min(.5,this.object.rotation.z+dt*.14);this.position.y=Math.max(-1.5,this.position.y-dt*.5);return;}
    if(this.state==='entrance') {
      const t=Math.min(1,this.timer/4);this.position.set(0,38*(1-t)*(1-t),-92+18*t);
      if(t===1){this.state='pursue';this.timer=0;this.impact(this.position.clone(),8,player);}
    }else if(this.state==='exposed') {
      this.position.y=Math.max(.05,this.position.y-dt*6);this.weakTime=20;this.telegraph.visible=false;this.play('idle');
    }else if(this.health<=35){this.state='exposed';this.timer=0;}
    else if(this.state==='transition') {
      this.play('charge');this.position.y=Math.min(13,this.position.y+dt*5);this.weakTime=.2;
      if(this.timer>2.8){this.state='pursue';this.attackCooldown=1;this.timer=0;}
    }else if(this.state==='windup') {
      const duration=this.phase===1?1.4:1.15;
      this.telegraph.visible=true;this.telegraph.position.copy(this.mark).setY(.07);this.telegraph.scale.setScalar(7.5*(.55+.45*Math.min(1,this.timer/duration)));
      if(this.timer>duration){this.impact(this.mark,7.5,player);this.state='recover';this.timer=0;this.weakTime=3.4;this.telegraph.visible=false;this.attacks++;}
    }else if(this.state==='salvo') {
      const count=this.phase===1?3:5;
      const next=Math.floor(this.timer/.55);
      if(next>this.attacks&&this.attacks<count){this.attacks=next;const p=this.core.clone().add(new Vector3(this.attacks%2?1.8:-1.8,0,0));this.projectiles.spawn(p,player.position.clone().add(new Vector3(0,1,0)).sub(p),true);}
      if(this.timer>(count+1)*.55){this.state='recover';this.timer=0;this.weakTime=3.6;}
    }else if(this.state==='recover') {
      this.play('idle');if(this.timer>3.6){this.state='pursue';this.attackCooldown=.8;this.timer=0;}
    }else {
      this.attackCooldown-=dt;this.play(this.phase===1?'walk':'idle');
      const to=player.position.clone().sub(this.position),distance=to.length();
      const desired=this.phase===1?player.position.clone().setY(0):player.position.clone().add(new Vector3(Math.sin(this.time*.32)*17,12,Math.cos(this.time*.32)*17));
      const delta=desired.sub(this.position);if(this.phase===1&&distance<6)delta.set(0,0,0);delta.clampLength(0,(this.phase===1?2.3:7)*dt);
      const hit=this.physics.world.castShape(this.position.clone().add(new Vector3(0,3,0)),this.object.quaternion,delta,new RAPIER.Ball(1.5),.03,1,true,RAPIER.QueryFilterFlags.ONLY_FIXED);
      if(hit)delta.multiplyScalar(Math.max(0,hit.time_of_impact-.05));this.position.add(delta);
      if(this.attackCooldown<=0){this.timer=0;this.attacks=0;if(distance<12||this.phase===2&&Math.sin(this.time)>0){this.state='windup';this.mark.copy(player.position).setY(0);this.play('charge');}else this.state='salvo';}
    }
    if(this.health<170&&this.phase===1&&this.state!=='exposed'){this.phase=2;this.state='transition';this.timer=0;this.telegraph.visible=false;}
    const direction=player.position.clone().sub(this.position);this.object.rotation.y=Math.atan2(direction.x,direction.z);
    this.body.setNextKinematicTranslation(this.position.clone().add(new Vector3(0,3,0)));
  }
  private impact(point:Vector3,radius:number,player:PlayerController):void {
    this.destruction.blast(point,radius,160);this.vfx.burst(point.clone().add(new Vector3(0,.5,0)),5);
    if(player.position.distanceTo(point)<radius&&player.position.y<4)player.damage(25,player.position.clone().sub(point).normalize(),true);
  }
  hit(damage:number,_direction:Vector3):void {if(this.state==='entrance'||this.state==='defeated'||this.state==='exposed')return;this.health=Math.max(25,this.health-damage*(this.weakTime>0?1:.18));this.vfx.burst(this.core,.4,new Vector3(0,1,0),false);}
  finish():void {this.health=0;this.state='defeated';this.timer=0;this.body.setEnabled(false);this.telegraph.visible=false;this.play('death');}
  dispose():void {this.physics.removeBody(this.body);this.mixer.stopAllAction();this.mixer.uncacheRoot(this.model);const skeletons=new Set<SkinnedMesh['skeleton']>();this.object.traverse(o=>{if(o instanceof SkinnedMesh)skeletons.add(o.skeleton);if(o instanceof Mesh){const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m.dispose());}});skeletons.forEach(s=>s.dispose());this.object.removeFromParent();this.telegraph.geometry.dispose();(this.telegraph.material as MeshBasicMaterial).dispose();this.telegraph.removeFromParent();}
}
