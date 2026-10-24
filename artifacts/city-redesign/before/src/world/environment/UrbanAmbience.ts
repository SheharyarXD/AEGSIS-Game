import { BufferAttribute, BufferGeometry, Group, Points, ShaderMaterial, Vector3 } from 'three';
import { placement } from '../WorldStreaming';
import { AssetLibrary } from './AssetLibrary';
import { WeatherState } from './WeatherState';
export class UrbanAmbience {
 readonly group=new Group();
 private cars:import('three').InstancedMesh[];
 private geometry=new BufferGeometry();private steam:Points;
 private time={value:0};private wind={value:0};private count=12;
 constructor(assets:AssetLibrary){
  this.cars=assets.instance('car',Array.from({length:36},()=>placement(0,-100,0)),this.group,false);
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
  const streets=[-816,-704,-576,-448,-320,-192,128,256,400,544,704];
  for(let i=0;i<36;i++){
   let matrix;
   if(i>=this.count)matrix=placement(0,-100,0);
   else{
    const base=streets.reduce((a,b)=>Math.abs(a-position.x)<Math.abs(b-position.x)?a:b),street=streets[(streets.indexOf(base)+i%3)%streets.length];
    const z=((i*61+time*(i%2?9:-8))%360+360)%360-180+Math.round(position.z/360)*360;
    const visible=street<820&&Math.abs(z)<970&&!(Math.abs(street)<110&&z>-150&&z<100);
    matrix=visible?placement(street+(i%2?3:-3),.08,z,1,1,1,i%2?0:Math.PI):placement(0,-100,0);
   }
   for(const car of this.cars){car.setMatrixAt(i,matrix);car.instanceMatrix.needsUpdate=true;car.frustumCulled=false;}
  }
  this.steam.visible=position.distanceTo(new Vector3(778,0,610))<650;
 }
 dispose():void{for(const c of this.cars)c.dispose();this.geometry.dispose();(this.steam.material as ShaderMaterial).dispose();this.group.removeFromParent();}
}
