import { BufferAttribute, BufferGeometry, Group, InstancedMesh, Matrix4, Mesh, Vector3 } from 'three';
import { CityLayout, districtAt } from '../CityLayout';
import { CITY_PLAN } from '../CityPlan';
import { placement } from '../WorldStreaming';
import { AssetLibrary } from './AssetLibrary';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
interface Slot {key:string;matrix:Matrix4;x:number;z:number;range:number;}
/** The saved road hierarchy owns the paving, crosswalks, curb ramps and furniture strip. */
export class UrbanSurfaces {
 readonly group=new Group();private geometry:BufferGeometry[]=[];private slots:Slot[]=[];
 readonly colliders:import('../../physics/PhysicsWorld').RAPIER.Collider[]=[];
 private pools=new Map<string,{capacity:number;meshes:InstancedMesh[]}>();private last='';private range=140;
 constructor(layout:CityLayout,private assets:AssetLibrary,private physics?:PhysicsWorld){
  const asphalt:number[]=[],paving:number[]=[],paint:number[]=[],wear:number[]=[];
  const rect=(a:number[],x:number,z:number,w:number,d:number,y:number)=>{for(const [xx,zz] of [[-1,-1],[-1,1],[1,1],[-1,-1],[1,1],[1,-1]])a.push(x+xx*w/2,y,z+zz*d/2);};
  const reserved=(x:number,z:number)=>Math.abs(x)<111&&z>-160&&z<100;
  const roadWidth=(v:number,axis:'X'|'Z')=>(CITY_PLAN[axis==='X'?'avenueX':'avenueZ'] as readonly number[]).includes(v)?26:16;
  const sidewalk=(x:number,z:number)=>CITY_PLAN.districts.find(d=>d.id===districtAt(x,z))!.sidewalkWidth;
  const add=(key:string,x:number,y:number,z:number,angle=0,range=135,w=1,h=1,d=1)=>this.slots.push({key,x,z,range,matrix:placement(x,y,z,w,h,d,angle)});
  for(const road of layout.roads){if(road.elevated)continue;const vertical=road.a.x===road.b.x,horizontal=road.a.z===road.b.z;if(!vertical&&!horizontal)continue;
   const start=vertical?road.a.z:road.a.x,end=vertical?road.b.z:road.b.x,fixed=vertical?road.a.x:road.a.z;
   const cuts=vertical?CITY_PLAN.roadZ:CITY_PLAN.roadX;
   // Small road sections are easy to cull and avoid painting through Claude's compound.
   for(let t=start;t<end;t+=8){const x=vertical?fixed:t+4,z=vertical?t+4:fixed;if(reserved(x,z))continue;rect(asphalt,x,z,vertical?road.width:8,vertical?8:road.width,.012);
    const intersection=cuts.some(c=>Math.abs(c-(t+4))<17);if(!intersection&&Math.floor(t/8)%2===0){for(const offset of road.width>20?[-3,3]:[0])rect(paint,vertical?x+offset:x,vertical?z:z+offset,vertical?.12:3.5,vertical?3.5:.12,.025);}
    if(!intersection&&Math.floor(t/8)%9===0){rect(wear,x+2,z+1,vertical?2.8:4.3,vertical?4.3:2.8,.014);add('urban_manhole',x-2,.025,z+2,0,95);}
   }
  }
  for(let j=0;j<CITY_PLAN.roadZ.length-1;j++)for(let i=0;i<CITY_PLAN.roadX.length-1;i++){
   const x0=CITY_PLAN.roadX[i],x1=CITY_PLAN.roadX[i+1],z0=CITY_PLAN.roadZ[j],z1=CITY_PLAN.roadZ[j+1],cx=(x0+x1)/2,cz=(z0+z1)/2;
   if(reserved(cx,cz)||x0>=832&&z0>388)continue;
   const sw=sidewalk(cx,cz),l=x0+roadWidth(x0,'X')/2,r=Math.min(878,x1-roadWidth(x1,'X')/2),f=z0+roadWidth(z0,'Z')/2,b=z1-roadWidth(z1,'Z')/2;
   rect(paving,(l+r)/2,f+sw/2,r-l,sw,.15);rect(paving,(l+r)/2,b-sw/2,r-l,sw,.15);
   rect(paving,l+sw/2,(f+b)/2,sw,b-f-2*sw,.15);rect(paving,r-sw/2,(f+b)/2,sw,b-f-2*sw,.15);
   if(physics)for(const [x,z,w,d] of [[(l+r)/2,f+sw/2,r-l-4,sw],[(l+r)/2,b-sw/2,r-l-4,sw],[l+sw/2,(f+b)/2,sw,b-f-2*sw],[r-sw/2,(f+b)/2,sw,b-f-2*sw]])this.colliders.push(physics.box(new Vector3(x,.075,z),new Vector3(w,.15,d)));
   // The back-of-house six-metre alley follows the building frontage plan.
   rect(asphalt,cx,cz,Math.max(0,r-l-2*sw),6,.013);
   for(const edge of [f,b])for(let x=l+3;x<r-2;x+=2)add('urban_curb',x,.02,edge,0,115);
   for(const edge of [l,r])for(let z=f+3;z<b-2;z+=2)add('urban_curb',edge,.02,z,Math.PI/2,115);
   for(const x of [l+1.2,r-1.2])for(const z of [f+1.2,b-1.2])add('urban_ramp',x,.04,z,z<cz?0:Math.PI,90);
   for(const z of [f+.7,b-.7])for(let n=0,x=l+12;x<r-5;x+=31,n++){
    const angle=z<cz?0:Math.PI;add('urban_lamp',x,.15,z,angle,165);
    add(n%3===0?'urban_hydrant':n%3===1?'urban_bin_round':'urban_meter',x+3,.15,z,angle,120);
    add('urban_drain',x+7,.018,z<cz?f-.25:b+.25,angle,90);
    if((i+j+n)%3===0){add('urban_treepit',x+12,.151,z+.7*(z<cz?1:-1),0,110);add('tree',x+12,.15,z+.7*(z<cz?1:-1),0,140,.55,.8,.55);}
    if((i+j+n)%4===0){add('urban_bench',x+18,.15,z+1.1*(z<cz?1:-1),angle,135);add('urban_mailbox',x+21,.15,z,angle,115);}
   }
   for(const x of [l+.7,r-.7])for(let n=0,z=f+15;z<b-8;z+=31,n++){
    const inward=x<cx?1:-1,angle=inward>0?Math.PI/2:-Math.PI/2;add('urban_lamp',x,.15,z,angle,165);add(n%2?'urban_meter':'urban_hydrant',x,.15,z+3,angle,115);add('urban_drain',x-inward*.9,.018,z+8,Math.PI/2,90);
    if((i+j+n)%3===0){add('urban_treepit',x+inward*.9,.151,z+13,0,110);add('tree',x+inward*.9,.15,z+13,0,140,.55,.8,.55);}
   }
   if(i%3===0&&j%3===0){add('urban_busstop',l+16,.15,f+2.1,0,150);add('urban_utility',r-8,.15,b-2,0,130);}
   if(districtAt(cx,cz)==='industrial'){add('urban_barrier',l+12,.15,b-1,0,140);add('urban_bin',r-9,.15,f+2,0,140);add('urban_bag',r-7,.15,f+2,0,95);}
  }
  for(const x of CITY_PLAN.roadX)for(const z of CITY_PLAN.roadZ){if(x>880||reserved(x,z)||x>=832&&z>388)continue;
   const wx=roadWidth(x,'X'),wz=roadWidth(z,'Z');
   for(const side of [-1,1])for(let n=0;n<Math.floor(wx/1.4);n++)rect(paint,x-wx/2+.7+n*1.4,z+side*(wz/2+2.6),.68,3.8,.03);
   for(const side of [-1,1])for(let n=0;n<Math.floor(wz/1.4);n++)rect(paint,x+side*(wx/2+2.6),z-wz/2+.7+n*1.4,3.8,.68,.03);
   for(const side of [-1,1]){rect(paint,x+side*wx/4,z+side*(wz/2+5.1),wx/2-.5,.25,.029);if(wx>20||wz>20)add('urban_signal',x+side*(wx/2+1),.15,z+side*(wz/2+7.5),side<0?0:Math.PI,150);}
  }
  for(const [vertices,material] of [[asphalt,'road'],[paving,'stone'],[paint,'paint'],[wear,'roof']] as const){
   const g=new BufferGeometry();g.setAttribute('position',new BufferAttribute(new Float32Array(vertices),3));const uv=new Float32Array(vertices.length/3*2);for(let i=0;i<vertices.length/3;i++){uv[i*2]=vertices[i*3]/3;uv[i*2+1]=vertices[i*3+2]/3;}g.setAttribute('uv',new BufferAttribute(uv,2));g.computeVertexNormals();g.computeBoundingSphere();this.geometry.push(g);const mesh=new Mesh(g,assets.materials.get(material));mesh.receiveShadow=true;mesh.name='Saved urban '+material;this.group.add(mesh);
  }
 }
 setQuality(q:string){this.range=q==='LOW'?135:q==='MEDIUM'?165:q==='HIGH'?195:220;this.last='';}
 reset(){this.last='';}
 update(point:Vector3){const key=`${Math.floor(point.x/12)},${Math.floor(point.z/12)},${Math.floor(point.y/24)}`;if(key===this.last)return;this.last=key;const lists=new Map<string,Matrix4[]>();
  for(const s of this.slots)if(Math.hypot(point.x-s.x,point.z-s.z,Math.max(0,point.y-8))<Math.min(s.range,this.range)){const a=lists.get(s.key)??[];a.push(s.matrix);lists.set(s.key,a);}
  for(const key of new Set([...this.pools.keys(),...lists.keys()])){const matrices=lists.get(key)??[];let pool=this.pools.get(key);if(matrices.length>(pool?.capacity??0)){if(pool)for(const m of pool.meshes){m.dispose();m.removeFromParent();}const capacity=2**Math.ceil(Math.log2(Math.max(8,matrices.length)));pool={capacity,meshes:this.assets.instance(key,Array.from({length:capacity},()=>new Matrix4().makeScale(0,0,0)),this.group,false)};this.pools.set(key,pool);}if(pool)for(const m of pool.meshes){m.count=matrices.length;m.visible=matrices.length>0;matrices.forEach((matrix,i)=>m.setMatrixAt(i,matrix));m.instanceMatrix.needsUpdate=true;m.computeBoundingSphere();}}
 }
 diagnostics(){return {plannedPropSlots:this.slots.length,activeProps:[...this.pools.values()].reduce((n,p)=>n+(p.meshes[0]?.count??0),0)};}
 dispose(){for(const c of this.colliders)this.physics?.removeCollider(c);this.colliders.length=0;for(const g of this.geometry)g.dispose();for(const p of this.pools.values())for(const m of p.meshes)m.dispose();this.group.removeFromParent();}
}
