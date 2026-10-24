import { BufferAttribute, BufferGeometry, FrontSide, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, SRGBColorSpace, TextureLoader } from 'three';
import { DDSLoader } from 'three/addons/loaders/DDSLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EnvironmentMaterials } from './EnvironmentMaterials';
export interface AssetPart {geometry:BufferGeometry;material:string;componentRanges?:Map<number,[number,number][]>;}
export class AssetLibrary {
 readonly parts=new Map<string,AssetPart[]>();
 bytes=0;triangles=0;
 revision=0;catalog:any;private pending=new Map<string,Promise<void>>();private directories=new Map<string,string>();private dead=false;
 private loading=0;get pendingCount(){return this.loading;}
 async idle():Promise<void>{await Promise.all([...this.pending.values()]);}
 constructor(readonly materials:EnvironmentMaterials){}
 async load():Promise<void>{
  const files=['aegis-city-kit.glb','metropolis/metropolis-street-kit-optimized.glb','metropolis/metropolis-hlod-optimized.glb'];
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
 ensure(family:string,height:number,lod:'near'|'mid'):Promise<void>{const key=`${family}_${height}_${lod}`;if(this.parts.has(key))return Promise.resolve();if(this.dead)return Promise.reject(new Error('Asset library disposed'));let pending=this.pending.get(key);if(!pending){this.loading++;pending=this.loadFile(`premium/${this.directories.get(family)??'city'}/${family}-${lod}-optimized.glb`).then(()=>{this.revision++;}).finally(()=>this.loading--);this.pending.set(key,pending);}return pending;}
 private async loadFile(file:string):Promise<void>{
  const response=await fetch('/assets/environment/'+file);if(!response.ok)throw new Error('Missing authored environment: '+file);
  const buffer=await response.arrayBuffer();this.bytes+=buffer.byteLength;
  const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buffer,'/assets/environment/');gltf.scene.updateMatrixWorld(true);
  if(this.dead){gltf.scene.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});return;}
  const provided=file.includes('premium/provided')||file.includes('premium/city');
  if(file.includes('metropolis-street-kit')){const maps=await fetch('/assets/environment/metropolis/street-texture-manifest.json').then(r=>r.json()),unique=new Map<string,MeshStandardMaterial>();gltf.scene.traverse(o=>{if(o instanceof Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m instanceof MeshStandardMaterial&&maps[m.name])unique.set(m.name,m);});for(const m of unique.values())await this.materials.adoptSource(m,maps[m.name]);}
  if(provided){const family=file.split('/').at(-1)!.split('-')[0],manifest=await fetch(`/assets/environment/premium/${file.includes('premium/city')?'city':'provided'}/texture-manifest.json`).then(r=>r.json());const unique=new Map<string,MeshStandardMaterial>();gltf.scene.traverse(o=>{if(o instanceof Mesh){const converted=(Array.isArray(o.material)?o.material:[o.material]).map(m=>{if(m instanceof MeshBasicMaterial){const lit=new MeshStandardMaterial({name:m.name,color:m.color,map:m.map,emissive:m.color,emissiveMap:m.map,emissiveIntensity:1,transparent:m.transparent,opacity:m.opacity,side:m.side});m.dispose();return lit;}return m;});o.material=converted.length===1?converted[0]:converted;for(const m of converted)if(m instanceof MeshStandardMaterial&&m.name.startsWith('src_'))unique.set(m.name,m);}});for(const m of unique.values())await this.materials.adoptSource(m,manifest[family]?.materials[m.name]??{});}
  if(this.dead){gltf.scene.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});return;}
  gltf.scene.traverse(object=>{
   if(!(object instanceof Mesh))return;
   const external=file.includes('cc0')||file.includes('metropolis');let node:Object3D|null=object;while(external&&node&&!node.userData.aegisKey)node=node.parent;
   const key=external?(node?.userData.aegisKey as string|undefined):object.name.split('__')[0];if(!key)return;
   const materials=Array.isArray(object.material)?object.material:[object.material];
   const mat=external||provided?materials[0].name:object.name.split('__')[1];if(!mat)return;
   if(external){for(const material of materials)if(material instanceof MeshStandardMaterial){if(material.name.startsWith('urban_people')){material.onBeforeCompile=s=>{s.uniforms.urbanClock=this.materials.uniforms.clock;s.vertexShader='uniform float urbanClock;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      float pace=urbanClock*7.5+instanceMatrix[3].x*.7+instanceMatrix[3].z*.2;
      if(position.y<.78)transformed.z+=sin(pace+step(0.,position.x)*3.14159)*.13*(1.-position.y/.85);
      transformed.y+=sin(pace*2.)*.013;`);};material.customProgramCacheKey=()=> 'urban-citizen-walk-1';}this.materials.adopt(material.name,material);}}
   const geometry:BufferGeometry=object.geometry.clone();
   // Meshopt often uses normalized integer positions. Baking a metre-scale node
   // transform into those buffers overflows values beyond 1 and folds real props.
   for(const [name,attribute] of Object.entries(geometry.attributes)){const values=new Float32Array(attribute.count*attribute.itemSize);for(let i=0;i<attribute.count;i++)for(let c=0;c<attribute.itemSize;c++)values[i*attribute.itemSize+c]=c===0?attribute.getX(i):c===1?attribute.getY(i):c===2?attribute.getZ(i):attribute.getW(i);geometry.setAttribute(name,new BufferAttribute(values,attribute.itemSize));}
   geometry.applyMatrix4(object.matrixWorld);geometry.computeBoundingSphere();
   const part:AssetPart={geometry,material:mat};const cid=geometry.getAttribute('_cid');
   if(cid&&key.endsWith('_near')&&geometry.index){const ranges=new Map<number,[number,number][]>(),index=geometry.index;for(let i=0;i<index.count;i+=3){const id=Math.round(cid.getX(index.getX(i))),list=ranges.get(id)??[],last=list.at(-1);if(last&&last[0]+last[1]===i)last[1]+=3;else list.push([i,3]);ranges.set(id,list);}part.componentRanges=ranges;}
   const list=this.parts.get(key)??[];list.push(part);this.parts.set(key,list);
   this.triangles+=(geometry.index?.count??geometry.attributes.position.count)/3;
   object.geometry.dispose();if(!external&&!provided)for(const m of materials)m.dispose();
  });
  if(provided||file.includes('metropolis')){for(const [key,parts] of this.parts){if(!key.endsWith('_far')&&!key.endsWith('_mid')&&!key.startsWith('urban_'))continue;const grouped=new Map<string,AssetPart[]>();for(const part of parts){const list=grouped.get(part.material)??[];list.push(part);grouped.set(part.material,list);}if([...grouped.values()].every(p=>p.length===1))continue;const merged:AssetPart[]=[];for(const [material,list] of grouped){if(list.length===1){merged.push(list[0]);continue;}const names=new Set(list.flatMap(p=>Object.keys(p.geometry.attributes)));for(const part of list)for(const name of names){if(part.geometry.hasAttribute(name))continue;const sample=list.find(p=>p.geometry.hasAttribute(name))!.geometry.getAttribute(name),count=part.geometry.getAttribute('position').count,values=new Float32Array(count*sample.itemSize),uv=part.geometry.getAttribute('uv');if(name.startsWith('uv')&&uv)for(let i=0;i<count;i++){values[i*sample.itemSize]=uv.getX(i);values[i*sample.itemSize+1]=uv.getY(i);}if(name==='color')values.fill(1);part.geometry.setAttribute(name,new BufferAttribute(values,sample.itemSize));}for(const part of list)for(const [name,attribute] of Object.entries(part.geometry.attributes)){const values=new Float32Array(attribute.count*attribute.itemSize);for(let i=0;i<attribute.count;i++)for(let c=0;c<attribute.itemSize;c++)values[i*attribute.itemSize+c]=c===0?attribute.getX(i):c===1?attribute.getY(i):c===2?attribute.getZ(i):attribute.getW(i);part.geometry.setAttribute(name,new BufferAttribute(values,attribute.itemSize));}const geometry=mergeGeometries(list.map(p=>p.geometry),false);if(!geometry)throw new Error('Incompatible source LOD attributes: '+key);geometry.computeBoundingSphere();merged.push({geometry,material});for(const p of list)p.geometry.dispose();}this.parts.set(key,merged);}}
 }
 instance(key:string,matrices:Matrix4[],parent:Object3D,shadows=true):InstancedMesh[]{
  if(!matrices.length)return[];
  const parts=this.parts.get(key);if(!parts)throw new Error(`Missing authored module: ${key}`);
  return parts.filter(part=>!(key.endsWith('_near')&&part.material==='p_concrete')).map(part=>{
   const mesh=new InstancedMesh(part.geometry,this.materials.get(part.material),matrices.length);mesh.name=key;
   matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.castShadow=shadows;mesh.receiveShadow=true;mesh.computeBoundingSphere();parent.add(mesh);return mesh;
  });
 }
 dispose():void{this.dead=true;for(const p of this.parts.values())for(const part of p)part.geometry.dispose();this.parts.clear();}
}
