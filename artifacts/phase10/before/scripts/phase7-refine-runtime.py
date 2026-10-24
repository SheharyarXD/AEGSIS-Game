from pathlib import Path
p=Path('src/world/ArchitectureDestruction.ts');s=p.read_text()
s=s.replace("import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';\n",'').replace('Building, CityLayout }','Building, CityLayout, profilesFor }')
s=s.replace('batches:Batch[];group:Group;collapse:{floor:number;sector:boolean;next:number}', 'activeFloors:Set<number>;coarse:RAPIER.Collider[];batches:Batch[];group:Group;collapse:{floor:number;sector:boolean;xSign:number;zSign:number;next:number}')
s=s.replace('colliders:new Map(),batches:[]','colliders:new Map(),activeFloors:new Set(),coarse:[],batches:[]')
first=s.index('  const materialParts=');last=s.index('  this.lastActivationMs=',first)
s=s[:first]+'''  for(const part of this.assets.parts.get(`${b.family}_${b.h}_near`)??[]){
   // Stable Blender component IDs survive triangle reordering during Meshopt compression.
   const source=part.geometry,cid=source.getAttribute('_cid'),sourceIndex=source.index;if(!cid||!sourceIndex)throw new Error('Building lacks authored component IDs: '+b.family);
   const merged=new BufferGeometry();for(const [name,attribute] of Object.entries(source.attributes))merged.setAttribute(name,attribute);merged.setIndex(sourceIndex.clone());merged.index!.setUsage(DynamicDrawUsage);merged.boundingBox=source.boundingBox?.clone()??null;merged.boundingSphere=source.boundingSphere?.clone()??null;
   const ranges=new Map<number,[number,number][]>();
   for(let i=0;i<sourceIndex.count;i+=3){const id=Math.round(cid.getX(sourceIndex.getX(i))),list=ranges.get(id)??[],last=list.at(-1);if(last&&last[0]+last[1]===i)last[1]+=3;else list.push([i,3]);ranges.set(id,list);}
   const original=merged.index!.array.slice() as Uint32Array|Uint16Array;
   const mesh=new Mesh(merged,this.assets.materials.get(part.material));mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);state.batches.push({mesh,original,ranges});
  }
  this.rebuildCoarse(state);
'''+s[last:]
anchor=' private position(b:Building,c:Component)'
addition=''' private rebuildCoarse(state:Damage){
  for(const c of state.coarse){this.hitOwners.delete(c.handle);this.physics.removeCollider(c);}state.coarse=[];const b=state.building;
  for(const [start,portion,w,d] of profilesFor(b)){
   const first=Math.round(start*b.h/4),last=Math.round((start+portion)*b.h/4);let begin=-1;
   for(let floor=first;floor<=last;floor++){
    const solid=floor<last&&!state.activeFloors.has(floor);if(solid&&begin<0)begin=floor;
    if(!solid&&begin>=0){const c=this.physics.box(new Vector3(b.x,(begin+floor)*2,b.z),new Vector3(b.w*w,(floor-begin)*4,b.d*d));state.coarse.push(c);this.hitOwners.set(c.handle,{building:b.id,component:-1});begin=-1;}
   }
  }
 }
 private ensureFloor(state:Damage,floor:number){
  if(state.activeFloors.has(floor))return;state.activeFloors.add(floor);this.rebuildCoarse(state);const b=state.building;
  for(const c of this.templates.get(b.family!)!){if(c.floor!==floor||c.kind==='decoration'||state.broken.has(c.id))continue;
   const boxes=c.kind==='glass'?[{center:c.center,size:c.size}]:c.collisionBoxes??[],colliders:RAPIER.Collider[]=[];
   for(const box of boxes){if(c.kind!=='glass'&&Math.min(...box.size)<.18)continue;const collider=this.physics.box(new Vector3(b.x+box.center[0],box.center[1],b.z+box.center[2]),new Vector3(...box.size as [number,number,number]));colliders.push(collider);this.hitOwners.set(collider.handle,{building:b.id,component:c.id});}state.colliders.set(c.id,colliders);
  }
 }
'''
s=s.replace(anchor,addition+anchor)
s=s.replace('if(state.broken.has(c.id))return;state.broken.add(c.id);','if(state.broken.has(c.id))return;this.ensureFloor(state,c.floor);state.broken.add(c.id);')
s=s.replace("state.stage=complete?'collapsed':'partial';state.collapse={floor,sector:!complete,next:this.elapsed};", "const lostPosts=supports.filter(c=>state.broken.has(c.id)&&c.size[0]<1),xs=lostPosts.reduce((n,c)=>n+c.center[0],0),zs=lostPosts.reduce((n,c)=>n+c.center[2],0);state.stage=complete?'collapsed':'partial';state.collapse={floor,sector:!complete,xSign:Math.abs(xs)>1?Math.sign(xs):0,zSign:Math.abs(zs)>1?Math.sign(zs):0,next:this.elapsed};")
s=s.replace('const old=this.fragments.find(f=>f.body)!;this.retire(old);','const index=this.fragments.findIndex(f=>f.body);this.retire(this.fragments[index]);this.fragments.splice(index,1);')
s=s.replace('!collapse.sector||c.center[0]>0&&c.center[2]>-2','!collapse.sector||(collapse.xSign===0||c.center[0]*collapse.xSign>0)&&(collapse.zSign===0||c.center[2]*collapse.zSign>0)')
s=s.replace('for(const s of this.states.values()){for(const list','for(const s of this.states.values()){for(const c of s.coarse)this.physics.removeCollider(c);for(const list')
p.write_text(s)
