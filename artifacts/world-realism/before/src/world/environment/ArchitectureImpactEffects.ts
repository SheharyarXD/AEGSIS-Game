import { BufferAttribute, BufferGeometry, Group, InstancedMesh, Matrix4, PlaneGeometry, Points, Quaternion, ShaderMaterial, Vector3 } from 'three';
interface Scar {id:number;p:Vector3;n:Vector3;radius:number;heat:number;hits:number;}
interface Fire {p:Vector3;age:number;life:number;size:number;}
/** Bounded facade damage records and four pooled GPU draws, independent of combat/HUD effects. */
export class ArchitectureImpactEffects {
 readonly group=new Group();readonly scars:Scar[]=[];private fires:Fire[]=[];private clock=0;private budget=64;
 private marks:InstancedMesh;private flames:InstancedMesh;private smoke:Points;private sparks:Points;
 private particles:{p:Vector3;v:Vector3;age:number;life:number;size:number;hot:boolean}[]=[];
 private geometry=new PlaneGeometry(1,1);private smokeGeometry=new BufferGeometry();private sparkGeometry=new BufferGeometry();
 private zero=new Matrix4().makeScale(0,0,0);
 constructor(){
  const marks=new ShaderMaterial({transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3,
   vertexShader:'varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',
   fragmentShader:'varying vec2 v;float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}void main(){vec2 p=v*2.-1.;float r=length(p);float ragged=r+sin(atan(p.y,p.x)*13.)*.065+hash(floor(v*37.))*.08;float a=(1.-smoothstep(.28,.98,ragged))*.72;float chip=step(.84,hash(floor(v*24.)))*(1.-smoothstep(.7,1.,r));gl_FragColor=vec4(mix(vec3(.021,.018,.015),vec3(.17,.16,.14),chip*.65),a);}' });
  this.marks=new InstancedMesh(this.geometry,marks,96);this.marks.count=0;this.marks.frustumCulled=false;this.marks.name='Persistent localized facade scorch';this.group.add(this.marks);
  const flame=new ShaderMaterial({transparent:true,depthWrite:false,uniforms:{clock:{value:0}},
   vertexShader:'varying vec2 v;varying float seed;void main(){v=uv;seed=instanceMatrix[3].x+instanceMatrix[3].z;vec4 center=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);center.xy+=position.xy*vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));gl_Position=projectionMatrix*center;}',
   fragmentShader:'varying vec2 v;varying float seed;uniform float clock;void main(){vec2 p=v*2.-1.;float wobble=sin(v.y*13.-clock*9.+seed)*.13+sin(v.y*27.-clock*13.)*.04;float shape=1.-abs(p.x+wobble)/(max(.12,1.-v.y)*.58);float edge=smoothstep(0.,.24,shape)*smoothstep(0.,.13,v.y)*(1.-smoothstep(.65,1.,v.y));vec3 c=mix(vec3(1.,.10,.005),vec3(1.,.82,.27),pow(max(0.,shape),2.)*(1.-v.y));gl_FragColor=vec4(c*1.7,edge*.75);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'});
  this.flames=new InstancedMesh(this.geometry,flame,12);this.flames.count=0;this.flames.frustumCulled=false;this.flames.name='Pooled impact-side fire';this.group.add(this.flames);
  const make=(g:BufferGeometry,hot:boolean)=>{g.setAttribute('position',new BufferAttribute(new Float32Array(256*3),3));g.setAttribute('size',new BufferAttribute(new Float32Array(256),1));g.setAttribute('alpha',new BufferAttribute(new Float32Array(256),1));g.setDrawRange(0,0);const m=new ShaderMaterial({transparent:true,depthWrite:false,
    vertexShader:'attribute float size,alpha;varying float a;void main(){a=alpha;vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=min(96.,size*720./max(2.,-p.z));}',
    fragmentShader:hot?'varying float a;void main(){float r=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(1.,.50,.08,a*(1.-smoothstep(.1,1.,r)));}':'varying float a;void main(){vec2 p=gl_PointCoord*2.-1.;float r=length(p);float noise=sin(p.x*19.+p.y*11.)*sin(p.y*23.)*.06;float edge=1.-smoothstep(.35,1.,r+noise);gl_FragColor=vec4(.13,.14,.145,a*edge);}' });const o=new Points(g,m);o.frustumCulled=false;this.group.add(o);return o;};
  this.smoke=make(this.smokeGeometry,false);this.sparks=make(this.sparkGeometry,true);
 }
 setQuality(q:string){this.budget=q==='LOW'?64:q==='MEDIUM'?112:q==='HIGH'?176:256;}
 impact(point:Vector3,normal:Vector3,strength:number,id:number,heavy=false){
  if(strength<2)return;const scar=this.scars.find(s=>s.id===id&&s.p.distanceToSquared(point)<5);let target=scar;
  if(target){target.hits++;target.radius=Math.min(6,target.radius+.035*Math.min(strength,30));target.heat=this.clock;}else{target={id,p:point.clone().addScaledVector(normal,.055),n:normal.clone().normalize(),radius:heavy?2.8:1.1,heat:this.clock,hits:1};if(this.scars.length===96)this.scars.shift();this.scars.push(target);}
  // Lasers heat the same scar; coalesce emissions instead of creating effects every tick.
  if(target.hits%5!==1&&!heavy)return;
  if(heavy||target.hits>8){const fire=this.fires.find(f=>f.p.distanceToSquared(point)<9);if(fire){fire.age=0;fire.life=10;}else{if(this.fires.length>=12)this.fires.shift();this.fires.push({p:point.clone().addScaledVector(normal,.45),age:0,life:heavy?12:5,size:heavy?2.5:1.2});}}
  const count=heavy?16:6;for(let i=0;i<count;i++){if(this.particles.length>=this.budget)this.particles.shift();const hot=i%4===0,phase=i*2.399;this.particles.push({p:point.clone().addScaledVector(normal,.2),v:new Vector3(Math.cos(phase)*.8,hot?2.8:1.2,Math.sin(phase)*.8).addScaledVector(normal,hot?3:.55),age:0,life:hot?.7+i*.012:4+i*.15,size:hot?.09:1.4,hot});}
 }
 update(dt:number,point:Vector3){this.clock+=dt;const q=new Quaternion(),m=new Matrix4();let n=0;
  for(const s of this.scars)if(s.p.distanceToSquared(point)<240*240){q.setFromUnitVectors(new Vector3(0,0,1),s.n);m.compose(s.p,q,new Vector3(s.radius*2,s.radius*2,1));this.marks.setMatrixAt(n++,m);}this.marks.count=n;this.marks.instanceMatrix.needsUpdate=true;
  this.fires=this.fires.filter(f=>(f.age+=dt)<f.life);n=0;for(const f of this.fires)if(f.p.distanceToSquared(point)<190*190){m.compose(f.p.clone().add(new Vector3(0,f.size*.55,0)),new Quaternion(),new Vector3(f.size,f.size*1.7,1));this.flames.setMatrixAt(n++,m);if(this.clock%0.15<dt&&this.particles.length<this.budget)this.particles.push({p:f.p.clone().add(new Vector3(0,f.size,0)),v:new Vector3(.12,1.7,.14),age:0,life:4.2,size:1.7,hot:false});}this.flames.count=n;this.flames.instanceMatrix.needsUpdate=true;(this.flames.material as ShaderMaterial).uniforms.clock.value=this.clock;
  this.particles=this.particles.filter(p=>{p.age+=dt;if(p.age>=p.life)return false;p.p.addScaledVector(p.v,dt);if(p.hot)p.v.y-=dt*8;return true;});
  for(const [g,hot] of [[this.smokeGeometry,false],[this.sparkGeometry,true]] as const){let count=0;for(const p of this.particles){if(p.hot!==hot||p.p.distanceToSquared(point)>210*210)continue;const life=p.age/p.life;(g.attributes.position as BufferAttribute).setXYZ(count,p.p.x,p.p.y,p.p.z);(g.attributes.size as BufferAttribute).setX(count,p.size*(hot?1:1+life*2));(g.attributes.alpha as BufferAttribute).setX(count,(1-life)*(hot?.95:.24)*Math.min(1,p.age*7));count++;}g.setDrawRange(0,count);for(const a of Object.values(g.attributes))a.needsUpdate=true;}
 }
 diagnostics(){return {scars:this.scars.length,fires:this.fires.length,particles:this.particles.length,particleCap:this.budget};}
 reset(){this.scars.length=0;this.fires=[];this.particles=[];this.marks.count=this.flames.count=0;this.smokeGeometry.setDrawRange(0,0);this.sparkGeometry.setDrawRange(0,0);this.clock=0;}
 dispose(){this.reset();this.marks.setMatrixAt(0,this.zero);this.marks.dispose();this.flames.dispose();this.geometry.dispose();this.smokeGeometry.dispose();this.sparkGeometry.dispose();for(const o of [this.marks,this.flames,this.smoke,this.sparks])(o.material as ShaderMaterial).dispose();this.group.removeFromParent();}
}
