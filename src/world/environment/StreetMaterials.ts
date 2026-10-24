import { Color, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, Texture, TextureLoader, Vector2, Vector3 } from 'three';
import { EnvironmentMaterials } from './EnvironmentMaterials';
/** Dedicated ground materials; no facade atlas is sampled by concrete paving. */
export class StreetMaterials {
 readonly road:MeshStandardMaterial;readonly paving:MeshStandardMaterial;readonly paint:MeshStandardMaterial;readonly patch:MeshStandardMaterial;
 readonly lamps={value:Array.from({length:8},()=>new Vector3(0,-10000,0))};private count={value:4};private owned:MeshStandardMaterial[]=[];private textures:Texture[]=[];
 constructor(source:EnvironmentMaterials){
  const base=source.get('road');
  const create=(kind:'road'|'paving'|'paint'|'patch')=>{
   const m=kind==='road'||kind==='patch'?base.clone():new MeshStandardMaterial();m.name='realism_'+kind;m.color=new Color(kind==='paving'?'#aaa69b':kind==='paint'?'#d1cbb9':kind==='patch'?'#4f5353':'#6a6d6c');m.metalness=0;m.roughness=kind==='paint'?.82:.94;m.polygonOffset=true;m.polygonOffsetFactor=-1;m.polygonOffsetUnits=kind==='paint'?-7:kind==='paving'?-4:kind==='patch'?-3:-2;if(m.normalMap)m.normalScale=new Vector2(.32,.32);
   m.onBeforeCompile=s=>{
    Object.assign(s.uniforms,{streetWet:source.uniforms.wet,streetNight:source.uniforms.night,streetClock:source.uniforms.clock,streetLamps:this.lamps,streetLampCount:this.count});
    s.vertexShader='varying vec3 streetPosition;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nstreetPosition=(modelMatrix*vec4(transformed,1.)).xyz;');
    s.fragmentShader=`varying vec3 streetPosition;uniform float streetWet,streetNight,streetClock,streetLampCount;uniform vec3 streetLamps[8];
     float stHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
     float stNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(stHash(i),stHash(i+vec2(1,0)),f.x),mix(stHash(i+vec2(0,1)),stHash(i+1.),f.x),f.y);}
    `+s.fragmentShader;
    s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
     vec2 ground=streetPosition.xz;float broad=stNoise(ground*.19);float dirt=stNoise(ground*.73+17.);float puddle=smoothstep(.48,.76,broad)*streetWet;
     ${kind==='paving'?`vec2 cells=ground/vec2(1.55,1.95),edge=min(fract(cells),1.-fract(cells))*vec2(1.55,1.95);float aa=min(fwidth(ground.x),fwidth(ground.y))*.5;float joint=(1.-smoothstep(.006,.012+aa,min(edge.x,edge.y)))*(1.-smoothstep(.035,.15,aa));float slab=stHash(floor(cells));float pavingRelief=(1.-joint)*.012+stNoise(ground*12.)*.0015;diffuseColor.rgb*=mix(.82,1.08,slab)*(1.-joint*.47);diffuseColor.rgb*=1.-smoothstep(.58,.88,dirt)*.23;diffuseColor.rgb*=.94+stNoise(ground*28.)*.09;`:`diffuseColor.rgb*=mix(.81,1.05,broad);`}
     ${kind==='road'||kind==='patch'?`float repair=smoothstep(.73,.77,stNoise(ground*.085));float oil=pow(smoothstep(.48,.83,dirt),3.);diffuseColor.rgb*=1.-repair*.13-oil*.16;float crack=1.-smoothstep(.012,.024+fwidth(ground.x)*.8,abs(sin(ground.x*.33+ground.y*.17+stNoise(ground*.8)*3.)));diffuseColor.rgb*=1.-crack*.16;`:''}
     ${kind==='paint'?`float wear=stNoise(ground*13.);diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.13,.145,.15),smoothstep(.62,.87,wear)*.42);`:''}
     diffuseColor.rgb*=1.-streetWet*${kind==='paving'?'.18':'.17'};
     if(streetNight>.015){for(int i=0;i<8;i++){if(float(i)>=streetLampCount)break;vec2 d=ground-streetLamps[i].xz;float pool=pow(max(0.,1.-dot(d,d)/81.),2.);float streak=exp(-abs(d.x)*1.3)*pow(max(0.,1.-abs(d.y)/17.),2.);totalEmissiveRadiance+=vec3(1.,.70,.39)*streetNight*(pool*.075+streak*puddle*.38);}}
    `);
    s.fragmentShader=s.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,${kind==='paving'?'mix(.62,.37,puddle)':kind==='paint'?'.3':'mix(.40,.17,puddle)'},streetWet*.48+puddle*.49);`);
    s.fragmentShader=s.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
     ${kind==='paving'?`vec3 sx=dFdx(-vViewPosition),sy=dFdy(-vViewPosition),r1=cross(sy,normal),r2=cross(normal,sx);float det=dot(sx,r1);vec3 grad=sign(det)*(dFdx(pavingRelief)*r1+dFdy(pavingRelief)*r2);normal=normalize(max(abs(det),.0000001)*normal-grad);`:''}
     ${kind==='road'||kind==='patch'?`normal=normalize(normal+vec3(sin(ground.x*39.+streetClock*1.7),cos(ground.y*43.-streetClock*1.9),0.)*puddle*.008);`:''}`);
   };m.customProgramCacheKey=()=>`real-street-phase10-${kind}`;this.owned.push(m);return m;
  };this.road=create('road');this.paving=create('paving');this.paint=create('paint');this.patch=create('patch');const loader=new TextureLoader();for(const [key,file] of [['map','concrete-color'],['normalMap','concrete-normal'],['roughnessMap','concrete-rough']] as const){const t=loader.load('/assets/environment/metropolis/'+file+'.webp');t.wrapS=t.wrapT=RepeatWrapping;t.anisotropy=2;if(key==='map')t.colorSpace=SRGBColorSpace;this.paving[key]=t;this.textures.push(t);}this.paving.color.set('#e8e5dc');this.paving.normalScale.set(.45,.45);
 }
 setQuality(q:string){this.count.value=q==='LOW'?4:q==='MEDIUM'?6:8;}
 update(positions:readonly Vector3[]){for(let i=0;i<8;i++)this.lamps.value[i].copy(positions[i]??new Vector3(0,-10000,0));}
 dispose(){for(const t of this.textures)t.dispose();for(const m of this.owned)m.dispose();}
}
