import {Box3,Ray,Vector3} from 'three';
import type {Building} from '../CityLayout';
export interface BreachPlan {buildingId:number;entry:Vector3;exit:Vector3;direction:Vector3;length:number;radius:number;halfHeight:number;exitOpen?:boolean;exitTrigger?:number;ground?:boolean;lining?:string;}
export function planBreach(buildings:readonly Building[],origin:Vector3,direction:Vector3,range:number,maxDepth:number,radius:number,halfHeight:number):BreachPlan|null{
 if(![...origin.toArray(),...direction.toArray(),range,maxDepth,radius,halfHeight].every(Number.isFinite)||direction.lengthSq()<.001)return null;
 const d=direction.clone().normalize();if(Math.abs(d.y)>.22)return null;let nearest=Infinity,result:BreachPlan|null=null;
 for(const b of buildings){const a=-(b.angle??0),o=origin.clone().sub(new Vector3(b.x,0,b.z)).applyAxisAngle(new Vector3(0,1,0),a),localDirection=d.clone().applyAxisAngle(new Vector3(0,1,0),a),box=new Box3(new Vector3(-b.w/2,0,-b.d/2),new Vector3(b.w/2,b.h,b.d/2));if(box.containsPoint(o))return null;
 const hit=new Ray(o,localDirection).intersectBox(box,new Vector3());if(!hit)continue;const entryDistance=hit.distanceTo(o);if(entryDistance>range||entryDistance>=nearest)continue;
 // A nearer solid structure always blocks an ability aimed at a farther one.
 nearest=entryDistance;result=null;if(entryDistance<4||!b.family||origin.y<halfHeight+.1||origin.y>b.h-halfHeight-.1)continue;
 const end=new Ray(hit.clone().addScaledVector(localDirection,500),localDirection.clone().negate()).intersectBox(box,new Vector3());if(!end)continue;const length=end.distanceTo(hit);if(length<4||length>maxDepth)continue;
 const entry=origin.clone().addScaledVector(d,entryDistance-.8),exit=origin.clone().addScaledVector(d,entryDistance+length+.8);
 if(exit.y<halfHeight+.1||exit.y>b.h-halfHeight-.1)continue;
 // Reject passages that immediately run into another intact building at the exit.
 if(buildings.some(other=>{if(other.id===b.id)return false;const local=exit.clone().sub(new Vector3(other.x,0,other.z)).applyAxisAngle(new Vector3(0,1,0),-(other.angle??0));return Math.abs(local.x)<other.w/2+radius&&Math.abs(local.z)<other.d/2+radius&&exit.y<other.h+halfHeight;}))continue;
 result={buildingId:b.id,entry,exit,direction:d.clone(),length:length+1.6,radius,halfHeight};
 }return result;
}
export function sweptSection(box:Box3,plan:BreachPlan){const expanded=box.clone().expandByVector(new Vector3(plan.radius,plan.halfHeight,plan.radius)),hit=new Ray(plan.entry,plan.direction).intersectBox(expanded,new Vector3());return expanded.containsPoint(plan.entry)||!!hit&&hit.distanceTo(plan.entry)<=plan.length;}

/** Recessed/bulky exit sections can begin well before the building's nominal far face. */
export function exitOpeningProgress(boxes:readonly Box3[],plan:BreachPlan,speed:number){
 let trigger=plan.length-4;const ray=new Ray(plan.entry,plan.direction),padding=new Vector3(plan.radius,plan.halfHeight,plan.radius);
 for(const box of boxes){const expanded=box.clone().expandByVector(padding),hit=ray.intersectBox(expanded,new Vector3());if(!hit&&!expanded.containsPoint(plan.entry))continue;const leading=expanded.containsPoint(plan.entry)?0:hit!.sub(plan.entry).dot(plan.direction);trigger=Math.min(trigger,leading-speed*(2/60)-.3);}
 return Math.max(0,trigger);
}
