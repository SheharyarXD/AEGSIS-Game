import { BufferAttribute, BufferGeometry, Group, Mesh, Points, ShaderMaterial, Vector3 } from 'three';
import { randomFor } from '../CityLayout';
import { WeatherState } from './WeatherState';

export class Precipitation {
 readonly group=new Group();
 readonly uniforms={time:{value:0},center:{value:new Vector3()},wind:{value:0},rain:{value:0},snow:{value:0},night:{value:0},shelter:{value:0},quality:{value:1}};
 private rainMesh:Mesh;private snowMesh:Points;private impacts:Points;
  private maxRain=2400;private maxSnow=2400;
 constructor(){
  const random=randomFor(9741),positions=new Float32Array(this.maxRain*6*3),seeds=new Float32Array(this.maxRain*6*3);
  const corners=[[-.5,0],[.5,0],[-.5,1],[-.5,1],[.5,0],[.5,1]];
  for(let i=0;i<this.maxRain;i++){
   const seed=[random(),random(),random()];for(let j=0;j<6;j++){positions.set([corners[j][0],corners[j][1],0],(i*6+j)*3);seeds.set(seed,(i*6+j)*3);}
  }
  const geometry=new BufferGeometry();geometry.setAttribute('position',new BufferAttribute(positions,3));geometry.setAttribute('seed',new BufferAttribute(seeds,3));
  const rain=new ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,side:2,
   vertexShader:`attribute vec3 seed;uniform float time,wind,rain,shelter;uniform vec3 center;varying float alpha;
    void main(){vec3 p;float span=76.;p.x=mod(seed.x*span+time*wind*.65-center.x,span)-span*.5+center.x;
     p.z=mod(seed.z*span+time*wind*.23-center.z,span)-span*.5+center.z;
     p.y=mod(seed.y*56.-time*(26.+seed.x*9.)-center.y,56.)-18.+center.y;
     vec4 view=modelViewMatrix*vec4(p,1.);view.xy+=vec2(position.x*.035+position.y*wind*.025,position.y*(.38+rain*.4));
     alpha=rain*(1.-shelter)*(.17+seed.y*.15);gl_Position=projectionMatrix*view;}`,
   fragmentShader:'varying float alpha;uniform float night;void main(){gl_FragColor=vec4(mix(vec3(.67,.78,.85),vec3(.48,.62,.76),night),alpha);}'
  });this.rainMesh=new Mesh(geometry,rain);this.rainMesh.frustumCulled=false;this.group.add(this.rainMesh);
  const snowPositions=new Float32Array(this.maxSnow*3);for(let i=0;i<snowPositions.length;i++)snowPositions[i]=random();
  const snowGeo=new BufferGeometry();snowGeo.setAttribute('position',new BufferAttribute(snowPositions,3));
  const snow=new ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,
   vertexShader:`uniform float time,wind,snow,shelter;uniform vec3 center;varying float alpha;void main(){float span=50.;vec3 p;
    p.x=mod(position.x*span+time*wind*.5+sin(time*.7+position.y*24.)*2.-center.x,span)-span*.5+center.x;
    p.z=mod(position.z*span+time*wind*.18+cos(time*.5+position.x*24.)*2.-center.z,span)-span*.5+center.z;
    p.y=mod(position.y*35.-time*(1.6+position.x)-center.y,35.)-10.+center.y;
    vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(150./max(2.,-mv.z),1.5,7.);alpha=snow*(1.-shelter)*.85;}`,
   fragmentShader:'varying float alpha;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;gl_FragColor=vec4(.85,.91,.97,alpha*(1.-smoothstep(.12,.5,d)));}'
  });this.snowMesh=new Points(snowGeo,snow);this.snowMesh.frustumCulled=false;this.group.add(this.snowMesh);
  const impacts=new ShaderMaterial({uniforms:{...this.uniforms,center:{value:new Vector3()}},transparent:true,depthWrite:false,
   vertexShader:`uniform float time,rain;uniform vec3 center;varying float alpha;void main(){vec3 p=vec3(mod(position.x*22.-center.x,22.)-11.+center.x,center.y-.08,mod(position.z*22.-center.z,22.)-11.+center.z);
    vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;float phase=fract(time*1.3+position.y);gl_PointSize=clamp((4.+phase*12.)*25./max(4.,-mv.z),1.,14.);alpha=(1.-phase)*rain*.24;}`,
   fragmentShader:'varying float alpha;void main(){float d=length(gl_PointCoord-.5);float ring=smoothstep(.23,.3,d)*(1.-smoothstep(.37,.44,d));gl_FragColor=vec4(.62,.76,.85,ring*alpha);}'
  });this.impacts=new Points(snowGeo.clone(),impacts);this.impacts.frustumCulled=false;this.group.add(this.impacts);
 }
 update(camera:Vector3,time:number,weather:WeatherState,sheltered:boolean,surfaceHeight:number,quality:number):void{
  this.uniforms.center.value.copy(camera);this.uniforms.time.value=time;this.uniforms.wind.value=weather.values.wind;this.uniforms.rain.value=weather.values.rain*weather.intensity;this.uniforms.snow.value=weather.values.snow*weather.intensity;this.uniforms.night.value=weather.night;
  this.uniforms.shelter.value+=(Number(sheltered)-this.uniforms.shelter.value)*.15;
  this.rainMesh.geometry.setDrawRange(0,Math.floor(this.maxRain*quality)*6);this.snowMesh.geometry.setDrawRange(0,Math.floor(this.maxSnow*quality));
  this.rainMesh.visible=this.uniforms.rain.value>.005;this.snowMesh.visible=this.uniforms.snow.value>.005;
  this.impacts.visible=this.rainMesh.visible&&!sheltered&&camera.y-surfaceHeight<15;
  // Impacts use their own centre uniform: no per-particle raycasts.
  const shader=this.impacts.material as ShaderMaterial;
  if(shader.uniforms.center===this.uniforms.center)shader.uniforms.center={value:camera.clone()};
  (shader.uniforms.center.value as Vector3).set(camera.x,surfaceHeight+.13,camera.z);
  this.impacts.geometry.setDrawRange(0,Math.floor(160*quality));
 }
 get particleCount():number{return (this.rainMesh.visible?this.rainMesh.geometry.drawRange.count/6:0)+(this.snowMesh.visible?this.snowMesh.geometry.drawRange.count:0);}
 reset():void{this.uniforms.shelter.value=0;this.rainMesh.visible=this.snowMesh.visible=this.impacts.visible=false;}
 dispose():void{const geometries=new Set<BufferGeometry>();for(const object of [this.rainMesh,this.snowMesh,this.impacts]){geometries.add(object.geometry);(object.material as ShaderMaterial).dispose();}for(const g of geometries)g.dispose();this.group.removeFromParent();}
}
