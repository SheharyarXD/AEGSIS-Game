import { BufferAttribute, BufferGeometry, CanvasTexture, Color, Group, Mesh, MeshBasicMaterial, PlaneGeometry, ShaderMaterial, SRGBColorSpace, Vector3 } from 'three';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { CityLayout } from '../CityLayout';
import { placement } from '../WorldStreaming';
import { AssetLibrary } from './AssetLibrary';
import { WeatherState } from './WeatherState';

export class CityInfrastructure {
 readonly group=new Group();readonly colliders:import('../../physics/PhysicsWorld').RAPIER.Collider[]=[];
 private water:Mesh;private puddles:Mesh;private time={value:0};private wet={value:0};private night={value:0};
 private haze={value:new Color('#8eabb9')};private density={value:.0003};
 private ownedGeometries:BufferGeometry[]=[];private ownedMaterials:import('three').Material[]=[];private textures:CanvasTexture[]=[];
 private buildingSigns=new Map<number,Mesh>();
 constructor(_layout:CityLayout,assets:AssetLibrary,private physics?:PhysicsWorld,_slice=false){
  // A ground-plane roof offset hid road layers at altitude; roads own the depth bias.
  assets.materials.get('roof').polygonOffset=false;
  for(const [name,units] of [['road',-2],['stone',-4],['paint',-6]] as const){const material=assets.materials.get(name);material.polygonOffset=true;material.polygonOffsetFactor=-1;material.polygonOffsetUnits=units;}
  const solid=(p:Vector3,size:Vector3)=>{if(physics)this.colliders.push(physics.box(p,size));};
  const plane=(w:number,d:number,material:import('three').Material,x:number,y:number,z:number)=>{const geo=new PlaneGeometry(w,d);this.ownedGeometries.push(geo);const mesh=new Mesh(geo,material);mesh.rotation.x=-Math.PI/2;mesh.position.set(x,y,z);mesh.receiveShadow=true;this.group.add(mesh);return mesh;};
  plane(1944,2048,assets.materials.get('roof'),-52,-.035,0);
  // Keep the deployment floor's precise contact scale, and tile its non-overlapping surroundings.
  solid(new Vector3(0,-.5,-5),new Vector3(300,1,320));
  for(const [left,right,front,back] of [[-1024,880,-1024,-165],[-1024,880,155,1024],[-1024,-150,-165,155],[150,880,-165,155]]){
   for(let x=left;x<right;x+=256)for(let z=front;z<back;z+=256){const w=Math.min(256,right-x),d=Math.min(256,back-z);solid(new Vector3(x+w/2,-.5,z+d/2),new Vector3(w,1,d));}
  }
  solid(new Vector3(936,-16,0),new Vector3(176,1,2048));
  // Bridge bays are instanced authored trusses, with a separate level collision deck.
  assets.instance('bridge',Array.from({length:7},(_,i)=>placement(592+i*64,24,512,1,1,1,Math.PI/2)),this.group);
  solid(new Vector3(784,24,512),new Vector3(448,1.5,24));
  for(const side of [-1,1])solid(new Vector3(784,25.35,512+side*11.7),new Vector3(448,1.2,.35));
  for(const x of [576,704,832,960]){assets.instance('industrial_far',[placement(x,0,512,10,23.25,10)],this.group);solid(new Vector3(x,11.5,512),new Vector3(10,23,10));}
  // Accessible ramps meet the bridge deck at its western edge.
  const ramp=new BufferGeometry();ramp.setAttribute('position',new BufferAttribute(new Float32Array([448,.1,500,448,.1,524,560,24.75,524,448,.1,500,560,24.75,524,560,24.75,500]),3));ramp.computeVertexNormals();this.ownedGeometries.push(ramp);this.group.add(new Mesh(ramp,assets.materials.get('road')));
  if(physics){const collider=physics.world.createCollider(RAPIER.ColliderDesc.trimesh(ramp.attributes.position.array as Float32Array,new Uint32Array([0,1,2,3,4,5])));physics.surfaces.set(collider.handle,{kind:'world'});this.colliders.push(collider);}
  // Deliberate waterside composition and low-cost props.
  assets.instance('crane',[placement(780,0,630),placement(780,0,760,1,1,1,Math.PI)],this.group);
  for(const z of [630,760]){for(const x of [-3,3])for(const dz of [-3,3])solid(new Vector3(780+x,15,z+dz),new Vector3(.56,30,.56));solid(new Vector3(780,30,z+(z===630?12:-12)),new Vector3(7,2,38));}
  const containers=[];for(let row=0;row<9;row++)for(let col=0;col<7;col++)containers.push(placement(745+col*3,Math.floor(row/3)*2.6,660+(row%3)*8));assets.instance('container',containers,this.group);
  // Shipping container collision is owned per container by environmental destruction.
  plane(72,22,assets.materials.get('green'),-668,.025,504);
  const trees=[];for(let n=0;n<24;n++){const a=n/24*Math.PI*2;trees.push(placement(-668+Math.cos(a)*30,0,504+Math.sin(a)*8,.75,.85,.75));}assets.instance('tree',trees,this.group);
  // Waterfront/outskirts are source-derived scenery outside the playable footprint.
  const waterMat=new ShaderMaterial({fog:true,uniforms:{time:this.time,night:this.night,wet:this.wet,haze:this.haze,density:this.density,fogColor:{value:new Color()},fogDensity:{value:0}},
   vertexShader:'varying vec3 wp;void main(){wp=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
   fragmentShader:`varying vec3 wp;uniform float time,night,wet,density;uniform vec3 fogColor;void main(){float w=sin(wp.x*.024+wp.z*.017+time*.3)*sin(wp.z*.036-time*.22)*.009/(1.+length(fwidth(wp.xz))*.1);vec3 color=mix(vec3(.11,.22,.28),vec3(.012,.045,.068),night);color+=w;float depth=length(wp-cameraPosition);gl_FragColor=vec4(color,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\ngl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,1.-exp(-depth*depth*density*density));}`});
  this.ownedMaterials.push(waterMat);this.water=plane(18000,18000,waterMat,9910,-1.3,0);
  const puddleMat=new ShaderMaterial({uniforms:{time:this.time,wet:this.wet,night:this.night},transparent:true,depthWrite:false,
   vertexShader:'varying vec3 wp;void main(){wp=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
   fragmentShader:`varying vec3 wp;uniform float time,wet,night;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}void main(){float streak=pow(max(0.,sin(wp.x*1.8+sin(wp.z*.12)*.2)),9.)*exp(-abs(wp.z-352.)*.015);float poolMask=smoothstep(.4,.67,noise(wp.xz*.22));vec3 c=mix(vec3(.12,.18,.22),vec3(.018,.045,.065),night);c+=mix(vec3(.15,.25,.3),vec3(.08,.55,.75),night)*streak*.65;float ripple=sin(length(mod(wp.xz,3.)-1.5)*18.-time*8.)*.008;gl_FragColor=vec4(c+ripple,wet*.58*poolMask);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>}`});
  this.ownedMaterials.push(puddleMat);this.puddles=plane(26,180,puddleMat,128,.032,352);
  for(const id of [235,211,287,9013,9014]){const b=_layout.buildings.find(b=>b.id===id);if(b)this.sign((b.landmark??b.family??'AEGIS').toUpperCase(),b.x,3.2,b.z+b.d/2+.12,id);}
  // Continuous mainland scenery: no circular shore/water ring around the playable city.
  const mainland:number[]=[];
  const shore=(z:number)=>z>=-1024&&z<=1024?910:910+Math.sin(z*.00075)*230+Math.sin(z*.0019)*110;
  for(let z=-15000;z<15000;z+=128){const a=[-18000,-.18,z],b=[shore(z),-.18,z],c=[shore(z+128),-.18,z+128],d=[-18000,-.18,z+128];for(const p of [a,c,b,a,d,c])mainland.push(...p);}
  const land=new BufferGeometry();land.setAttribute('position',new BufferAttribute(new Float32Array(mainland),3));land.computeVertexNormals();this.ownedGeometries.push(land);this.group.add(new Mesh(land,assets.materials.get('roof')));
  const horizon=new Map<string,import('three').Matrix4[]>();
  for(let row=0;row<20;row++)for(let col=0;col<48;col++){
   const sources=['city_modernoffice_4','city_classicoffice_1','city_artdeco_1','city_iron_warehouse_3'];
   const family=assets.catalog.families.find((f:{id:string})=>f.id===sources[(row+col)%4]);if(!family)continue;
   const key=`${family.id}_${family.height}_far`,list=horizon.get(key)??[],x=-2600+col*72+(Math.floor(row/2)%2)*14,z=(row%2?1:-1)*(1088+Math.floor(row/2)*92);
   const scale=1.15+(col%3)*.1;list.push(placement(x,0,z,family.width*scale,family.height*scale,family.depth*scale));horizon.set(key,list);
  }
  for(let row=0;row<24;row++)for(let col=0;col<12;col++){
   const name=['city_classicoffice_1','city_artdeco_1','city_modernoffice_4'][(row+col)%3],family=assets.catalog.families.find((f:{id:string})=>f.id===name);const key=`${family.id}_${family.height}_far`,list=horizon.get(key)??[];
   list.push(placement(-1070-col*72,0,-1100+row*100,family.width*1.15,family.height*1.15,family.depth*1.15));horizon.set(key,list);
  }
  for(const [key,matrices] of horizon)assets.instance(key,matrices,this.group,false);

 }
 private sign(text:string,x:number,y:number,z:number,buildingId:number):void{
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=64;const ctx=canvas.getContext('2d')!;
  ctx.fillStyle='#101d25';ctx.fillRect(0,0,512,64);ctx.fillStyle='#abd9de';ctx.textAlign='center';ctx.font='24px sans-serif';ctx.fillText(text,256,42);
  const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;this.textures.push(texture);
  const material=new MeshBasicMaterial({map:texture});this.ownedMaterials.push(material);const geometry=new PlaneGeometry(12,1.5);this.ownedGeometries.push(geometry);
  const m=new Mesh(geometry,material);m.position.set(x,y,z);this.group.add(m);this.buildingSigns.set(buildingId,m);
 }
 update(time:number,weather:WeatherState,haze?:Color,density?:number,damage?:ReadonlyMap<number,{stage:string}>):void{this.time.value=time;this.wet.value=weather.wetness;this.night.value=weather.night;if(haze)this.haze.value.copy(haze);if(density!==undefined)this.density.value=density;this.puddles.visible=weather.wetness>.01;this.water.visible=true;for(const [id,sign] of this.buildingSigns)sign.visible=damage?.get(id)?.stage!=='collapsed';}
 dispose():void{for(const c of this.colliders)this.physics?.removeCollider(c);this.colliders.length=0;this.group.traverse(o=>{if('isInstancedMesh' in o)(o as import('three').InstancedMesh).dispose();});for(const g of this.ownedGeometries)g.dispose();for(const m of this.ownedMaterials)m.dispose();for(const t of this.textures)t.dispose();this.group.removeFromParent();}
}
// Imported directly: no modifications to PhysicsWorld required.
import { RAPIER } from '../../physics/PhysicsWorld';
