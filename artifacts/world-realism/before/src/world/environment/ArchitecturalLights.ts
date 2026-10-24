import { Color, Group, Mesh, PlaneGeometry, PointLight, ShaderMaterial, Vector3 } from 'three';
import { CityLayout } from '../CityLayout';
import { WeatherState } from './WeatherState';
/** A fixed local light budget and small wet-ground light proxies, tied to real entrances. */
export class ArchitecturalLights {
 readonly group=new Group();private lights:PointLight[]=[];private pools:Mesh[]=[];private geometry=new PlaneGeometry(12,26);private count=4;
 constructor(private layout:CityLayout){
  for(let i=0;i<6;i++){
   const color=new Color(i%3===2?'#67c9dc':'#ffc280'),light=new PointLight(color,0,65,2);light.castShadow=false;this.lights.push(light);this.group.add(light);
   const material=new ShaderMaterial({transparent:true,depthWrite:false,uniforms:{color:{value:color},alpha:{value:0}},vertexShader:'varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 v;uniform vec3 color;uniform float alpha;void main(){vec2 p=v*2.-1.;float glow=pow(max(0.,1.-length(p)),2.);float stripe=.7+.3*sin(v.x*67.+sin(v.y*23.));gl_FragColor=vec4(color,alpha*glow*stripe);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'});
   const mesh=new Mesh(this.geometry,material);mesh.rotation.x=-Math.PI/2;this.pools.push(mesh);this.group.add(mesh);
  }
 }
 setQuality(q:string){this.count=q==='LOW'?2:4;this.lights.forEach((light,i)=>light.visible=i<this.count);}
 update(target:Vector3,weather:WeatherState){
  const nearby=this.layout.buildings.filter(b=>Math.hypot(b.x-target.x,b.z-target.z)<220).sort((a,b)=>Math.hypot(a.x-target.x,a.z-target.z)-Math.hypot(b.x-target.x,b.z-target.z));
  for(let i=0;i<6;i++){
   const b=nearby[i],light=this.lights[i],pool=this.pools[i],visible=!!b&&i<this.count&&weather.night>.03;pool.visible=visible;light.intensity=0;if(!b||!visible)continue;
   const angle=b.angle??0;light.position.set(b.x+Math.sin(angle)*(b.d/2+1.4),3.7,b.z+Math.cos(angle)*(b.d/2+1.4));light.intensity=weather.night*115;pool.position.set(b.x+Math.sin(angle)*(b.d/2+10),.024,b.z+Math.cos(angle)*(b.d/2+10));pool.rotation.z=angle;(pool.material as ShaderMaterial).uniforms.alpha.value=weather.night*weather.wetness*.55;
  }
 }
 dispose(){this.geometry.dispose();for(const p of this.pools)(p.material as ShaderMaterial).dispose();this.group.removeFromParent();this.group.clear();}
}
