import {writeFile,readFile} from 'node:fs/promises';
import {CityLayout} from '../src/world/CityLayout';
import {CITY_PLAN} from '../src/world/CityPlan';
import {STREET_STANDARDS,historicFrontages,trafficLoopDirection} from '../src/world/titan/StreetStandards';
import {TITAN_CONFIG} from '../src/world/titan/TitanConfig';
import {WORLD_QUALITY} from '../src/world/WorldStreaming';

// Static plan/configuration report. No renderer, DOM, server, browser or game.
const layout=new CityLayout();
let trafficLoops=0;
for(let x=0;x<CITY_PLAN.roadX.length-1;x++)for(let z=0;z<CITY_PLAN.roadZ.length-1;z++){
 const a=CITY_PLAN.roadX[x],b=CITY_PLAN.roadX[x+1],c=CITY_PLAN.roadZ[z],d=CITY_PLAN.roadZ[z+1];
 if(a<112&&b>-112&&c<100&&d>-160||b>832)continue;
 if(trafficLoopDirection(a,b,c,d))trafficLoops++;
}
const catalog=JSON.parse(await readFile('public/assets/environment/metropolis/runtime-components.json','utf8'));
const report={worldMeters:[2048,2048],buildings:layout.buildings.length,sourceFamilies:catalog.families.map((f:{id:string;name:string;source?:string})=>({id:f.id,name:f.name,source:f.source,placements:layout.buildings.filter(b=>b.family===f.id).length})),districts:CITY_PLAN.districts.map(d=>({id:d.id,name:d.name,buildings:layout.buildings.filter(b=>b.district===d.id).length,standards:STREET_STANDARDS[d.id]})),historicFrontageLinks:historicFrontages(layout.buildings),trafficLoops,quality:WORLD_QUALITY,destruction:TITAN_CONFIG,showcases:layout.buildings.filter(b=>b.damageClass==='full'||b.id===287).map(b=>({id:b.id,family:b.family,x:b.x,z:b.z,width:b.w,depth:b.d,height:b.h,damageClass:b.damageClass})),note:'Configuration and saved-plan facts only. These budgets are not measured FPS or guaranteed frame times.'};
await writeFile('artifacts/phase8/street-standard.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({buildings:report.buildings,families:report.sourceFamilies.length,districts:report.districts.length,historicLinks:report.historicFrontageLinks.length,trafficLoops}));
