import {AdditiveAnimationBlendMode,AnimationAction,AnimationClip,Euler,LoopOnce,MathUtils,Object3D,Quaternion,QuaternionKeyframeTrack} from 'three';
import {AegisSuit} from '../../player/AegisSuit';

/** Original small additive keyframe clips, layered in the existing mixer without editing its rig or base actions. */
export class BreachAnimation {
 private actions:AnimationAction[]=[];private weights=[0,0,0];
 readonly clips:AnimationClip[]=[];
 constructor(private suit:AegisSuit){
  const authored:[string,Record<string,[number,number,number]>,number][]=[
   ['titan_acquire_brace',{chest:[-.065,0,0],head:[.05,0,0],upper_armL:[-.05,0,-.06],upper_armR:[-.05,0,.06]},.8],
   ['titan_flight_stabilize',{chest:[.07,0,0],thighL:[-.045,0,-.025],thighR:[-.025,0,.025]},1.1],
   ['titan_exit_recoil',{chest:[-.13,0,.025],head:[.065,0,0],upper_armL:[.08,0,-.08],upper_armR:[.06,0,.08]},.65],
  ];
  for(const [name,bones,duration] of authored){const times=[0,duration*.2,duration*.65,duration],tracks=[];for(const [bone,rotation] of Object.entries(bones)){
   const root=suit.mixer.getRoot();if(!(root instanceof Object3D)||!root.getObjectByName(bone))continue;
   const pose=new Quaternion().setFromEuler(new Euler(...rotation)),values=[0,0,0,1,...pose.toArray(),...pose.toArray(),0,0,0,1];tracks.push(new QuaternionKeyframeTrack(bone+'.quaternion',times,values));
  }const clip=new AnimationClip(name,duration,tracks,AdditiveAnimationBlendMode);this.clips.push(clip);const action=suit.mixer.clipAction(clip);action.setLoop(LoopOnce,1);action.clampWhenFinished=true;action.setEffectiveTimeScale(0);action.setEffectiveWeight(0);action.play();this.actions.push(action);}
 }
 update(dt:number,state:string,age:number,active:boolean){
  const stage=!active?-1:['ACQUIRING','DEPLOYING','BARRAGE','ENTRY_CONFIRMED'].includes(state)?0:['EXIT_IMPACT','RECOVERY'].includes(state)?2:1;
  for(let i=0;i<this.actions.length;i++){this.weights[i]=MathUtils.damp(this.weights[i],i===stage?1:0,10,dt);const action=this.actions[i];action.time=Math.min(this.clips[i].duration*.82,Math.max(.02,age));action.setEffectiveWeight(this.weights[i]);}
  this.suit.setPower(1+(active?(stage===0?.12:stage===2?.34:.22):0));
 }
 reset(){this.weights.fill(0);for(const a of this.actions)a.setEffectiveWeight(0);this.suit.setPower(1);}
 dispose(){this.reset();for(const clip of this.clips){this.suit.mixer.existingAction(clip)?.stop();this.suit.mixer.uncacheClip(clip);}}
}
