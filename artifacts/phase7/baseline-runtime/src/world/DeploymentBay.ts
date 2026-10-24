import {
  BackSide, CanvasTexture, Color, CylinderGeometry, DirectionalLight, FogExp2,
  Group, HemisphereLight, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry,
  RepeatWrapping, RingGeometry, Scene, ShaderMaterial, SphereGeometry, SRGBColorSpace,
  Vector3, PointLight, TorusGeometry, SpotLight,
} from 'three';
import { QualitySettings } from '../config';
import { PhysicsWorld, RAPIER } from '../physics/PhysicsWorld';
import { GeometryBatch } from './GeometryBatch';

export const SPAWN = new Vector3(0,.22,58);
export const COURT = new Vector3(0,.05,-66);
export const COURSE = [new Vector3(0,8,33),new Vector3(-5,15,7),new Vector3(7,20,-18),new Vector3(0,8,-45)];
export class DeploymentBay {
  readonly group=new Group();
  private colliders:RAPIER.Collider[]=[];
  readonly sun=new DirectionalLight('#ffe2b4',3.4);
  readonly hangarLights:PointLight[]=[];
  readonly courseRings:Mesh[]=[];
  private readonly batch=new GeometryBatch();
  private seed=4197;
  private hangarKey!:SpotLight;
  private readonly concrete=new MeshStandardMaterial({color:'#7b817f',roughness:.87,metalness:.04});
  private readonly dark=new MeshStandardMaterial({color:'#2d3942',roughness:.62,metalness:.45});
  private readonly metal=new MeshStandardMaterial({color:'#a7b1b1',roughness:.38,metalness:.78});
  private readonly glass=new MeshStandardMaterial({color:'#426575',roughness:.23,metalness:.55});
  private readonly warm=new MeshStandardMaterial({color:'#c7b294',emissive:'#e0aa58',emissiveIntensity:.36,roughness:.48});
  private readonly light=new MeshStandardMaterial({color:'#d4eced',emissive:'#91c6d6',emissiveIntensity:1.4});
  private readonly paint=new MeshStandardMaterial({color:'#c5bc9d',roughness:.9});

  constructor(scene:Scene,settings:QualitySettings,private readonly physics?:PhysicsWorld,private readonly integrated=false) {
    const finish=surfaceTexture();finish.repeat.set(5,5);this.concrete.map=finish;this.concrete.bumpMap=finish;this.concrete.bumpScale=.055;this.dark.roughnessMap=finish;
    scene.add(this.group);
    if(!integrated){scene.background=new Color('#9daeb9');scene.fog=new FogExp2('#a2afb8',.0034);this.sky(scene);scene.add(new HemisphereLight('#c2d6e7','#56514b',.9));}
    this.sun.position.set(-75,95,60);this.sun.target.position.set(0,0,0);
    this.sun.castShadow=settings.shadows;this.sun.shadow.mapSize.set(settings.shadowSize,settings.shadowSize);
    Object.assign(this.sun.shadow.camera,{left:-38,right:38,top:38,bottom:-38,near:1,far:240});
    this.sun.shadow.normalBias=.04;this.sun.shadow.bias=-.00015;
    if(!integrated)scene.add(this.sun,this.sun.target);
    this.ground();this.district();this.hangar();if(!integrated)this.skyline(settings.cityBlocks);this.streetFurniture();
    const key=this.hangarKey=new SpotLight('#e6d4b9',125,16,Math.PI/4,.8,1.8);key.position.set(-3,5,54);key.target.position.set(0,1,58);key.castShadow=settings.shadows;key.shadow.mapSize.set(1024,1024);key.shadow.normalBias=.02;this.group.add(key,key.target);
    const rim=new SpotLight('#a6c5e3',90,15,Math.PI/3,.7,2);rim.position.set(4,4,62);rim.target.position.set(0,1,58);this.group.add(rim,rim.target);
    this.batch.build(this.group);
    COURSE.forEach((p,i)=>{
      const ring=new Mesh(new TorusGeometry(3.2,.045,5,64),new MeshBasicMaterial({color:'#9ad3dc',transparent:true,opacity:.65}));
      ring.position.copy(p);ring.name=`Flight calibration gate ${i+1}`;this.courseRings.push(ring);this.group.add(ring);
    });
    if(!integrated){for(const x of [-148,148])this.collider(new Vector3(x,100,0),new Vector3(2,200,320));
    for(const z of [-160,150])this.collider(new Vector3(0,100,z),new Vector3(300,200,2));
    this.collider(new Vector3(0,151,0),new Vector3(300,2,320));}
  }
  random():number {this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
  private collider(position:Vector3,size:Vector3):void{const collider=this.physics?.box(position,size);if(collider)this.colliders.push(collider);}
  dispose():void{
    for(const c of this.colliders)this.physics?.removeCollider(c);this.colliders=[];
    const geometries=new Set<import('three').BufferGeometry>(),materials=new Set<import('three').Material>(),textures=new Set<import('three').Texture>();
    this.group.traverse(object=>{
      if(object instanceof Mesh){geometries.add(object.geometry);for(const m of Array.isArray(object.material)?object.material:[object.material])materials.add(m);if('isInstancedMesh' in object)(object as import('three').InstancedMesh).dispose();}
      if(object instanceof SpotLight||object instanceof PointLight)object.dispose();
    });
    for(const material of materials){for(const value of Object.values(material))if(value&&typeof value==='object'&&'isTexture' in value)textures.add(value as import('three').Texture);material.dispose();}
    for(const texture of textures)texture.dispose();for(const geometry of geometries)geometry.dispose();this.group.removeFromParent();this.sun.dispose();
  }
  private solid(mat:MeshStandardMaterial,x:number,y:number,z:number,w:number,h:number,d:number,collision=true):void {
    this.batch.box(mat,x,y,z,w,h,d);
    if(collision)this.collider(new Vector3(x,y,z),new Vector3(w,h,d));
  }
  update(target:Vector3,time:number):void {
    this.hangarKey.shadow.autoUpdate=target.z>38&&Math.abs(target.x)<18;
    const x=Math.round(target.x),z=Math.round(target.z);
    this.sun.target.position.set(x,0,z);this.sun.position.set(x-75,95,z+60);
    this.courseRings.forEach((r,i)=>{r.rotation.z=time*.08+i;r.scale.setScalar(1+Math.sin(time*1.5+i)*.018);});
  }
  setAssemblyLight(t:number):void {this.hangarLights.forEach((l,i)=>l.intensity=75*Math.min(1,Math.max(0,t*7-i*.5)));}
  private sky(scene:Scene):void {
    const sky=new Mesh(new SphereGeometry(800,24,12),new ShaderMaterial({side:BackSide,depthWrite:false,
      uniforms:{top:{value:new Color('#637e9b')},horizon:{value:new Color('#ccd0c8')},sun:{value:new Vector3(-.55,.17,.65).normalize()}},
      vertexShader:'varying vec3 v;void main(){v=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`varying vec3 v;uniform vec3 top;uniform vec3 horizon;uniform vec3 sun;
        void main(){vec3 d=normalize(v);float h=pow(max(d.y,0.),.48);vec3 c=mix(horizon,top,h);
        c+=vec3(.31,.19,.08)*pow(max(dot(d,sun),0.),12.);c+=vec3(1.6,1.1,.5)*pow(max(dot(d,sun),0.),1800.);
        float clouds=sin(d.x*28.+sin(d.z*16.)*2.)*sin(d.z*22.+d.y*19.);c+=smoothstep(.35,.85,clouds)*smoothstep(.08,.2,d.y)*(1.-smoothstep(.35,.7,d.y))*.07;
        gl_FragColor=vec4(c,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
    }));scene.add(sky);
  }
  private ground():void {
    const tex=surfaceTexture();tex.repeat.set(75,75);
    const road=new MeshStandardMaterial({color:'#606365',map:tex,roughness:.87,metalness:.08});
    const ground=new Mesh(new PlaneGeometry(300,320),road);ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;this.group.add(ground);
    if(!this.integrated)this.collider(new Vector3(0,-.5,-5),new Vector3(300,1,320));
    for(const side of [-1,1]) {
      this.solid(this.concrete,side*17,.1,-23,9,.2,176);
      this.batch.box(this.paint,side*10.4,.011,-23,.12,.015,178);
      for(let z=-116;z<82;z+=7)this.batch.box(this.paint,side*2.1,.012,z,.09,.018,2.4);
    }
    for(const z of [-37,36])for(let i=-4;i<=4;i++)this.batch.box(this.paint,i*2.2,.017,z,1.1,.02,3.2);
    this.solid(this.concrete,0,.015,-67,37,.03,37,false);
    for(let x=-16;x<=16;x+=4)for(let z=-82;z<=-52;z+=4){
      this.batch.box(this.dark,x,.04,z,.025,.014,4);this.batch.box(this.dark,x+2,.04,z-2,4,.014,.025);
    }
    this.label('PORT HELIX',-18,2,-45,7,1.2,Math.PI/2);
    this.label('09  /  QUARANTINE',0,.055,-84,12,1.3,-Math.PI/2,true);
    if(this.integrated)return;
    const water=new Mesh(new PlaneGeometry(700,1000),new MeshStandardMaterial({color:'#4e747e',roughness:.24,metalness:.66}));
    water.rotation.x=-Math.PI/2;water.position.set(505,-.7,-30);this.group.add(water);
    this.solid(this.concrete,144,1,-5,2,2,310);
  }
  private district():void {
    const blocks=[[-32,28,24,23,40],[32,26,25,25,54],[-34,-8,28,25,61],[33,-13,24,31,35],
      [-34,-65,23,29,32],[37,-67,27,27,49],[-34,-106,25,28,67],[34,-110,27,28,43],
      [-68,37,28,30,28],[68,40,29,29,37],[-72,-6,30,32,49],[72,-7,30,28,72],
      [-73,-59,28,32,60],[74,-65,26,35,27],[-76,-113,30,32,91],[72,-117,33,29,63]];
    blocks.forEach(([x,z,w,d,h],i)=>this.building(x,z,w,d,h,i));
    const x=-76,z=-113;
    this.solid(this.metal,x-8,96,z,3,18,13);this.solid(this.metal,x+8,101,z,3,28,13);
    this.solid(this.dark,x,110,z,19,2,13);this.solid(this.metal,x+8,127,z,1,26,1);
    this.label('HELIX / 04',-20,14,20,10,2,Math.PI/2);
    this.label('AEGIS SYSTEMS',20,7,42,10,1.5,-Math.PI/2);
    this.solid(this.dark,0,30,-5,43,2,5);this.solid(this.glass,0,32,-5,42,2.7,4.4);
    for(let x=-19;x<20;x+=4)this.batch.box(this.metal,x,32,-2.7,.15,3,.15);
  }
  private building(x:number,z:number,w:number,d:number,h:number,index:number):void {
    const bodyMat=index%3===0?this.concrete:this.dark;
    this.solid(bodyMat,x,2.8,z,w+1.4,5.6,d+1.4);
    this.solid(this.glass,x,h/2+3,z,w,h-6,d);
    this.solid(this.concrete,x,h-.5,z,w+1,1.1,d+1);
    for(let y=7;y<h-1;y+=3.3) {
      this.batch.box(this.dark,x,y,z,w+.2,.3,d+.2);
      for(const s of [-1,1])for(let px=-w/2+1.7;px<w/2;px+=2.7) {
        if(this.random()>.74)this.batch.box(this.warm,x+px,y+1.25,z+s*(d/2+.025),1.75,1.7,.04);
      }
    }
    for(const s of [-1,1]) {
      for(let px=-w/2;px<=w/2+.1;px+=3.5)this.batch.box(this.metal,x+px,h/2+2,z+s*(d/2+.11),.11,h-4,.25);
      for(let pz=-d/2;pz<=d/2+.1;pz+=3.5)this.batch.box(this.metal,x+s*(w/2+.11),h/2+2,z+pz,.25,h-4,.11);
      this.batch.box(bodyMat,x+s*(w/2-.3),h/2,z,.75,h,d+.5);
      this.batch.box(this.metal,x+s*(w/2+.15),h+1,z,.3,1.4,d);
      this.batch.box(this.dark,x+s*(w/2+1.4),4.1,z,3,.24,d*.65);
      for(let k=-1;k<=1;k++)this.batch.box(this.glass,x+s*(w/2+.76),2,z+k*4,.08,3.1,3.1);
    }
    this.batch.box(this.metal,x,h+1,z-d/2,w,1.4,.3);this.batch.box(this.metal,x,h+1,z+d/2,w,1.4,.3);
    for(let k=0;k<3;k++) {
      this.batch.box(this.dark,x-5+k*4,h+1.1,z,2.8,1.5,4);
      for(let n=0;n<5;n++)this.batch.box(this.metal,x-5+k*4,h+1.88,z-1.5+n*.65,2.3,.06,.12);
    }
    this.solid(this.concrete,x,h+2,z+d*.25,5,4,5);
    this.batch.box(this.light,x-w/2-.3,h-4,z,.06,.25,4.5);
  }
  private hangar():void {
    this.solid(this.dark,0,.06,59,26,.12,29,false);
    this.solid(this.dark,0,7,71,27,14,1);
    this.solid(this.dark,0,12,59,27,1,26);
    for(const side of [-1,1]) {
      this.solid(this.concrete,side*13,6,59,1.1,12,26);
      for(const z of [48,55,63,70]){
        this.solid(this.metal,side*12.2,5.7,z,.5,11.4,.65);
        this.batch.box(this.light,side*11.9,6,z,.07,7.5,.15);
      }
      for(const z of [53,61,68]){
        this.batch.box(this.metal,side*9.5,1.7,z,2.5,3.4,2);
        this.batch.box(this.dark,side*9.5,2,z-1.02,1.9,2.3,.09);
        for(let i=0;i<6;i++)this.batch.box(this.metal,side*9.5,1+i*.3,z-1.1,1.5,.09,.1);
      }
      this.batch.box(this.paint,side*5,.14,59,.18,.03,23);
      const light=new PointLight('#b4dfff',75,25,2);light.position.set(side*4,5,57);this.group.add(light);this.hangarLights.push(light);
    }
    for(const z of [49,57,66]){
      this.batch.box(this.metal,0,11.4,z,25,.7,.8);this.batch.box(this.light,0,10.95,z,12,.08,.24);
    }
    const platform=new Mesh(new CylinderGeometry(3.6,3.8,.1,64),this.metal);platform.position.set(0,.15,58);platform.receiveShadow=true;this.group.add(platform);
    this.collider(new Vector3(0,.1,58),new Vector3(5.7,.2,5.7));
    const ring=new Mesh(new RingGeometry(3.2,3.25,64),this.light);ring.rotation.x=-Math.PI/2;ring.position.set(0,.21,58);this.group.add(ring);
    this.label('A E G I S',0,7.7,70.4,10,2.3,Math.PI);
    this.label('AER-7   /   DEPLOYMENT BAY',0,5.7,70.38,10,.6,Math.PI);
    for(let x=-10;x<=10;x+=2)this.batch.box(this.paint,x,.13,46,1,.015,.35);
  }
  private streetFurniture():void {
    for(const s of [-1,1])for(let z=-119;z<43;z+=19) {
      this.solid(this.metal,s*12.5,2.7,z,.12,5.4,.15);
      this.batch.box(this.dark,s*12,5.4,z,1.1,.15,.45);this.batch.box(this.warm,s*12,5.3,z,.7,.04,.3);
      this.solid(this.concrete,s*16,.4,z+4,3.5,.8,1.3);
      this.batch.box(this.dark,s*16,.86,z+4,3.1,.16,1.1);
      for(let i=-1;i<=1;i++)this.batch.box(this.dark,s*16+i,.97,z+4,.5,.17,.7);
    }
    for(const [x,z] of [[8,16],[-8,-18],[9,-111],[-8,-96],[54,50]]) {
      this.solid(this.dark,x,.65,z,2.3,.8,4.9);
      this.batch.box(this.metal,x,1.2,z-.15,2.15,.45,4);
      this.batch.box(this.glass,x,1.55,z-.2,1.8,.55,2.5);
      for(const side of [-1,1])for(const dz of [-1.5,1.5])this.batch.box(this.dark,x+side*1.08,.42,z+dz,.3,.7,.9);
      for(const side of [-1,1])this.batch.box(this.light,x+side*.8,1,z-2.5,.48,.14,.05);
    }
    for(const x of [-13,13])for(let z=-80;z<=-52;z+=4)this.solid(this.metal,x,.55,z,.14,1.1,.14);
  }
  private skyline(count:number):void {
    for(let i=0;i<count;i++) {
      const a=i/count*Math.PI*2,r=230+this.random()*120,x=Math.cos(a)*r,z=Math.sin(a)*r;
      const h=20+this.random()*95,w=12+this.random()*15,d=14+this.random()*19;
      this.batch.box(this.dark,x,h/2,z,w,h,d);
      this.batch.box(this.concrete,x,h*.7,z,w*.86,h*.6,d*.86);
      for(let y=5;y<h;y+=6)this.batch.box(this.glass,x,y,z,w+.05,.9,d+.05);
    }
  }
  private label(text:string,x:number,y:number,z:number,w:number,h:number,angle:number,floor=false):void {
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=128;
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='#b8c8cb';ctx.font='600 62px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,512,64,1000);
    const tex=new CanvasTexture(canvas);tex.colorSpace=SRGBColorSpace;
    const mesh=new Mesh(new PlaneGeometry(w,h),new MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,opacity:.8}));
    mesh.position.set(x,y,z);if(floor)mesh.rotation.x=angle;else mesh.rotation.y=angle;
    this.group.add(mesh);
  }
}
function surfaceTexture():CanvasTexture {
  const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d')!;
  const image=ctx.createImageData(256,256);let seed=912;
  for(let i=0;i<image.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const v=145+seed%34;image.data[i]=v;image.data[i+1]=v;image.data[i+2]=v;image.data[i+3]=255;}
  ctx.putImageData(image,0,0);const texture=new CanvasTexture(c);texture.colorSpace=SRGBColorSpace;texture.wrapS=texture.wrapT=RepeatWrapping;texture.anisotropy=4;return texture;
}

