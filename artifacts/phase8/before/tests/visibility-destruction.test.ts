import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { BoxGeometry, BufferAttribute, BufferGeometry, Group, InstancedMesh, Matrix4, MeshBasicMaterial, PerspectiveCamera, Vector3 } from 'three';
import { DamageIndex } from '../src/world/DamageIndex';
import { WorldStreaming } from '../src/world/WorldStreaming';
import { AssetLibrary } from '../src/world/environment/AssetLibrary';
import { collisionTriangles } from '../src/world/CollisionTriangles';
import type { CityLayout, Building } from '../src/world/CityLayout';

test('sparse triangle removal retains every surviving authored triangle through fragmented/repeated removal', () => {
  const source = Uint32Array.from({length: 90}, (_, i) => i);
  const ranges = new Map<number, [number, number][]>();
  for (let t = 0; t < 30; t++) { const id = t % 7; const list = ranges.get(id) ?? []; list.push([t * 3, 3]); ranges.set(id, list); }
  const packed = source.slice(), index = new DamageIndex(packed, ranges), broken = new Set<number>();
  for (const id of [3, 0, 6, 3, 2, 1, 5, 4]) {
    index.remove(id); broken.add(id);
    const actual = Array.from({length: index.count}, (_, i) => packed[i * 3] / 3).sort((a,b) => a-b);
    const expected = Array.from({length: 30}, (_, i) => i).filter(t => !broken.has(t % 7));
    assert.deepEqual(actual, expected);
    for (let i = 0; i < index.count; i++) assert.deepEqual(Array.from(packed.subarray(i * 3, i * 3 + 3)), [packed[i * 3], packed[i * 3] + 1, packed[i * 3] + 2]);
  }
  assert.equal(index.count, 0); assert.deepEqual(source, Uint32Array.from({length: 90}, (_, i) => i));
});

test('removing the final triangle needs only a draw-range change, not a full index upload', () => {
  const array = new Uint16Array([0,1,2,3,4,5]);
  const index = new DamageIndex(array, new Map([[1, [[3,3]]]]));
  index.remove(1); assert.equal(index.count, 1); assert.equal(index.updates(), null);
  index.remove(1); assert.equal(index.count, 1);
});

test('GPU update spans touch swapped slots rather than rebuilding the intact triangle prefix', () => {
  const array = Uint32Array.from({length: 30000}, (_, i) => i);
  const index = new DamageIndex(array, new Map([[1, [[9,3]]]]));
  index.remove(1); assert.deepEqual(index.updates(), {start:9,count:3}); assert.equal(index.updates(), null);
  assert.equal(index.count, 9999); assert.equal(array[9], 29997);
});

test('merged floor collision retains exact authored surfaces, shares vertices and removes only broken components', () => {
 const geometry=new BufferGeometry();geometry.setAttribute('position',new BufferAttribute(new Float32Array([0,0,0, 1,0,0, 1,1,.2, 0,1,0]),3));
 const original=new Uint16Array([0,1,2,0,2,3]),ranges=new Map<number,[number,number][]>([[1,[[0,3]]],[2,[[3,3]]]]);
 const surface=collisionTriangles([{geometry,original,ranges}],new Set([1,2]),[2,3,4]);
 assert.equal(surface.vertices.length,12);assert.deepEqual(Array.from(surface.index.array),[0,1,2,0,2,3]);
 assert.ok(Math.abs(surface.vertices[8]-.8)<1e-6);surface.index.remove(1);
 assert.equal(surface.index.count,1);assert.deepEqual(Array.from(surface.index.array.subarray(0,3)),[0,2,3]);
 assert.deepEqual(Array.from(original),[0,1,2,0,2,3]);geometry.dispose();
});

test('floor collision excludes already broken components and keeps separate material vertex spaces', () => {
 const a=new BufferGeometry(),b=new BufferGeometry();a.setAttribute('position',new BufferAttribute(new Float32Array([0,0,0, 1,0,0, 0,1,0]),3));b.setAttribute('position',new BufferAttribute(new Float32Array([0,0,1, 1,0,1, 0,1,1]),3));
 const part=(geometry:BufferGeometry,id:number)=>({geometry,original:new Uint32Array([0,1,2]),ranges:new Map<number,[number,number][]>([[id,[[0,3]]]])});
 const parts=[part(a,1),part(b,2)],both=collisionTriangles(parts,new Set([1,2]),[1,1,1]);assert.equal(both.vertices.length,18);assert.deepEqual(Array.from(both.index.array),[0,1,2,3,4,5]);
 const remaining=collisionTriangles(parts,new Set([2]),[1,1,1]);assert.equal(remaining.index.count,1);assert.equal(remaining.vertices[2],1);
 a.dispose();b.dispose();
});

function fixture(extraHeight = 1.5) {
  const material = new MeshBasicMaterial(), far = new BoxGeometry(1, 1, 1).translate(0,.5,0);
  const complete = new BoxGeometry(1, extraHeight, 1).translate(0, extraHeight/2, 0);
  const b:Building = {id:1,family:'city_test',assetHeight:180,x:0,z:-1000,w:20,d:20,h:180,
    style:'financial',district:'financial',tile:'test',roof:'roofkit'};
  const layout = {buildings:[b],tiles:new Map([['test',{key:'test',x:0,z:-1000,buildings:[b]}]])} as unknown as CityLayout;
  const parts = new Map([['city_test_180_far',[{geometry:far,material:'test'}]],
    ['city_test_180_near',[{geometry:complete,material:'test'}]], ['city_test_180_mid',[{geometry:complete,material:'test'}]],
    ['city_test_180_skyline',[{geometry:complete,material:'test'}]]]);
  const assets = {revision:0,parts,materials:{premium:{multiDraw:false}},ensureSkyline:async()=>{},
    instance:(key:string, matrices:Matrix4[], parent:Group) => {
      const mesh = new InstancedMesh(parts.get(key)![0].geometry, material, matrices.length);
      matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.computeBoundingSphere();parent.add(mesh);return [mesh];
    }} as unknown as AssetLibrary;
  return {layout,assets,cleanup:()=>{far.dispose();complete.dispose();material.dispose();}};
}

test('source crowns outside estimated building height remain visible at long distance on every quality', () => {
  const f=fixture(), camera=new PerspectiveCamera(4,1,1,2000);
  camera.position.set(0,250,0);camera.lookAt(0,250,-1000);
  for (const quality of ['LOW','MEDIUM','HIGH','ULTRA']) {
    const stream=new WorldStreaming(f.layout,f.assets,quality);
    stream.update(new Vector3(-3000,250,1000),new Vector3(),undefined,true,camera);
    assert.ok(stream.isSkylineVisible(1), quality);assert.equal(stream.loaded.size,0);
    stream.dispose();
  }
  f.cleanup();
});

test('far-plane changes recull a stationary camera without requiring movement', () => {
  const f=fixture(), stream=new WorldStreaming(f.layout,f.assets), camera=new PerspectiveCamera(20,1,1,500);
  camera.position.set(0,90,0);camera.lookAt(0,90,-1000);const focus=new Vector3(-3000,90,1000);
  stream.update(focus,new Vector3(),undefined,true,camera);assert.equal(stream.isFarVisible(1),false);
  camera.far=2000;camera.updateProjectionMatrix();stream.update(focus,new Vector3(),undefined,false,camera);
  assert.equal(stream.isSkylineVisible(1),true);stream.dispose();f.cleanup();
});

test('small camera rotations cannot strand a skyscraper outside a rounded culling cache', () => {
  const f=fixture(), stream=new WorldStreaming(f.layout,f.assets), camera=new PerspectiveCamera(.5,1,1,2000);
  camera.position.set(0,90,0);camera.lookAt(16,90,-1000);const focus=new Vector3(-3000,90,1000);
  stream.update(focus,new Vector3(),undefined,true,camera);assert.equal(stream.isFarVisible(1),false);
  camera.lookAt(14,90,-1000);stream.update(focus,new Vector3(),undefined,false,camera);
  assert.equal(stream.isSkylineVisible(1),true);stream.dispose();f.cleanup();
});

test('complete skyline geometry returns after detail eviction and is suppressed for damaged buildings', () => {
  const f=fixture(), stream=new WorldStreaming(f.layout,f.assets), camera=new PerspectiveCamera(30,1,1,3000);
  camera.position.set(0,90,0);camera.lookAt(0,90,-1000);
  stream.update(new Vector3(0,20,-960),new Vector3(),undefined,true,camera);
  assert.equal(stream.isSkylineVisible(1),false);
  stream.update(new Vector3(-3000,90,1000),new Vector3(),undefined,true,camera);
  assert.equal(stream.isSkylineVisible(1),true);
  stream.hideBuilding(1);assert.equal(stream.isSkylineVisible(1),false);
  stream.setDamageProxy(1,true,'collapsed');assert.equal(stream.isSkylineVisible(1),false);
  stream.dispose();f.cleanup();
});

test('skyline source loading is deduplicated and cannot replace the existing HLOD asset', async () => {
  const library=new AssetLibrary({} as never), placeholder=new BoxGeometry(), full=new BoxGeometry();
  const original=[{geometry:placeholder,material:'proxy'}];library.parts.set('city_test_180_far',original);
  let loads=0, release!:()=>void;
  (library as unknown as {loadFile:(file:string,alias:{from:string;to:string})=>Promise<void>}).loadFile=async(_file,alias)=>{
    loads++;await new Promise<void>(resolve=>{release=resolve;});library.parts.set(alias.to,[{geometry:full,material:'source'}]);
  };
  const a=library.ensureSkyline('city_test',180), b=library.ensureSkyline('city_test',180);
  assert.equal(loads,1);release();await Promise.all([a,b]);
  assert.equal(library.parts.get('city_test_180_far'),original);assert.equal(library.parts.get('city_test_180_skyline')![0].geometry,full);
  await library.ensureSkyline('city_test',180);assert.equal(loads,1);library.dispose();
});
