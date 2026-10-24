import {CanvasTexture,MeshStandardMaterial,PlaneGeometry,SRGBColorSpace} from 'three';
import {AssetLibrary} from '../environment/AssetLibrary';import {CityLayout,districtAt} from '../CityLayout';import {CITY_PLAN} from '../CityPlan';import {historicFrontages} from './StreetStandards';
type Add=(key:string,x:number,y:number,z:number,angle?:number,range?:number,w?:number,h?:number,d?:number,owner?:number)=>void;
/** One original fictional sign atlas, reused by facade sockets throughout the saved city. */
export function installDistrictSigns(assets:AssetLibrary){
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;const ctx=canvas.getContext('2d')!;
 const brands=['CROWN / TRUST','MERIDIAN COFFEE','VESPER RECORDS','IRONWAKE SUPPLY','ORBIT DAILY','FENN & CO.','NOCTURNE ELECTRIC','AURELIA MARKET'];
 ctx.fillStyle='#142127';ctx.fillRect(0,0,1024,512);
 for(let i=0;i<brands.length;i++){const x=i%2*512,y=Math.floor(i/2)*128;ctx.fillStyle=['#263b43','#36312d','#282936','#302c27'][i%4];ctx.fillRect(x+4,y+4,504,120);ctx.strokeStyle='#b29a6a';ctx.strokeRect(x+12,y+12,488,104);ctx.textAlign='center';ctx.fillStyle='#eadfc2';ctx.font='bold 29px Georgia';ctx.fillText(brands[i],x+256,y+66);ctx.font='12px Arial';ctx.fillStyle='#afc3c4';ctx.fillText(['CROWN EXCHANGE','PRISM MIDTOWN','SAINT VESPER','IRONWAKE DOCKS'][i%4],x+256,y+92);}
 const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;texture.anisotropy=2;
 for(let i=0;i<brands.length;i++){const geometry=new PlaneGeometry(4.8,.82),uv=geometry.getAttribute('uv');for(let v=0;v<uv.count;v++){uv.setXY(v,(uv.getX(v)+i%2)/2,(uv.getY(v)+3-Math.floor(i/2))/4);}const material=new MeshStandardMaterial({name:'titan9_sign_'+i,map:texture,emissiveMap:texture,emissive:'#ffffff',emissiveIntensity:.42,roughness:.7});material.onBeforeCompile=s=>{s.uniforms.signNight=assets.materials.uniforms.night;s.fragmentShader='uniform float signNight;\n'+s.fragmentShader;s.fragmentShader=s.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance*=.1+signNight*.9;');};material.customProgramCacheKey=()=> 'phase9-fictional-sign';assets.materials.adopt(material.name,material);assets.parts.set('titan9_shop_sign_'+i,[{geometry,material:material.name}]);}
}
/** Deliberate frontage bays, service edges and curb parking; no random building generation. */
export function composeLivingBlocks(layout:CityLayout,add:Add){
 const reserved=(x:number,z:number)=>Math.abs(x)<112&&z>-160&&z<100;
 for(const b of layout.buildings){if(!b.family||reserved(b.x,b.z))continue;const a=b.angle??0,co=Math.cos(a),si=Math.sin(a),district=districtAt(b.x,b.z),flat=!b.family.startsWith('aer_')&&b.family!=='city_singapore'&&b.family!=='city_citadel';
  const socket=(key:string,u:number,v:number,y=0.15,w=1,h=1,d=1,turn=0)=>add(key,b.x+u*co+v*si,y,b.z-u*si+v*co,a+turn,110,w,h,d,b.id);
  if(flat&&b.w>17){const bays=district==='financial'?1:Math.min(4,Math.max(1,Math.floor(b.w/9))),span=Math.min(b.w-9,bays*7.4),front=b.d/2+.16;
   for(let j=0;j<bays;j++){const u=bays===1?0:-span/2+j*span/(bays-1);if(district!=='industrial'){socket(district==='gothic'?'titan9_storefront':'titan10_lobby_canopy',u,front,.15,1,1,1);socket('titan9_shop_sign_'+((b.id+j+(district==='gothic'?2:district==='financial'?0:1))%8),u,front+.20,3.63);}else socket('titan9_service_bank',u,-front,.15);}
   if(b.h<85&&(district==='commercial'||district==='residential')&&b.id%3===0)socket('titan9_fire_escape',b.w/2+.3,0,0,1,1,1,Math.PI/2);
   if(district==='gothic'||district==='residential')for(const side of [-1,1])for(let j=0;j<Math.min(3,Math.floor(b.w/11));j++)socket('titan9_railing',side*(5+j*3),front+2.8,.15);
   if(district==='industrial'){socket('titan9_service_bank',b.w/2+.15,0,.15,1,1,1,Math.PI/2);socket('realism_dumpster',b.w*.3,-front-1.2);for(let j=0;j<3;j++)socket('realism_fence',-b.w*.3+j*2.4,-front-1.4);}
  }
 }
 // Two reserved curb spaces per block edge compress broad avenues visually.
 for(let xi=1;xi<CITY_PLAN.roadX.length-1;xi++)for(let zi=0;zi<CITY_PLAN.roadZ.length-1;zi++){
  const x=CITY_PLAN.roadX[xi],z=CITY_PLAN.roadZ[zi],end=CITY_PLAN.roadZ[zi+1],width=(CITY_PLAN.avenueX as readonly number[]).includes(x)?26:16;if(reserved(x,z+45)||x>880||end-z<90)continue;
  for(let j=0;j<2;j++){const side=(xi+zi)%2?1:-1;add('titan9_parked_car',x+side*(width/2-1.1),.02,z+39+j*12,side>0?Math.PI:0,130);}
 }
 for(const {begin,end,z} of historicFrontages(layout.buildings))if(end-begin>6&&end-begin<18)add('titan9_courtyard_span',(begin+end)/2,0,z,0,155,(end-begin)/6.5,1,1);
 // The review intersection: a bus waiting area, protected seating and a service edge.
 for(const [x,z] of [[250,-453],[250,-457],[250,-461]])add('titan9_railing',x,.15,z,Math.PI/2,125);
 add('titan9_parked_car',243.6,.02,-459,Math.PI,145);add('titan9_parked_car',243.6,.02,-447,Math.PI,145);
 add('titan9_service_bank',218,.15,-454,Math.PI/2,115);
}
