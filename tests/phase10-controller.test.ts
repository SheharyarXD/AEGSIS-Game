import test from 'node:test';import assert from 'node:assert/strict';
import {AnimationMixer,Group,PerspectiveCamera,Vector3} from 'three';
import {CharacterBody,PhysicsWorld} from '../src/physics/PhysicsWorld';
import {FlightState} from '../src/player/FlightState';
import {DEFAULT_CONTROLS} from '../src/input/Controls';
import {TitanCinematicAssault} from '../src/world/titan/TitanCinematicAssault';

async function harness(deferred=false){
 await PhysicsWorld.init();const old=Object.getOwnPropertyDescriptor(globalThis,'document'),element=()=>({style:{},textContent:'',setAttribute(){},remove(){}});Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:element,body:{append(){}}}});
 const physics=new PhysicsWorld(),body=new CharacterBody(physics,new Vector3(0,.021,0)),group=new Group(),mixer=new AnimationMixer(group);physics.box(new Vector3(0,-.5,0),new Vector3(200,1,200));physics.world.step();
 const armor={mixer,setPower(){},combatReady:false},player={physics,body,armor,controls:DEFAULT_CONTROLS,suited:true,changingForm:false,health:100,energy:100,ragdoll:{active:false},state:FlightState.Ground,velocity:new Vector3(),object:group,strikeHeading:null,boostActive:false,get position(){return body.position;},get isFlying(){return this.state!==FlightState.Ground;},getSpeed(){return this.velocity.length();}};
 let charged=0,released=0,live=true,resolve!:(t:number)=>void,token=1,shots:any[]=[];
 const architecture={targetBuilding:()=>({id:7,point:new Vector3(0,2,-20)}),reserveBarrage:()=>deferred?new Promise<number>(r=>{resolve=r;}):Promise.resolve(token),releaseBarrage(){released++;live=false;},barrageReserved:()=>live,barrageTarget:()=>new Vector3(0,2,-30),barrageImpact:()=>true,finishBarrage:()=>true,breachImpact(){},effects:{cinematicExit(){},fragmentBurst(){}}};
 const missiles={demolition:false,barrageAvailable:true,barrageBusy:false,deployed:0,onBarrageImpact:undefined as any,beginBarrage(){charged++;return true;},deployBarrage(){this.deployed=1;},barrageWave(a:any[]){shots=a;this.barrageBusy=true;return true;},endBarrage(){this.barrageBusy=false;}};
 const building={id:7,x:0,z:-30,w:20,d:20,h:40,family:'test'},assets={parts:new Map([['titan10_interior_office',[]]])};
 const camera={camera:new PerspectiveCamera(),yaw:Math.PI,pitch:0,addShake(){}};camera.camera.position.set(0,2,5);
 const ability=new TitanCinematicAssault({layout:{buildings:[building]},architecture,assets,prepareAt(){}} as never,player as never,camera as never,missiles as never,{cue(){}} as never,element() as never);
 let tap='';const input={anyTap:(keys:string[])=>keys.includes(tap),reset(){}};
 const tick=(key='',dt=1/60)=>{tap=key;ability.update(dt,input as never,{forward:new Vector3(0,0,-1)} as never);physics.world.step();body.sync();group.position.copy(body.position);};
 const hit=()=>{const wave=shots;shots=[];for(const shot of wave)missiles.onBarrageImpact(new Vector3(0,2,-20),new Vector3(0,0,1),shot);missiles.barrageBusy=false;};
 return {ability,player,physics,body,architecture,missiles,building,assets,tick,hit,resolve(){resolve(token);},loseReservation(){live=false;},stats:()=>({charged,released}),dispose(){ability.dispose();body.dispose();physics.dispose();if(old)Object.defineProperty(globalThis,'document',old);else Reflect.deleteProperty(globalThis,'document');}};
}
const task=()=>new Promise(r=>setTimeout(r,0));
test('one Y reserves once and completion requires impacts before automatic physical movement',async()=>{
 const h=await harness();try{h.tick('KeyY');await task();assert.equal(h.player.energy,52);assert.equal(h.ability.state,'ACQUIRING');h.tick('KeyY');assert.equal(h.stats().charged,1);for(let i=0;i<90;i++)h.tick();assert.equal(h.ability.state,'BARRAGE');assert.equal(h.ability.entries,0);assert.ok(h.player.position.z>-.1);
  for(let wave=0;wave<3;wave++){h.hit();h.tick();}for(let i=0;i<500&&h.ability.completed===0;i++)h.tick();assert.equal(h.ability.completed,1);assert.ok(h.player.position.z<-45);assert.equal(h.body.body.isEnabled(),true);assert.equal(h.ability.ownsInput,false);assert.equal(h.player.strikeHeading,null);assert.ok(h.player.velocity.length()>0);assert.equal(h.stats().charged,1);
 }finally{h.dispose();}
});
for(const reason of ['pause','focus-loss','restart','death','world-loss'])test(`${reason} releases cinematic ownership and never grants a completed traversal`,async()=>{
 const h=await harness();try{h.tick('KeyY');await task();for(let i=0;i<70;i++)h.tick();if(reason==='death'){h.player.health=0;h.tick();}else if(reason==='world-loss'){h.loseReservation();h.tick();}else if(reason==='restart')h.ability.reset();else h.ability.interrupt(reason);
  assert.equal(h.ability.ownsInput,false);assert.equal(h.ability.completed,0);assert.equal(h.body.body.isEnabled(),true);assert.ok(h.stats().released>0);assert.equal(h.player.strikeHeading,null);
 }finally{h.dispose();}
});
test('late asynchronous reservation after interruption is released without charging energy',async()=>{
 const h=await harness(true);try{h.tick('KeyY');assert.equal(h.ability.state,'PREPARING');h.ability.interrupt('pause');h.resolve();await task();assert.equal(h.player.energy,100);assert.equal(h.stats().charged,0);assert.equal(h.stats().released,1);assert.equal(h.ability.ownsInput,false);}finally{h.dispose();}
});
test('a stalled asset reservation times out without spending energy and releases a late result',async()=>{
 const h=await harness(true);try{h.tick('KeyY');h.tick('',8.1);assert.equal(h.ability.state,'ABORTED');assert.equal(h.ability.ownsInput,false);assert.equal(h.player.energy,100);h.resolve();await task();assert.equal(h.stats().released,1);assert.equal(h.stats().charged,0);}finally{h.dispose();}
});
test('a missing family-specific interior rejects before reserving a Gothic attack',async()=>{
 const h=await harness();try{(h.building as any).style='gothic';h.tick('KeyY');await task();assert.equal(h.ability.ownsInput,false);assert.equal(h.player.energy,100);assert.equal(h.stats().charged,0);assert.match(h.ability.diagnostics().message,/ASSET/);}finally{h.dispose();}
});
test('new geometry on an accepted route stops actual movement instead of disabling the capsule',async()=>{
 const h=await harness();try{h.tick('KeyY');await task();for(let i=0;i<70;i++)h.tick();for(let wave=0;wave<3;wave++){h.hit();h.tick();}for(let i=0;i<15;i++)h.tick();h.physics.box(new Vector3(0,2,-8),new Vector3(8,8,1));h.physics.world.step();for(let i=0;i<180&&h.ability.ownsInput;i++)h.tick();assert.equal(h.ability.state,'ABORTED');assert.equal(h.ability.completed,0);assert.ok(h.player.position.z>-8);assert.equal(h.body.body.isEnabled(),true);}finally{h.dispose();}
});
