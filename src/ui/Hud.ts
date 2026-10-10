import { PerspectiveCamera, Vector3 } from 'three';
import { QualityLevel, QUALITY_ORDER } from '../config';
import { PlayerTelemetry } from '../player/PlayerController';

export interface HudActions {start:(range:boolean)=>void;resume:()=>void;restart:()=>void;quality:(q:QualityLevel)=>void;audio:(enabled:boolean)=>void;}
export class Hud {
  readonly root:HTMLDivElement;
  private readonly nodes=new Map<string,HTMLElement>();
  private lastUpdate=0;
  private objectiveText='';
  constructor(parent:HTMLElement,quality:QualityLevel,actions:HudActions) {
    this.root=document.createElement('div');this.root.className='hud';
    this.root.innerHTML=`
      <div class="vignette"></div><div class="letterbox top"></div><div class="letterbox bottom"></div>
      <header class="brand"><span class="brand-mark">Λ</span><div><strong>AEGIS</strong><small>RISE OF THE TITAN</small></div></header>
      <div class="build-tag"><span class="status-dot"></span> AER–7 <i>/</i> VANGUARD SYSTEMS</div>
      <section class="menu" id="menu">
        <span class="overline" id="menu-kicker">PORT HELIX · 04:37 LOCAL</span>
        <h1 id="menu-title">THE CITY<br>IS STILL<br><em>OURS.</em></h1>
        <p id="menu-copy">One operative. A city under siege.<br>Bring the machine to its knees.</p>
        <div class="menu-actions"><button class="primary" id="deploy">DEPLOY OPERATIVE <span>↗</span></button>
        <button class="secondary" id="range">Flight & impact range <span>02</span></button>
        <button class="secondary hidden" id="resume">Resume operation <span>↗</span></button>
        <button class="secondary hidden" id="restart">Restart operation <span>↻</span></button>
        <div class="menu-links"><button id="controls-button">Controls</button><button id="settings-button">Settings</button><button id="credits-button">Credits</button></div></div>
        <div class="chapter"><b>01</b><div><span>OPERATION / BREAKWATER</span><small>A playable development slice</small></div></div>
      </section>
      <div class="title-detail" id="title-detail"><span>AEGIS / AER–7</span><strong>VANGUARD</strong><small>Adaptive armored response platform</small><div class="detail-line"></div><p>180 KG <i>•</i> VECTOR PROPULSION <i>•</i> CORE ONLINE</p></div>
      <div class="game-ui hidden" id="game-ui">
        <section class="objective"><span class="overline">OPERATION BREAKWATER</span><div><i>◇</i><strong id="objective-title">Deploy to Port Helix</strong></div><p id="objective-hint"></p><small id="objective-progress"></small></section>
        <div class="compass"><span>W</span><i>240</i><b id="heading">N</b><i>300</i><span>N</span></div>
        <div class="reticle"><i></i><b></b></div>
        <div class="target-marker hidden" id="target-marker"><i></i><span id="target-label"></span></div>
        <div class="waypoint hidden" id="waypoint"><i>◇</i><span id="waypoint-distance"></span></div>
        <section class="vitals"><div class="operative"><b>AER–7</b><span id="mode">GROUNDED</span></div><div class="bar"><i id="health-fill"></i></div><div class="vital-label"><span>ARMOR INTEGRITY</span><b id="health-value">100</b></div><div class="bar core"><i id="energy-fill"></i></div><div class="vital-label"><span>REACTOR</span><b id="energy-value">100%</b></div></section>
        <section class="telemetry"><div><b id="speed">000</b><span>KM/H</span></div><small>ALT <strong id="altitude">000</strong> M</small></section>
        <div class="hints" id="hints"><span><kbd>E</kbd> Flight</span><span><kbd>SHIFT</kbd> Boost</span><span><kbd>Q</kbd> Brake</span><span><kbd>H</kbd> Controls</span></div>
        <div class="warning hidden" id="warning">MISSILE APPROACHING</div>
        <section class="boss-bar hidden" id="boss-bar"><div><strong>TITAN–09</strong><span id="boss-phase">SIEGE PLATFORM</span></div><div class="bar"><i id="boss-fill"></i></div><small id="boss-cue"></small></section>
      </div>
      <div class="cinematic-caption hidden" id="caption"><span id="caption-label">VANGUARD SYSTEMS</span><strong id="caption-text"></strong><button id="skip">Skip sequence · Enter</button></div>
      <pre class="diagnostics hidden" id="diagnostics"></pre>
      <dialog id="dialog"><button class="close" id="close-dialog" aria-label="Close dialog">×</button><div id="dialog-content"></div></dialog>
      <div class="toast hidden" id="toast" role="status"></div>`;
    parent.append(this.root);
    this.root.querySelectorAll<HTMLElement>('[id]').forEach(e=>this.nodes.set(e.id,e));
    this.el('deploy').onclick=()=>actions.start(false);this.el('range').onclick=()=>actions.start(true);
    this.el('resume').onclick=actions.resume;this.el('restart').onclick=actions.restart;
    this.el('controls-button').onclick=()=>this.controls();
    this.el('settings-button').onclick=()=>{
      this.dialog(`<span class="overline">SYSTEM CONFIGURATION</span><h2>Make it yours.</h2><label class="setting">Render quality<select id="quality-select">${QUALITY_ORDER.map(q=>`<option ${q===quality?'selected':''}>${q}</option>`).join('')}</select></label><p class="dialog-note">Quality changes resolution, shadows and effect budgets. The playable world stays the same. Applying reloads the game.</p><label class="setting">Synthesized audio<input id="audio-toggle" type="checkbox" checked></label><p class="dialog-note">Press F3 during play for frame times, draw calls and physical body counts.</p>`);
      this.root.querySelector<HTMLSelectElement>('#quality-select')!.onchange=e=>actions.quality((e.target as HTMLSelectElement).value as QualityLevel);
      this.root.querySelector<HTMLInputElement>('#audio-toggle')!.onchange=e=>actions.audio((e.target as HTMLInputElement).checked);
    };
    this.el('credits-button').onclick=()=>this.dialog(`<span class="overline">ASSET CREDITS</span><h2>Built with credit.</h2><p>Robot models, textures and authored animation © 2018 Juan Linietsky and Fernando Miguel Calabró, Godot TPS demo. Adapted for AEGIS.</p><p><a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">CC BY 3.0</a> · <a href="/assets/LICENSE-godot.txt" target="_blank">Full attribution</a> · <a href="/assets/asset-manifest.json" target="_blank">Asset manifest</a></p><p class="dialog-note">AEGIS is a development prototype. Combat and flight poses include authored fallback keyframes. Assembly deploys supplementary panels around the continuous source rig.</p><p>Three.js · Rapier · Original district geometry and synthesized audio.</p>`);
    this.el('close-dialog').onclick=()=>this.closeDialog();
  }
  el(id:string):HTMLElement {return this.nodes.get(id)!;}
  show(id:string,visible:boolean):void {this.el(id).classList.toggle('hidden',!visible);}
  text(id:string,text:string):void {if(this.el(id).textContent!==text)this.el(id).textContent=text;}
  menu(state:'title'|'paused'|'dead'|'complete'|'hidden'):void {
    this.show('menu',state!=='hidden');this.show('title-detail',state==='title');this.show('game-ui',state==='hidden');
    this.root.classList.toggle('menu-visible',state!=='hidden');
    this.show('deploy',state==='title');this.show('range',state==='title');this.show('resume',state==='paused');this.show('restart',state!=='title'&&state!=='hidden');
    const copy={title:['PORT HELIX · 04:37 LOCAL','THE CITY<br>IS STILL<br><em>OURS.</em>','One operative. A city under siege.<br>Bring the machine to its knees.'],paused:['LINK SUSPENDED','TAKE A<br><em>BREATH.</em>','The operation is paused.'],dead:['VANGUARD / SIGNAL LOST','ARMOR<br><em>OFFLINE.</em>','Read the telegraphs. Brake before turning.<br>Re-enter the operation.'],complete:['OPERATION BREAKWATER / COMPLETE','THE CITY<br><em>HOLDS.</em>','TITAN–09 neutralized.<br>Port Helix is back on the grid.'],hidden:['','','']}[state];
    this.text('menu-kicker',copy[0]);this.el('menu-title').innerHTML=copy[1];this.el('menu-copy').innerHTML=copy[2];
  }
  cinematic(label:string,text:string):void {this.show('caption',true);this.text('caption-label',label);this.text('caption-text',text);this.root.classList.add('cinematic');this.show('game-ui',false);}
  endCinematic():void {this.show('caption',false);this.root.classList.remove('cinematic');this.show('game-ui',true);}
  objective(title:string,hint:string,progress=''):void {
    if(this.objectiveText===title+hint+progress)return;this.objectiveText=title+hint+progress;
    this.text('objective-title',title);this.text('objective-hint',hint);this.text('objective-progress',progress);
  }
  update(data:PlayerTelemetry,now:number):void {
    if(now-this.lastUpdate<.08)return;this.lastUpdate=now;
    this.text('speed',Math.round(data.speed*3.6).toString().padStart(3,'0'));this.text('altitude',Math.round(data.altitude).toString().padStart(3,'0'));
    this.text('mode',data.ragdoll?'STABILITY LOST':data.state);this.text('health-value',`${Math.ceil(data.health)}`);this.text('energy-value',`${Math.ceil(data.energy)}%`);
    this.el('health-fill').style.width=`${data.health}%`;this.el('energy-fill').style.width=`${data.energy}%`;
    this.root.classList.toggle('damaged',data.health<25);
  }
  waypoint(position:Vector3|null,player:Vector3,camera:PerspectiveCamera):void {
    this.show('waypoint',!!position);if(!position)return;const p=position.clone().project(camera);
    this.el('waypoint').style.left=`${Math.max(7,Math.min(93,p.x*50+50))}%`;
    this.el('waypoint').style.top=`${Math.max(20,Math.min(78,-p.y*50+50))}%`;
    this.text('waypoint-distance',`${Math.round(position.distanceTo(player))} M`);
    this.el('waypoint').style.opacity=p.z>1?'.4':'1';
  }
  target(position:Vector3|null,name:string,camera:PerspectiveCamera):void {
    if(!position){this.show('target-marker',false);return;}const p=position.clone().project(camera);this.show('target-marker',p.z<1&&Math.abs(p.x)<1&&Math.abs(p.y)<1);
    this.el('target-marker').style.left=`${p.x*50+50}%`;this.el('target-marker').style.top=`${-p.y*50+50}%`;this.text('target-label',name);
  }
  controls():void {this.dialog(`<span class="overline">VANGUARD / FIELD MANUAL</span><h2>You are the weapon.</h2><div class="control-grid"><kbd>W A S D</kbd><span>Move / steer</span><kbd>MOUSE</kbd><span>Look · click scene to capture</span><kbd>E</kbd><span>Take off / land</span><kbd>SPACE / CTRL</kbd><span>Jump or climb / descend</span><kbd>SHIFT / Q</kbd><span>Sprint or boost / air brake</span><kbd>LMB / J</kbd><span>Light punch · air strike</span><kbd>R / K</kbd><span>Heavy punch</span><kbd>G</kbd><span>Grab · press again to throw</span><kbd>RMB / B</kbd><span>Guard · time it to counter</span><kbd>X</kbd><span>Dodge</span><kbd>F</kbd><span>Pulse cannon · shoot missiles</span><kbd>C</kbd><span>Ground slam while flying</span><kbd>TAB</kbd><span>Cycle target lock</span><kbd>V</kbd><span>Finish exposed TITAN core</span><kbd>ESC / H</kbd><span>Pause / this manual</span><kbd>F3</kbd><span>Performance diagnostics</span></div><p class="dialog-note">Mouse and keyboard required. Arrow keys also turn the camera. Heavy blows and thrown bodies can break the checkpoint wall. Read red attack telegraphs and move before impact.</p>`);}
  private dialog(html:string):void {this.el('dialog-content').innerHTML=html;(this.el('dialog') as HTMLDialogElement).showModal();document.exitPointerLock();}
  closeDialog():void {(this.el('dialog') as HTMLDialogElement).close();}
}
