import { BufferAttribute, BufferGeometry, DoubleSide, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, PlaneGeometry, Points, Quaternion, ShaderMaterial, Vector3 } from 'three';
interface Scar {id:number;p:Vector3;n:Vector3;radius:number;heat:number;hits:number;hidden?:boolean;misses?:number;}
interface Fire {id:number;p:Vector3;n:Vector3;age:number;life:number;size:number;seed:number;next:number;hidden?:boolean;misses?:number;}
interface Particle {p:Vector3;v:Vector3;age:number;life:number;size:number;hot:boolean;seed:number;dust:boolean;}
const noise=`float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float ns(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+1.),f.x),f.y);}float fb(vec2 p){return ns(p)*.57+ns(p*2.13+3.1)*.28+ns(p*4.27+11.)*.15;}`;
/** Four bounded GPU batches. Persistent scars, surface-bound fire and wind-driven smoke have separate lifetimes. */
export class ArchitectureImpactEffects {
 readonly group=new Group();readonly scars:Scar[]=[];private fires:Fire[]=[];private particles:Particle[]=[];
 private clock=0;private budget=64;private wind=1;private seed=0;private pending=new Set<number>();private checked=0;
 private surface?: (id:number,p:Vector3,n:Vector3)=>{p:Vector3;n:Vector3}|null;
 private marks:InstancedMesh;private flames:InstancedMesh;private smoke:InstancedMesh;private sparks:Points;
 private geometry=new PlaneGeometry(1,1);private smokeGeometry=new PlaneGeometry(1,1);private flameGeometry=new PlaneGeometry(1,1);private sparkGeometry=new BufferGeometry();
 private uniforms={clock:{value:0},night:{value:0}};
 constructor(){
  const mark=new ShaderMaterial({transparent:true,depthWrite:false,side:DoubleSide,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3,
   vertexShader:'varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',
   fragmentShader:`varying vec2 v;${noise}void main(){vec2 p=v*2.-1.;float r=length(p)+(fb(v*9.)-.5)*.28;float edge=1.-smoothstep(.25,1.,r);float chip=smoothstep(.68,.85,ns(v*35.));vec3 c=mix(vec3(.024,.021,.017),vec3(.22,.20,.17),chip*.5);gl_FragColor=vec4(c,edge*.78);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`});
  this.marks=new InstancedMesh(this.geometry,mark,96);this.marks.count=0;this.marks.frustumCulled=false;this.marks.name='Persistent surface scorch';this.group.add(this.marks);
  const vertex=`attribute vec4 phase;varying vec2 v;varying vec4 f;void main(){v=uv;f=phase;vec4 c=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);vec2 p=position.xy;float a=phase.w;${''}mat2 r=mat2(cos(a),-sin(a),sin(a),cos(a));p=r*p;c.xy+=p*vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));gl_Position=projectionMatrix*c;}`;
  this.flameGeometry.setAttribute('phase',new InstancedBufferAttribute(new Float32Array(36*4),4));
  const flame=new ShaderMaterial({transparent:true,depthWrite:false,uniforms:this.uniforms,vertexShader:vertex,
   fragmentShader:`varying vec2 v;varying vec4 f;uniform float clock;${noise}void main(){vec2 p=v;float turbulence=fb(vec2(p.x*7.+f.z,p.y*8.-clock*5.));float lean=sin(p.y*6.+f.z+clock*2.)*.12*p.y;float width=(1.-p.y)*.43;float field=width-abs(p.x-.5+lean)+(turbulence-.5)*.23;float a=smoothstep(-.04,.07,field)*smoothstep(0.,.16,p.y)*(1.-smoothstep(.64,1.,p.y));float core=smoothstep(.05,.28,field)*(1.-p.y);vec3 c=mix(vec3(.65,.045,.005),vec3(1.7,.9,.22),core);gl_FragColor=vec4(c,a*f.x*.68);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`});
  this.flames=new InstancedMesh(this.flameGeometry,flame,36);this.flames.count=0;this.flames.frustumCulled=false;this.flames.name='Rim-attached turbulent flame tongues';this.group.add(this.flames);
  this.smokeGeometry.setAttribute('phase',new InstancedBufferAttribute(new Float32Array(256*4),4));
  const smoke=new ShaderMaterial({transparent:true,depthWrite:false,uniforms:this.uniforms,vertexShader:vertex,
   fragmentShader:`varying vec2 v;varying vec4 f;uniform float clock,night;${noise}void main(){vec2 p=v*2.-1.;float n=fb(v*4.+vec2(f.z,clock*.10));float r=length(p)+(n-.5)*.35;float edge=1.-smoothstep(.44,1.,r);float density=(.42+n*.58)*edge;vec3 col=mix(vec3(.13,.14,.15),vec3(.32,.30,.26),f.y);col=mix(col,col*.46,night*.65);col+=vec3(.065)*(1.-r)*n;gl_FragColor=vec4(col,f.x*density);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`});
  this.smoke=new InstancedMesh(this.smokeGeometry,smoke,256);this.smoke.count=0;this.smoke.frustumCulled=false;this.smoke.name='Advected layered smoke and structural dust';this.group.add(this.smoke);
  this.sparkGeometry.setAttribute('position',new BufferAttribute(new Float32Array(256*3),3));this.sparkGeometry.setAttribute('size',new BufferAttribute(new Float32Array(256),1));this.sparkGeometry.setAttribute('alpha',new BufferAttribute(new Float32Array(256),1));this.sparkGeometry.setDrawRange(0,0);
  const spark=new ShaderMaterial({transparent:true,depthWrite:false,vertexShader:'attribute float size,alpha;varying float a;void main(){a=alpha;vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=min(120.,size*720./max(2.,-p.z));}',fragmentShader:'varying float a;void main(){float r=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(2.,.95,.25,a*(1.-smoothstep(.05,1.,r)));\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'});
  this.sparks=new Points(this.sparkGeometry,spark);this.sparks.frustumCulled=false;this.group.add(this.sparks);
 }
 setQuality(q:string){this.budget=q==='LOW'?64:q==='MEDIUM'?112:q==='HIGH'?176:256;this.particles.splice(0,Math.max(0,this.particles.length-this.budget));}
 setWeather(wind:number,night:number){this.wind=Math.max(0,Math.min(20,wind));this.uniforms.night.value=night;}
 setSurfaceResolver(resolve:NonNullable<ArchitectureImpactEffects['surface']>){this.surface=resolve;}
 invalidate(id:number){this.pending.add(id);}
 private add(p:Particle){if(this.particles.length>=this.budget)this.particles.shift();this.particles.push(p);}
 impact(point:Vector3,normal:Vector3,strength:number,id:number,heavy=false){
  if(strength<2)return;const n=normal.clone().normalize();let s=this.scars.find(s=>s.id===id&&s.p.distanceToSquared(point)<5);
  if(s){s.hits++;s.radius=Math.min(4.6,s.radius+.025*Math.min(strength,30));s.heat=this.clock;}else{s={id,p:point.clone().addScaledVector(n,.055),n,radius:heavy?1.9:.65,heat:this.clock,hits:1};if(this.scars.length===96)this.scars.shift();this.scars.push(s);}
  this.pending.add(id);if(s.hits%5!==1&&!heavy)return;
  if(heavy||s.hits>8){const f=this.fires.find(f=>f.id===id&&f.p.distanceToSquared(point)<12);if(f){f.age=0;f.life=Math.min(18,f.life+2);f.size=Math.min(2.4,f.size+.18);}else{if(this.fires.length>=12)this.fires.shift();this.fires.push({id,p:point.clone().addScaledVector(n,.11),n:n.clone(),age:0,life:heavy?12:6,size:heavy?1.55:.85,seed:++this.seed,next:this.clock});}}
  for(let i=0;i<(heavy?24:7);i++){const seed=++this.seed,hot=i%3===0,a=seed*2.399;this.add({p:point.clone().addScaledVector(n,.16),v:new Vector3(Math.cos(a)*1.1,hot?2.9:1.5,Math.sin(a)*1.1).addScaledVector(n,hot?4:.9),age:0,life:hot?.45+(i%5)*.11:3.5+(i%7)*.45,size:hot?(i===0&&heavy?2.8:.07+(i%3)*.025):.8+(i%4)*.24,hot,seed,dust:false});}
 }
 structural(point:Vector3,size:number,id:number){
  this.invalidate(id);for(let i=0;i<20;i++){const a=i*2.399,s=++this.seed;this.add({p:point.clone().add(new Vector3(Math.cos(a)*size*.36,(i%3)*.18,Math.sin(a)*size*.36)),v:new Vector3(Math.cos(a)*2.4,1.5+(i%4)*.4,Math.sin(a)*2.4),age:0,life:5+(i%6)*.6,size:Math.min(4,.9+size*.13),hot:false,seed:s,dust:true});}
 }
 update(dt:number,point:Vector3){
  this.clock+=dt;this.uniforms.clock.value=this.clock;
  if(this.surface&&this.pending.size&&this.clock-this.checked>.2){const retry=new Set<number>();for(let i=this.scars.length-1;i>=0;i--){const s=this.scars[i];if(!this.pending.has(s.id))continue;const hit=this.surface(s.id,s.p,s.n);if(hit){s.p.copy(hit.p).addScaledVector(hit.n,.035);s.n.copy(hit.n);s.hidden=false;s.misses=0;}else{s.hidden=true;s.misses=(s.misses??0)+1;if(s.misses>=3)this.scars.splice(i,1);else retry.add(s.id);}}
   this.fires=this.fires.filter(f=>{if(!this.pending.has(f.id))return true;const hit=this.surface!(f.id,f.p,f.n);if(!hit){f.hidden=true;f.misses=(f.misses??0)+1;if(f.misses>=3)return false;retry.add(f.id);return true;}f.p.copy(hit.p).addScaledVector(hit.n,.12);f.n.copy(hit.n);f.hidden=false;f.misses=0;return true;});this.pending=retry;this.checked=this.clock;}
  const q=new Quaternion(),m=new Matrix4(),scale=new Vector3();let count=0;
  for(const s of this.scars)if(!s.hidden&&s.p.distanceToSquared(point)<240**2){q.setFromUnitVectors(new Vector3(0,0,1),s.n);m.compose(s.p,q,scale.set(s.radius*2,s.radius*2,1));this.marks.setMatrixAt(count++,m);}this.marks.count=count;this.marks.instanceMatrix.needsUpdate=true;
  this.fires=this.fires.filter(f=>(f.age+=dt)<f.life&&f.p.distanceToSquared(point)<260**2);count=0;
  for(const f of this.fires){if(f.hidden)continue;const fade=Math.min(1,(f.life-f.age)*.65),growth=1+Math.min(4,this.scars.find(s=>s.id===f.id&&s.p.distanceToSquared(f.p)<16)?.hits??0)*.035;
   for(let i=0;i<3;i++){const size=f.size*(i===0?1:.62)*growth,offset=new Vector3(Math.sin(f.seed+i*2.4)*.24,0,Math.cos(f.seed+i*2.4)*.24);const p=f.p.clone().add(offset).add(new Vector3(0,size*.65,0));m.compose(p,new Quaternion(),scale.set(size,size*(1.6+i*.17),1));this.flames.setMatrixAt(count,m);(this.flameGeometry.attributes.phase as InstancedBufferAttribute).setXYZW(count++,fade,0,f.seed+i*6.7,Math.sin(f.seed+i)*.09);}
   if(this.clock>=f.next){f.next=this.clock+.21+(.5+.5*Math.sin(f.seed+this.clock*3.2))*.19;this.add({p:f.p.clone().add(new Vector3(0,f.size*.7,0)),v:f.n.clone().multiplyScalar(.18).add(new Vector3(.08,1.5+(f.seed%4)*.19,.12)),age:0,life:4.8+(f.seed%5)*.6,size:f.size*.68,hot:false,seed:++this.seed,dust:false});}
  }this.flames.count=count;this.flames.instanceMatrix.needsUpdate=true;this.flameGeometry.attributes.phase.needsUpdate=true;
  this.particles=this.particles.filter(p=>{p.age+=dt;if(p.age>=p.life)return false;p.v.y+=dt*(p.hot?-9:.09);if(!p.hot){p.v.x+=(this.wind*.13-p.v.x)*dt*.35;p.v.z+=(this.wind*.075-p.v.z)*dt*.35;}p.p.addScaledVector(p.v,dt);return true;});
  let smoke=0,sparks=0;for(const p of this.particles){if(p.p.distanceToSquared(point)>230**2)continue;const life=p.age/p.life,fade=Math.min(1,p.age*9)*Math.pow(1-life,1.35);if(p.hot){(this.sparkGeometry.attributes.position as BufferAttribute).setXYZ(sparks,p.p.x,p.p.y,p.p.z);(this.sparkGeometry.attributes.size as BufferAttribute).setX(sparks,p.size*(p.size>1?Math.max(.1,1-p.age*8):1));(this.sparkGeometry.attributes.alpha as BufferAttribute).setX(sparks++,fade*.95);}else{const size=p.size*(1+life*2.5);m.compose(p.p,new Quaternion(),scale.set(size*1.14,size,1));this.smoke.setMatrixAt(smoke,m);(this.smokeGeometry.attributes.phase as InstancedBufferAttribute).setXYZW(smoke++,fade*(p.dust?.46:.37),p.dust?1:0,p.seed,p.seed*2.399+p.age*.08);}}
  this.smoke.count=smoke;this.smoke.instanceMatrix.needsUpdate=true;this.smokeGeometry.attributes.phase.needsUpdate=true;this.sparkGeometry.setDrawRange(0,sparks);for(const a of Object.values(this.sparkGeometry.attributes))a.needsUpdate=true;
 }
 diagnostics(){return {scars:this.scars.length,fires:this.fires.length,particles:this.particles.length,particleCap:this.budget,batches:4,wind:this.wind};}
 reset(){this.scars.length=0;this.fires=[];this.particles=[];this.pending.clear();this.marks.count=this.flames.count=this.smoke.count=0;this.sparkGeometry.setDrawRange(0,0);this.clock=this.checked=0;}
 dispose(){this.reset();for(const m of [this.marks,this.flames,this.smoke])m.dispose();for(const g of [this.geometry,this.flameGeometry,this.smokeGeometry,this.sparkGeometry])g.dispose();for(const o of [this.marks,this.flames,this.smoke,this.sparks])(o.material as ShaderMaterial).dispose();this.group.removeFromParent();}
}
