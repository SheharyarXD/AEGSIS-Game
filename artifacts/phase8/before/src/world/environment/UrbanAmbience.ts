import { BufferAttribute, BufferGeometry, Color, Group, Points, ShaderMaterial, Vector3 } from 'three';
import { placement } from '../WorldStreaming';
import { AssetLibrary } from './AssetLibrary';
import { WeatherState } from './WeatherState';
import { CITY_PLAN } from '../CityPlan';
export class UrbanAmbience {
 readonly group=new Group();
 private cars:import('three').InstancedMesh[];
 private people:import('three').InstancedMesh[];
 private geometry=new BufferGeometry();private steam:Points;
 private time={value:0};private wind={value:0};private count=12;
 constructor(assets:AssetLibrary){
  this.cars=assets.instance('car',Array.from({length:36},()=>placement(0,-100,0)),this.group,false);
  this.people=assets.instance('urban_citizen',Array.from({length:36},()=>placement(0,-100,0)),this.group,false);
  for(const mesh of this.people)if(mesh.material===assets.materials.get('urban_people_coat'))for(let i=0;i<36;i++)mesh.setColorAt(i,new Color(['#718b91','#665d54','#4c566c','#967c64'][i%4]));
  const positions=new Float32Array(64*3);for(let i=0;i<64;i++)positions.set([(i*17%31)/31,(i*13%37)/37,(i*19%41)/41],i*3);
  this.geometry.setAttribute('position',new BufferAttribute(positions,3));
  const material=new ShaderMaterial({transparent:true,depthWrite:false,uniforms:{time:this.time,wind:this.wind},
   vertexShader:`uniform float time,wind;varying float life;void main(){life=fract(position.y+time*.14);vec3 p=vec3(778.+(position.x-.5)*10.+life*wind,2.+life*18.,610.+(position.z-.5)*8.);vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(450.*life/max(3.,-mv.z),1.,30.);}`,
   fragmentShader:'varying float life;void main(){float a=(1.-smoothstep(.1,.5,length(gl_PointCoord-.5)))*sin(life*3.14159)*.14;gl_FragColor=vec4(.48,.56,.60,a);}'
  });this.steam=new Points(this.geometry,material);this.steam.frustumCulled=false;this.group.add(this.steam);
 }
 setCount(count:number):void{this.count=count;}
 update(position:Vector3,time:number,weather:WeatherState):void{
  this.time.value=time;this.wind.value=weather.values.wind;
  const routes=[];
  for(let x=0;x<CITY_PLAN.roadX.length-1;x++)for(let z=0;z<CITY_PLAN.roadZ.length-1;z++){
   const a=CITY_PLAN.roadX[x],b=CITY_PLAN.roadX[x+1],c=CITY_PLAN.roadZ[z],d=CITY_PLAN.roadZ[z+1];if(a<112&&b>-112&&c<100&&d>-160||b>832)continue;
   const distance=Math.hypot((a+b)/2-position.x,(c+d)/2-position.z),sw=CITY_PLAN.districts.find(d=>d.id===(a>420&&c>180?'industrial':a<-300?(c<-160?'gothic':'residential'):c<-176?'financial':'commercial'))!.sidewalkWidth;
   const width=(v:number)=>(CITY_PLAN.avenueZ as readonly number[]).includes(v)?26:16;
   if(distance<230)routes.push({id:x*100+z,a:a+3,b:b-3,c:c+3,d:d-3,pedestrianC:c+width(c)/2+sw*.5,pedestrianD:d-width(d)/2-sw*.5,distance});
  }routes.sort((a,b)=>a.distance-b.distance);
  for(let i=0;i<36;i++){
   let matrix;
   if(i>=this.count)matrix=placement(0,-100,0);
   else{
    const r=routes[Math.floor(i/3)%Math.max(1,routes.length)];
    if(!r||position.y>170){matrix=placement(0,-100,0);}else{
     const w=r.b-r.a,d=r.d-r.c,total=2*(w+d),signal=Math.floor(time/18)%2,clock=Math.floor(time/18)*16+Math.min(time%18,16);
     let t=((r.id*19+i%3*71)+clock*7.4)%total,x=r.a,z=r.c,angle=Math.PI/2;
     if(t<w){x+=t;angle=Math.PI/2;}else if((t-=w)<d){x=r.b;z+=t;angle=0;}else if((t-=d)<w){x=r.b-t;z=r.d;angle=-Math.PI/2;}else{t-=w;z=r.d-t;angle=Math.PI;}
     // A short intersection pause follows the same signal rhythm throughout a route.
     if(signal===1&&t<5){x+=Math.sin(angle)*Math.max(0,5-t)*.25;z+=Math.cos(angle)*Math.max(0,5-t)*.25;}
     matrix=placement(x,.08,z,1,1,1,angle);
    }
   }
   for(const car of this.cars){car.userData.aegisPropIds??=[];car.userData.aegisPropIds[i]=`car:route-${routes[Math.floor(i/3)%Math.max(1,routes.length)]?.id??0}:${i%3}`;car.setMatrixAt(i,matrix);car.instanceMatrix.needsUpdate=true;car.frustumCulled=false;}
  }
  for(const car of this.cars){car.count=this.count;car.visible=position.y<170;}
  for(let i=0;i<36;i++){const r=routes[i%Math.max(1,routes.length)];let matrix=placement(0,-100,0);if(r&&i<this.count&&position.y<95){const side=i%2,span=r.b-r.a-22,t=((time*.85+r.id*11)%span+span)%span,x=r.a+11+(side?t:span-t),z=side?r.pedestrianC:r.pedestrianD;matrix=placement(x,.15,z,.96,1+i%3*.04,.96,side?Math.PI/2:-Math.PI/2);}for(const mesh of this.people){mesh.setMatrixAt(i,matrix);mesh.instanceMatrix.needsUpdate=true;mesh.frustumCulled=false;}}
  for(const mesh of this.people){mesh.count=this.count;mesh.visible=position.y<95;}
  this.steam.visible=position.distanceTo(new Vector3(778,0,610))<650;
 }
 dispose():void{for(const c of [...this.cars,...this.people])c.dispose();this.geometry.dispose();(this.steam.material as ShaderMaterial).dispose();this.group.removeFromParent();}
}
