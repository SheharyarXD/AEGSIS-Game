import { BackSide, Color, DirectionalLight, FogExp2, HemisphereLight, Mesh, PlaneGeometry, Scene, ShaderMaterial, SphereGeometry, Vector3 } from 'three';
import { QualitySettings } from '../../config';
import { WeatherState } from './WeatherState';
const noise=`float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=noise(p)*a;p=mat2(.8,-.6,.6,.8)*p*2.07;a*=.5;}return v;}`;
export class Atmosphere {
 readonly sun=new DirectionalLight('#ffd7a4',2);
 readonly fill=new HemisphereLight('#94bdd9','#3b3941',.8);
 readonly fog=new FogExp2('#7e8f9c',.0004);
 readonly uniforms={time:{value:0},hour:{value:17},coverage:{value:.4},darkness:{value:0},wind:{value:3},sunDir:{value:new Vector3()},night:{value:0},flash:{value:0},altitude:{value:0}};
 private sky:Mesh;private cloud:Mesh;
 constructor(private scene:Scene,settings:QualitySettings){
  scene.fog=this.fog;
  const material=new ShaderMaterial({side:BackSide,depthWrite:false,fog:true,uniforms:{...this.uniforms,fogColor:{value:new Color()},fogDensity:{value:0}},
   vertexShader:'varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
   fragmentShader:`varying vec3 direction;uniform float time,hour,coverage,darkness,wind,night,flash,altitude;uniform vec3 sunDir,fogColor;${noise}
   void main(){vec3 d=normalize(direction);float height=max(d.y,0.);float daylight=1.-night;
    float sunset=pow(1.-abs(sunDir.y),3.)*(daylight+.35);
    vec3 top=mix(vec3(.007,.016,.045),vec3(.095,.29,.53),daylight);
    vec3 horizon=mix(vec3(.035,.06,.10),vec3(.58,.68,.73),daylight);
    horizon=mix(horizon,vec3(.94,.36,.12),sunset*.67);
    vec3 col=mix(horizon,top,pow(height,.44));float alignment=max(dot(d,sunDir),0.);
    col+=vec3(1.,.58,.23)*pow(alignment,22.)*daylight*(.18+sunset*.35);
    col+=vec3(4.,3.2,2.1)*smoothstep(.9995,.9998,alignment)*daylight*(1.-coverage*.82);
    float moon=max(dot(d,-sunDir),0.);col+=vec3(.3,.42,.63)*smoothstep(.99965,.99987,moon)*night;
    vec2 st=vec2(atan(d.z,d.x),asin(d.y))*480.;float stars=pow(hash(floor(st)),35.)*pow(max(0.,1.-length(fract(st)-.5)*2.),7.);
    col+=stars*night*(1.-coverage)*smoothstep(.08,.4,d.y)*.9;
    vec2 uv=d.xz/max(.025,abs(d.y))*.8+vec2(time*wind*.0008,time*.0003);float field=fbm(uv*2.5);
    float clouds=smoothstep(1.-coverage*.82,1.01-coverage*.68,field)*smoothstep(.045,.14,d.y);
    vec3 cloudCol=mix(vec3(.35,.4,.47),vec3(.018,.028,.047),night);cloudCol*=1.-darkness*.62;
    cloudCol+=vec3(1.,.4,.16)*sunset*pow(alignment,3.)*.22;
    col=mix(col,cloudCol,clouds*.95);col+=vec3(.025,.055,.08)*night*pow(1.-height,7.);
    col+=vec3(.28,.34,.45)*flash*clouds;
    gl_FragColor=vec4(col,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    // Fog uniforms use the current render target's output space, matching city haze.
    gl_FragColor.rgb=mix(fogColor,gl_FragColor.rgb,smoothstep(0.,.09,d.y));
   }`});
  this.sky=new Mesh(new SphereGeometry(5800,32,16),material);this.sky.frustumCulled=false;this.sky.renderOrder=-10;scene.add(this.sky);
  // A genuine world-space layer can be approached and crossed at 650 m.
  this.cloud=new Mesh(new PlaneGeometry(9000,9000),new ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,side:2,
   vertexShader:'varying vec2 uvw;void main(){uvw=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
   fragmentShader:`varying vec2 uvw;uniform float time,coverage,darkness,wind,night;${noise}void main(){float f=fbm(uvw*29.+vec2(time*wind*.0008,0.));float a=smoothstep(1.-coverage*.81,1.-coverage*.65+.08,f)*.52;vec3 c=mix(vec3(.68,.72,.77),vec3(.05,.07,.12),max(night,darkness*.65));gl_FragColor=vec4(c,a);#include <tonemapping_fragment>\n#include <colorspace_fragment>}`.replace(';#include',';\n#include')
  }));this.cloud.rotation.x=-Math.PI/2;this.cloud.position.y=650;scene.add(this.cloud);
  this.sun.castShadow=settings.shadows;this.sun.shadow.mapSize.set(settings.shadowSize,settings.shadowSize);
  Object.assign(this.sun.shadow.camera,{left:-80,right:80,top:80,bottom:-80,near:1,far:600});this.sun.shadow.normalBias=.12;this.sun.shadow.bias=-.0002;
  scene.add(this.sun,this.sun.target,this.fill);
 }
 update(position:Vector3,weather:WeatherState,time:number,flash=0):void{
  const elevation=Math.sin((weather.hour-6)*Math.PI/12),azimuth=(weather.hour-6)*Math.PI/12;
  const direction=this.uniforms.sunDir.value.set(Math.cos(azimuth)*.72,elevation*.86,Math.sin(azimuth)*.58).normalize();
  const daylight=1-weather.night,overcast=weather.values.darkness;
  this.uniforms.time.value=time;this.uniforms.hour.value=weather.hour;this.uniforms.night.value=weather.night;
  this.uniforms.coverage.value=weather.values.cloud;this.uniforms.darkness.value=overcast;this.uniforms.wind.value=weather.values.wind;this.uniforms.flash.value=flash;this.uniforms.altitude.value=position.y;
  this.sky.position.copy(position);this.cloud.position.x=Math.round(position.x/512)*512;this.cloud.position.z=Math.round(position.z/512)*512;
  this.sun.target.position.set(Math.round(position.x/8)*8,Math.max(0,position.y-25),Math.round(position.z/8)*8);
  this.sun.position.copy(this.sun.target.position).addScaledVector(elevation<-.08?direction.clone().negate():direction,350);
  const warm=Math.pow(1-Math.abs(elevation),5);
  this.sun.color.set(weather.night>.5?'#9bb5df':warm>.35?'#ffa960':'#ffecd1');
  this.sun.intensity=(.38+daylight*3.05)*(1-overcast*.62)+flash*.65;
  this.fill.intensity=.38+daylight*.40-overcast*.06;this.fill.color.set(weather.night>.5?'#7091bf':'#accee5');
  this.scene.environmentIntensity=.2+daylight*.5;
  const horizon=new Color().set(weather.night>.5?'#172936':warm>.4?'#ad8672':'#8eabb9');horizon.lerp(new Color('#52616c'),overcast*.6);
  this.fog.color.copy(horizon);const altitudeFactor=.2+.8*Math.exp(-Math.max(0,position.y)/230);
  // Aerial haze blends the outskirts without obscuring close street architecture.
  const aerial=Math.max(0,Math.min(1,(position.y-90)/360));
  this.fog.density=Math.max(.00019+aerial*.00042,weather.values.fog*altitudeFactor);
 }
 dispose():void{for(const mesh of [this.sky,this.cloud]){mesh.removeFromParent();mesh.geometry.dispose();(mesh.material as ShaderMaterial).dispose();}this.sun.removeFromParent();this.sun.target.removeFromParent();this.fill.removeFromParent();this.sun.dispose();}
}
