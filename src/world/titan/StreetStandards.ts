import {districtAt} from '../CityLayout';
import {CITY_PLAN} from '../CityPlan';
import type {Building,DistrictId} from '../CityLayout';
export const STREET_STANDARDS:Record<DistrictId,{sidewalk:number;lane:number;parking:number;lampSpacing:number;lamp:'modern'|'historic';cornerCut:number;frontage:'corporate'|'shops'|'historic'|'service'}>={financial:{sidewalk:6,lane:3.2,parking:2.4,lampSpacing:31,lamp:'modern',cornerCut:1.8,frontage:'corporate'},commercial:{sidewalk:4.8,lane:3.2,parking:2.4,lampSpacing:28,lamp:'modern',cornerCut:1.5,frontage:'shops'},residential:{sidewalk:5.2,lane:3.1,parking:2.3,lampSpacing:30,lamp:'historic',cornerCut:1.5,frontage:'historic'},gothic:{sidewalk:4.6,lane:3.1,parking:2.3,lampSpacing:28,lamp:'historic',cornerCut:1.6,frontage:'historic'},industrial:{sidewalk:3.6,lane:3.6,parking:2.6,lampSpacing:34,lamp:'modern',cornerCut:1.8,frontage:'service'}};
export function streetKind(district:DistrictId,width:number,fixed:number){if(district==='industrial')return fixed>712?'waterfront':'industrial';if(width>20)return 'avenue';if((district==='commercial'||district==='residential')&&Math.abs(Math.round(fixed/112))%3===1)return 'one-way';return 'two-way';}
/** A five-sided paving corner with a genuine cut, returned as upward-facing triangles. */
export function cutCorner(x:number,z:number,sw:number,sx:number,sz:number,cut:number,y=.15){const p=[[cut,0],[sw,0],[sw,sw],[0,sw],[0,cut]].map(([a,b])=>[x+a*sx,y,z+b*sz]),v:number[]=[];for(let i=1;i<p.length-1;i++){const a=p[0],b=p[i],c=p[i+1],cross=(b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]);for(const q of cross>0?[a,c,b]:[a,b,c])v.push(...q);}return v;}

export function historicFrontages(buildings:readonly Building[]){const historic=buildings.filter(b=>b.district==='gothic'),links:{begin:number;end:number;z:number}[]=[];for(const left of historic){const begin=left.x+left.w/2;const right=historic.filter(b=>{const gap=b.x-b.w/2-begin,overlap=Math.min(left.z+left.d/2,b.z+b.d/2)-Math.max(left.z-left.d/2,b.z-b.d/2);return b.id!==left.id&&!!left.block&&b.block===left.block&&gap>2.5&&gap<15&&overlap>2.5;}).sort((a,b)=>a.x-b.x)[0];if(right)links.push({begin,end:right.x-right.w/2,z:Math.min(left.z+left.d/2,right.z+right.d/2)-.3});}return links;}

export const oneWayDirection=(fixed:number)=>Math.abs(Math.round(fixed/112))%2?1:-1;

/** Direction of a complete decorative traffic loop; zero means its one-way edges conflict. */
export function trafficLoopDirection(a:number,b:number,c:number,d:number){
 const width=(value:number,avenues:readonly number[])=>avenues.includes(value)?26:16;
 const cx=(a+b)/2,cz=(c+d)/2;
 return [1,-1].find(direction=>[
  [c,width(c,CITY_PLAN.avenueZ),cx,c,direction],[d,width(d,CITY_PLAN.avenueZ),cx,d,-direction],
  [a,width(a,CITY_PLAN.avenueX),a,cz,-direction],[b,width(b,CITY_PLAN.avenueX),b,cz,direction],
 ].every(([fixed,w,x,z,travel])=>streetKind(districtAt(x,z),w,fixed)!=='one-way'||oneWayDirection(fixed)===travel))??0;
}
