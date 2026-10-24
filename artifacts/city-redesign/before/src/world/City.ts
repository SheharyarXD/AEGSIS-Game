import { BufferAttribute, BufferGeometry, Group, Line, LineBasicMaterial, PerspectiveCamera, Scene, Vector3 } from 'three';
import { QualitySettings } from '../config';
import { PhysicsWorld, RAPIER } from '../physics/PhysicsWorld';
import { DeploymentBay, SPAWN } from './DeploymentBay';
import { CityLayout, districtAt, randomFor } from './CityLayout';
import { WorldCollision } from './WorldCollision';
import { WorldStreaming } from './WorldStreaming';
import { AssetLibrary } from './environment/AssetLibrary';
import { EnvironmentMaterials } from './environment/EnvironmentMaterials';
import { Atmosphere } from './environment/Atmosphere';
import { WeatherState, WeatherPreset, WEATHER } from './environment/WeatherState';
import { Precipitation } from './environment/Precipitation';
import { CityInfrastructure } from './environment/CityInfrastructure';
import { UrbanAmbience } from './environment/UrbanAmbience';
import { EnvironmentAudio } from './environment/EnvironmentAudio';
import { WorldRecovery } from './WorldRecovery';
import { ArchitectureDestruction } from './ArchitectureDestruction';
import { Destruction } from '../physics/Destruction';
import { ImpactVfx } from '../vfx/ImpactVfx';
import { ArchitecturalLights } from './environment/ArchitecturalLights';
import { EnvironmentalDestruction } from './EnvironmentalDestruction';
export { SPAWN, COURT, COURSE } from './DeploymentBay';

/** Drop-in City contract: hero, combat, HUD and physics are not modified. */
export class City {
 readonly recovery=new WorldRecovery();
 readonly group=new Group();readonly layout=new CityLayout();readonly weather=new WeatherState();
 readonly materials=new EnvironmentMaterials();readonly assets=new AssetLibrary(this.materials);
 readonly atmosphere:Atmosphere;readonly precipitation=new Precipitation();readonly audio=new EnvironmentAudio();
 readonly ready:Promise<void>;readonly courseRings:import('three').Mesh[];
 streaming!:WorldStreaming;collision?:WorldCollision;
 architecture?:ArchitectureDestruction;
 private propDestruction?:EnvironmentalDestruction;
 private architecturalLights=new ArchitecturalLights(this.layout);
 quality:string;reducedFlashes=true;
 readonly cleanupTasks:(()=>void)[]=[];
 gpuStats=()=>({supported:false,samples:0,meanMs:0,p95Ms:0});
 private disposed=false;private initialPreset:WeatherPreset='partly-cloudy';private initialHour=17.3;private initialPaused=false;
 private bay:DeploymentBay;private infrastructure?:CityInfrastructure;private ambience?:UrbanAmbience;
 private previousPosition=SPAWN.clone();private previousTime=0;private flash=0;private lightningDelay=7;private random=randomFor(7119);
 private bolt:Line;private boltPositions=new Float32Array(18*3);private lightningCount=0;
 private captureView:{eye:Vector3;look:Vector3}|null=null;
 constructor(scene:Scene,settings:QualitySettings,private physics?:PhysicsWorld){
  this.quality=settings.cityBlocks<=36?'LOW':settings.cityBlocks<=48?'MEDIUM':settings.pixelRatio>1.25?'ULTRA':'HIGH';
  this.bay=new DeploymentBay(scene,settings,physics,true);this.courseRings=this.bay.courseRings;this.group.add(this.bay.group);scene.add(this.group);
  this.atmosphere=new Atmosphere(scene,settings);this.group.add(this.precipitation.group);
  this.architecturalLights.setQuality(this.quality);this.group.add(this.architecturalLights.group);
  const geometry=new BufferGeometry();geometry.setAttribute('position',new BufferAttribute(this.boltPositions,3));
  this.bolt=new Line(geometry,new LineBasicMaterial({color:'#afc7ef',transparent:true,opacity:.75,depthWrite:false}));this.bolt.visible=false;this.bolt.frustumCulled=false;scene.add(this.bolt);
  const params=new URLSearchParams(location.search),slice=params.has('districtSlice');
  this.weather.paused=params.has('qa');this.initialPaused=this.weather.paused;
  const preset=params.get('weather');if(preset&&preset in WEATHER)this.weather.setWeather(preset as WeatherPreset,0);
  const hour=Number(params.get('hour'));if(params.has('hour')&&Number.isFinite(hour))this.weather.setTime(hour);
  this.initialPreset=this.weather.preset;this.initialHour=this.weather.hour;
  this.ready=Promise.all([this.assets.load(),this.materials.ready]).then(()=>{const catalog=this.assets.catalog;
   this.infrastructure=new CityInfrastructure(this.layout,this.assets,physics,slice);this.group.add(this.infrastructure.group);
   if(physics)this.collision=new WorldCollision(this.layout,physics,slice);
   this.streaming=new WorldStreaming(this.layout,this.assets,this.quality,slice);this.group.add(this.streaming.group);
   if(physics&&this.collision){this.architecture=new ArchitectureDestruction(this.layout,this.assets,physics,this.collision,this.streaming,catalog);this.architecture.setQuality(this.quality);this.group.add(this.architecture.group);this.propDestruction=new EnvironmentalDestruction(this.group,physics,this.architecture,this.infrastructure.colliders);}
   this.ambience=new UrbanAmbience(this.assets);this.group.add(this.ambience.group);this.ambience.setCount(this.streaming.settings.ambientCars);
   this.streaming.update(SPAWN,new Vector3(),undefined,true);
  });
  const unlock=()=>{void this.audio.start().catch(()=>{});};window.addEventListener('pointerdown',unlock,{once:true});this.cleanupTasks.push(()=>window.removeEventListener('pointerdown',unlock));
 }
 get sun(){return this.atmosphere.sun;}
 async prepareInitialAssets():Promise<void>{await this.assets.idle();this.streaming.update(SPAWN,new Vector3(),undefined,true);await this.assets.idle();this.streaming.update(SPAWN,new Vector3(),undefined,true);}
 get hangarLights(){return this.bay.hangarLights;}
 setAssemblyLight(t:number):void{this.bay.setAssemblyLight(t);}
 update(target:Vector3,time:number,camera?:PerspectiveCamera,velocity?:Vector3,active=true):void{
  if(this.disposed)return;
  const dt=Math.max(0,Math.min(.15,time-this.previousTime));this.previousTime=time;
  const motion=velocity??(dt>0?target.clone().sub(this.previousPosition).divideScalar(dt):new Vector3());this.previousPosition.copy(target);
  this.weather.update(dt);this.materials.update(this.weather,time);this.bay.update(target,time);
  this.architecture?.update(dt,target,active);
  this.architecturalLights.update(target,this.weather);
  if(this.captureView&&camera){camera.position.copy(this.captureView.eye);camera.lookAt(this.captureView.look);camera.fov=57;camera.updateProjectionMatrix();camera.updateMatrixWorld();}
  const view=camera?camera.getWorldDirection(new Vector3()):undefined;this.streaming?.update(target,motion,view,false,camera);
  const eye=camera?.position??target;this.lightningDelay-=dt;
  if(camera){const far=Math.ceil(Math.max(6500,Math.min(24000,eye.y*1.4+3500))/256)*256;if(camera.far!==far){camera.far=far;camera.updateProjectionMatrix();}}
  if(this.weather.values.storm>.4&&this.lightningDelay<=0){this.triggerLightning(target);this.lightningDelay=7+this.random()*18;}
  this.flash=Math.max(0,this.flash-dt*3.8);this.bolt.visible=this.flash>.03;
  this.atmosphere.update(eye,this.weather,time,this.flash);this.infrastructure?.update(time,this.weather,this.atmosphere.fog.color,this.atmosphere.fog.density);this.ambience?.update(target,time,this.weather);this.propDestruction?.update();
  let sheltered=false,surfaceHeight=0;
  if(this.physics){
   const hit=this.physics.world.castRay(new RAPIER.Ray(eye,{x:0,y:1,z:0}),70,true,RAPIER.QueryFilterFlags.ONLY_FIXED);sheltered=!!hit;
   const floor=this.physics.world.castRay(new RAPIER.Ray(eye,{x:0,y:-1,z:0}),1200,true,RAPIER.QueryFilterFlags.ONLY_FIXED);surfaceHeight=floor?eye.y-floor.timeOfImpact:0;
  }
  this.precipitation.update(eye,time,this.weather,sheltered,surfaceHeight,this.streaming?.settings.particleScale??.28);
  this.audio.update(this.weather,active,target.y,districtAt(target.x,target.z)==='industrial');
 }
 connectDestruction(destruction:Destruction,vfx:ImpactVfx):void{this.architecture?.connect(destruction,vfx);destruction.onWorldHit=(c,s,p,d)=>!!this.architecture?.hit(c,s,p,d)||!!this.propDestruction?.hit(c,s,p);destruction.onWorldBlast=(p,r,s,d)=>{this.architecture?.blast(p,r,s,d);this.propDestruction?.blast(p,r,s);};}
 private resetArchitecture():void{this.propDestruction?.reset();const damaged=(this.architecture?.states.size??0)>0;this.architecture?.reset();if(this.physics&&this.collision&&damaged){this.collision.dispose();this.collision=new WorldCollision(this.layout,this.physics,new URLSearchParams(location.search).has('districtSlice'));this.architecture?.rebindCollision(this.collision);}else if(this.collision)this.architecture?.rebindCollision(this.collision);}
 setQuality(quality:string):void{this.quality=quality;this.streaming?.setQuality(quality);this.architecture?.setQuality(quality);this.architecturalLights.setQuality(quality);this.ambience?.setCount(this.streaming?.settings.ambientCars??12);}
 setActive(active:boolean):void{if(!this.disposed)this.audio.update(this.weather,active,this.previousPosition.y,districtAt(this.previousPosition.x,this.previousPosition.z)==='industrial');}
 setWeather(preset:WeatherPreset,seconds=12):void{this.weather.setWeather(preset,seconds);}
 triggerLightning(target=this.previousPosition):void{
  const x=target.x+220+this.random()*320,z=target.z-180-this.random()*260;
  for(let i=0;i<18;i++){const t=i/17;this.boltPositions.set([x+(this.random()-.5)*28,500*(1-t)+55,z+(this.random()-.5)*25],i*3);}
  this.bolt.geometry.attributes.position.needsUpdate=true;this.flash=this.reducedFlashes?.16:.38;this.lightningCount++;
  this.audio.thunder(Math.hypot(x-target.x,z-target.z)/343,.6);
 }
 /** Exposed by the bootstrap only on an explicit QA/development URL. */
 setCaptureView(eye:number[]|null,look?:number[]):void{this.captureView=eye?{eye:new Vector3(...eye as [number,number,number]),look:new Vector3(...look as [number,number,number])}:null;}
 prepareAt(point:Vector3,velocity=new Vector3()):void{this.streaming?.update(point,velocity,undefined,true);}
 reset():void{this.resetArchitecture();this.recovery.reset();this.weather.reset();this.weather.paused=this.initialPaused;this.weather.setWeather(this.initialPreset,0);this.weather.setTime(this.initialHour);this.audio.reset();this.precipitation.reset();this.streaming?.reset();this.streaming?.update(SPAWN,new Vector3(),undefined,true);this.previousPosition.copy(SPAWN);this.previousTime=0;this.flash=0;this.lightningCount=0;this.lightningDelay=7;this.random=randomFor(7119);this.captureView=null;}
 diagnostics(){return {worldSize:[2048,2048],district:districtAt(this.previousPosition.x,this.previousPosition.z),buildings:this.layout.buildings.length,tiles:this.streaming?.loaded.size??0,pending:this.streaming?.pending??0,maxTiles:this.streaming?.settings.maxTiles??0,loads:this.streaming?.loads??0,unloads:this.streaming?.unloads??0,generationMs:this.streaming?.generationMs??0,maxGenerationMs:this.streaming?.maxGenerationMs??0,collisionResident:true,worldColliders:this.collision?.count??0,quality:this.quality,assetBytes:this.assets.bytes,pendingAssetLoads:this.assets.pendingCount,textureBytesEstimate:this.materials.textureBytes,destruction:this.architecture?.diagnostics(),props:this.propDestruction?.diagnostics(),weather:this.weather.preset,hour:this.weather.hour,night:this.weather.night,wetness:this.weather.wetness,snowCover:this.weather.snowCover,particles:this.precipitation.particleCount,lightningCount:this.lightningCount,fogDensity:this.atmosphere.fog.density,gpu:this.gpuStats()};}
 dispose():void{if(this.disposed)return;this.disposed=true;this.propDestruction?.dispose();this.architecture?.dispose();this.architecturalLights.dispose();for(const cleanup of this.cleanupTasks)cleanup();this.cleanupTasks.length=0;this.streaming?.dispose();this.collision?.dispose();this.infrastructure?.dispose();this.ambience?.dispose();this.bay.dispose();this.precipitation.dispose();this.atmosphere.dispose();this.audio.dispose();this.bolt.removeFromParent();this.bolt.geometry.dispose();(this.bolt.material as LineBasicMaterial).dispose();this.assets.dispose();this.materials.dispose();this.group.removeFromParent();}
}
