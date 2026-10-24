import { Group, Matrix4, Quaternion, Vector3 } from 'three';
import { AssetLibrary } from './environment/AssetLibrary';
import { CityLayout, Tile, PROFILES } from './CityLayout';
export interface StreamingQuality {range:number;maxTiles:number;particleScale:number;ambientCars:number;budgetMs:number;}
export const WORLD_QUALITY:Record<string,StreamingQuality>={
 LOW:{range:145,maxTiles:9,particleScale:.28,ambientCars:12,budgetMs:2.0},
 MEDIUM:{range:205,maxTiles:16,particleScale:.5,ambientCars:20,budgetMs:2.5},
 HIGH:{range:255,maxTiles:22,particleScale:.75,ambientCars:28,budgetMs:3},
 ULTRA:{range:310,maxTiles:28,particleScale:1,ambientCars:36,budgetMs:3},
};
const rotation=new Quaternion();
export function placement(x:number,y:number,z:number,w=1,h=1,d=1,angle=0):Matrix4{
 return new Matrix4().compose(new Vector3(x,y,z),rotation.setFromAxisAngle(new Vector3(0,1,0),angle),new Vector3(w,h,d));
}
/** Persistent authored silhouette + bounded instanced architecture tiles. No async collision holes. */
export class WorldStreaming {
 readonly group=new Group();readonly loaded=new Map<string,Group>();
 private tileMatrices=new Map<string,Map<string,Matrix4[]>>();
 private near=new Map<string,{capacity:number;meshes:import('three').InstancedMesh[]}>();
 private queue:Tile[]=[];private lastSelection='';
 private far=new Map<string,import('three').InstancedMesh[]>();
 private farIndices=new Map<number,{key:string;index:number;matrix:Matrix4}>();
 private zero=new Matrix4().makeScale(0,0,0);
 generationMs=0;maxGenerationMs=0;loads=0;unloads=0;
 private quality:StreamingQuality;
 constructor(readonly layout:CityLayout,readonly assets:AssetLibrary,quality='LOW',private slice=false){
  this.quality=WORLD_QUALITY[quality];
  const lists=new Map<string,Matrix4[]>();
  for(const b of layout.buildings){
   if(slice&&b.district!=='gothic')continue;
   const key=`${b.style}_far`,list=lists.get(key)??[],matrix=placement(b.x,0,b.z,b.w,b.h,b.d);
   this.farIndices.set(b.id,{key,index:list.length,matrix});list.push(matrix);lists.set(key,list);
  }
  for(const [key,matrices] of lists)this.far.set(key,assets.instance(key,matrices,this.group,false));
 }
 setQuality(quality:string):void{this.quality=WORLD_QUALITY[quality]??WORLD_QUALITY.LOW;this.lastSelection='';}
 select(position:Vector3,velocity:Vector3,heading?:Vector3):Tile[]{
  // Flight lookahead is capped, leaving capacity for the currently occupied region.
  const future=position.clone().addScaledVector(velocity,2.4),speed=velocity.length();
  const scored=[...this.layout.tiles.values()].filter(t=>t.buildings.some(b=>!this.slice||b.district==='gothic')).map(tile=>{
   const distance=Math.hypot(tile.x-position.x,tile.z-position.z),ahead=Math.hypot(tile.x-future.x,tile.z-future.z);
   const view=heading?((tile.x-position.x)*heading.x+(tile.z-position.z)*heading.z)/Math.max(1,distance):0;
   return {tile,distance,score:Math.min(distance,ahead+(speed>8?28:80))-view*12};
  }).filter(t=>t.distance<this.quality.range+91||t.score<this.quality.range*.8).sort((a,b)=>a.score-b.score);
  return scored.slice(0,this.quality.maxTiles).map(t=>t.tile);
 }
 update(position:Vector3,velocity:Vector3,heading?:Vector3,immediate=false):void{
  let changed=false;
  const selected=this.select(position,velocity,heading),signature=selected.map(t=>t.key).join('|');
  if(signature!==this.lastSelection){
   this.lastSelection=signature;const wanted=new Set(selected.map(t=>t.key));
   for(const [key,group] of this.loaded)if(!wanted.has(key)){this.release(group);this.loaded.delete(key);this.tileMatrices.delete(key);changed=true;this.restore(this.layout.tiles.get(key)!);this.unloads++;}
   this.queue=selected.filter(t=>!this.loaded.has(t.key));
  }
  const start=performance.now();let n=0;
  while(this.queue.length&&(immediate||n<1&&performance.now()-start<this.quality.budgetMs)){
   const tile=this.queue.shift()!;this.loaded.set(tile.key,this.build(tile));this.loads++;n++;changed=true;
  }
  if(changed)this.syncNear();
  this.generationMs=performance.now()-start;this.maxGenerationMs=Math.max(this.maxGenerationMs,this.generationMs);
 }
 private build(tile:Tile):Group{
  const group=new Group();group.name=`City tile ${tile.key}`;const lists=new Map<string,Matrix4[]>();
  const add=(key:string,matrix:Matrix4)=>{const list=lists.get(key)??[];list.push(matrix);lists.set(key,list);};
  for(const b of tile.buildings){
   if(this.slice&&b.district!=='gothic')continue;
   add(`${b.style}_near`,placement(b.x,0,b.z,b.w,b.h,b.d));
   const top=b.style==='financial'? .54:b.style==='deco'?.44:.86;
   const profile=PROFILES[b.style].at(-1)!,roofWidth=b.w*profile[2],roofDepth=b.d*profile[3];
   for(const side of [-1,1]){add('parapet',placement(b.x,b.h,b.z+side*roofDepth/2,roofWidth,1,1));add('parapet',placement(b.x+side*roofWidth/2,b.h,b.z,roofDepth,1,1,Math.PI/2));}
   add('roofkit',placement(b.x,b.h,b.z,Math.min(1,b.w*top/14),1,Math.min(1,b.d*top/14)));
   if(b.roof==='tank')add('tank',placement(b.x+b.w*.23,b.h,b.z-b.d*.15));
   if(b.district==='financial'&&b.id%3===0)add('helipad',placement(b.x-b.w*top*.18,b.h+.1,b.z-b.d*top*.24,Math.min(1,b.w*top/20),1,Math.min(1,b.d*top/20)));
   if(b.roof==='spire')for(const s of [-1,1])add('spire',placement(b.x+s*b.w*.35,b.h,b.z-b.d*.32,.65,.7,.65));
   if(b.district==='gothic')for(const side of [-1,1])add('portal',placement(b.x,0,b.z+side*(b.d*.5+.3),1,1,1,side<0?Math.PI:0));
   if(b.district==='commercial'){add('shop',placement(b.x,0,b.z+b.d*.51,Math.min(2,b.w/9)));add('sign',placement(b.x,b.h*.45,b.z+b.d*.51));for(const side of [-1,1])add('sign',placement(b.x+side*(b.w*.5+.5),8,b.z,1.6,1,1,side*Math.PI/2));}
   if(b.district==='residential')for(const s of [-1,1])add('tree',placement(b.x+s*(b.w*.5+4),0,b.z+b.d*.5));
   add('lamp',placement(b.x-b.w*.55,0,b.z+b.d*.65));add('bench',placement(b.x+b.w*.2,.05,b.z+b.d*.65));
   const index=this.farIndices.get(b.id);if(index)for(const mesh of this.far.get(index.key)!) {mesh.setMatrixAt(index.index,this.zero);mesh.instanceMatrix.needsUpdate=true;}
  }
  this.tileMatrices.set(tile.key,lists);
  this.group.add(group);return group;
 }
 /** One reusable instance pool per authored module/material across active tiles. */
 private syncNear():void{
  const combined=new Map<string,Matrix4[]>();
  for(const tile of this.tileMatrices.values())for(const [key,matrices] of tile){const list=combined.get(key)??[];list.push(...matrices);combined.set(key,list);}
  for(const key of new Set([...this.near.keys(),...combined.keys()])){
   const matrices=combined.get(key)??[];let pool=this.near.get(key);
   if(matrices.length>(pool?.capacity??0)){
    if(pool)for(const mesh of pool.meshes){mesh.dispose();mesh.removeFromParent();}
    const capacity=2**Math.ceil(Math.log2(Math.max(8,matrices.length)));
    pool={capacity,meshes:this.assets.instance(key,Array.from({length:capacity},()=>this.zero),this.group,true)};this.near.set(key,pool);
   }
   if(!pool)continue;
   for(const mesh of pool.meshes){mesh.count=matrices.length;matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();}
  }
 }
 private restore(tile:Tile):void{for(const b of tile.buildings){const index=this.farIndices.get(b.id);if(index)for(const mesh of this.far.get(index.key)!){mesh.setMatrixAt(index.index,index.matrix);mesh.instanceMatrix.needsUpdate=true;}}}
 private release(group:Group):void{group.traverse(o=>{if('isInstancedMesh' in o&&(o as import('three').InstancedMesh).isInstancedMesh)(o as import('three').InstancedMesh).dispose();});group.removeFromParent();group.clear();}
 reset():void{for(const [key,g] of this.loaded){this.release(g);this.restore(this.layout.tiles.get(key)!);}this.loaded.clear();this.tileMatrices.clear();this.syncNear();this.queue=[];this.lastSelection='';this.maxGenerationMs=0;}
 dispose():void{this.reset();for(const pool of this.near.values())for(const mesh of pool.meshes)mesh.dispose();this.near.clear();for(const meshes of this.far.values())for(const m of meshes)m.dispose();this.far.clear();this.group.removeFromParent();this.group.clear();}
 get pending():number{return this.queue.length;}
 get settings():StreamingQuality{return this.quality;}
}
