import {MathUtils,Quaternion,Vector3} from 'three';
import {CameraRig} from '../../camera/CameraRig';
import {PlayerController} from '../../player/PlayerController';
import {BreachPlan} from './BreachPlan';

/** An additive director; normal CameraRig is preserved and remains the recovery destination. */
export class CinematicCamera {
 reduced=false;private age=0;private previous=new Quaternion();private aimed=new Quaternion();collisionCorrections=0;
 constructor(private rig:CameraRig,private player:PlayerController){try{this.reduced=localStorage.getItem('aegis-reduced-camera-motion')==='1'||matchMedia('(prefers-reduced-motion: reduce)').matches;}catch{}}
 update(dt:number,plan:BreachPlan,phase:string,phaseAge:number){
  this.age+=dt;const camera=this.rig.camera,head=this.player.renderPosition.clone().add(new Vector3(0,1.2,0));
  const inside=phase==='INTERIOR_TRAVERSAL',moving=inside||phase==='ACCELERATING'||phase==='EXIT_IMPACT'||phase==='RECOVERY';
  const side=new Vector3().crossVectors(plan.direction,new Vector3(0,1,0)).normalize();
  const reveal=phase==='EXIT_IMPACT'?MathUtils.smoothstep(phaseAge,0,.25):phase==='RECOVERY'?1:0;
  const recovery=MathUtils.smoothstep(phaseAge,0,.45),normalDistance=6.8+Math.min(1,this.player.getSpeed()/52)*3.5;
  const distance=this.reduced?5:phase==='RECOVERY'?MathUtils.lerp(-3,normalDistance,recovery):phase==='EXIT_IMPACT'?MathUtils.lerp(5,-3,reveal):inside?3.4:moving?5:5.8;
  const shoulder=this.reduced?.25:phase==='RECOVERY'?MathUtils.lerp(8,.3,recovery):inside?.35:1.2+reveal*6.8;
  const desired=head.clone().addScaledVector(plan.direction,-distance).addScaledVector(side,shoulder).add(new Vector3(0,inside?.3:.7));
  // Follow translation before damping composition. Otherwise 46 m/s creates a large chase lag and a tiny exit silhouette.
  const from=camera.position.clone();if(moving)from.addScaledVector(this.player.velocity,dt);
  const alpha=1-Math.exp(-dt*(phase==='EXIT_IMPACT'?14:inside?10:8));desired.lerpVectors(from,desired,alpha);
  // Clamp the interpolated position too: an otherwise safe endpoint can have an unsafe interpolation through a wall.
  const boom=desired.clone().sub(head),fraction=this.player.physics.cameraDistance(head,boom);
  if(fraction<.999)this.collisionCorrections++;
  camera.position.copy(head).addScaledVector(boom,fraction);
  const revealLook=head.clone().lerp(plan.exit,.38),normalLook=camera.position.clone().addScaledVector(plan.direction,15);
  const look=phase==='RECOVERY'&&!this.reduced?revealLook.lerp(normalLook,recovery):phase==='EXIT_IMPACT'&&!this.reduced?revealLook:phase==='RECOVERY'?normalLook:head.clone().addScaledVector(plan.direction,moving?9:18);
  this.previous.copy(camera.quaternion);camera.lookAt(look);this.aimed.copy(camera.quaternion);camera.quaternion.slerpQuaternions(this.previous,this.aimed,1-Math.exp(-dt*(phase==='EXIT_IMPACT'||phase==='RECOVERY'?14:9)));
  const normalFov=56+Math.min(1,this.player.getSpeed()/52)*13;
  const fov=phase==='RECOVERY'?MathUtils.lerp(this.reduced?58:74,normalFov,recovery):this.reduced?58:moving?inside?67:74:49;
  camera.fov=MathUtils.damp(camera.fov,fov,6,dt);camera.updateProjectionMatrix();
 }
 reset(){this.age=0;this.collisionCorrections=0;}
}
