import { Vector3 } from 'three';
import { FIXED_CITY_BUILDINGS } from './FixedCityLayout';
import { DESTRUCTIBLE_FAMILIES } from './DestructibleFamilies';
import { CITY_PLAN } from './CityPlan';

export const WORLD_SIZE=2048, TILE_SIZE=128, CITY_SEED=4197;
export type DistrictId='financial'|'gothic'|'industrial'|'commercial'|'residential';
export type BuildingStyle='financial'|'deco'|'gothic'|'industrial'|'residential';
export interface Building {id:number;x:number;z:number;w:number;d:number;h:number;style:BuildingStyle;district:DistrictId;tile:string;roof:'roofkit'|'tank'|'spire';family?:string;assetHeight?:number;angle?:number;landmark?:string;damageClass?:'impact'|'section'|'major'|'full';category?:string;block?:string|null;}
const familyMap=new Map<string,(typeof DESTRUCTIBLE_FAMILIES)[number]>(DESTRUCTIBLE_FAMILIES.map(f=>[f.id,f]));
export function familyOf(b:Building){return familyMap.get(b.family??'');}
export function profilesFor(b:Building):readonly (readonly number[])[]{return familyOf(b)?.profiles??PROFILES[b.style];}
export interface Road {a:Vector3;b:Vector3;width:number;elevated?:boolean;hierarchy?:'avenue'|'secondary'|'service';}
export interface Tile {key:string;x:number;z:number;buildings:Building[];}
export const DISTRICTS:Record<DistrictId,{name:string;center:Vector3;test:Vector3}>={
 financial:{name:'Crown Exchange',center:new Vector3(260,0,-520),test:new Vector3(232,2,-400)},
 gothic:{name:'Saint Vesper',center:new Vector3(-610,0,-550),test:new Vector3(-604,2,-496)},
 industrial:{name:'Ironwake Docks',center:new Vector3(690,0,570),test:new Vector3(704,26,512)},
 commercial:{name:'Prism Midtown',center:new Vector3(-40,0,250),test:new Vector3(112,2,244)},
 residential:{name:'Meridian Civic',center:new Vector3(-570,0,430),test:new Vector3(-604,2,388)},
};
export const LANDMARKS=[
 {name:'Vesper Cathedral',asset:'cathedral',position:new Vector3(-640,0,-368),size:new Vector3(58,64,84)},
 {name:'Crown Exchange',asset:'crown',position:new Vector3(328,0,-496),size:new Vector3(56,308,46)},
];
export const TRAVERSAL_ROUTES=[
 {name:'Crown ascent',points:[[0,4,44],[128,30,-176],[328,320,-496],[0,400,-720]]},
 {name:'Vesper rooftops',points:[[-626,3,-292],[-640,42,-368],[-704,90,-560],[-384,180,-432]]},
 {name:'Ironwake bridge run',points:[[128,50,350],[576,32,480],[880,25,512],[990,45,512]]},
];
export function randomFor(seed:number):()=>number {let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
export function tileKey(x:number,z:number):string{return `${Math.floor((x+1024)/128)},${Math.floor((z+1024)/128)}`;}
export function districtAt(x:number,z:number):DistrictId {
 if(x>420&&z>180)return 'industrial';if(x<-300&&z<-160)return 'gothic';if(x<-300)return 'residential';if(z<-176)return 'financial';return 'commercial';
}
export const PROFILES:Record<BuildingStyle,number[][]>={
 financial:[[0,.72,1,1],[.72,.2,.78,.82],[.92,.08,.54,.62]],
 deco:[[0,.62,1,1],[.62,.21,.83,.85],[.83,.12,.66,.7],[.95,.05,.44,.52]],
 gothic:[[0,.87,1,1],[.87,.13,.86,.9]],
 industrial:[[0,.82,1,1],[.82,.18,.68,.8]],
 residential:[[0,.94,1,1],[.94,.06,.88,.9]],
};
export class CityLayout {
 readonly buildings:Building[]=[];
 readonly roads:Road[]=[];
 readonly tiles=new Map<string,Tile>();
 readonly seed=CITY_SEED;
 constructor(){
  for(let z=0;z<16;z++)for(let x=0;x<16;x++)this.tiles.set(`${x},${z}`,{key:`${x},${z}`,x:-960+x*128,z:-960+z*128,buildings:[]});
  for(const x of CITY_PLAN.roadX){if(x>880)continue;const avenue=(CITY_PLAN.avenueX as readonly number[]).includes(x);this.roads.push({a:new Vector3(x,0,-1010),b:new Vector3(x,0,1005),width:avenue?26:16,hierarchy:avenue?'avenue':'secondary'});}
  for(const z of CITY_PLAN.roadZ){const avenue=(CITY_PLAN.avenueZ as readonly number[]).includes(z);this.roads.push({a:new Vector3(-1010,0,z),b:new Vector3(880,0,z),width:avenue?26:16,hierarchy:avenue?'avenue':'secondary'});}
  // Short port approach links the saved grid to the retained elevated bridge.
  this.roads.push({a:new Vector3(472,0,388),b:new Vector3(448,0,500),width:16,hierarchy:'service'});
  this.roads.push({a:new Vector3(580,24,512),b:new Vector3(1010,24,512),width:24,elevated:true});
  for(const saved of FIXED_CITY_BUILDINGS){const b={...saved,tile:tileKey(saved.x,saved.z)} as Building;this.buildings.push(b);this.tiles.get(b.tile)?.buildings.push(b);}
 }
 roofAt(x:number,z:number):number{
  for(const b of this.buildings)if(Math.abs(x-b.x)<b.w*.45&&Math.abs(z-b.z)<b.d*.45)return b.h;
  return 0;
 }
 signature():string{return JSON.stringify(this.buildings.map(b=>[b.x,b.z,b.w,b.d,b.h,b.style]));}
}
