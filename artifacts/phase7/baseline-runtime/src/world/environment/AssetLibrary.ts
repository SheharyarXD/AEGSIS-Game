import { BufferGeometry, InstancedMesh, Matrix4, Mesh, Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EnvironmentMaterials } from './EnvironmentMaterials';
export interface AssetPart {geometry:BufferGeometry;material:string;}
export class AssetLibrary {
 readonly parts=new Map<string,AssetPart[]>();
 bytes=0;triangles=0;
 constructor(readonly materials:EnvironmentMaterials){}
 async load():Promise<void>{
  const response=await fetch('/assets/environment/aegis-city-kit.glb');if(!response.ok)throw new Error('Missing Blender-authored environment kit. Run art/environment/build.py.');
  const buffer=await response.arrayBuffer();this.bytes=buffer.byteLength;
  const gltf=await new GLTFLoader().parseAsync(buffer,'/assets/environment/');gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(object=>{
   if(!(object instanceof Mesh))return;
   const [key,mat]=object.name.split('__');if(!mat)return;
   const geometry=object.geometry.clone().applyMatrix4(object.matrixWorld);geometry.computeBoundingSphere();
   const part={geometry,material:mat},list=this.parts.get(key)??[];list.push(part);this.parts.set(key,list);
   this.triangles+=(geometry.index?.count??geometry.attributes.position.count)/3;
   object.geometry.dispose();for(const m of Array.isArray(object.material)?object.material:[object.material])m.dispose();
  });
  if(!this.parts.has('gothic_near'))throw new Error('Invalid Blender asset kit: Gothic architecture is absent.');
 }
 instance(key:string,matrices:Matrix4[],parent:Object3D,shadows=true):InstancedMesh[]{
  if(!matrices.length)return[];
  const parts=this.parts.get(key);if(!parts)throw new Error(`Missing authored module: ${key}`);
  return parts.map(part=>{
   const mesh=new InstancedMesh(part.geometry,this.materials.get(part.material),matrices.length);mesh.name=key;
   matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.castShadow=shadows;mesh.receiveShadow=true;mesh.computeBoundingSphere();parent.add(mesh);return mesh;
  });
 }
 dispose():void{for(const p of this.parts.values())for(const part of p)part.geometry.dispose();this.parts.clear();}
}
