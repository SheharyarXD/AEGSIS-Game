import { Box3, Sphere, Vector3, Group, WebGLRenderer, Scene, PerspectiveCamera, BufferAttribute, BufferGeometry, FrontSide, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, MeshStandardMaterial, Object3D, SRGBColorSpace, TextureLoader } from 'three';
import { DDSLoader } from 'three/addons/loaders/DDSLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EnvironmentMaterials } from './EnvironmentMaterials';
import { AssetQueue } from '../streaming/AssetQueue';
import { GeometryWorker } from '../streaming/GeometryWorker';
if(typeof Worker!=='undefined')try{MeshoptDecoder.useWorkers(2);}catch{MeshoptDecoder.useWorkers(0);}
export interface AssetPart {geometry:BufferGeometry;material:string;componentRanges?:Map<number,[number,number][]>;}
export class AssetLibrary {
 readonly parts=new Map<string,AssetPart[]>();
 bytes=0;triangles=0;
 revision=0;catalog:any;private pending=new Map<string,Promise<void>>();private directories=new Map<string,string>();private dead=false;
 private jobs=new AssetQueue(2);private worker=new GeometryWorker();private preparing=new Set<string>();private warmedTextures=new WeakSet<import('three').Texture>();private renderer?:WebGLRenderer;private scene?:Scene;private camera?:PerspectiveCamera;
 setRenderer(renderer:WebGLRenderer,scene:Scene,camera:PerspectiveCamera){this.renderer=renderer;this.scene=scene;this.camera=camera;}
 available(key:string){return this.parts.has(key)&&!this.preparing.has(key);}
 stats(){return {...this.jobs.stats(),preparing:this.preparing.size,decodedKeys:this.parts.size,timings:{...this.timings}};}
 async warmInitial(){for(const key of this.parts.keys())if(/^(aer_|city_).*(near|mid|skyline)$/.test(key))await this.warm(key);}
 private async warm(key:string){if(!this.renderer||!this.scene||!this.camera)return;const parts=this.parts.get(key)??[];
  for(const part of parts){const material=this.materials.get(part.material);for(const t of [material.map,material.normalMap,material.roughnessMap,material.metalnessMap,material.aoMap,material.emissiveMap])if(t&&!this.warmedTextures.has(t)){await new Promise(r=>requestAnimationFrame(r));this.renderer.initTexture(t);this.warmedTextures.add(t);}}
  // compileAsync observes the last program per material; await each object variant separately.
  for(const variant of key.endsWith('_skyline')?[3]:[0,1,2]){const group=new Group();if(variant===3)this.instance(key,[new Matrix4()],group,false);else for(const part of parts){const material=this.materials.get(part.material),mesh=variant===0?new Mesh(part.geometry,material):new InstancedMesh(part.geometry,material,1);if(variant===2&&(mesh instanceof InstancedMesh))mesh.setColorAt(0,new (await import('three')).Color('white'));mesh.receiveShadow=true;group.add(mesh);}await this.renderer.compileAsync(group,this.camera,this.scene);for(const o of group.children)if(o instanceof InstancedMesh)o.dispose();group.clear();}
 }
 private timings={files:0,fetchMaxMs:0,decodeMaxMs:0,prepareMaxMs:0};
 private loading=0;get pendingCount(){return this.loading;}
 private skylineMaterials=new Map<string,MeshLambertMaterial>();
 async idle():Promise<void>{await Promise.all([...this.pending.values()]);}
 constructor(readonly materials:EnvironmentMaterials){}
 async load():Promise<void>{
  const files=['aegis-city-kit.glb','metropolis/metropolis-street-kit-optimized.glb','metropolis/street-details-optimized.glb','metropolis/phase8-titan-kit-optimized.glb','metropolis/metropolis-hlod-optimized.glb'];
  this.catalog=await fetch('/assets/environment/metropolis/runtime-components.json').then(r=>{if(!r.ok)throw new Error('Missing fixed city architecture catalog');return r.json();});
  for(const family of this.catalog.families)this.directories.set(family.id,family.id.startsWith('aer_')?'provided':'city');
  files.push('premium/destructible/fractures-optimized.glb');
  for(const file of files)await this.loadFile(file);
  const atlasMaterial=this.materials.get('city_hlod_atlas');await this.materials.premium.ready;
  const atlas=this.materials.premium.compressed?await new DDSLoader().loadAsync('/assets/environment/metropolis/source-facades.dds'):await new TextureLoader().loadAsync('/assets/environment/metropolis/source-facades.webp');atlas.colorSpace=SRGBColorSpace;atlas.flipY=false;atlas.anisotropy=2;
  atlasMaterial.color.set('#babec2');atlasMaterial.map=atlas;atlasMaterial.alphaTest=.35;atlasMaterial.transparent=false;atlasMaterial.depthWrite=true;atlasMaterial.side=FrontSide;atlasMaterial.roughness=1;atlasMaterial.metalness=0;atlasMaterial.needsUpdate=true;this.materials.adopt('city_hlod_atlas',atlasMaterial);
  atlasMaterial.onBeforeCompile=s=>{s.vertexShader='varying vec3 metroWorld;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
   vec4 metroP=vec4(transformed,1.);
   #ifdef USE_BATCHING
    metroP=batchingMatrix*metroP;
   #endif
   #ifdef USE_INSTANCING
    metroP=instanceMatrix*metroP;
   #endif
   metroWorld=(modelMatrix*metroP).xyz;`);s.fragmentShader='varying vec3 metroWorld;\n'+s.fragmentShader;s.fragmentShader=s.fragmentShader.replace('#include <fog_fragment>',`#include <fog_fragment>
   #ifdef USE_FOG
    float outskirts=smoothstep(1050.,2400.,max(abs(metroWorld.x),abs(metroWorld.z)));gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,outskirts*.92);
   #endif`);};atlasMaterial.customProgramCacheKey=()=> 'authored-outskirts-haze-1';
  if(!this.parts.has('gothic_near'))throw new Error('Invalid Blender asset kit: Gothic architecture is absent.');
 }
 ensure(family:string,height:number,lod:'near'|'mid',priority=20):Promise<void>{return this.schedule(`${family}_${height}_${lod}`,`premium/${this.directories.get(family)??'city'}/${family}-${lod}-optimized.glb`,priority);}
 /** Complete source skyline is cached independently from the atlas HLOD. */
 ensureSkyline(family:string,height:number):Promise<void>{return this.schedule(`${family}_${height}_skyline`,`premium/${this.directories.get(family)??'city'}/${family}-far-optimized.glb`,80,{from:`${family}_${height}_far`,to:`${family}_${height}_skyline`});}
 private schedule(key:string,file:string,priority:number,alias?:{from:string;to:string}):Promise<void>{
  if(this.available(key))return Promise.resolve();if(this.dead)return Promise.resolve();let pending=this.pending.get(key);
  if(!pending){const previous=this.parts.get(key);this.loading++;this.preparing.add(key);
   pending=this.jobs.request(key,priority,async()=>{if(this.dead)return;await this.loadFile(file,alias);if(!this.dead)await this.warm(key);})
    .then(()=>{this.revision++;})
    .catch(error=>{for(const part of this.parts.get(key)??[])if(!previous?.includes(part))part.geometry.dispose();if(previous)this.parts.set(key,previous);else this.parts.delete(key);throw error;})
    .finally(()=>{this.preparing.delete(key);this.pending.delete(key);this.loading--;});this.pending.set(key,pending);
  }else void this.jobs.request(key,priority,async()=>{}).catch(()=>{});
  return pending;
 }
 private async loadFile(file:string,alias?:{from:string;to:string}):Promise<void>{
  let stage=performance.now();const response=await fetch('/assets/environment/'+file);if(!response.ok)throw new Error('Missing authored environment: '+file);
  const buffer=await response.arrayBuffer();this.bytes+=buffer.byteLength;this.timings.files++;this.timings.fetchMaxMs=Math.max(this.timings.fetchMaxMs,performance.now()-stage);stage=performance.now();
  const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buffer,'/assets/environment/');gltf.scene.updateMatrixWorld(true);this.timings.decodeMaxMs=Math.max(this.timings.decodeMaxMs,performance.now()-stage);
  if(this.dead){gltf.scene.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});return;}
  const provided=file.includes('premium/provided')||file.includes('premium/city');
  if(file.includes('metropolis-street-kit')){const maps=await fetch('/assets/environment/metropolis/street-texture-manifest.json').then(r=>r.json()),unique=new Map<string,MeshStandardMaterial>();gltf.scene.traverse(o=>{if(o instanceof Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m instanceof MeshStandardMaterial&&maps[m.name])unique.set(m.name,m);});for(const m of unique.values())await this.materials.adoptSource(m,maps[m.name]);}
  if(provided){const family=file.split('/').at(-1)!.split('-')[0],manifest=await fetch(`/assets/environment/premium/${file.includes('premium/city')?'city':'provided'}/texture-manifest.json`).then(r=>r.json());const unique=new Map<string,MeshStandardMaterial>();gltf.scene.traverse(o=>{if(o instanceof Mesh){const converted=(Array.isArray(o.material)?o.material:[o.material]).map(m=>{if(m instanceof MeshBasicMaterial){const lit=new MeshStandardMaterial({name:m.name,color:m.color,map:m.map,emissive:m.color,emissiveMap:m.map,emissiveIntensity:1,transparent:m.transparent,opacity:m.opacity,side:m.side});m.dispose();return lit;}return m;});o.material=converted.length===1?converted[0]:converted;for(const m of converted)if(m instanceof MeshStandardMaterial&&m.name.startsWith('src_'))unique.set(m.name,m);}});for(const m of unique.values())await this.materials.adoptSource(m,manifest[family]?.materials[m.name]??{});}
  if(this.dead){gltf.scene.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});return;}
  const objects:Mesh[]=[];gltf.scene.traverse(o=>{if(o instanceof Mesh)objects.push(o);});
  for(const object of objects){
   if(!(object instanceof Mesh))continue;
   const external=file.includes('cc0')||file.includes('metropolis');let node:Object3D|null=object;while(external&&node&&!node.userData.aegisKey)node=node.parent;
   let key=external?(node?.userData.aegisKey as string|undefined):object.name.split('__')[0];if(!key)continue;if(alias&&key===alias.from)key=alias.to;
   const materials=Array.isArray(object.material)?object.material:[object.material];
   const mat=external||provided?materials[0].name:object.name.split('__')[1];if(!mat)continue;
   if(external){for(const material of materials)if(material instanceof MeshStandardMaterial){if(material.name.startsWith('urban_people')){material.onBeforeCompile=s=>{s.uniforms.urbanClock=this.materials.uniforms.clock;s.vertexShader='uniform float urbanClock;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      float pace=urbanClock*7.5+instanceMatrix[3].x*.7+instanceMatrix[3].z*.2;
      if(position.y<.78)transformed.z+=sin(pace+step(0.,position.x)*3.14159)*.13*(1.-position.y/.85);
      transformed.y+=sin(pace*2.)*.013;`);};material.customProgramCacheKey=()=> 'urban-citizen-walk-1';}this.materials.adopt(material.name,material);}}
   const preparationStarted=performance.now();const prepared=await this.worker.prepare({attributes:Object.entries(object.geometry.attributes).map(([name,a])=>({name,array:a.array.slice() as Float32Array,size:a.itemSize,normalized:a.normalized,stride:'data' in a?(a as import('three').InterleavedBufferAttribute).data.stride:undefined,offset:'offset' in a?(a as import('three').InterleavedBufferAttribute).offset:undefined})),index:object.geometry.index?.array.slice() as Uint16Array|Uint32Array??null,matrix:object.matrixWorld.elements,damage:key.endsWith('_near')});
   this.timings.prepareMaxMs=Math.max(this.timings.prepareMaxMs,performance.now()-preparationStarted);if(this.dead)return;const geometry=new BufferGeometry();for(const a of prepared.attributes)geometry.setAttribute(a.name,new BufferAttribute(a.array,a.size));if(prepared.index)geometry.setIndex(new BufferAttribute(prepared.index,1));geometry.boundingBox=new Box3(new Vector3().copy(prepared.bounds.min),new Vector3().copy(prepared.bounds.max));geometry.boundingSphere=new Sphere(new Vector3().copy(prepared.sphere.center),prepared.sphere.radius);
   const part:AssetPart={geometry,material:mat};if(prepared.ranges.size)part.componentRanges=prepared.ranges;
   const list=this.parts.get(key)??[];list.push(part);this.parts.set(key,list);
   this.triangles+=(geometry.index?.count??geometry.attributes.position.count)/3;
   object.geometry.dispose();if(!external&&!provided)for(const m of materials)m.dispose();
  }
  if(provided||file.includes('metropolis')){for(const [key,parts] of this.parts){if(!key.endsWith('_far')&&!key.endsWith('_mid')&&!key.endsWith('_skyline')&&!key.startsWith('urban_')&&!key.startsWith('realism_')&&!key.startsWith('titan_'))continue;const grouped=new Map<string,AssetPart[]>();for(const part of parts){const list=grouped.get(part.material)??[];list.push(part);grouped.set(part.material,list);}if([...grouped.values()].every(p=>p.length===1))continue;const merged:AssetPart[]=[];for(const [material,list] of grouped){if(list.length===1){merged.push(list[0]);continue;}const names=new Set(list.flatMap(p=>Object.keys(p.geometry.attributes)));for(const part of list)for(const name of names){if(part.geometry.hasAttribute(name))continue;const sample=list.find(p=>p.geometry.hasAttribute(name))!.geometry.getAttribute(name),count=part.geometry.getAttribute('position').count,values=new Float32Array(count*sample.itemSize),uv=part.geometry.getAttribute('uv');if(name.startsWith('uv')&&uv)for(let i=0;i<count;i++){values[i*sample.itemSize]=uv.getX(i);values[i*sample.itemSize+1]=uv.getY(i);}if(name==='color')values.fill(1);part.geometry.setAttribute(name,new BufferAttribute(values,sample.itemSize));}const geometry=mergeGeometries(list.map(p=>p.geometry),false);if(!geometry)throw new Error('Incompatible source LOD attributes: '+key);geometry.computeBoundingSphere();merged.push({geometry,material});for(const p of list)p.geometry.dispose();}this.parts.set(key,merged);}}
 }
 instance(key:string,matrices:Matrix4[],parent:Object3D,shadows=true):InstancedMesh[]{
  if(!matrices.length)return[];
  const parts=this.parts.get(key);if(!parts)throw new Error(`Missing authored module: ${key}`);
  return parts.filter(part=>!(key.endsWith('_near')&&part.material==='p_concrete')).map(part=>{
   const source=this.materials.get(part.material);let material:MeshStandardMaterial|MeshLambertMaterial=source;
   if(key.endsWith('_skyline')){
    let distant=this.skylineMaterials.get(part.material);if(!distant){
     // At skyline distances retain authored UVs/color/emission without subpixel PBR maps/reflections.
     distant=new MeshLambertMaterial({name:source.name+' skyline',color:source.color,map:source.map,emissive:source.emissive,emissiveMap:source.emissiveMap,emissiveIntensity:source.emissiveIntensity,transparent:source.transparent,opacity:source.opacity,side:source.side,alphaTest:source.alphaTest});distant.forceSinglePass=true;
     distant.onBeforeCompile=s=>{s.uniforms.sourceNight=this.materials.uniforms.night;s.fragmentShader='uniform float sourceNight;\n'+s.fragmentShader;s.fragmentShader=s.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance*=.16+sourceNight*.84;');};distant.customProgramCacheKey=()=> 'complete-skyline-diffuse-1';this.skylineMaterials.set(part.material,distant);
    }material=distant;
   }
   const mesh=new InstancedMesh(part.geometry,material,matrices.length);mesh.name=key;
   matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.castShadow=shadows;mesh.receiveShadow=true;mesh.computeBoundingSphere();parent.add(mesh);return mesh;
  });
 }
 dispose():void{this.dead=true;this.jobs.close();this.worker.dispose();for(const p of this.parts.values())for(const part of p)part.geometry.dispose();this.parts.clear();for(const material of this.skylineMaterials.values())material.dispose();this.skylineMaterials.clear();}
}
