import {CityLayout,districtAt,LANDMARKS} from '../src/world/CityLayout.ts';import {readFile,writeFile} from 'node:fs/promises';
const city=JSON.parse(await readFile('public/assets/environment/premium/city/components.json','utf8')),provided=JSON.parse(await readFile('public/assets/environment/premium/provided/components.json','utf8'));
const families=[...provided.families,...city.families].map(f=>({...f,buildingId:f.buildingId??-1,x:f.x??0,z:f.z??0}));
const sx=[-960,-816,-704,-576,-448,-320,-192,-112,0,128,256,400,544,704,832,960],sz=[-960,-816,-688,-560,-432,-304,-176,-48,96,224,352,480,624,768,912];
const original=new CityLayout(),placed=[],used=new Set(),prototypes=new Set([211,235,287]);
const choices=d=>families.filter(f=>f.id.startsWith('city_')&&(f.district===d||d==='residential'&&['city_brownstoneoffice_1','city_brownstoneoffice_2','city_brutal_1'].includes(f.id))&&f.id!=='city_citadel'&&f.id!=='city_singapore');
function placement(old,f,scale=1,x=old.x,z=old.z){return {...old,x,z,w:f.width*scale,d:f.depth*scale,h:f.height*scale,assetHeight:f.height,family:f.id,style:f.style,angle:z<(sz.find(n=>n>z)??1024)-55?Math.PI:0,roof:'roofkit'};}
for(const old of original.buildings){
 if(used.has(old.id))continue;
 if(prototypes.has(old.id)){const f=old.id===287?families.find(f=>f.id==='city_brownstoneoffice_2'):families.find(f=>f.buildingId===old.id);placed.push(placement(old,f,1));used.add(old.id);continue;}
 const xi=sx.findIndex((n,i)=>sx[i+1]!==undefined&&old.x>=n&&old.x<sx[i+1]),zi=sz.findIndex((n,i)=>sz[i+1]!==undefined&&old.z>=n&&old.z<sz[i+1]);
 const left=sx[xi]+20,right=sx[xi+1]-20,front=sz[zi]+20,back=sz[zi+1]-20;
 const siblings=original.buildings.filter(b=>!used.has(b.id)&&!prototypes.has(b.id)&&b.x>=left&&b.x<=right&&Math.abs(b.z-old.z)<1);
 const pool=choices(old.district);let f=pool[(xi*3+zi*5+old.id%3)%pool.length],width=siblings.length>1?right-left:Math.min(right-left,old.w+3),depth=Math.min(back-front,old.d+3),scale=Math.min(1,width/f.width,depth/f.depth);
 if(scale<.82){f=pool.filter(a=>a.width*.82<=width&&a.depth*.82<=depth).sort((a,b)=>Math.abs(a.height-f.height)-Math.abs(b.height-f.height))[0]??pool.reduce((a,b)=>a.width*a.depth<b.width*b.depth?a:b);scale=Math.min(1,width/f.width,depth/f.depth);}
 if(scale<.65)continue;
 const wide=f.width*scale>old.w+4&&siblings.length>1,x=wide?(left+right)/2:old.x;
 const block=siblings.filter(b=>wide||b.id===old.id);block.forEach(b=>used.add(b.id));placed.push(placement(old,f,scale,x));
}
for(const [index,l] of LANDMARKS.entries()){
 const f=families.find(f=>f.id===(l.asset==='crown'?'city_citadel':'city_vesper_6'));
 placed.push(placement({id:9001+index,x:l.position.x,z:l.position.z,district:l.asset==='crown'?'financial':'gothic',tile:`${Math.floor((l.position.x+1024)/128)},${Math.floor((l.position.z+1024)/128)}`},f,1));placed.at(-1).landmark=l.asset;
}
const layout={worldSize:[2048,2048],buildings:placed,originalLotCount:original.buildings.length,note:'Fixed supplied-model placements. Paired parcels hold complete wide blocks; models are uniformly scaled, with road and deployment reservations preserved.'};
await writeFile('art/environment/phase7/city-layout.json',JSON.stringify(layout,null,2));await writeFile('src/world/FixedCityLayout.ts','// Saved architectural placements; edit the JSON and regenerate when authoring the city.\nexport const FIXED_CITY_BUILDINGS = '+JSON.stringify(placed,null,1)+';\n');
await writeFile('src/world/DestructibleFamilies.ts','export const DESTRUCTIBLE_FAMILIES = '+JSON.stringify(families,null,1)+' as const;\n');
await writeFile('public/assets/environment/premium/city/runtime-components.json',JSON.stringify({families,components:[...provided.components,...city.components]},null,2));console.log('Fixed city placements',placed.length,'families',families.length);
