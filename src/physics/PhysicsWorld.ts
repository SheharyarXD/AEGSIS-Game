import RAPIER from '@dimforge/rapier3d-compat';
import { Quaternion, Vector3 } from 'three';

export { RAPIER };
export const FIXED_DT = 1 / 60;
export interface Surface { kind: 'world' | 'breakable' | 'actor' | 'debris'; id?: number; }
export interface ContactImpact { a: RAPIER.Collider; b: RAPIER.Collider; force: number; }

/** All simulation advances on the same 60 Hz clock, independent of display refresh. */
export class PhysicsWorld {
  readonly world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  readonly events = new RAPIER.EventQueue(true);
  readonly surfaces = new Map<number, Surface>();
  onImpact?: (event: ContactImpact) => void;
  steps = 0;
  droppedTime = 0;
  private accumulator = 0;

  static async init(): Promise<void> { await RAPIER.init(); }
  constructor() {
    this.world.timestep = FIXED_DT;
    this.world.numSolverIterations = 8;
    this.world.integrationParameters.maxCcdSubsteps = 4;
  }
  box(position: Vector3, size: Vector3, surface: Surface = { kind: 'world' }): RAPIER.Collider {
    const collider = this.world.createCollider(RAPIER.ColliderDesc.cuboid(size.x/2,size.y/2,size.z/2)
      .setTranslation(position.x,position.y,position.z).setFriction(.8));
    this.surfaces.set(collider.handle,surface);
    return collider;
  }
  advance(dt: number, before: (step:number)=>void, after: (step:number)=>void): void {
    const accepted=Math.min(dt, FIXED_DT*5);
    this.droppedTime += Math.max(0,dt-accepted);
    this.accumulator += accepted;
    while (this.accumulator >= FIXED_DT) {
      before(FIXED_DT);
      this.world.step(this.events);
      this.events.drainContactForceEvents(e=>{
        const a=this.world.getCollider(e.collider1()), b=this.world.getCollider(e.collider2());
        if(a&&b&&e.totalForceMagnitude()>800) this.onImpact?.({a,b,force:e.totalForceMagnitude()});
      });
      after(FIXED_DT);
      this.steps++;
      this.accumulator -= FIXED_DT;
    }
  }
  resetClock(): void { this.accumulator=0; }
  /** Height of `point` above the nearest fixed surface below it, up to `limit` metres. */
  groundDistance(point: {x:number;y:number;z:number}, limit: number): number {
    const hit=this.world.castRay(new RAPIER.Ray({x:point.x,y:point.y+.3,z:point.z},{x:0,y:-1,z:0}),limit+.3,true,RAPIER.QueryFilterFlags.ONLY_FIXED);
    return hit?Math.max(0,hit.timeOfImpact-.3):limit;
  }
  /** How far the display is past the last simulated step, 0..1: draw between the last two states. */
  get alpha(): number { return this.accumulator / FIXED_DT; }
  removeCollider(collider:RAPIER.Collider): void {
    this.surfaces.delete(collider.handle);
    if(collider.isValid())this.world.removeCollider(collider,true);
  }
  removeBody(body:RAPIER.RigidBody): void {
    if(!body.isValid())return;
    for(let i=0;i<body.numColliders();i++)this.surfaces.delete(body.collider(i).handle);
    this.world.removeRigidBody(body);
  }
  ray(origin:Vector3,direction:Vector3,distance:number,exclude?:RAPIER.RigidBody) {
    return this.world.castRayAndGetNormal(new RAPIER.Ray(origin,direction),distance,true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,undefined,exclude);
  }
  cameraDistance(origin:Vector3,delta:Vector3):number {
    const hit=this.world.castShape(origin,new Quaternion(),delta,new RAPIER.Ball(.28),.03,1,true,
      RAPIER.QueryFilterFlags.ONLY_FIXED);
    return hit ? Math.max(.04,hit.time_of_impact) : 1;
  }
  get activeBodies(): number { let n=0;this.world.forEachActiveRigidBody(()=>n++);return n; }
  dispose():void { this.events.free();this.world.free(); }
}

export class CharacterBody {
  readonly body:RAPIER.RigidBody;
  readonly collider:RAPIER.Collider;
  readonly controller:RAPIER.KinematicCharacterController;
  readonly position=new Vector3(); // Foot origin. Capsule center is 1.05 m above it.
  grounded=false;
  readonly height=1.05;
  constructor(readonly physics:PhysicsWorld,position:Vector3,mass=180) {
    this.position.copy(position);
    this.body=physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(position.x,position.y+this.height,position.z));
    this.collider=physics.world.createCollider(RAPIER.ColliderDesc.capsule(.68,.37).setMass(mass).setFriction(.7),this.body);
    physics.surfaces.set(this.collider.handle,{kind:'actor'});
    this.controller=physics.world.createCharacterController(.02);
    this.controller.enableAutostep(.27,.3,false);
    this.controller.enableSnapToGround(.18);
    this.controller.setMaxSlopeClimbAngle(Math.PI/4);
    this.controller.setApplyImpulsesToDynamicBodies(true);
    this.controller.setCharacterMass(mass);
  }
  move(velocity:Vector3,dt:number,flying:boolean,onHit?:(speed:number,point:Vector3,normal:Vector3,collider:RAPIER.Collider)=>void):void {
    if(flying){this.controller.disableSnapToGround();this.controller.disableAutostep();}
    else {this.controller.enableSnapToGround(.18);this.controller.enableAutostep(.27,.3,false);}
    this.controller.computeColliderMovement(this.collider,velocity.clone().multiplyScalar(dt),RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
    const movement=this.controller.computedMovement();
    const p=this.body.translation();
    this.body.setNextKinematicTranslation({x:p.x+movement.x,y:p.y+movement.y,z:p.z+movement.z});
    this.grounded=this.controller.computedGrounded();
    for(let i=0;i<this.controller.numComputedCollisions();i++) {
      const c=this.controller.computedCollision(i);if(!c?.collider)continue;
      const normal=new Vector3(c.normal1.x,c.normal1.y,c.normal1.z);
      const into=-velocity.dot(normal);
      if(into>0){
        if(into>6)onHit?.(into,new Vector3(c.witness1.x,c.witness1.y,c.witness1.z),normal,c.collider);
        velocity.addScaledVector(normal,into);
      }
    }
  }
  sync(): void {const p=this.body.translation();this.position.set(p.x,p.y-this.height,p.z);}
  teleport(position:Vector3):void {
    this.position.copy(position);
    const p={x:position.x,y:position.y+this.height,z:position.z};
    this.body.setTranslation(p,true);this.body.setNextKinematicTranslation(p);
    this.physics.world.propagateModifiedBodyPositionsToColliders();
  }
  setEnabled(enabled:boolean):void {this.body.setEnabled(enabled);}
  dispose():void {this.physics.world.removeCharacterController(this.controller);this.physics.removeBody(this.body);}
}
