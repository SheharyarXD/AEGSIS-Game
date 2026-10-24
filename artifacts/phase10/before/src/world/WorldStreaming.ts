import { BatchedMesh, Box3, Color, Frustum, Group, Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three';
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
 private refresh:Tile[]=[];
 private tileMatrices=new Map<string,Map<string,Matrix4[]>>();
 private near=new Map<string,{capacity:number;meshes:import('three').InstancedMesh[]}>();
 private queue:Tile[]=[];private lastSelection='';
 private far=new Map<string,import('three').InstancedMesh[]>();
 private skyline=new Map<string,{capacity:number;meshes:import('three').InstancedMesh[]}>();
 private visibleSkylineIds=new Set<number>();
 private localBounds=new Map<string,Box3>();
 private boundsScratch=new Box3();
 private buildingsById=new Map<number,CityLayout['buildings'][number]>();
 private farIndices=new Map<number,{key:string;index:number;matrix:Matrix4}>();
 private zero=new Matrix4().makeScale(0,0,0);
 private hlod?:BatchedMesh;private hlodInstances=new Map<number,number>();
 private coldDamage=new Map<number,'local'|'partial'|'collapsed'>();
 private visibleFarIds=new Set<number>();
 generationMs=0;maxGenerationMs=0;loads=0;unloads=0;
 private quality:StreamingQuality;
 private focus=new Vector3();private lodCell='';private assetRevision=-1;
 private detailedBuildings=new Set<number>();private camera?:PerspectiveCamera;private farView='';private nearView='';
 readonly hiddenBuildings=new Set<number>();
 constructor(readonly layout:CityLayout,readonly assets:AssetLibrary,quality='LOW',private slice=false){
  this.quality=WORLD_QUALITY[quality];
  for(const b of layout.buildings)this.buildingsById.set(b.id,b);
  const lists=new Map<string,Matrix4[]>();
  for(const b of layout.buildings){
   if(slice&&b.district!=='gothic')continue;
   const key=b.family?`${b.family}_${b.assetHeight??b.h}_far`:`${b.style}_far`,list=lists.get(key)??[],matrix=placement(b.x,0,b.z,b.w,b.h,b.d,b.angle??0);
   this.farIndices.set(b.id,{key,index:list.length,matrix});list.push(matrix);lists.set(key,list);
  }
  if(assets.materials?.premium.multiDraw&&assets.parts?.size&&assets.parts.has([...lists.keys()][0])){
   const entries=[...lists.keys()].map(key=>({key,part:assets.parts.get(key)![0]}));
   this.hlod=new BatchedMesh(layout.buildings.length,entries.reduce((n,e)=>n+e.part.geometry.attributes.position.count,0),entries.reduce((n,e)=>n+(e.part.geometry.index?.count??0),0),assets.materials.get('city_hlod_atlas'));
   this.hlod.name='Shared authored skyline HLOD';this.hlod.sortObjects=false;this.hlod.perObjectFrustumCulled=false;this.hlod.frustumCulled=false;this.hlod.castShadow=false;this.hlod.receiveShadow=false;this.group.add(this.hlod);
   const geometries=new Map(entries.map(e=>[e.key,this.hlod!.addGeometry(e.part.geometry)]));
   for(const b of layout.buildings){const index=this.farIndices.get(b.id);if(!index)continue;const instance=this.hlod.addInstance(geometries.get(index.key)!);this.hlodInstances.set(b.id,instance);this.hlod.setMatrixAt(instance,index.matrix);this.hlod.setColorAt(instance,new Color('white'));}
  }else for(const [key,matrices] of lists)this.far.set(key,assets.instance(key,matrices,this.group,false));
  // Tall buildings retain their complete source silhouette at every quality/distance.
  // One shared far mesh per family, not one expensive near model per placement.
  if(assets.ensureSkyline)for(const b of layout.buildings)if(b.family&&b.h>=90&&(!slice||b.district==='gothic'))void assets.ensureSkyline(b.family,b.assetHeight??b.h).catch(error=>console.error(error));
 }
 private viewSignature(camera?:PerspectiveCamera):string{return camera?camera.matrixWorld.elements.join(',')+'|'+camera.projectionMatrix.elements.join(','):'all';}
 private geometryBounds(key:string):Box3{
  let bounds=this.localBounds.get(key);if(!bounds){bounds=new Box3();for(const part of this.assets.parts?.get(key)??[]){if(!part.geometry.boundingBox)part.geometry.computeBoundingBox();bounds.union(part.geometry.boundingBox!);}if(bounds.isEmpty())bounds.set(new Vector3(-.5,0,-.5),new Vector3(.5,1.2,.5));this.localBounds.set(key,bounds);}return bounds;
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
 update(position:Vector3,velocity:Vector3,heading?:Vector3,immediate=false,camera?:PerspectiveCamera):void{
  if(camera)this.camera=camera;
  let changed=false;
  this.focus.copy(position);const cell=`${Math.floor(position.x/24)},${Math.floor(position.z/24)},${Math.floor(position.y/32)}`;
  if(cell!==this.lodCell||this.assetRevision!==this.assets.revision){this.lodCell=cell;this.assetRevision=this.assets.revision;this.localBounds.clear();this.refresh=[...this.loaded.keys()].map(key=>this.layout.tiles.get(key)!);}
  const selected=this.select(position,velocity,heading),signature=selected.map(t=>t.key).join('|');
  if(signature!==this.lastSelection){
   this.lastSelection=signature;if(velocity.lengthSq()>64&&this.assets.ensure){const future=position.clone().addScaledVector(velocity,2.4);for(const tile of selected.slice(0,4))for(const b of tile.buildings)if(b.family&&Math.hypot(b.x-future.x,b.z-future.z)<150)void this.assets.ensure(b.family,b.assetHeight??b.h,'near',5).catch(()=>{});}
   const wanted=new Set(selected.map(t=>t.key));
   for(const [key,group] of this.loaded)if(!wanted.has(key)){this.release(group);this.loaded.delete(key);this.tileMatrices.delete(key);changed=true;this.restore(this.layout.tiles.get(key)!);this.unloads++;}
   this.queue=selected.filter(t=>!this.loaded.has(t.key));
  }
  const start=performance.now();let n=0;
  while(this.queue.length&&(immediate||n<1&&performance.now()-start<this.quality.budgetMs)){
   const tile=this.queue.shift()!;this.loaded.set(tile.key,this.build(tile));this.loads++;n++;changed=true;
  }
  let refreshed=0;while(this.refresh.length&&(immediate||refreshed<1&&performance.now()-start<this.quality.budgetMs)){const tile=this.refresh.shift()!;if(!this.loaded.has(tile.key))continue;this.loaded.get(tile.key)!.removeFromParent();this.loaded.set(tile.key,this.build(tile));refreshed++;changed=true;}
  this.syncNear(changed||immediate);
  this.syncFar(changed||immediate);
  this.generationMs=performance.now()-start;this.maxGenerationMs=Math.max(this.maxGenerationMs,this.generationMs);
 }
 private build(tile:Tile):Group{
  const group=new Group();group.name=`City tile ${tile.key}`;const lists=new Map<string,Matrix4[]>();
  const add=(key:string,matrix:Matrix4)=>{const list=lists.get(key)??[];list.push(matrix);lists.set(key,list);};
  for(const b of tile.buildings){
   this.detailedBuildings.delete(b.id);
   if(this.hiddenBuildings.has(b.id))continue;
   if(this.slice&&b.district!=='gothic')continue;
   if(b.family){
    const a=b.angle??0,hx=(Math.abs(Math.cos(a))*b.w+Math.abs(Math.sin(a))*b.d)/2,hz=(Math.abs(Math.sin(a))*b.w+Math.abs(Math.cos(a))*b.d)/2;
    const distance=Math.hypot(Math.max(0,Math.abs(b.x-this.focus.x)-hx),Math.max(0,Math.abs(b.z-this.focus.z)-hz),Math.max(0,this.focus.y-b.h-25));
    const nearRange=this.quality.range<=145?55:this.quality.range<=205?70:this.quality.range<=255?90:110;
    const midRange=this.quality.range<=145?100:this.quality.range<=205?130:this.quality.range<=255?165:200;
    if(distance>midRange)continue;
    const near=distance<nearRange,lod=near?'near':'mid';
    const key=`${b.family}_${b.assetHeight??b.h}_${lod}`;
    if(this.assets.ensure&&!(this.assets.available?.(key)??this.assets.parts.has(key))){void this.assets.ensure(b.family,b.assetHeight??b.h,lod,distance<35?0:distance).catch(error=>console.error(error));continue;}
    add(key,placement(b.x,0,b.z,b.w,b.h,b.d,b.angle??0));
    this.detailedBuildings.add(b.id);
    continue;
   }
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
   this.detailedBuildings.add(b.id);
  }
  this.tileMatrices.set(tile.key,lists);
  this.group.add(group);return group;
 }
 /** One reusable instance pool per authored module/material across active tiles. */
 private syncNear(force=true):void{
  const camera=this.camera;camera?.updateMatrixWorld();
  const view=this.viewSignature(camera);
  if(!force&&view===this.nearView)return;this.nearView=view;
  const frustum=camera?new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse)):null;
  const combined=new Map<string,Matrix4[]>();
  for(const tile of this.tileMatrices.values())for(const [key,matrices] of tile){const list=combined.get(key)??[];for(const matrix of matrices){
   if(frustum&&/^(city_|aer_)/.test(key)){
    // Retain nearby shadow casters beyond the visible edge on shadowed presets.
    const margin=this.quality.range>145?24:0;
    if(!frustum.intersectsBox(this.boundsScratch.copy(this.geometryBounds(key)).applyMatrix4(matrix).expandByScalar(margin)))continue;
   }
   list.push(matrix);
  }combined.set(key,list);}
  for(const key of new Set([...this.near.keys(),...combined.keys()])){
   const matrices=combined.get(key)??[];let pool=this.near.get(key);
   if(matrices.length>(pool?.capacity??0)){
    if(pool)for(const mesh of pool.meshes){mesh.dispose();mesh.removeFromParent();}
    const capacity=2**Math.ceil(Math.log2(Math.max(8,matrices.length)));
    pool={capacity,meshes:this.assets.instance(key,Array.from({length:capacity},()=>this.zero),this.group,true)};this.near.set(key,pool);
   }
   if(!pool)continue;
   for(const mesh of pool.meshes){mesh.count=matrices.length;mesh.visible=matrices.length>0;mesh.castShadow=!key.endsWith('_mid');matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();}
  }
 }
 private syncFar(force=false):void{
  const camera=this.camera;camera?.updateMatrixWorld();
  const view=this.viewSignature(camera);
  if(!force&&view===this.farView)return;this.farView=view;
  this.visibleFarIds.clear();this.visibleSkylineIds.clear();
  const skylineLists=new Map<string,Matrix4[]>();
  const frustum=camera?new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse)):null,lists=new Map<string,Matrix4[]>(),colors=new Map<string,Color[]>();
  for(const b of this.layout.buildings){if(this.coldDamage.get(b.id)==='collapsed'){if(this.hlod)this.hlod.setVisibleAt(this.hlodInstances.get(b.id)!,false);continue;}if(this.slice&&b.district!=='gothic')continue;if(this.hiddenBuildings.has(b.id)&&!this.coldDamage.has(b.id)||this.detailedBuildings.has(b.id)){if(this.hlod)this.hlod.setVisibleAt(this.hlodInstances.get(b.id)!,false);continue;}
   const index=this.farIndices.get(b.id)!,skyKey=`${b.family}_${b.assetHeight??b.h}_skyline`,full=b.h>=90&&!this.coldDamage.has(b.id)&&(this.assets.available?.(skyKey)??this.assets.parts?.has(skyKey)),boundsKey=full?skyKey:index.key;
   if(frustum&&!frustum.intersectsBox(this.boundsScratch.copy(this.geometryBounds(boundsKey)).applyMatrix4(index.matrix))){if(this.hlod)this.hlod.setVisibleAt(this.hlodInstances.get(b.id)!,false);continue;}
   this.visibleFarIds.add(b.id);if(full){this.visibleSkylineIds.add(b.id);const list=skylineLists.get(skyKey)??[];list.push(index.matrix);skylineLists.set(skyKey,list);if(this.hlod)this.hlod.setVisibleAt(this.hlodInstances.get(b.id)!,false);continue;}
   if(this.hlod){this.hlod.setVisibleAt(this.hlodInstances.get(b.id)!,true);continue;}
   const stage=this.coldDamage.get(b.id),matrix=stage?index.matrix.clone():index.matrix;
   const list=lists.get(index.key)??[],tints=colors.get(index.key)??[];list.push(matrix);tints.push(new Color(stage?'#69665e':'#ffffff'));lists.set(index.key,list);colors.set(index.key,tints);
  }
  for(const [key,meshes] of this.far){const matrices=lists.get(key)??[];for(const mesh of meshes){mesh.count=matrices.length;mesh.visible=matrices.length>0;matrices.forEach((m,i)=>{mesh.setMatrixAt(i,m);mesh.setColorAt(i,colors.get(key)![i]);});mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();}}
  for(const key of new Set([...this.skyline.keys(),...skylineLists.keys()])){
   const matrices=skylineLists.get(key)??[];let pool=this.skyline.get(key);
   if(matrices.length>(pool?.capacity??0)){if(pool)for(const mesh of pool.meshes){mesh.dispose();mesh.removeFromParent();}const capacity=2**Math.ceil(Math.log2(Math.max(4,matrices.length)));pool={capacity,meshes:this.assets.instance(key,Array.from({length:capacity},()=>this.zero),this.group,false)};this.skyline.set(key,pool);}
   if(pool)for(const mesh of pool.meshes){mesh.count=matrices.length;mesh.visible=matrices.length>0;mesh.receiveShadow=false;matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();}
  }
 }
 private restore(tile:Tile):void{for(const b of tile.buildings)this.detailedBuildings.delete(b.id);}
 hideBuilding(id:number):void{this.hiddenBuildings.add(id);const tile=this.buildingsById.get(id)?.tile,g=tile?this.loaded.get(tile):undefined;if(g&&tile){g.removeFromParent();this.loaded.set(tile,this.build(this.layout.tiles.get(tile)!));}this.syncNear();this.syncFar(true);}
 isFarVisible(id:number){return this.visibleFarIds.has(id);}
 isSkylineVisible(id:number){return this.visibleSkylineIds.has(id);}
 setDamageProxy(id:number,enabled:boolean,stage:'local'|'partial'|'collapsed'){
  if(enabled)this.coldDamage.set(id,stage);else this.coldDamage.delete(id);
  const instance=this.hlodInstances.get(id),original=this.farIndices.get(id);if(this.hlod&&instance!==undefined&&original){const matrix=original.matrix.clone();this.hlod.setMatrixAt(instance,matrix);this.hlod.setColorAt(instance,new Color(enabled?'#69665e':'#ffffff'));}this.syncFar(true);
 }
 private release(group:Group):void{group.traverse(o=>{if('isInstancedMesh' in o&&(o as import('three').InstancedMesh).isInstancedMesh)(o as import('three').InstancedMesh).dispose();});group.removeFromParent();group.clear();}
 reset():void{for(const [id,stage] of this.coldDamage)this.setDamageProxy(id,false,stage);for(const [key,g] of this.loaded){this.release(g);this.restore(this.layout.tiles.get(key)!);}this.loaded.clear();this.tileMatrices.clear();this.syncNear();this.queue=[];this.refresh=[];this.coldDamage.clear();this.lastSelection='';this.maxGenerationMs=0;}
 dispose():void{this.reset();this.hlod?.dispose();for(const pool of this.near.values())for(const mesh of pool.meshes)mesh.dispose();this.near.clear();for(const pool of this.skyline.values())for(const mesh of pool.meshes)mesh.dispose();this.skyline.clear();for(const meshes of this.far.values())for(const m of meshes)m.dispose();this.far.clear();this.group.removeFromParent();this.group.clear();}
 get pending():number{return this.queue.length+this.refresh.length;}
 get settings():StreamingQuality{return this.quality;}
}
