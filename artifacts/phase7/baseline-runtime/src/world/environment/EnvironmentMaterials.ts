import { Color, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, TextureLoader, Vector2 } from 'three';
import { WeatherState } from './WeatherState';

export class EnvironmentMaterials {
 readonly materials=new Map<string,MeshStandardMaterial>();
 readonly uniforms={night:{value:0},wet:{value:0},snow:{value:0},clock:{value:0}};
 private atlas={value:null as import('three').Texture|null};
 private atlasNormal={value:null as import('three').Texture|null};private atlasOrm={value:null as import('three').Texture|null};
 readonly ready:Promise<void>;
 private textures:import('three').Texture[]=[];
 constructor(){
  const definitions:Record<string,[string,number,number]>={stone:['#60656a',.025,.88],brick:['#827269',.015,.91],steel:['#70808a',.65,.43],glass:['#315365',.58,.26],roof:['#353e45',.08,.94],warm:['#eac088',.04,.4],neon:['#3db8cd',.1,.3],green:['#476349',0,.94],road:['#515a60',.04,.93],paint:['#c9c4ad',0,.86]};
  for(const [style,base] of [['financial','glass'],['deco','stone'],['gothic','stone'],['industrial','stone'],['residential','brick']])definitions[`wall_${style}`]=definitions[base];
  definitions.wall_deco=['#80776c',.025,.88];definitions.wall_gothic=['#56616d',.02,.9];definitions.wall_industrial=['#645c4e',.10,.9];
  for(const [name,[color,metalness,roughness]] of Object.entries(definitions)){
   const material=new MeshStandardMaterial({color,metalness,roughness});material.name=name;
   if(name==='roof'){material.polygonOffset=true;material.polygonOffsetFactor=-1;material.polygonOffsetUnits=-2;}
   if(name==='warm'||name==='neon'){material.emissive=new Color(color);material.emissiveIntensity=.4;}
   const facade=name.startsWith('wall_'),porous=['stone','brick','road','roof','wall_gothic','wall_deco','wall_residential','wall_industrial'].includes(name);
   const useAtlas=(porous||name==='steel')&&name!=='road';
   material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{uNight:this.uniforms.night,uWet:this.uniforms.wet,uSnow:this.uniforms.snow,uClock:this.uniforms.clock,uAtlas:this.atlas,uAtlasNormal:this.atlasNormal,uAtlasOrm:this.atlasOrm});
    shader.vertexShader='varying vec3 cityPosition; varying vec3 cityNormal;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
     vec4 cp=vec4(transformed,1.0);
     vec3 cn=objectNormal;
     #ifdef USE_INSTANCING
      cp=instanceMatrix*cp;cn/=max(vec3(dot(instanceMatrix[0].xyz,instanceMatrix[0].xyz),dot(instanceMatrix[1].xyz,instanceMatrix[1].xyz),dot(instanceMatrix[2].xyz,instanceMatrix[2].xyz)),vec3(.00000001));cn=mat3(instanceMatrix)*cn;
     #endif
     cityPosition=(modelMatrix*cp).xyz;cityNormal=normalize(mat3(modelMatrix)*cn);`);
    shader.fragmentShader=`varying vec3 cityPosition;varying vec3 cityNormal;uniform float uNight,uWet,uSnow,uClock;uniform sampler2D uAtlas,uAtlasNormal,uAtlasOrm;
     float cityHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
     float cityNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(cityHash(i),cityHash(i+vec2(1.,0.)),f.x),mix(cityHash(i+vec2(0.,1.)),cityHash(i+1.),f.x),f.y);}
     `+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`${name==='road'?'#ifdef USE_MAP\ndiffuseColor *= texture2D(map,cityPosition.xz/3.);\n#endif':'#include <map_fragment>'}
     float up=step(.72,normalize(cityNormal).y);
     float weatherNoise=cityNoise(cityPosition.xz*.3);
     vec2 surfaceUv=abs(cityNormal.y)>.6?cityPosition.xz:(abs(cityNormal.z)>abs(cityNormal.x)?cityPosition.xy:cityPosition.zy);
     ${useAtlas?`vec2 atlasUv=fract(surfaceUv/${name.includes('brick')||name==='wall_residential'?'3.':'6.'})*.49+vec2(${name==='brick'||name==='wall_residential'||name==='roof'?'.5':'0.'},${name==='roof'||name==='steel'?'.5':'0.'});diffuseColor.rgb*=texture2D(uAtlas,atlasUv).rgb*1.45;`:''}
     float accumulation=up*uSnow*smoothstep(.25,.75,weatherNoise)*${name==='green'?'1.':'step(.5,cityPosition.y)'};
     diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.78,.83,.87),accumulation*.9);
     ${porous?'diffuseColor.rgb*=1.0-uWet*.22*(1.0-accumulation);':''}
     ${facade?`vec2 plane=abs(cityNormal.z)>abs(cityNormal.x)?cityPosition.xy:cityPosition.zy;
      vec2 cell=fract(plane/vec2(3.4,3.8));
      float pane=smoothstep(.24,.27,cell.x)*(1.0-smoothstep(.73,.76,cell.x))*smoothstep(.19,.23,cell.y)*(1.0-smoothstep(.75,.79,cell.y));
      float windows=pane*(1.0-up)*step(5.,cityPosition.y);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.045,.085,.115),windows*.87);
      float occupied=step(.78,cityHash(floor(plane/vec2(3.4,3.8))));
      totalEmissiveRadiance+=windows*occupied*uNight*mix(vec3(.17,.35,.5),vec3(.7,.39,.14),cityHash(floor(plane/vec2(23.,17.))))*.55;`:''}
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
     ${useAtlas?'roughnessFactor*=texture2D(uAtlasOrm,atlasUv).g;':''}
     roughnessFactor=mix(roughnessFactor,${name==='road'?'.29':porous?'.53':'.2'},uWet*${name==='road'?'1.':'0.65'}*(1.0-accumulation));
     roughnessFactor=mix(roughnessFactor,.96,accumulation);`);
    if(useAtlas)shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
     vec3 aq0=dFdx(-vViewPosition),aq1=dFdy(-vViewPosition);vec2 ast0=dFdx(surfaceUv),ast1=dFdy(surfaceUv);
     vec3 aperp1=cross(aq1,normal),aperp0=cross(normal,aq0);
     vec3 atangent=aperp1*ast0.x+aperp0*ast1.x,abitangent=aperp1*ast0.y+aperp0*ast1.y;
     float ainv=inversesqrt(max(max(dot(atangent,atangent),dot(abitangent,abitangent)),.000001));
     vec3 anormal=texture2D(uAtlasNormal,atlasUv).xyz*2.-1.;anormal.xy*=.28;
     normal=normalize(mat3(atangent*ainv,abitangent*ainv,normal)*anormal);`);
   };
   material.customProgramCacheKey=()=>`aegis-weather-v2-${name}`;
   this.materials.set(name,material);
  }
  this.ready=Promise.all([this.loadRoad(),this.loadAtlas()]).then(()=>{});
 }
 get(name:string):MeshStandardMaterial{return this.materials.get(name)??this.materials.get('stone')!;}
 update(weather:WeatherState,time:number):void{
  this.uniforms.night.value=weather.night;this.uniforms.wet.value=weather.wetness;this.uniforms.snow.value=weather.snowCover;this.uniforms.clock.value=time;
  this.get('warm').emissiveIntensity=.12+weather.night*1.5;this.get('neon').emissiveIntensity=.3+weather.night*2;
 }
 private async loadRoad():Promise<void>{
  const loader=new TextureLoader();
  const files=['asphalt-diff.webp','asphalt-normal.webp','asphalt-rough.webp'];
  const loaded=await Promise.all(files.map(f=>loader.loadAsync(`/assets/environment/${f}`).catch(()=>null)));
  loaded.forEach(t=>{if(t){t.wrapS=t.wrapT=RepeatWrapping;t.repeat.set(1,1);t.anisotropy=2;this.textures.push(t);}});
  const road=this.get('road');if(loaded[0]){road.map=loaded[0];road.map.colorSpace=SRGBColorSpace;road.color.set('#999999');}
  if(loaded[1]){road.normalMap=loaded[1];road.normalScale=new Vector2(.22,.22);}if(loaded[2])road.roughnessMap=loaded[2];road.needsUpdate=true;
 }
 private async loadAtlas():Promise<void>{const loader=new TextureLoader(),textures=await Promise.all(['atlas-color','atlas-normal','atlas-orm'].map(name=>loader.loadAsync(`/assets/environment/${name}.webp`)));textures[0].colorSpace=SRGBColorSpace;textures.forEach(t=>{t.anisotropy=2;this.textures.push(t);});this.atlas.value=textures[0];this.atlasNormal.value=textures[1];this.atlasOrm.value=textures[2];}
 get textureBytes():number{return this.textures.reduce((n,t)=>{const image=t.image as {width?:number;height?:number}|undefined;return n+(image?.width??0)*(image?.height??0)*4*4/3;},0);}
 dispose():void{for(const m of this.materials.values())m.dispose();for(const t of this.textures)t.dispose();this.materials.clear();this.textures=[];}
}
