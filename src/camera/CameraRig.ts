import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { InputController } from '../input/InputController';
import { MovementReference } from '../player/PlayerController';
import { PhysicsWorld } from '../physics/PhysicsWorld';

export class CameraRig {
  readonly camera=new PerspectiveCamera(56,window.innerWidth/window.innerHeight,.12,1050);
  yaw=Math.PI;
  pitch=-.07;
  private shake=0;
  private time=0;
  private readonly forward=new Vector3();
  private readonly right=new Vector3();
  private readonly up=new Vector3(0,1,0);
  private readonly desired=new Vector3();
  private readonly aim=new Vector3();
  constructor(private readonly physics?:PhysicsWorld) {this.camera.position.set(0,3,65);}
  readInput(input:InputController):void {
    const look=input.consumeLook();this.yaw-=look.x*.0022;this.pitch=MathUtils.clamp(this.pitch-look.y*.00165,-1.1,1.05);
    // Keyboard camera fallback is useful if pointer lock is unavailable.
    this.yaw+=(Number(input.isHeld('ArrowLeft'))-Number(input.isHeld('ArrowRight')))*.035;
    this.pitch=MathUtils.clamp(this.pitch+(Number(input.isHeld('ArrowUp'))-Number(input.isHeld('ArrowDown')))*.02,-1.1,1.05);
  }
  getReference():MovementReference {
    const c=Math.cos(this.pitch);this.forward.set(Math.sin(this.yaw)*c,Math.sin(this.pitch),Math.cos(this.yaw)*c).normalize();
    this.right.crossVectors(this.forward,this.up).normalize();return {forward:this.forward,right:this.right};
  }
  update(dt:number,target:Vector3,speed:number,flying:boolean,focus?:Vector3):void {
    this.time+=dt;const reference=this.getReference();const amount=Math.min(1,speed/52);
    this.aim.copy(target).add(new Vector3(0,1.35,0));
    if(focus&&focus.distanceTo(target)<50){
      const to=focus.clone().sub(target);this.yaw=MathUtils.damp(this.yaw,this.yaw+Math.atan2(Math.sin(Math.atan2(to.x,to.z)-this.yaw),Math.cos(Math.atan2(to.x,to.z)-this.yaw)),3,dt);
      this.aim.lerp(focus.clone().add(new Vector3(0,1,0)),.22);
    }
    const distance=(flying?6.8:5.4)+amount*3.5;
    this.desired.copy(this.aim).addScaledVector(reference.forward,-distance).addScaledVector(reference.right,.75).add(new Vector3(0,.8,0));
    const boom=this.desired.clone().sub(this.aim),fraction=this.physics?.cameraDistance(this.aim,boom)??1;
    this.desired.copy(this.aim).addScaledVector(boom,fraction);
    // Collision correction is immediate inward; easing outward avoids a wall-pop oscillation.
    this.camera.position.lerp(this.desired,fraction<.98?1:1-Math.exp(-dt*7));
    this.shake=Math.max(0,this.shake-dt*2.8);
    this.camera.position.x+=Math.sin(this.time*83)*this.shake*.035;this.camera.position.y+=Math.sin(this.time*107)*this.shake*.025;
    this.camera.lookAt(this.aim.clone().addScaledVector(reference.forward,2.5));
    this.camera.fov=MathUtils.damp(this.camera.fov,56+amount*(flying?13:3),5,dt);this.camera.updateProjectionMatrix();
  }
  cinematic(position:Vector3,target:Vector3,dt:number,fov=48):void {
    this.camera.position.lerp(position,1-Math.exp(-dt*3));this.camera.lookAt(target);
    this.camera.fov=MathUtils.damp(this.camera.fov,fov,3,dt);this.camera.updateProjectionMatrix();
  }
  addShake(amount:number):void {this.shake=Math.min(1,this.shake+amount);}
  reset(target:Vector3):void {this.yaw=Math.PI;this.pitch=-.07;this.camera.position.copy(target).add(new Vector3(.75,3,6));this.shake=0;}
  resize(width:number,height:number):void {this.camera.aspect=width/height;this.camera.updateProjectionMatrix();}
}
