import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { PhysicsWorld, RAPIER } from './PhysicsWorld';
import { ImpactVfx } from '../vfx/ImpactVfx';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';

interface Piece {mesh:Mesh;collider:RAPIER.Collider|null;position:Vector3;size:Vector3;hp:number;maxHp:number;broken:boolean;}
interface Debris {mesh:Mesh;body:RAPIER.RigidBody;life:number;}
export class Destruction {
  readonly group=new Group();
  readonly pieces:Piece[]=[];
  readonly debris:Debris[]=[];
  broken=0;
  onBreak?: (position:Vector3)=>void;
  private readonly geometry=new BoxGeometry();
  private readonly fragments=Array.from({length:4},(_,index)=>new ConvexGeometry(Array.from({length:8},(_,i)=>new Vector3(
    (i&1?.5:-.5)*(1-((i*7+index*3)%5)*.035),
    (i&2?.5:-.5)*(1-((i*3+index*5)%7)*.035),
    (i&4?.5:-.5)*(1-((i*11+index)%5)*.045),
  ))));
  private readonly concrete=new MeshStandardMaterial({color:'#969389',roughness:.95,metalness:.04});
  private readonly glass=new MeshStandardMaterial({color:'#6c9eac',roughness:.18,metalness:.65});
  private readonly steel=new MeshStandardMaterial({color:'#68737a',roughness:.65,metalness:.6});
  constructor(readonly physics:PhysicsWorld,private readonly vfx:ImpactVfx,private readonly cap:number) {
    // Pre-segmented checkpoint facade. Breaking a tile removes its collider and leaves a real opening.
    for(let row=0;row<3;row++)for(let col=0;col<8;col++)this.add(new Vector3(-5.25+col*1.5,.8+row*1.6,-81),new Vector3(1.47,1.57,.55),this.concrete,65);
    for(const side of [-1,1])for(let col=0;col<4;col++)this.add(new Vector3(side*18.4,2.4,-58-col*2.1),new Vector3(.16,3.8,1.98),this.glass,22);
    for(const [x,z] of [[-6,-61],[8,-75],[-8,-73]])this.add(new Vector3(x,.65,z),new Vector3(1.3,1.3,1.3),this.steel,35);
  }
  private add(position:Vector3,size:Vector3,material:MeshStandardMaterial,hp:number):void {
    const mesh=new Mesh(this.geometry,material);mesh.position.copy(position);mesh.scale.copy(size);mesh.castShadow=mesh.receiveShadow=true;this.group.add(mesh);
    const id=this.pieces.length;
    const collider=this.physics.box(position,size,{kind:'breakable',id});
    this.pieces.push({mesh,collider,position,size,hp,maxHp:hp,broken:false});
  }
  hit(collider:RAPIER.Collider,strength:number,point:Vector3,direction:Vector3):boolean {
    const surface=this.physics.surfaces.get(collider.handle);if(surface?.kind!=='breakable')return false;
    const piece=this.pieces[surface.id!];if(!piece||piece.broken)return false;
    piece.hp-=strength;
    if(piece.hp<=0)this.fracture(piece,direction,Math.min(18,strength/10));
    else this.vfx.mark(point,direction.clone().negate(),.8);
    return piece.broken;
  }
  blast(position:Vector3,radius:number,strength:number,direction?:Vector3):void {
    for(const piece of this.pieces)if(!piece.broken&&piece.position.distanceTo(position)<radius){
      this.hit(piece.collider!,strength*(1-piece.position.distanceTo(position)/(radius+1)),piece.position,direction??piece.position.clone().sub(position).normalize());
    }
  }
  private fracture(piece:Piece,direction:Vector3,strength:number):void {
    piece.broken=true;piece.mesh.visible=false;this.broken++;
    this.physics.removeCollider(piece.collider!);piece.collider=null;
    const glass=piece.mesh.material===this.glass;
    const count=glass?3:4;
    for(let i=0;i<count;i++) {
      while(this.debris.length>=this.cap)this.removeDebris(0);
      const size=piece.size.clone().multiply(new Vector3(.44,.44,.85));
      const p=piece.position.clone().add(new Vector3((i%2-.5)*piece.size.x*.48,(Math.floor(i/2)-.5)*piece.size.y*.48,0));
      const body=this.physics.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x,p.y,p.z).setCcdEnabled(true).setLinearDamping(.32).setAngularDamping(.8));
      const collider=this.physics.world.createCollider(RAPIER.ColliderDesc.cuboid(size.x/2,size.y/2,size.z/2).setDensity(glass?300:650).setFriction(.8).setRestitution(.08),body);
      this.physics.surfaces.set(collider.handle,{kind:'debris'});
      const velocity=direction.clone().multiplyScalar(strength).add(new Vector3((i%2-.5)*2,1+Math.floor(i/2),0));
      body.setLinvel(velocity,true);body.setAngvel({x:i-1,y:1.5,z:1-i},true);
      const mesh=new Mesh(this.fragments[i%4],piece.mesh.material);mesh.scale.copy(size);mesh.position.copy(p);mesh.castShadow=mesh.receiveShadow=true;this.group.add(mesh);
      this.debris.push({mesh,body,life:16});
    }
    this.vfx.burst(piece.position,2,new Vector3(0,1,0),!glass);this.onBreak?.(piece.position);
  }
  update(dt:number):void {
    for(let i=this.debris.length-1;i>=0;i--) {
      const d=this.debris[i];d.life-=dt;
      if(d.life<=0){this.removeDebris(i);continue;}
      d.mesh.position.copy(d.body.translation());d.mesh.quaternion.copy(d.body.rotation());
      if(d.life<1)d.mesh.scale.multiplyScalar(Math.exp(-dt*2));
    }
  }
  private removeDebris(i:number):void {const d=this.debris[i];this.physics.removeBody(d.body);this.group.remove(d.mesh);this.debris.splice(i,1);}
  reset():void {
    while(this.debris.length)this.removeDebris(0);
    this.broken=0;
    this.pieces.forEach((p,id)=>{p.hp=p.maxHp;p.broken=false;p.mesh.visible=true;if(!p.collider)p.collider=this.physics.box(p.position,p.size,{kind:'breakable',id});});
  }
}
