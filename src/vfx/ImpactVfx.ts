import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Group, Mesh, PlaneGeometry, Points, ShaderMaterial, Vector3 } from 'three';

interface Particle {position:Vector3;velocity:Vector3;life:number;max:number;size:number;color:Color;}
export class ImpactVfx {
  readonly group=new Group();
  private readonly pool:Particle[];
  private readonly geo=new BufferGeometry();
  private readonly positions:Float32Array;
  private readonly colors:Float32Array;
  private readonly sizes:Float32Array;
  private readonly alphas:Float32Array;
  private cursor=0;
  private readonly marks:Mesh[]=[];
  private markCursor=0;
  /** Ground shockwaves: a few pooled quads, each an expanding ring drawn in the shader. */
  private readonly waves:{mesh:Mesh;material:ShaderMaterial;age:number;life:number}[]=[];
  private waveCursor=0;
  constructor(count:number) {
    this.pool=Array.from({length:count},()=>({position:new Vector3(),velocity:new Vector3(),life:0,max:1,size:1,color:new Color()}));
    this.positions=new Float32Array(count*3);this.colors=new Float32Array(count*3);this.sizes=new Float32Array(count);this.alphas=new Float32Array(count);
    this.geo.setAttribute('position',new BufferAttribute(this.positions,3));this.geo.setAttribute('color',new BufferAttribute(this.colors,3));this.geo.setAttribute('size',new BufferAttribute(this.sizes,1));this.geo.setAttribute('alpha',new BufferAttribute(this.alphas,1));
    const material=new ShaderMaterial({transparent:true,depthWrite:false,vertexColors:true,
      vertexShader:'attribute float size;attribute float alpha;varying vec3 c;varying float a;void main(){c=color;a=alpha;vec4 p=modelViewMatrix*vec4(position,1.);gl_PointSize=min(110.,size*500./max(1.,-p.z));gl_Position=projectionMatrix*p;}',
      fragmentShader:'varying vec3 c;varying float a;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;gl_FragColor=vec4(c,a*pow(1.-r,1.5));}',
    });
    const points=new Points(this.geo,material);points.frustumCulled=false;this.group.add(points);
    // Bounded persistent scorch marks; geometry is reused and opaque enough to read under daylight.
    const markGeo=new PlaneGeometry(1,1);
    const markMat=new ShaderMaterial({transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,
      vertexShader:'varying vec2 uvv;void main(){uvv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'varying vec2 uvv;void main(){vec2 p=uvv-.5;float r=length(p)*2.;float crack=pow(abs(sin(atan(p.y,p.x)*7.+r*9.)),20.);float a=(1.-smoothstep(.2,1.,r))*.6+crack*(1.-smoothstep(.3,1.,r))*.3;gl_FragColor=vec4(.035,.032,.029,a);}',
    });
    for(let i=0;i<32;i++){const m=new Mesh(markGeo,markMat);m.visible=false;this.marks.push(m);this.group.add(m);}
    for(let i=0;i<3;i++){
      const material=new ShaderMaterial({transparent:true,depthWrite:false,blending:AdditiveBlending,polygonOffset:true,polygonOffsetFactor:-3,uniforms:{uAge:{value:0}},
        vertexShader:'varying vec2 uvv;void main(){uvv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader:'uniform float uAge;varying vec2 uvv;void main(){float r=length(uvv-.5)*2.;float front=sqrt(uAge);float ring=exp(-pow((r-front)*9.,2.));float wash=(1.-smoothstep(0.,front,r))*.18;float a=(ring+wash)*(1.-uAge)*(1.-uAge)*(1.-smoothstep(.92,1.,r));gl_FragColor=vec4(vec3(.62,.78,1.)*a,1.);}'});
      const mesh=new Mesh(markGeo,material);mesh.visible=false;mesh.rotation.x=-Math.PI/2;this.group.add(mesh);this.waves.push({mesh,material,age:0,life:0});
    }
  }
  burst(position:Vector3,strength=1,normal=new Vector3(0,1,0),dust=true):void {
    const count=Math.min(30,8+Math.floor(strength*5));
    for(let i=0;i<count;i++) {
      const p=this.pool[this.cursor++%this.pool.length];p.position.copy(position);
      p.velocity.set(Math.random()-.5,Math.random()*.8,Math.random()-.5).multiplyScalar(3+strength*2).addScaledVector(normal,2);
      p.max=p.life=dust?1.1+Math.random()*.8:.25+Math.random()*.4;p.size=dust?.6+Math.random()*.7:.06+Math.random()*.08;
      p.color.set(dust?'#b4aa96':'#ffe2aa');
    }
  }
  /** Dust thrown outward along the ground, as from a landing. */
  radial(position:Vector3,strength=1):void {
    const count=Math.min(36,10+Math.floor(strength*9));
    for(let i=0;i<count;i++) {
      const p=this.pool[this.cursor++%this.pool.length],angle=(i+Math.random())/count*Math.PI*2,speed=(2.2+Math.random()*2.4)*(.6+strength*.55);
      p.position.copy(position);p.position.y+=.08;p.velocity.set(Math.cos(angle)*speed,.35+Math.random()*.9*strength,Math.sin(angle)*speed);
      p.max=p.life=.7+Math.random()*.7;p.size=.35+Math.random()*.45+strength*.12;p.color.set('#b4aa96');
    }
  }
  /** A brief ring racing out over the ground. `radius` in metres. */
  shockwave(position:Vector3,radius:number,seconds=.5):void {
    const wave=this.waves[this.waveCursor++%this.waves.length];wave.age=0;wave.life=seconds;
    wave.mesh.visible=true;wave.mesh.position.copy(position);wave.mesh.position.y+=.05;wave.mesh.scale.setScalar(radius*2);wave.material.uniforms.uAge.value=0;
  }
  trail(position:Vector3,hot=false):void {
    const p=this.pool[this.cursor++%this.pool.length];p.position.copy(position);p.velocity.set(0,.2,0);p.max=p.life=.42;p.size=hot?.4:.14;p.color.set(hot?'#c5b9a2':'#8bc6e3');
  }
  mark(position:Vector3,normal:Vector3,size=1):void {
    const mark=this.marks[this.markCursor++%this.marks.length];mark.visible=true;mark.position.copy(position).addScaledVector(normal,.028);mark.quaternion.setFromUnitVectors(new Vector3(0,0,1),normal);mark.scale.setScalar(size);
  }
  update(dt:number):void {
    this.pool.forEach((p,i)=>{
      p.life=Math.max(0,p.life-dt);if(p.life){p.position.addScaledVector(p.velocity,dt);p.velocity.multiplyScalar(Math.exp(-dt*2));}
      p.position.toArray(this.positions,i*3);p.color.toArray(this.colors,i*3);this.sizes[i]=p.size*(1+(1-p.life/p.max)*1.8);this.alphas[i]=p.life/p.max*.65;
    });
    for(const a of Object.values(this.geo.attributes))a.needsUpdate=true;
    for(const wave of this.waves)if(wave.mesh.visible){wave.age+=dt;const t=wave.age/wave.life;if(t>=1)wave.mesh.visible=false;else wave.material.uniforms.uAge.value=t;}
  }
  get active():number {return this.pool.filter(p=>p.life>0).length;}
  reset():void {this.pool.forEach(p=>p.life=0);this.marks.forEach(m=>m.visible=false);this.waves.forEach(w=>w.mesh.visible=false);}
}
