import { Color, CompressedTexture, DoubleSide, MeshStandardMaterial, SRGBColorSpace, Texture, TextureLoader } from 'three';
import { DDSLoader } from 'three/addons/loaders/DDSLoader.js';
type Uniforms={night:{value:number};wet:{value:number};snow:{value:number};clock:{value:number}};
/** PBR on authored relief, with occupancy shading only on genuine recessed glass surfaces. */
export class PremiumMaterials {
 readonly materials=new Map<string,MeshStandardMaterial>();readonly textures:Texture[]=[];
 private atlas={color:{value:null as Texture|null},normal:{value:null as Texture|null},orm:{value:null as Texture|null}};
 readonly ready:Promise<void>;
 compressed=false;
 multiDraw=false;
 constructor(weather:Uniforms){
  const defs:Record<string,[string,number,number,number]>={p_nocturne:['#526174',0,.83,0],p_stone:['#b4b5c0',0,.83,0],p_limestone:['#e3dbca',0,.84,1],p_brick:['#c4a08d',0,.86,2],p_concrete:['#b3bdc4',0,.87,3],p_metal:['#9daebc',.78,.35,4],p_copper:['#91aaa0',.7,.4,5],p_roof:['#697783',.06,.83,3],p_glass:['#466777',.35,.18,-1],p_glass_warm:['#636457',.26,.22,-1],p_warm:['#e8ac63',.1,.4,-2],p_neon:['#6ac6dc',.1,.4,-2]};
  for(const [name,[color,metalness,roughness,slot]] of Object.entries(defs)){
   const m=new MeshStandardMaterial({color,metalness,roughness});m.name=name;
   if(slot===-1)m.side=DoubleSide;
   if(slot===-2){m.emissive=new Color(color);m.emissiveIntensity=1.6;}
   m.onBeforeCompile=s=>{
    Object.assign(s.uniforms,{pNight:weather.night,pWet:weather.wet,pSnow:weather.snow,pColor:this.atlas.color,pNormal:this.atlas.normal,pOrm:this.atlas.orm});
    s.vertexShader='varying vec3 pWorld,pNormalWorld;\n'+s.vertexShader;
    s.vertexShader=s.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
     vec4 pp=vec4(transformed,1.);vec3 pn=objectNormal;
     #ifdef USE_INSTANCING
      pp=instanceMatrix*pp;pn/=max(vec3(dot(instanceMatrix[0].xyz,instanceMatrix[0].xyz),dot(instanceMatrix[1].xyz,instanceMatrix[1].xyz),dot(instanceMatrix[2].xyz,instanceMatrix[2].xyz)),vec3(.0000001));pn=mat3(instanceMatrix)*pn;
     #endif
     pWorld=(modelMatrix*pp).xyz;pNormalWorld=normalize(mat3(modelMatrix)*pn);`);
    s.fragmentShader='varying vec3 pWorld,pNormalWorld;uniform float pNight,pWet,pSnow;uniform sampler2D pColor,pNormal,pOrm;float phash(vec2 x){return fract(sin(dot(x,vec2(127.1,311.7)))*43758.5453);}\n'+s.fragmentShader;
    const plane='(abs(pNormalWorld.y)>.6?pWorld.xz:(abs(pNormalWorld.z)>abs(pNormalWorld.x)?pWorld.xy:pWorld.zy))';
    s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
     vec2 pPlane=${plane};float pUp=step(.7,pNormalWorld.y);
     ${slot>=0?`vec2 pUv=fract(pPlane/${slot===2?'2.6':'4.'})*vec2(.248,.496)+vec2(${(slot%4)/4+.001},${Math.floor(slot/4)/2+.002});vec3 pPacked=texture2D(pOrm,pUv).rgb;diffuseColor.rgb*=texture2D(pColor,pUv).rgb*1.32;diffuseColor.rgb*=mix(.76,1.,pPacked.r);float pSillDirt=(1.-pUp)*(.5+.5*sin(pWorld.y*1.57))*smoothstep(.5,.85,phash(floor(pPlane*.2)));diffuseColor.rgb*=1.-pSillDirt*.15;diffuseColor.rgb*=1.-pWet*.16;diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.8,.84,.87),pSnow*pUp*.8);`:''}
     ${slot===-1?`vec2 pc=floor(pPlane/vec2(4.,4.));float occupied=step(.61,phash(pc));float warm=step(.34,phash(pc+12.));vec2 uv=fract(pPlane/vec2(4.,4.));float interior=.35+.65*smoothstep(.05,.35,uv.y);vec3 room=mix(vec3(.12,.29,.40),vec3(.92,.54,.22),warm);diffuseColor.rgb*=.65+.35*sin(pWorld.y*.12);totalEmissiveRadiance+=room*occupied*pNight*interior*.86;`:''}`);
    s.fragmentShader=s.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
     ${slot>=0?`roughnessFactor*=pPacked.g;roughnessFactor=mix(roughnessFactor,${slot===4||slot===5?'.24':'.5'},pWet*${slot===4||slot===5?'.8':'.5'});`:''}`);
    if(slot>=0)s.fragmentShader=s.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
     vec3 q0=dFdx(-vViewPosition),q1=dFdy(-vViewPosition);vec2 st0=dFdx(pPlane),st1=dFdy(pPlane);vec3 t=cross(q1,normal)*st0.x+cross(normal,q0)*st1.x,b=cross(q1,normal)*st0.y+cross(normal,q0)*st1.y;float inv=inversesqrt(max(max(dot(t,t),dot(b,b)),.000001));vec3 nm=texture2D(pNormal,pUv).xyz*2.-1.;nm.xy*=.42;normal=normalize(mat3(t*inv,b*inv,normal)*nm);`);
   };m.customProgramCacheKey=()=>`aegis-premium-pbr-phase10-${name}`;this.materials.set(name,m);
  }
  this.ready=this.load();
 }
 private async load(){
  // Native BC3 on the target NVIDIA hardware; equal-resolution WebP fallback elsewhere.
  const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl2');const compressed=!!gl?.getExtension('WEBGL_compressed_texture_s3tc');const multiDraw=!!gl?.getExtension('WEBGL_multi_draw');gl?.getExtension('WEBGL_lose_context')?.loseContext();
  this.compressed=compressed;this.multiDraw=multiDraw;
  for(const channel of ['color','normal','orm'] as const){
   const url=`/assets/environment/premium/pbr-${channel}`;const t=compressed?await new DDSLoader().loadAsync(url+'.dds'):await new TextureLoader().loadAsync(url+'.webp');
   if(channel==='color')t.colorSpace=SRGBColorSpace;t.anisotropy=2;this.atlas[channel].value=t;this.textures.push(t);
  }
 }
 get bytes(){return this.textures.reduce((n,t)=>{const img=t.image as {width?:number;height?:number}|undefined;return n+(t instanceof CompressedTexture?t.mipmaps.reduce((sum,m)=>sum+m.data.byteLength,0):(img?.width??0)*(img?.height??0)*16/3);},0);}
 dispose(){for(const m of this.materials.values())m.dispose();for(const t of this.textures)t.dispose();this.materials.clear();this.textures.length=0;}
}
