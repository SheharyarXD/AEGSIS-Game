import { BufferAttribute, BufferGeometry, Group, InstancedMesh, Matrix4, Mesh, Vector3 } from 'three';
import { CityLayout, districtAt } from '../CityLayout';
import { CITY_PLAN } from '../CityPlan';
import { placement } from '../WorldStreaming';
import { STREET_STANDARDS, cutCorner, streetKind, historicFrontages, oneWayDirection } from '../titan/StreetStandards';
import { composeLivingBlocks,installDistrictSigns } from '../titan/LivingBlock';
import { installStreetSigns } from './StreetSigns';
import { StreetMaterials } from './StreetMaterials';
import { AssetLibrary } from './AssetLibrary';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
interface Slot {key:string;matrix:Matrix4;x:number;z:number;range:number;buildingId?:number;}
/** The saved road hierarchy owns the paving, crosswalks, curb ramps and furniture strip. */
export class UrbanSurfaces {
 readonly group=new Group();private geometry:BufferGeometry[]=[];private slots:Slot[]=[];
 readonly colliders:import('../../physics/PhysicsWorld').RAPIER.Collider[]=[];
 private pools=new Map<string,{capacity:number;meshes:InstancedMesh[]}>();private last='';private range=140;private materials:StreetMaterials;readonly lightPositions:Vector3[]=[];private disposeSigns:()=>void;
 constructor(layout:CityLayout,private assets:AssetLibrary,private physics?:PhysicsWorld){
  installDistrictSigns(assets);this.materials=new StreetMaterials(assets.materials);this.disposeSigns=installStreetSigns(assets);
  const asphalt:number[]=[],paving:number[]=[],paint:number[]=[],wear:number[]=[];
  const rect=(a:number[],x:number,z:number,w:number,d:number,y:number)=>{for(const [xx,zz] of [[-1,-1],[-1,1],[1,1],[-1,-1],[1,1],[1,-1]])a.push(x+xx*w/2,y,z+zz*d/2);};
  const reserved=(x:number,z:number)=>Math.abs(x)<111&&z>-160&&z<100;
  const roadWidth=(v:number,axis:'X'|'Z')=>(CITY_PLAN[axis==='X'?'avenueX':'avenueZ'] as readonly number[]).includes(v)?26:16;
  const sidewalk=(x:number,z:number)=>STREET_STANDARDS[districtAt(x,z)].sidewalk;
  const add=(key:string,x:number,y:number,z:number,angle=0,range=135,w=1,h=1,d=1,buildingId?:number)=>{if(key==='urban_lamp'&&STREET_STANDARDS[districtAt(x,z)].lamp==='historic')key='titan_historic_lamp';this.slots.push({key,x,z,range,buildingId,matrix:placement(x,y,z,w,h,d,angle)});if(key==='urban_lamp')this.slots.push({key:'realism_lamp_lens',x,z,range,matrix:placement(x,y,z,w,h,d,angle)});if(key==='realism_signpost')this.slots.push({key:'realism_sign_label',x,z,range,matrix:placement(x,y,z,w,h,d,angle)});};
  for(const road of layout.roads){if(road.elevated)continue;const vertical=road.a.x===road.b.x,horizontal=road.a.z===road.b.z;if(!vertical&&!horizontal)continue;
   const start=vertical?road.a.z:road.a.x,end=vertical?road.b.z:road.b.x,fixed=vertical?road.a.x:road.a.z;
   const cuts=vertical?CITY_PLAN.roadZ:CITY_PLAN.roadX;
   // Small road sections are easy to cull and avoid painting through Claude's compound.
   for(let t=start;t<end;t+=8){const x=vertical?fixed:t+4,z=vertical?t+4:fixed;if(reserved(x,z))continue;rect(asphalt,x,z,vertical?road.width:8,vertical?8:road.width,.012);
    const kind=streetKind(districtAt(x,z),road.width,fixed);const intersection=cuts.some(c=>Math.abs(c-(t+4))<17);if(!intersection&&Math.floor(t/8)%2===0){for(const offset of road.width>20?[-3,3]:[0])rect(paint,vertical?x+offset:x,vertical?z:z+offset,vertical?.12:3.5,vertical?3.5:.12,.025);}
    if(!intersection&&road.width>20){for(const offset of [-road.width/2+2.4,road.width/2-2.4])rect(paint,vertical?x+offset:x,vertical?z:z+offset,vertical?.10:7.8,vertical?7.8:.10,.027);}
    if(!intersection&&kind==='one-way'&&Math.floor(t/8)%8===0){const dir=oneWayDirection(fixed);for(const lane of [-1.65,1.65]){const px=x+(vertical?lane:0),pz=z+(vertical?0:lane);rect(paint,px,pz,vertical?.20:3,vertical?3:.20,.03);const points=vertical?[[px-.62,pz+dir*.45],[px+.62,pz+dir*.45],[px,pz+dir*1.7]]:[[px+dir*.45,pz-.62],[px+dir*.45,pz+.62],[px+dir*1.7,pz]],cross=(points[1][0]-points[0][0])*(points[2][1]-points[0][1])-(points[1][1]-points[0][1])*(points[2][0]-points[0][0]);for(const [xx,zz] of cross>0?[points[0],points[2],points[1]]:points)paint.push(xx,.03,zz);}}
    if(!intersection&&Math.floor(t/8)%9===0){rect(wear,x+2,z+1,vertical?2.8:4.3,vertical?4.3:2.8,.014);add('urban_manhole',x-2,.025,z+2,0,95);}
   }
  }
  for(let j=0;j<CITY_PLAN.roadZ.length-1;j++)for(let i=0;i<CITY_PLAN.roadX.length-1;i++){
   const x0=CITY_PLAN.roadX[i],x1=CITY_PLAN.roadX[i+1],z0=CITY_PLAN.roadZ[j],z1=CITY_PLAN.roadZ[j+1],cx=(x0+x1)/2,cz=(z0+z1)/2;
   if(reserved(cx,cz)||x0>=832&&z0>388)continue;
   const sw=sidewalk(cx,cz),l=x0+roadWidth(x0,'X')/2,r=Math.min(878,x1-roadWidth(x1,'X')/2),f=z0+roadWidth(z0,'Z')/2,b=z1-roadWidth(z1,'Z')/2;
   rect(paving,(l+r)/2,f+sw/2,r-l-2*sw,sw,.15);rect(paving,(l+r)/2,b-sw/2,r-l-2*sw,sw,.15);for(const [x,z,sx,sz] of [[l,f,1,1],[r,f,-1,1],[l,b,1,-1],[r,b,-1,-1]])paving.push(...cutCorner(x,z,sw,sx,sz,STREET_STANDARDS[districtAt(cx,cz)].cornerCut));
   rect(paving,l+sw/2,(f+b)/2,sw,b-f-2*sw,.15);rect(paving,r-sw/2,(f+b)/2,sw,b-f-2*sw,.15);
   if(physics)for(const [x,z,w,d] of [[(l+r)/2,f+sw/2,r-l-4,sw],[(l+r)/2,b-sw/2,r-l-4,sw],[l+sw/2,(f+b)/2,sw,b-f-2*sw],[r-sw/2,(f+b)/2,sw,b-f-2*sw]])this.colliders.push(physics.box(new Vector3(x,.075,z),new Vector3(w,.15,d)));
   // The back-of-house six-metre alley follows the building frontage plan.
   rect(asphalt,cx,cz,Math.max(0,r-l-2*sw),6,.013);
   for(const edge of [f,b])for(let x=l+6;x<r-5;x+=2)add('urban_curb',x,.02,edge,0,115);
   for(const edge of [l,r])for(let z=f+6;z<b-5;z+=2)add('urban_curb',edge,.02,z,Math.PI/2,115);
   for(const x of [l+1.2,r-1.2])for(const z of [f+1.2,b-1.2])add('urban_ramp',x,.04,z,z<cz?0:Math.PI,90);
   for(const z of [f+.7,b-.7])for(let n=0,x=l+12;x<r-5;x+=STREET_STANDARDS[districtAt(cx,cz)].lampSpacing,n++){
    const angle=z<cz?0:Math.PI;add('urban_lamp',x,.15,z,angle,165);
    if((n+i+j)%3===1)add('realism_newspaper',x-2,.15,z,angle,105);
    if((i+j+n)%4===2)add('titan_bike_rack',x+7,.15,z,angle,95);
    if((n+i*2+j)%4===1)add('realism_planter',x+6,.15,z+.6*(z<cz?1:-1),angle,115);
    add(n%3===0?'urban_hydrant':n%3===1?'urban_bin_round':'urban_meter',x+3,.15,z,angle,120);
    add('urban_drain',x+7,.018,z<cz?f-.25:b+.25,angle,90);
    if((i+j+n)%3===0){add('urban_treepit',x+12,.151,z+.7*(z<cz?1:-1),0,110);add('realism_tree',x+12,.15,z+.7*(z<cz?1:-1),0,135,.85,.95,.85);}
    if((i+j+n)%4===0){add('urban_bench',x+18,.15,z+1.1*(z<cz?1:-1),angle,135);add('urban_mailbox',x+21,.15,z,angle,115);}
   }
   for(const x of [l+.7,r-.7])for(let n=0,z=f+15;z<b-8;z+=STREET_STANDARDS[districtAt(cx,cz)].lampSpacing,n++){
    const inward=x<cx?1:-1,angle=inward>0?Math.PI/2:-Math.PI/2;add('urban_lamp',x,.15,z,angle,165);add(n%2?'urban_meter':'urban_hydrant',x,.15,z+3,angle,115);add('urban_drain',x-inward*.9,.018,z+8,Math.PI/2,90);if((n+i+j)%4===0){add('realism_newspaper',x,.15,z+5,angle,110);add('urban_bench',x+inward*.6,.15,z+8,angle,120);}
    if((i+j+n)%3===0){add('urban_treepit',x+inward*.9,.151,z+13,0,110);add('realism_tree',x+inward*.9,.15,z+13,0,135,.85,.95,.85);}
   }
   if(i%3===0&&j%3===0){add('urban_busstop',l+16,.15,f+2.1,0,150);add('urban_utility',r-8,.15,b-2,0,130);}
   if(districtAt(cx,cz)==='industrial'){add('urban_barrier',l+12,.15,b-1,0,140);add('urban_bin',r-9,.15,f+2,0,140);add('urban_bag',r-7,.15,f+2,0,95);add('realism_dumpster',cx-8,.03,cz+2,0,115);for(let k=0;k<3;k++)add('realism_fence',l+16+k*2.4,.15,b-1,0,125);add('realism_vent',r-12,.15,b-1,0,110);}
  }
  // The review block has a deliberately composed reading corner, loading edge and bus waiting strip.
  for(const [key,x,z,a] of [['realism_newspaper',245.9,-449,Math.PI/2],['urban_bench',250.1,-439,-Math.PI/2],['realism_planter',250.3,-444,Math.PI/2],['urban_bin_round',245.9,-452,0],['realism_signpost',247,-481,0],['urban_busstop',249.5,-465,Math.PI/2]] as const)add(key,x,.15,z,a,125);
  // Facade sockets follow each source model's saved front orientation. Keep entrances and walkways open.
  for(const b of layout.buildings){if(!b.family||reserved(b.x,b.z))continue;const a=b.angle??0,co=Math.cos(a),si=Math.sin(a),front=b.d/2+.4;const socket=(key:string,u:number,v:number,angle=a)=>{add(key,b.x+u*co+v*si,.15,b.z-u*si+v*co,angle,115);if(key==='realism_canopy'||key==='titan_lobby_portal')this.slots[this.slots.length-1].buildingId=b.id;};
   if(/classic|deco|midrise|arcade/i.test(b.family)&&b.w>22){socket('realism_canopy',0,front,a+Math.PI);socket('realism_planter',-4,front+1.2);socket('realism_planter',4,front+1.2);}
   if(/classic|deco|arcade|brownstone/.test(b.family)&&b.w>20){socket('titan_lobby_portal',0,front,a);socket('titan_basement_grate',-5,front+1.2);if(/brownstone/.test(b.family))socket('titan_stoop',0,front+1.0);}
   if(districtAt(b.x,b.z)==='industrial'||b.family.includes('industrial')){socket('realism_dumpster',b.w/2+1.2,-b.d*.15,a+Math.PI/2);socket('realism_vent',0,-front,a);}
  }
  // Join small historic frontage gaps with low stone boundaries and open gates, never across roads.
  for(const {begin,end,z} of historicFrontages(layout.buildings)){const center=(begin+end)/2,gap=end-begin;for(let x=begin+1.2;x<end-1;x+=2.4)if(gap<7||Math.abs(x-center)>2.7)add('titan_courtyard_wall',x,.15,z,0,125);if(gap>7)add('titan_courtyard_gate',center,.15,z,0,135);}
  for(const x of CITY_PLAN.roadX)for(const z of CITY_PLAN.roadZ){if(x>880||reserved(x,z)||x>=832&&z>388)continue;
   const wx=roadWidth(x,'X'),wz=roadWidth(z,'Z');
   for(const side of [-1,1]){add('realism_pedestrian_signal',x+side*(wx/2+1.2),.15,z-side*(wz/2+1.8),side>0?0:Math.PI,105);if(wx>20||wz>20)add('realism_signpost',x+side*(wx/2+2.3),.15,z+side*(wz/2+2),side>0?0:Math.PI,115);}
   // Four approach bars and turn arrows sit behind the pedestrian crossing.
   for(const side of [-1,1]){rect(paint,x+side*(wx/4),z-side*(wz/2+5.1),wx/2-.5,.25,.029);if(wx>20){const px=x+side*4.6,pz=z-side*(wz/2+19);rect(paint,px,pz,.23,3,.03);if(side>0)paint.push(px-.75,.03,pz+side*.6,px,.03,pz+side*2,px+.75,.03,pz+side*.6);else paint.push(px-.75,.03,pz+side*.6,px+.75,.03,pz+side*.6,px,.03,pz+side*2);}}
   for(const side of [-1,1])for(let n=0;n<Math.floor(wx/1.4);n++)rect(paint,x-wx/2+.7+n*1.4,z+side*(wz/2+2.6),.68,3.8,.03);
   for(const side of [-1,1])for(let n=0;n<Math.floor(wz/1.4);n++)rect(paint,x+side*(wx/2+2.6),z-wz/2+.7+n*1.4,3.8,.68,.03);
   for(const side of [-1,1]){rect(paint,x+side*wx/4,z+side*(wz/2+5.1),wx/2-.5,.25,.029);if(wx>20||wz>20)add('urban_signal',x+side*(wx/2+1),.15,z+side*(wz/2+7.5),side<0?0:Math.PI,150);}
  }
  composeLivingBlocks(layout,add);
  for(const [vertices,material] of [[asphalt,'road'],[paving,'paving'],[paint,'paint'],[wear,'patch']] as const){
   const g=new BufferGeometry();g.setAttribute('position',new BufferAttribute(new Float32Array(vertices),3));const uv=new Float32Array(vertices.length/3*2);for(let i=0;i<vertices.length/3;i++){uv[i*2]=vertices[i*3]/3;uv[i*2+1]=vertices[i*3+2]/3;}g.setAttribute('uv',new BufferAttribute(uv,2));g.computeVertexNormals();g.computeBoundingSphere();this.geometry.push(g);const mesh=new Mesh(g,this.materials[material]);mesh.receiveShadow=true;mesh.name='Saved urban '+material;this.group.add(mesh);
  }
 }
 setQuality(q:string){this.materials.setQuality(q);this.range=q==='LOW'?135:q==='MEDIUM'?165:q==='HIGH'?195:220;this.last='';}
 reset(){this.last='';}
 update(point:Vector3,damaged?:ReadonlyMap<number,{stage:string}>){const collapsed=new Set([...damaged??[]].filter(([,s])=>s.stage==='collapsed').map(([id])=>id));const key=`${Math.floor(point.x/12)},${Math.floor(point.z/12)},${Math.floor(point.y/24)}:${[...collapsed].join()} `;if(key===this.last)return;this.last=key;this.lightPositions.length=0;const lamps=this.slots.filter(s=>(s.key==='urban_lamp'||s.key==='titan_historic_lamp')&&Math.hypot(s.x-point.x,s.z-point.z)<80).sort((a,b)=>Math.hypot(a.x-point.x,a.z-point.z)-Math.hypot(b.x-point.x,b.z-point.z));for(const s of lamps.slice(0,8))this.lightPositions.push(new Vector3(s.x,4.17,s.z));this.materials.update(this.lightPositions);const lists=new Map<string,Matrix4[]>();
  for(const s of this.slots)if(!(s.buildingId&&collapsed.has(s.buildingId))&&Math.hypot(point.x-s.x,point.z-s.z,Math.max(0,point.y-8))<Math.min(s.range,this.range)){const a=lists.get(s.key)??[];a.push(s.matrix);lists.set(s.key,a);}
  for(const key of new Set([...this.pools.keys(),...lists.keys()])){const matrices=lists.get(key)??[];let pool=this.pools.get(key);if(matrices.length>(pool?.capacity??0)){if(pool)for(const m of pool.meshes){m.dispose();m.removeFromParent();}const capacity=2**Math.ceil(Math.log2(Math.max(8,matrices.length)));pool={capacity,meshes:this.assets.instance(key,Array.from({length:capacity},()=>new Matrix4().makeScale(0,0,0)),this.group,false)};this.pools.set(key,pool);}if(pool)for(const m of pool.meshes){m.count=matrices.length;m.visible=matrices.length>0;matrices.forEach((matrix,i)=>m.setMatrixAt(i,matrix));m.instanceMatrix.needsUpdate=true;m.computeBoundingSphere();}}
 }
 diagnostics(){return {plannedPropSlots:this.slots.length,activeProps:[...this.pools.values()].reduce((n,p)=>n+(p.meshes[0]?.count??0),0)};}
 dispose(){this.disposeSigns();this.materials.dispose();for(const c of this.colliders)this.physics?.removeCollider(c);this.colliders.length=0;for(const g of this.geometry)g.dispose();for(const p of this.pools.values())for(const m of p.meshes)m.dispose();this.group.removeFromParent();}
}
