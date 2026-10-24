import { BufferAttribute, BufferGeometry, CanvasTexture, Color, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, ShaderMaterial, SRGBColorSpace, Vector3 } from 'three';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { CityLayout, LANDMARKS } from '../CityLayout';
import { placement } from '../WorldStreaming';
import { AssetLibrary } from './AssetLibrary';
import { WeatherState } from './WeatherState';

export class CityInfrastructure {
 readonly group=new Group();readonly colliders:import('../../physics/PhysicsWorld').RAPIER.Collider[]=[];
 private water:Mesh;private puddles:Mesh;private time={value:0};private wet={value:0};private night={value:0};
 private haze={value:new Color('#8eabb9')};private density={value:.0003};
 private ownedGeometries:BufferGeometry[]=[];private ownedMaterials:import('three').Material[]=[];private textures:CanvasTexture[]=[];
 constructor(layout:CityLayout,assets:AssetLibrary,private physics?:PhysicsWorld,slice=false){
  const solid=(p:Vector3,size:Vector3)=>{if(physics)this.colliders.push(physics.box(p,size));};
  const plane=(w:number,d:number,material:import('three').Material,x:number,y:number,z:number)=>{const geo=new PlaneGeometry(w,d);this.ownedGeometries.push(geo);const mesh=new Mesh(geo,material);mesh.rotation.x=-Math.PI/2;mesh.position.set(x,y,z);mesh.receiveShadow=true;this.group.add(mesh);return mesh;};
  plane(1904,2048,assets.materials.get('stone'),-72,-.035,0);
  // Keep the deployment floor's precise contact scale, and tile its non-overlapping surroundings.
  solid(new Vector3(0,-.5,-5),new Vector3(300,1,320));
  for(const [left,right,front,back] of [[-1024,880,-1024,-165],[-1024,880,155,1024],[-1024,-150,-165,155],[150,880,-165,155]]){
   for(let x=left;x<right;x+=256)for(let z=front;z<back;z+=256){const w=Math.min(256,right-x),d=Math.min(256,back-z);solid(new Vector3(x+w/2,-.5,z+d/2),new Vector3(w,1,d));}
  }
  solid(new Vector3(936,-16,0),new Vector3(176,1,2048));
  // Authored profile boxes match the actual setback roofs; visuals stay in Blender meshes.
  for(const l of LANDMARKS){if(slice&&l.asset!=='cathedral')continue;assets.instance(l.asset,[placement(l.position.x,0,l.position.z)],this.group);
   if(l.asset==='crown')for(const [y,h,w,d] of [[0,90,54,44],[90,90,46,40],[180,70,34,32],[250,30,24,24]])solid(new Vector3(l.position.x,y+h/2,l.position.z),new Vector3(w,h,d));
   else{
    solid(l.position.clone().add(new Vector3(0,12,0)),new Vector3(30,24,64));solid(l.position.clone().add(new Vector3(0,8,0)),new Vector3(54,16,17));for(const x of [-14,14])solid(l.position.clone().add(new Vector3(x,23,34)),new Vector3(10,46,12));
    if(physics){const desc=RAPIER.ColliderDesc.convexHull(new Float32Array([-15,24,-32,15,24,-32,0,36,-32,-15,24,32,15,24,32,0,36,32]));if(desc){const c=physics.world.createCollider(desc.setTranslation(l.position.x,0,l.position.z).setFriction(.8));physics.surfaces.set(c.handle,{kind:'world'});this.colliders.push(c);}}
   }
  }
  const roadVertices:number[]=[],markVertices:number[]=[],pavingVertices:number[]=[];
  const quad=(list:number[],a:Vector3,b:Vector3,width:number,height:number)=>{
   const offset=b.clone().sub(a).setY(0).normalize().cross(new Vector3(0,1,0)).multiplyScalar(width/2);
   const p=[a.clone().add(offset),a.clone().sub(offset),b.clone().sub(offset),b.clone().add(offset)];for(const index of [0,2,1,0,3,2])list.push(p[index].x,height,p[index].z);
  };
  for(const road of layout.roads){
   if(road.elevated)continue;
   // Preserve the old compound's streets instead of drawing through its buildings.
   const segments:[Vector3,Vector3][]=[];
   if(road.a.x===road.b.x&&Math.abs(road.a.x)<112)segments.push([road.a,new Vector3(road.a.x,0,-150)],[new Vector3(road.a.x,0,90),road.b]);
   else if(road.a.z===road.b.z&&road.a.z>-150&&road.a.z<90)segments.push([road.a,new Vector3(-112,0,road.a.z)],[new Vector3(112,0,road.a.z),road.b]);
   else segments.push([road.a,road.b]);
   const direction=road.b.clone().sub(road.a).normalize(),length=road.a.distanceTo(road.b);
   const offset=direction.clone().cross(new Vector3(0,1,0));
   for(const [a,b] of segments){
    quad(roadVertices,a,b,road.width,.012);
    for(const s of [-1,1]){
     const p=offset.clone().multiplyScalar(s*(road.width/2+1.75)),start=a.clone().add(p),end=b.clone().add(p);quad(pavingVertices,start,end,3.5,.13);
     if(physics){const centre=start.clone().add(end).multiplyScalar(.5),rotation=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.atan2(direction.x,direction.z));const c=physics.world.createCollider(RAPIER.ColliderDesc.cuboid(1.75,.065,start.distanceTo(end)/2).setTranslation(centre.x,.065,centre.z).setRotation(rotation).setFriction(.8));physics.surfaces.set(c.handle,{kind:'world'});this.colliders.push(c);}
    }
   }
   for(let t=0;t<length;t+=12){const a=road.a.clone().addScaledVector(direction,t);if(Math.abs(a.x)<110&&a.z>-150&&a.z<90)continue;quad(markVertices,a,a.clone().addScaledVector(direction,4),.18,.018);}
  }
  for(const [vertices,material] of [[roadVertices,assets.materials.get('road')],[markVertices,assets.materials.get('paint')],[pavingVertices,assets.materials.get('stone')]] as const){
   const geometry=new BufferGeometry();geometry.setAttribute('position',new BufferAttribute(new Float32Array(vertices),3));geometry.computeVertexNormals();
   const uv=new Float32Array(vertices.length/3*2);for(let i=0;i<vertices.length/3;i++){uv[i*2]=vertices[i*3]/3;uv[i*2+1]=vertices[i*3+2]/3;}geometry.setAttribute('uv',new BufferAttribute(uv,2));
   geometry.computeBoundingSphere();this.ownedGeometries.push(geometry);const m=new Mesh(geometry,material);m.receiveShadow=true;this.group.add(m);
  }
  // Crosswalks at four civic intersections: physical widths and no floating lanes.
  const cross:number[]=[];for(const [x,z] of [[128,-304],[-576,-304],[128,352],[-576,480]])for(let n=-4;n<=4;n++)quad(cross,new Vector3(x+n*1.9,0,z-13),new Vector3(x+n*1.9,0,z-8),.8,.022);
  const cg=new BufferGeometry();cg.setAttribute('position',new BufferAttribute(new Float32Array(cross),3));cg.computeVertexNormals();this.ownedGeometries.push(cg);this.group.add(new Mesh(cg,assets.materials.get('paint')));
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
  const containers=[];for(let row=0;row<5;row++)for(let col=0;col<7;col++)containers.push(placement(745+col*3,Math.floor(row/3)*2.6,660+(row%3)*8));assets.instance('container',containers,this.group);
  solid(new Vector3(754,2.6,668),new Vector3(25,5.2,24));
  plane(210,230,assets.materials.get('green'),-580,.025,440);
  const trees=[];for(let n=0;n<32;n++){const a=n/32*Math.PI*2;trees.push(placement(-580+Math.cos(a)*90,0,440+Math.sin(a)*95,.9,1.1,.9));}assets.instance('tree',trees,this.group);
  // Waterfront and outskirts are explicitly scenery, with no pretend city beyond the island.
  const waterMat=new ShaderMaterial({uniforms:{time:this.time,night:this.night,wet:this.wet,haze:this.haze,density:this.density},
   vertexShader:'varying vec3 wp;void main(){wp=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
   fragmentShader:`varying vec3 wp;uniform float time,night,wet,density;uniform vec3 haze;void main(){float w=sin(wp.x*.17+wp.z*.095+time*.6)*sin(wp.z*.24-time*.45)*.012;vec3 color=mix(vec3(.11,.22,.28),vec3(.012,.045,.068),night);color+=w;float depth=length(wp-cameraPosition);color=mix(color,haze,1.-exp(-depth*depth*density*density));gl_FragColor=vec4(color,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>}`});
  this.ownedMaterials.push(waterMat);this.water=plane(11000,11000,waterMat,0,-1.3,0);
  const puddleMat=new ShaderMaterial({uniforms:{time:this.time,wet:this.wet,night:this.night},transparent:true,depthWrite:false,
   vertexShader:'varying vec3 wp;void main(){wp=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
   fragmentShader:`varying vec3 wp;uniform float time,wet,night;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}void main(){float streak=pow(max(0.,sin(wp.x*1.8+sin(wp.z*.12)*.2)),9.)*exp(-abs(wp.z-352.)*.015);float poolMask=smoothstep(.4,.67,noise(wp.xz*.22));vec3 c=mix(vec3(.12,.18,.22),vec3(.018,.045,.065),night);c+=mix(vec3(.15,.25,.3),vec3(.08,.55,.75),night)*streak*.65;float ripple=sin(length(mod(wp.xz,3.)-1.5)*18.-time*8.)*.008;gl_FragColor=vec4(c+ripple,wet*.58*poolMask);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>}`});
  this.ownedMaterials.push(puddleMat);this.puddles=plane(26,180,puddleMat,128,.032,352);
  for(const [text,x,y,z] of [['VESPER / CIVIC ARCHIVE',-640,3,-319],['PRISM  /  CINEMA',146,8,362],['IRONWAKE / PORT AUTHORITY',742,4,602],['MERIDIAN GARDENS',-580,3,565],['CROWN EXCHANGE',328,8,-472]] as const)this.sign(text,x,y,z);
  // Actual authored silhouette modules on the horizon, beyond playable water.
  const coast:number[]=[];for(let i=0;i<128;i++){
   const point=(index:number,radius:number,height:number)=>{const a=index/128*Math.PI*2,r=radius+Math.sin(a*7)*120;return [Math.cos(a)*r,height,Math.sin(a)*r];};
   const inner=point(i,2300,-.3),next=point(i+1,2300,-.3),outer=point(i,4400,80+Math.sin(i*.6)**2*180),outerNext=point(i+1,4400,80+Math.sin((i+1)*.6)**2*180);
   for(const p of [inner,next,outer,next,outerNext,outer])coast.push(...p);
  }
  const cg2=new BufferGeometry();cg2.setAttribute('position',new BufferAttribute(new Float32Array(coast),3));cg2.computeVertexNormals();this.ownedGeometries.push(cg2);this.group.add(new Mesh(cg2,assets.materials.get('green')));
 }
 private sign(text:string,x:number,y:number,z:number):void{
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=64;const ctx=canvas.getContext('2d')!;
  ctx.fillStyle='#101d25';ctx.fillRect(0,0,512,64);ctx.fillStyle='#abd9de';ctx.textAlign='center';ctx.font='24px sans-serif';ctx.fillText(text,256,42);
  const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;this.textures.push(texture);
  const material=new MeshBasicMaterial({map:texture});this.ownedMaterials.push(material);const geometry=new PlaneGeometry(12,1.5);this.ownedGeometries.push(geometry);
  const m=new Mesh(geometry,material);m.position.set(x,y,z);this.group.add(m);
 }
 update(time:number,weather:WeatherState,haze?:Color,density?:number):void{this.time.value=time;this.wet.value=weather.wetness;this.night.value=weather.night;if(haze)this.haze.value.copy(haze);if(density!==undefined)this.density.value=density;this.puddles.visible=weather.wetness>.01;this.water.visible=true;}
 dispose():void{for(const c of this.colliders)this.physics?.removeCollider(c);this.colliders.length=0;this.group.traverse(o=>{if('isInstancedMesh' in o)(o as import('three').InstancedMesh).dispose();});for(const g of this.ownedGeometries)g.dispose();for(const m of this.ownedMaterials)m.dispose();for(const t of this.textures)t.dispose();this.group.removeFromParent();}
}
// Imported directly: no modifications to PhysicsWorld required.
import { RAPIER } from '../../physics/PhysicsWorld';
