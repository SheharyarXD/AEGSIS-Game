import {Quaternion,Vector3} from 'three';
import {PhysicsWorld,RAPIER} from '../../physics/PhysicsWorld';
import {BreachPlan} from './BreachPlan';

export const CINEMATIC={runway:14,entrySpeed:34,interiorSeconds:1.15,exitSpeed:46,recovery:.6,worldLimit:1004};
export function flightEntry(plan:BreachPlan,height=1.05){return plan.entry.clone().add(new Vector3(0,-height,0));}
export function flightExit(plan:BreachPlan,height=1.05){return plan.exit.clone().add(new Vector3(0,-height,0));}
/** Exactly the player's enabled capsule, with a small safety margin. No collider filter removes architecture. */
export function sweepFlight(physics:PhysicsWorld,foot:Vector3,end:Vector3,body:RAPIER.RigidBody,height=1.05){
 const delta=end.clone().sub(foot),distance=delta.length();if(distance<.001)return null;
 return physics.world.castShape(foot.clone().add(new Vector3(0,height,0)),new Quaternion(),delta.normalize(),new RAPIER.Capsule(.68,.37),.005,distance,true,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,undefined,body);
}
/** Outside segments must be physically clear before spending energy. The interior is reserved separately. */
export function validateExterior(physics:PhysicsWorld,plan:BreachPlan,foot:Vector3,body:RAPIER.RigidBody,height=1.05){
 const entry=flightEntry(plan,height),exit=flightExit(plan,height),end=exit.clone().addScaledVector(plan.direction,CINEMATIC.runway);
 if([entry,exit,end].some(p=>!p.toArray().every(Number.isFinite)||Math.abs(p.x)>CINEMATIC.worldLimit||Math.abs(p.z)>CINEMATIC.worldLimit||p.y<.22))return 'UNSAFE WORLD EDGE OR VERTICAL CLEARANCE';
 // End slightly short of the intact target skin; its prepared components are checked by reserveBarrage.
 // Last three metres include the destructible entrance canopy/stoop, reserved with the corridor.
 const approach=entry.clone().addScaledVector(plan.direction,-3);
 if(sweepFlight(physics,foot,approach,body,height))return 'ENTRY APPROACH OBSTRUCTED';
 if(sweepFlight(physics,exit,end,body,height))return 'EXIT RUNWAY OBSTRUCTED';
 return null;
}

