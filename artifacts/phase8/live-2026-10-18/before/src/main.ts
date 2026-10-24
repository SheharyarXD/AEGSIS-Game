import { ACESFilmicToneMapping, PCFShadowMap, PMREMGenerator, Scene, Vector3, WebGLRenderer } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import './styles.css';
import { chooseInitialQuality, getQualitySettings, QUALITY_ORDER, QualityLevel } from './config';
import { CameraRig } from './camera/CameraRig';
import { InputController } from './input/InputController';
import { PlayerController } from './player/PlayerController';
import { AegisSuit } from './player/AegisSuit';
import { FlightState } from './player/FlightState';
import { Hud } from './ui/Hud';
import { FlightVfx } from './vfx/FlightVfx';
import { ImpactVfx } from './vfx/ImpactVfx';
import { City, SPAWN } from './world/City';
import { installEnvironmentDebug } from './world/environment/EnvironmentDebug';
import { PhysicsWorld } from './physics/PhysicsWorld';
import { Destruction } from './physics/Destruction';
import { AudioSystem } from './audio/AudioSystem';
import { Encounter } from './combat/Encounter';
import { Boss } from './combat/Boss';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { TitanBreakthrough } from './world/titan/TitanBreakthrough';
import { FrameProfiler } from './world/streaming/FrameProfiler';
type Mode='title'|'intro'|'play'|'paused'|'dead'|'complete';
const root=document.querySelector<HTMLElement>('#app')!;
root.innerHTML='<div class="loader"><strong>AEGIS</strong><progress max="1" value="0"></progress><p id="load-status">INITIALIZING PHYSICS & ARMOR</p></div>';
let saved:string|null=null;try{saved=localStorage.getItem('aegis-quality');}catch{/* Storage is optional. */}
const quality:QualityLevel=saved&&QUALITY_ORDER.includes(saved as QualityLevel)?saved as QualityLevel:chooseInitialQuality();
const settings=getQualitySettings(quality);

async function boot():Promise<void> {
  const loadingStart=performance.now();
  await Promise.all([PhysicsWorld.init(),Boss.loadAssets(),AegisSuit.loadAssets(p=>{const bar=root.querySelector('progress'),status=root.querySelector('#load-status');if(bar)bar.value=p;if(status)status.textContent=`LOADING VANGUARD ARMOR · ${Math.round(p*100)}%`;})]);
  let loadingMs=performance.now()-loadingStart;
  const renderer=new WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,settings.pixelRatio));renderer.setSize(innerWidth,innerHeight);
  renderer.shadowMap.autoUpdate=false;renderer.shadowMap.enabled=settings.shadows;renderer.shadowMap.type=PCFShadowMap;renderer.toneMapping=ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  renderer.domElement.setAttribute('aria-label','AEGIS 3D game viewport');root.prepend(renderer.domElement);
  const scene=new Scene(),pmrem=new PMREMGenerator(renderer),room=new RoomEnvironment();
  const environment=pmrem.fromScene(room,.04);scene.environment=environment.texture;scene.environmentIntensity=.6;room.dispose();pmrem.dispose();
  const physics=new PhysicsWorld(),city=new City(scene,settings,physics),camera=new CameraRig(physics),player=new PlayerController(physics);
  await city.ready;loadingMs=performance.now()-loadingStart;
  city.assets.setRenderer(renderer,scene,camera.camera);
  await city.prepareInitialAssets();
  await city.assets.warmInitial();
  camera.camera.far=6500;camera.camera.updateProjectionMatrix();
  function relocate(point:Vector3):void {
    player.ragdoll.reset();player.body.setEnabled(true);player.body.teleport(point);player.body.grounded=false;player.velocity.set(0,0,0);
    player.state=point.y>1?FlightState.Fall:FlightState.Ground;
    player.sync(0);player.present(1);camera.reset(point);physics.resetClock();city.prepareAt(point);
  }
  installEnvironmentDebug(city,renderer,relocate);
  scene.add(player.root,camera.camera);const input=new InputController(renderer.domElement),audio=new AudioSystem();
  const impacts=new ImpactVfx(settings.particles),destruction=new Destruction(physics,impacts,settings.debris);scene.add(impacts.group,destruction.group);
  city.connectDestruction(destruction,impacts);
  const flightVfx=new FlightVfx(camera.camera,player.armor.thrusterMounts,settings.speedLineCount,quality);
  const encounter=new Encounter(physics,player,destruction,impacts,audio);scene.add(encounter.group);
  const titan=new TitanBreakthrough(city,player,camera,encounter.missiles,audio);
  player.assembly.onLock=()=>{if(mode==='play')audio.cue('dock');};
  // Contact shading is the only post effect. Low/medium use the direct path.
  let composer:EffectComposer|null=null;
  if(quality==='HIGH'||quality==='ULTRA'){
    composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera.camera));
    const ao=new GTAOPass(scene,camera.camera,innerWidth,innerHeight);ao.blendIntensity=.65;ao.updateGtaoMaterial({radius:.65,thickness:1,distanceFallOff:1,samples:8});ao.updatePdMaterial({radius:3,samples:8});composer.addPass(ao);composer.addPass(new OutputPass());
  }
  renderer.info.autoReset=false;
  let mode:Mode='title',introTime=0,time=0,previous=performance.now(),diagnostics=false,wasCinematic=false;
  const frameProfiler=new FrameProfiler();
  const frameTimes:number[]=[];let frameMs=0,simulationMs=0,lastDock=-1;
  const hud=new Hud(root,quality,{
    start:range=>{reset();encounter.begin(range);mode=range?'play':'intro';introTime=0;hud.menu('hidden');input.setEnabled(range);if(range)camera.reset(player.position);void audio.start();if(range)void input.lock();},
    resume:()=>{mode='play';input.setEnabled(true);hud.menu('hidden');void input.lock();audio.mute(false);physics.resetClock();},
    restart:()=>{reset();mode='intro';hud.menu('hidden');introTime=0;void audio.start();},
    quality:q=>{try{localStorage.setItem('aegis-quality',q);}catch{}location.reload();},audio:enabled=>{audio.enabled=enabled;city.audio.enabled=enabled;},
  });
  hud.menu('title');input.setEnabled(false);
  hud.el('credits-button').addEventListener('click',()=>{
    const credit=document.createElement('p');credit.innerHTML='City architecture: 99.Miles, ChamberSu1996, Daniel Zhabotinsky and Oneironauticus. Source models adapted for AEGIS under CC BY 4.0. Additional CC0 modules and textures by Poly Haven contributors. <a href="/assets/environment/ATTRIBUTION.txt" target="_blank" rel="noreferrer">Architecture licenses and full attribution</a>';hud.el('dialog-content').append(credit);
  });
  function reset():void {titan.reset();encounter.reset();player.reset();city.reset();destruction.reset();impacts.reset();physics.resetClock();frameTimes.length=0;frameProfiler.reset();wasCinematic=false;city.courseRings.forEach(r=>r.visible=true);camera.reset(SPAWN);hud.endCinematic();hud.show('boss-bar',false);input.reset();audio.mute(false);lastDock=-1;}
  function pause():void {if(mode!=='play')return;mode='paused';input.setEnabled(false);hud.menu('paused');audio.mute(true);document.exitPointerLock();}
  function finishIntro():void {if(mode!=='intro')return;mode='play';player.suitUp(1);hud.endCinematic();input.setEnabled(true);camera.reset(player.position);void input.lock();}
  hud.el('skip').onclick=finishIntro;
  // touchdown from the air: everything scales with how fast he was really falling
  player.onLanding=({tier,speed,position})=>{
    if(mode!=='play')return;
    const force=Math.min(1,speed/40),up=new Vector3(0,1,0);
    if(tier==='soft'){if(speed>3)audio.cue('impact',.25);return;}
    impacts.radial(position,tier==='medium'?.6:1.2+force);camera.addShake(tier==='medium'?.22:.55+force*.4);audio.cue(tier==='medium'?'impact':'landing',tier==='medium'?.7:1.3);
    if(tier==='medium')return;
    impacts.shockwave(position,3.2+force*3.5);impacts.mark(position,up,1.6+force*1.4);impacts.burst(position.clone().add(new Vector3(0,.2,0)),1.2+force*2,up,false);
    destruction.blast(position,2.2+force*1.6,40+force*60);
  };
  player.onCollision=(strength,p,n,c)=>{destruction.hit(c,strength*6,p,n.clone().negate());impacts.burst(p,strength/12,n);impacts.mark(p,n,Math.min(2,strength/15));camera.addShake(strength/35);audio.cue('impact',strength/15);};
  player.onDamage=()=>{camera.addShake(player.block?.12:.3);audio.cue(player.block?'block':'impact');};
  encounter.onLaunch=()=>camera.addShake(.08);
  encounter.onStrike=heavy=>{camera.addShake(heavy?.22:.07);if(heavy)camera.kick(-2.2);};
  // the body is heard: footfalls on the ground, thrusters lighting, the boost, the air brake
  player.armor.onStep=running=>{if(mode==='play'&&player.suited)audio.cue('step',running?1:.7);};
  if(player.pilot)player.pilot.onStep=running=>{if(mode==='play'&&!player.suited)audio.cue('step',running?.35:.22);};
  let heard={state:player.state,boost:false};
  encounter.onBlast=(p)=>{const d=p.distanceTo(player.position);if(d<40)camera.addShake(.35*(1-d/40));};
  destruction.onBreak=p=>{impacts.burst(p,1);audio.cue('impact');};
  physics.onImpact=({a,b,force})=>{
    for(const [surface,other] of [[a,b],[b,a]]) {
      if(physics.surfaces.get(surface.handle)?.kind==='breakable'){
        const p=new Vector3().copy(other.translation()),v=other.parent()?.linvel();
        destruction.hit(surface,Math.min(150,force/90),p,v?new Vector3(v.x,v.y,v.z).normalize():new Vector3(0,0,-1));
      }
    }
  };
  window.addEventListener('keydown',e=>{
    if(e.code==='Escape')pause();
    if(e.code==='Enter'&&mode==='intro')finishIntro();
    if(e.code==='KeyH'){pause();hud.controls();}
    if(e.code==='F3'){e.preventDefault();diagnostics=!diagnostics;hud.show('diagnostics',diagnostics);}
    if(e.code==='Tab')e.preventDefault();
  });
  document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement===null)pause();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('blur',pause);
  window.addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);composer?.setSize(innerWidth,innerHeight);camera.resize(innerWidth,innerHeight);});
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();pause();hud.text('menu-copy','Graphics context lost. Reload the page to reinitialize the renderer.');});
  window.addEventListener('error',e=>{pause();hud.show('toast',true);hud.text('toast',`Simulation stopped: ${e.message}. Restart or reload to recover.`);});
  const getDiagnostics=()=>({colliders:physics.world.colliders.len(),environment:city.diagnostics(),titan:titan.diagnostics(),timing:frameProfiler.stats(),shaderPrograms:renderer.info.programs?.length??0,mode,quality,frameMs,meanMs:frameTimes.reduce((a,b)=>a+b,0)/Math.max(1,frameTimes.length),p95Ms:[...frameTimes].sort((a,b)=>a-b)[Math.floor(frameTimes.length*.95)]??0,simulationMs,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,bodies:physics.world.bodies.len(),activeBodies:physics.activeBodies,particles:impacts.active,debris:destruction.debris.length,broken:destruction.broken,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,loadingMs,assetLoadMs:AegisSuit.assetLoadMilliseconds,position:player.position.toArray(),state:player.state,health:player.health,courseIndex:encounter.courseIndex,stage:encounter.stage,crashes:player.crashCount,throws:encounter.throws,enemyHealth:encounter.enemies.map(e=>e.health),bossHealth:encounter.boss?.health,bossPhase:encounter.boss?.phase,missiles:encounter.projectiles.pool.filter(p=>p.hostile&&p.life>0).length});
  await renderer.compileAsync(scene,camera.camera);loadingMs=performance.now()-loadingStart;
  // Read-only telemetry is always available. Mutation hooks are restricted to the explicit QA URL.
  Object.assign(window,{aegisDiagnostics:getDiagnostics});
  if(new URLSearchParams(location.search).has('qa'))Object.assign(window,{__AEGIS__:{player,physics,city,destruction,impacts,camera,input,encounter,audio,titan,reset,teleport:relocate,start:(range=false)=>{reset();encounter.begin(range);mode='play';hud.menu('hidden');input.setEnabled(true);camera.reset(player.position);},getDiagnostics}});
  physics.world.step();root.querySelector('.loader')!.remove();
  let animationFrame=0,closed=false;
  function tick(now:number):void {
    if(closed)return;
    const dt=Math.min((now-previous)/1000,.15);frameMs=now-previous;previous=now;if(mode==='play')frameProfiler.frame(frameMs);
    if(mode==='play'){frameTimes.push(frameMs);if(frameTimes.length>600)frameTimes.shift();}
    if(mode!=='paused'&&mode!=='dead'&&mode!=='complete')time+=dt;
    if(mode==='title') {
      player.animate(dt);const t=time*.08;camera.cinematic(new Vector3(3.1+Math.sin(t)*.3,1.9,54.3),new Vector3(1.15,1.2,58),dt,43);player.suitUp(1);
    }else if(mode==='intro') {
      introTime+=dt;const t=Math.min(1,introTime/10.5);city.setAssemblyLight(t);player.suitUp(t);player.animate(dt);
      const a=1.1+t*3;camera.cinematic(new Vector3(Math.sin(a)*4.3,1.5+t,58-Math.cos(a)*4.3),new Vector3(0,1.2,58),dt,43);
      const captions=['Bay lighting active','Docking lower armor','Torso seals engaging','Shoulder locks confirmed','Propulsion vanes deployed','Optics and core online','Vanguard. You have control.'];
      const stage=Math.min(6,Math.floor(t*7));hud.cinematic('AER–7 / DEPLOYMENT',captions[stage]);
      if(stage!==lastDock){lastDock=stage;audio.cue('dock');}
      if(t>=1)finishIntro();
    }else if(mode==='play') {
      camera.readInput(input);const start=performance.now(),steps=physics.steps;
      {const view=camera.getReference();encounter.setView(camera.camera.position,view.forward,view.right,camera.camera.fov);}
      physics.advance(dt,step=>{if(!encounter.cinematic)titan.update(step,input,camera.getReference());player.control(step,input,camera.getReference(),!encounter.cinematic);if(!player.ragdoll.active)player.object.position.copy(player.position);encounter.update(step,input,camera.getReference());},step=>{player.sync(step);encounter.sync(step);destruction.update(step);});
      simulationMs=performance.now()-start;frameProfiler.record('physics',simulationMs);if(physics.steps>steps)input.endFrame();player.present(physics.alpha);player.animate(dt);encounter.animate(dt);
      if(wasCinematic&&!encounter.cinematic)camera.reset(player.position);wasCinematic=encounter.cinematic;
      if(encounter.cinematic){
        hud.cinematic(encounter.stage==='boss_intro'?'UNREGISTERED SIEGE PLATFORM':'VANGUARD / FINAL STRIKE',encounter.stage==='boss_intro'?'TITAN–09':'Core breach confirmed');hud.show('skip',false);
        const boss=encounter.boss!;camera.cinematic(boss.position.clone().add(new Vector3(12,5,16)),boss.core,dt,52);
      }else {hud.endCinematic();hud.show('skip',true);camera.update(dt,player.renderPosition,player.getSpeed(),player.isFlying,encounter.locked&&encounter.target&&!player.isFlying?(encounter.target instanceof Boss?encounter.target.core:encounter.target.position):undefined);}
      city.courseRings.forEach((r,i)=>r.visible=i>=encounter.courseIndex&&encounter.stage==='course');
      const objective=encounter.objective;hud.objective(objective.title,objective.hint,objective.progress);hud.text('weapons',encounter.weaponStatus);hud.waypoint(objective.point,player.position,camera.camera);
      hud.target(encounter.target?(encounter.target instanceof Boss?encounter.target.core:encounter.target.position.clone().add(new Vector3(0,1.2,0))):null,encounter.targetLabel,camera.camera);
      const threat=encounter.projectiles.threat;hud.show('warning',threat);hud.text('warning','MISSILE APPROACHING · EVADE OR PRESS F');
      hud.show('boss-bar',!!encounter.boss&&!encounter.cinematic);if(encounter.boss){const b=encounter.boss;hud.el('boss-fill').style.width=`${b.health/b.maxHealth*100}%`;hud.text('boss-phase',b.phase===2?'AERIAL SIEGE':'ARMORED ADVANCE');hud.text('boss-cue',b.state==='exposed'?'CORE EXPOSED · APPROACH + V':b.weakTime>0?'CORE VENTING · FIRE NOW':b.state==='windup'?'IMPACT IMMINENT · LEAVE THE MARKED ZONE':'ARMOR SEALED');}
      if(encounter.stage==='complete'){mode='complete';hud.endCinematic();hud.menu('complete');input.setEnabled(false);document.exitPointerLock();audio.mute(true);}
      if(player.health<=0){mode='dead';hud.menu('dead');input.setEnabled(false);document.exitPointerLock();audio.mute(true);}
    }
    if(mode==='play'){const recovery=city.recovery.check(player.position,player.state===FlightState.Ground&&player.body.grounded&&!player.ragdoll.active);if(recovery)relocate(recovery);}
    if(mode!=='paused'){impacts.update(dt);frameProfiler.span('city',()=>city.update(player.position,time,camera.camera,player.velocity,mode==='play'));}
    city.setActive(mode==='play');
    titan.present();const telemetry=player.telemetry();
    if(mode==='play'){
      if(telemetry.state!==heard.state){if(telemetry.state==='TAKEOFF')audio.cue('thrusterStart');else if(telemetry.state==='BRAKE')audio.cue('brake',.8);else if(heard.state==='FALL'&&telemetry.state==='HOVER')audio.cue('thrusterStart',1.2);}
      if(telemetry.boostActive&&!heard.boost)audio.cue('boost');
    }
    heard={state:telemetry.state,boost:telemetry.boostActive};flightVfx.update(dt,telemetry.state,telemetry.speed,telemetry.flightActive&&telemetry.boostActive,{velocity:player.velocity,bank:player.bankAmount});audio.update(telemetry.speed,telemetry.flightActive&&mode==='play');hud.update(telemetry,time);
    if(diagnostics){const d=getDiagnostics();hud.text('diagnostics',`${quality} / ${innerWidth}×${innerHeight} / DPR ${renderer.getPixelRatio()}\nFRAME ${d.meanMs.toFixed(1)} ms · P95 ${d.p95Ms.toFixed(1)} ms\nPHYSICS ${simulationMs.toFixed(2)} ms / 60 Hz\nDRAW ${d.drawCalls} · TRI ${d.triangles.toLocaleString()}\nBODIES ${d.bodies} / ACTIVE ${d.activeBodies}\nPARTICLES ${d.particles} · DEBRIS ${d.debris}\nASSET ${(AegisSuit.assetBytes/1e6).toFixed(1)} MB · ${d.assetLoadMs.toFixed(0)} ms\nCITY ${d.environment.district.toUpperCase()} / ${d.environment.tiles} TILES\n${d.environment.weather.toUpperCase()} / ${d.environment.hour.toFixed(1)} h / ${d.colliders} COLLIDERS\nPOS ${d.position.map(v=>v.toFixed(1)).join(' / ')}`);}
    renderer.info.reset();renderer.shadowMap.needsUpdate=true;frameProfiler.span('render',()=>{if(composer)composer.render();else renderer.render(scene,camera.camera);});animationFrame=requestAnimationFrame(tick);
  }
  animationFrame=requestAnimationFrame(tick);
  function dispose():void {if(closed)return;closed=true;cancelAnimationFrame(animationFrame);audio.mute(true);titan.dispose();city.dispose();composer?.passes.forEach(pass=>pass.dispose());composer?.dispose();environment.dispose();renderer.dispose();}
  window.addEventListener('pagehide',event=>{if(!event.persisted)dispose();});
  import.meta.hot?.dispose(dispose);
}
void boot().catch(error=>{console.error(error);const loader=root.querySelector('.loader')!;loader.replaceChildren();const title=document.createElement('strong');title.textContent='SYSTEM OFFLINE';const text=document.createElement('p');text.textContent=error instanceof Error?error.message:String(error);const button=document.createElement('button');button.textContent='Retry loading';button.onclick=()=>location.reload();loader.append(title,text,button);});
