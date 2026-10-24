import { Group, InstancedBufferAttribute, InstancedMesh, Matrix4, PlaneGeometry, Quaternion, ShaderMaterial, Vector3 } from 'three';
import { CITY_PLAN } from '../CityPlan';
import { CityLayout } from '../CityLayout';
import { AssetLibrary } from './AssetLibrary';
import { WeatherState } from './WeatherState';
/** Source-atlas reflection proxies, limited to wet asphalt near actual building frontages. No extra scene render. */
export class WetStreetReflections {
 readonly group=new Group();private geometry=new PlaneGeometry(1,1);private mesh:InstancedMesh;private count=6;private last='';
 private uniforms:{atlas:{value:import('three').Texture|null};wet:{value:number};night:{value:number};clock:{value:number}};
 constructor(private layout:CityLayout,assets:AssetLibrary,private views:Record<string,{uv:number[]}[]>){
  this.geometry.setAttribute('tile',new InstancedBufferAttribute(new Float32Array(12*4),4));this.uniforms={atlas:{value:assets.materials.get('city_hlod_atlas').map},wet:{value:0},night:{value:0},clock:{value:0}};
  const material=new ShaderMaterial({transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-3,uniforms:this.uniforms,
   vertexShader:'attribute vec4 tile;varying vec2 v;varying vec4 t;varying vec3 wp;void main(){v=uv;t=tile;vec4 p=modelMatrix*instanceMatrix*vec4(position,1.);wp=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}',
   fragmentShader:`varying vec2 v;varying vec4 t;varying vec3 wp;uniform sampler2D atlas;uniform float wet,night,clock;float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}void main(){vec2 uv=v;uv.x+=sin(wp.z*14.+sin(wp.x*9.)+clock*2.)*.003;uv.y+=sin(wp.x*8.+clock*2.)*.004;vec2 tileUv=mix(t.xy,t.zw,vec2(uv.x,1.-uv.y));vec4 c=texture2D(atlas,tileUv);float fade=smoothstep(0.,.12,v.y)*(1.-smoothstep(.62,1.,v.y));float puddle=smoothstep(.25,.85,h(floor(wp.xz*1.7)));float fresnel=pow(1.-abs(normalize(cameraPosition-wp).y),2.);gl_FragColor=vec4(c.rgb*mix(.50,.23,night),c.a*wet*fade*fresnel*(.08+puddle*.16));\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`});
  this.mesh=new InstancedMesh(this.geometry,material,12);this.mesh.count=0;this.mesh.frustumCulled=false;this.mesh.name='Wet street source-facade reflections';this.group.add(this.mesh);
 }
 setQuality(q:string){this.count=q==='LOW'?4:q==='MEDIUM'?6:12;this.last='';}
 update(point:Vector3,weather:WeatherState,time:number,damaged:ReadonlyMap<number,unknown>){
  this.uniforms.wet.value=weather.wetness;this.uniforms.night.value=weather.night;this.uniforms.clock.value=time;this.mesh.visible=weather.wetness>.05&&point.y<90;if(!this.mesh.visible)return;
  const key=`${Math.floor(point.x/12)},${Math.floor(point.z/12)},${damaged.size}`;if(key===this.last)return;this.last=key;
  const nearby=this.layout.buildings.filter(b=>b.family&&this.views[b.family]&&!damaged.has(b.id)&&Math.hypot(b.x-point.x,b.z-point.z)<130).sort((a,b)=>Math.hypot(a.x-point.x,a.z-point.z)-Math.hypot(b.x-point.x,b.z-point.z));
  let n=0;for(const b of nearby){if(n===this.count)break;const rx=CITY_PLAN.roadX.reduce((a,x)=>Math.abs(x-b.x)<Math.abs(a-b.x)?x:a),rz=CITY_PLAN.roadZ.reduce((a,z)=>Math.abs(z-b.z)<Math.abs(a-b.z)?z:a);if(rx>880)continue;
   const dx=Math.abs(rx-b.x)-b.w/2,dz=Math.abs(rz-b.z)-b.d/2,vertical=dx<dz,side=vertical?(rx>b.x?1:3):(rz>b.z?2:0),angle=vertical?Math.PI/2:0,width=vertical?b.d:b.w,road=vertical?rx:rz,avenue=(vertical?CITY_PLAN.avenueX:CITY_PLAN.avenueZ as readonly number[]).includes(road as never),depth=avenue?25:15;
   const center=new Vector3(vertical?rx:b.x,.027,vertical?b.z:rz),rot=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),-Math.PI/2).premultiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),angle));this.mesh.setMatrixAt(n,new Matrix4().compose(center,rot,new Vector3(width,depth,1)));
   const index=(side+Math.round((b.angle??0)/(Math.PI/2))+4)%4,uv=this.views[b.family!][index].uv;(this.geometry.attributes.tile as InstancedBufferAttribute).setXYZW(n++,...uv as [number,number,number,number]);
  }this.mesh.count=n;this.mesh.instanceMatrix.needsUpdate=true;this.geometry.attributes.tile.needsUpdate=true;
 }
 dispose(){this.mesh.dispose();this.geometry.dispose();(this.mesh.material as ShaderMaterial).dispose();this.group.removeFromParent();}
}
