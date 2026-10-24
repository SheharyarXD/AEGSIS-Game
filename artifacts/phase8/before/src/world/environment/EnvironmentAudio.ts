import { WeatherState } from './WeatherState';
/** Own bounded graph; does not touch the hero's audio or introduce licensed samples. */
export class EnvironmentAudio {
 private context:AudioContext|null=null;private master:GainNode|null=null;private rain:GainNode|null=null;private wind:GainNode|null=null;
 private sources:AudioScheduledSourceNode[]=[];
 private thunderSources=new Set<AudioBufferSourceNode>();
 enabled=true;
 async start():Promise<void>{
  if(!this.context){
   const ctx=this.context=new AudioContext();this.master=ctx.createGain();this.master.gain.value=.35;this.master.connect(ctx.destination);
   const buffer=ctx.createBuffer(1,ctx.sampleRate*3,ctx.sampleRate),data=buffer.getChannelData(0);let seed=4197;
   for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=(seed/4294967296)*2-1;}
   for(const frequency of [1900,230]){
    const source=ctx.createBufferSource();source.buffer=buffer;source.loop=true;const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=frequency;
    const gain=ctx.createGain();gain.gain.value=0;source.connect(filter);filter.connect(gain);gain.connect(this.master);source.start();this.sources.push(source);
    if(frequency===1900)this.rain=gain;else this.wind=gain;
   }
   const hum=ctx.createOscillator();hum.frequency.value=48;const humGain=ctx.createGain();humGain.gain.value=.008;hum.connect(humGain);humGain.connect(this.master);hum.start();this.sources.push(hum);
  }
  await this.context.resume();
 }
 update(weather:WeatherState,active:boolean,altitude:number,industrial:boolean):void{
  const ctx=this.context;if(!ctx)return;
  this.master!.gain.setTargetAtTime(this.enabled&&active?.3:0,ctx.currentTime,.3);
  this.rain!.gain.setTargetAtTime(weather.values.rain*.12+weather.values.snow*.015,ctx.currentTime,.4);
  this.wind!.gain.setTargetAtTime(.015+weather.values.wind*.006+Math.min(.035,altitude*.00005)+(industrial?.02:0),ctx.currentTime,.4);
 }
 thunder(delay:number,strength:number):void{
  const ctx=this.context;if(!ctx||!this.enabled||this.thunderSources.size>=2)return;
  const source=ctx.createBufferSource();source.buffer=(this.sources[0] as AudioBufferSourceNode).buffer;
  const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=180;const gain=ctx.createGain(),t=ctx.currentTime+Math.min(5,delay);
  gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(strength*.2,t+.09);gain.gain.exponentialRampToValueAtTime(.001,t+2.8);
  source.connect(filter);filter.connect(gain);gain.connect(this.master!);source.start(t);source.stop(t+3);
  this.thunderSources.add(source);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();this.thunderSources.delete(source);};
 }
 reset():void{for(const source of this.thunderSources)try{source.stop();}catch{/* Already ended. */}this.thunderSources.clear();}
 dispose():void{this.reset();for(const s of this.sources)s.stop();this.sources=[];void this.context?.close();this.context=null;}
}
