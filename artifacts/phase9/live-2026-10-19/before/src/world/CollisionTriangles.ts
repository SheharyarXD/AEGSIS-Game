import { BufferGeometry } from 'three';
import { DamageIndex } from './DamageIndex';

/** One indexed surface per floor, retaining the original triangles and component ownership. */
export function collisionTriangles(parts: {geometry:BufferGeometry;original:Uint16Array|Uint32Array;ranges:Map<number,[number,number][]>}[], components:Set<number>, scale:[number,number,number]) {
 const vertices:number[]=[],indices:number[]=[],ranges=new Map<number,[number,number][]>();
 const welded=new Map<string,number>();
 for(const part of parts){
  const position=part.geometry.getAttribute('position'),shared=new Map<number,number>();
  for(const id of components)for(const [start,count] of part.ranges.get(id)??[]){
   const offset=indices.length;
   for(let i=start;i<start+count;i++){
    const source=part.original[i];let vertex=shared.get(source);
    if(vertex===undefined){const x=position.getX(source)*scale[0],y=position.getY(source)*scale[1],z=position.getZ(source)*scale[2],key=`${x},${y},${z}`;vertex=welded.get(key);if(vertex===undefined){vertex=vertices.length/3;welded.set(key,vertex);vertices.push(x,y,z);}shared.set(source,vertex);}
    indices.push(vertex);
   }
   const list=ranges.get(id)??[];list.push([offset,count]);ranges.set(id,list);
  }
 }
 const array=new Uint32Array(indices);
 return {vertices:new Float32Array(vertices),index:new DamageIndex(array,ranges)};
}
