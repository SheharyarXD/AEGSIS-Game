import { Vector3 } from 'three';
import { PhysicsWorld, RAPIER } from '../physics/PhysicsWorld';
import { CityLayout, profilesFor, familyOf } from './CityLayout';
/** All navigable building profiles stay resident. Detail streaming cannot remove them. */
export class WorldCollision {
 readonly colliders:RAPIER.Collider[]=[];
 readonly byBuilding=new Map<number,RAPIER.Collider[]>();
 constructor(readonly layout:CityLayout,private physics:PhysicsWorld,slice=false){
  for(const b of layout.buildings){
   const begin=this.colliders.length;
   if(slice&&b.district!=='gothic')continue;
   const source=familyOf(b);
   if(source&&'collisionContours' in source){
    source.collisionContours.forEach((contour,band)=>{if(contour.length<3)return;const low=band*4/(b.assetHeight??b.h)*b.h,high=Math.min(b.h,(band+1)*4/(b.assetHeight??b.h)*b.h),angle=b.angle??0,vertices:number[]=[];for(const y of [low,high])for(const [x,z] of contour){const xx=x*b.w,zz=z*b.d;vertices.push(xx*Math.cos(angle)+zz*Math.sin(angle),y,-xx*Math.sin(angle)+zz*Math.cos(angle));}const desc=RAPIER.ColliderDesc.convexHull(new Float32Array(vertices));if(desc){const c=physics.world.createCollider(desc.setTranslation(b.x,0,b.z).setFriction(.8));physics.surfaces.set(c.handle,{kind:'world'});this.colliders.push(c);}});
    this.byBuilding.set(b.id,this.colliders.slice(begin));continue;
   }
   for(const [start,height,w,d] of profilesFor(b)){
    if(!b.family&&(b.style==='financial'||b.style==='deco')){
     const cut=b.style==='financial'?.1:.06,points=[[-w/2+cut,-d/2],[w/2-cut,-d/2],[w/2,-d/2+cut],[w/2,d/2-cut],[w/2-cut,d/2],[-w/2+cut,d/2],[-w/2,d/2-cut],[-w/2,-d/2+cut]],vertices:number[]=[];
     for(const y of [0,height*b.h])for(const [x,z] of points)vertices.push(x*b.w,y,z*b.d);
     const desc=RAPIER.ColliderDesc.convexHull(new Float32Array(vertices));if(!desc)throw new Error('Invalid authored building collision hull');
     const collider=physics.world.createCollider(desc.setTranslation(b.x,start*b.h,b.z).setFriction(.8));physics.surfaces.set(collider.handle,{kind:'world'});this.colliders.push(collider);
    }else this.colliders.push(physics.box(new Vector3(b.x,(start+height/2)*b.h,b.z),new Vector3(b.w*w,b.h*height,b.d*d)));
   }
   const profile=profilesFor(b).at(-1)!,roofWidth=b.w*profile[2],roofDepth=b.d*profile[3];
   if(b.family){
    const family=familyOf(b)!;if('source' in family){this.byBuilding.set(b.id,this.colliders.slice(begin));continue;}
    this.colliders.push(physics.box(new Vector3(b.x+roofWidth*.13,b.h+.85,b.z+roofDepth*.08),new Vector3(3.2*b.w/familyOf(b)!.width,1.7,2.8*b.d/familyOf(b)!.depth)));
    this.colliders.push(physics.box(new Vector3(b.x-roofWidth*.21,b.h+.65,b.z-roofDepth*.1),new Vector3(2.1,1.3,2.4)));
    this.colliders.push(physics.box(new Vector3(b.x,b.h+1.8,b.z+roofDepth*.27),new Vector3(3.2,3.6,3.1)));
    for(const side of [-1,1]){this.colliders.push(physics.box(new Vector3(b.x,b.h+.5,b.z+side*roofDepth/2),new Vector3(roofWidth,1,.25)));this.colliders.push(physics.box(new Vector3(b.x+side*roofWidth/2,b.h+.5,b.z),new Vector3(.25,1,roofDepth)));}
    this.byBuilding.set(b.id,this.colliders.slice(begin));
    continue;
   }
   // Large authored roof crowns and mechanical housings are real landing surfaces.
   this.colliders.push(physics.box(new Vector3(b.x+b.w*.12,b.h*1.025,b.z+b.d*.08),new Vector3(b.w*.2,b.h*.05,b.d*.22)));
   this.colliders.push(physics.box(new Vector3(b.x-b.w*.2,b.h*1.018,b.z-b.d*.1),new Vector3(b.w*.12,b.h*.035,b.d*.18)));
   const roofHull=(vertices:number[])=>{const desc=RAPIER.ColliderDesc.convexHull(new Float32Array(vertices));if(desc){const c=physics.world.createCollider(desc.setTranslation(b.x,0,b.z).setFriction(.8));physics.surfaces.set(c.handle,{kind:'world'});this.colliders.push(c);}};
   if(b.style==='financial')roofHull([-.2*b.w,b.h,-.1*b.d,.2*b.w,b.h,-.1*b.d,0,b.h*1.12,-.1*b.d,-.2*b.w,b.h,.1*b.d,.2*b.w,b.h,.1*b.d,0,b.h*1.12,.1*b.d]);
   if(b.style==='gothic')for(const s of [-1,1]){const x=s*.37*b.w,z=-.3*b.d,y=.985*b.h;roofHull([x+.085*b.w,y,z,x,y,z+.085*b.d,x-.085*b.w,y,z,x,y,z-.085*b.d,x,b.h*1.165,z]);}
   for(const side of [-1,1]){this.colliders.push(physics.box(new Vector3(b.x,b.h+.5,b.z+side*roofDepth/2),new Vector3(roofWidth,1,.18)));this.colliders.push(physics.box(new Vector3(b.x+side*roofWidth/2,b.h+.5,b.z),new Vector3(.18,1,roofDepth)));}
   const top=b.style==='financial'?.54:b.style==='deco'?.44:.86,scaleX=Math.min(1,b.w*top/14),scaleZ=Math.min(1,b.d*top/14);
   this.colliders.push(physics.box(new Vector3(b.x,b.h+1.8,b.z+7*scaleZ),new Vector3(5*scaleX,3.6,4*scaleZ)));
   if(b.roof==='tank')this.colliders.push(physics.box(new Vector3(b.x+b.w*.23,b.h+3,b.z-b.d*.15),new Vector3(4,4,4)));
   this.byBuilding.set(b.id,this.colliders.slice(begin));
  }
 }
 removeBuilding(id:number):void{for(const c of this.byBuilding.get(id)??[])if(c.isValid())this.physics.removeCollider(c);this.byBuilding.delete(id);}
 get count():number{return this.colliders.filter(c=>c.isValid()).length;}
 hasTile(key:string):boolean{return this.layout.tiles.has(key);}
 dispose():void{for(const c of this.colliders)this.physics.removeCollider(c);this.colliders.length=0;}
}
