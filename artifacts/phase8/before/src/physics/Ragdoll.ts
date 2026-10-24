import { Bone, Quaternion, Vector3 } from 'three';
import { AegisSuit } from '../player/AegisSuit';
import { PhysicsWorld, RAPIER } from './PhysicsWorld';

interface Segment {bone:Bone;body:RAPIER.RigidBody;offset:Vector3;rotation:Quaternion;name:string;}
type SavedPose={bone:Bone;position:Vector3;quaternion:Quaternion};
/** Jointed physical skeleton. The authored skinned mesh stays visible while physics drives bones. */
export class Ragdoll {
  readonly segments:Segment[]=[];
  private readonly poses:SavedPose[]=[];
  private recoveryPoses:SavedPose[]=[];
  recoveryTime=0;
  age=0;
  active=false;
  private readonly centerOffset=new Vector3();
  constructor(readonly suit:AegisSuit,readonly physics:PhysicsWorld) {}
  start(velocity:Vector3,impulse:Vector3):void {
    if(this.active){this.segments.forEach(s=>s.body.applyImpulse(impulse.clone().multiplyScalar(s.body.mass()/180),true));return;}
    this.suit.stopAnimation();this.suit.group.updateMatrixWorld(true);this.age=0;this.active=true;this.poses.length=0;
    for(const bone of new Set(this.suit.bones.values()))this.poses.push({bone,position:bone.position.clone(),quaternion:bone.quaternion.clone()});
    const definitions:[string,string,number,number,string|null][]=[
      ['hips','spine1',.19,30,null],['spine1','chest',.23,55,'hips'],['head001','',.17,15,'spine1'],
      ['upper_armL','forearmL',.13,12,'spine1'],['forearmL','handL',.115,9,'upper_armL'],
      ['upper_armR','forearmR',.13,12,'spine1'],['forearmR','handR',.115,9,'upper_armR'],
      ['thighL','kneeL',.16,18,'hips'],['shinL','footL',.13,10,'thighL'],
      ['thighR','kneeR',.16,18,'hips'],['shinR','footR',.13,10,'thighR'],
    ];
    const endpoints=new Map<string,Vector3>();
    for(const [name,end,radius,mass] of definitions) {
      const bone=this.suit.bones.get(name);if(!bone)continue;
      const a=bone.getWorldPosition(new Vector3());
      const b=end?this.suit.bones.get(end)!.getWorldPosition(new Vector3()):a.clone().add(new Vector3(0,.23,0));
      if(a.distanceTo(b)<.12)b.copy(a).add(new Vector3(0,.22,0));
      const midpoint=a.clone().add(b).multiplyScalar(.5),direction=b.clone().sub(a);
      const q=new Quaternion().setFromUnitVectors(new Vector3(0,1,0),direction.clone().normalize());
      const body=this.physics.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(midpoint.x,midpoint.y,midpoint.z)
        .setRotation(q).setCcdEnabled(true).setLinearDamping(.25).setAngularDamping(2.5).setAdditionalSolverIterations(4));
      const collider=this.physics.world.createCollider(RAPIER.ColliderDesc.capsule(Math.max(.02,direction.length()/2-radius*.7),radius)
        .setMass(mass).setFriction(.9).setRestitution(.02).setCollisionGroups(0x00020001)
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(1000),body);
      this.physics.surfaces.set(collider.handle,{kind:'actor'});
      body.setLinvel(velocity.clone().addScaledVector(impulse,1/198),true);
      const inverse=q.clone().invert();
      this.segments.push({name,bone,body,offset:a.clone().sub(midpoint).applyQuaternion(inverse),rotation:inverse.clone().multiply(bone.getWorldQuaternion(new Quaternion()))});
      endpoints.set(name,a);
    }
    for(const [name,,, ,parentName] of definitions) {
      if(!parentName)continue;
      const child=this.segments.find(s=>s.name===name),parent=this.segments.find(s=>s.name===parentName);if(!child||!parent)continue;
      const jointPoint=endpoints.get(name)!;
      const anchor=(segment:Segment)=>jointPoint.clone().sub(new Vector3().copy(segment.body.translation())).applyQuaternion(new Quaternion().copy(segment.body.rotation()).invert());
      const hinge=name.startsWith('forearm')||name.startsWith('shin');
      const data=hinge?RAPIER.JointData.revoluteWithAxes(anchor(parent),anchor(child),
        new Vector3(1,0,0).applyQuaternion(new Quaternion().copy(parent.body.rotation()).invert()),
        new Vector3(1,0,0).applyQuaternion(new Quaternion().copy(child.body.rotation()).invert())):
        RAPIER.JointData.spherical(anchor(parent),anchor(child));
      const joint=this.physics.world.createImpulseJoint(data,parent.body,child.body,true);joint.setContactsEnabled(false);
      if(hinge)(joint as RAPIER.RevoluteImpulseJoint).setLimits(-1.65,.25);
      // Rapier 0.21 maps spherical descriptors to a GenericImpulseJoint at runtime.
      // It constrains translation; angular damping on the bodies keeps shoulders/hips passive.
      // Do not call SphericalImpulseJoint motors merely because the .d.ts advertises them.
    }
    this.centerOffset.copy(this.segments[0].body.translation()).sub(this.suit.group.position);
  }
  update(dt:number):void {
    if(!this.active)return;this.age+=dt;
    for(const s of this.segments) {
      const q=new Quaternion().copy(s.body.rotation());
      const p=new Vector3().copy(s.body.translation()).add(s.offset.clone().applyQuaternion(q));
      const worldRotation=q.multiply(s.rotation);
      s.bone.parent!.updateWorldMatrix(true,false);
      s.bone.position.copy(s.bone.parent!.worldToLocal(p));
      s.bone.quaternion.copy(s.bone.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(worldRotation));
      s.bone.updateWorldMatrix(false,true);
    }
  }
  get position():Vector3 {return this.active?new Vector3().copy(this.segments[0].body.translation()).sub(this.centerOffset):this.suit.group.position.clone();}
  get speed():number {const v=this.segments[0]?.body.linvel();return v?Math.hypot(v.x,v.y,v.z):0;}
  canRecover():boolean {
    if(!this.active||this.age<=2.4||this.speed>=1.5)return false;
    const center=new Vector3().copy(this.segments[0].body.translation());
    return !!this.physics.world.castRay(new RAPIER.Ray(center,new Vector3(0,-1,0)),1.8,true,RAPIER.QueryFilterFlags.ONLY_FIXED);
  }
  recover():Vector3 {
    const center=new Vector3().copy(this.segments[0].body.translation());
    const hit=this.physics.world.castRay(new RAPIER.Ray(center.clone().add(new Vector3(0,.4,0)),new Vector3(0,-1,0)),4,true,RAPIER.QueryFilterFlags.ONLY_FIXED);
    const p=center.clone();p.y=hit?center.y+.4-hit.timeOfImpact+.03:Math.max(.03,p.y-.8);
    // Snapshot in world space; a short blend avoids snapping to a standing pose.
    this.recoveryPoses=this.poses.map(({bone})=>({bone,position:bone.getWorldPosition(new Vector3()),quaternion:bone.getWorldQuaternion(new Quaternion())}));
    this.clear();this.suit.group.position.copy(p);this.suit.visual.rotation.set(0,0,0);
    for(const pose of this.poses){pose.bone.position.copy(pose.position);pose.bone.quaternion.copy(pose.quaternion);}
    this.suit.restartAnimation();this.recoveryTime=.75;return p;
  }
  blendRecovery(dt:number):void {
    if(this.recoveryTime<=0)return;this.recoveryTime=Math.max(0,this.recoveryTime-dt);
    const t=1-this.recoveryTime/.75,blend=t*t*(3-2*t);this.suit.group.updateMatrixWorld(true);
    for(const pose of this.recoveryPoses) {
      const bone=pose.bone;
      const target=bone.getWorldPosition(new Vector3()).lerp(pose.position,1-blend);
      const rotation=bone.getWorldQuaternion(new Quaternion()).slerp(pose.quaternion,1-blend);
      bone.position.copy(bone.parent!.worldToLocal(target));
      bone.quaternion.copy(bone.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(rotation));bone.updateWorldMatrix(false,true);
    }
  }
  clear():void {for(const s of this.segments)this.physics.removeBody(s.body);this.segments.length=0;this.active=false;}
  reset():void {this.clear();this.recoveryTime=0;this.suit.ragdollActive=false;this.suit.restartAnimation();}
}
