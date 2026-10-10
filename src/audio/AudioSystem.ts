/** Lightweight original synthesis. No unlicensed sound downloads; all sounds begin after a user gesture. */
export class AudioSystem {
  private context:AudioContext|null=null;
  private master:GainNode|null=null;
  private engine:OscillatorNode|null=null;
  private engineGain:GainNode|null=null;
  enabled=true;
  async start():Promise<void> {
    if(!this.context){
      this.context=new AudioContext();this.master=this.context.createGain();this.master.gain.value=.22;this.master.connect(this.context.destination);
      this.engine=this.context.createOscillator();this.engine.type='sawtooth';
      const filter=this.context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=190;
      this.engineGain=this.context.createGain();this.engineGain.gain.value=0;
      this.engine.connect(filter).connect(this.engineGain).connect(this.master);this.engine.start();
    }
    await this.context.resume();
  }
  cue(kind:'impact'|'lock'|'shot'|'dock'|'alarm',strength=1):void {
    if(!this.context||!this.master||!this.enabled)return;
    const now=this.context.currentTime,o=this.context.createOscillator(),g=this.context.createGain();
    const settings={impact:[80,30,.22],lock:[620,980,.08],shot:[260,65,.13],dock:[160,60,.12],alarm:[540,420,.25]}[kind];
    o.type=kind==='lock'?'sine':'triangle';o.frequency.setValueAtTime(settings[0],now);o.frequency.exponentialRampToValueAtTime(settings[1],now+settings[2]);
    g.gain.setValueAtTime(Math.min(.5,.22*strength),now);g.gain.exponentialRampToValueAtTime(.0001,now+settings[2]);
    o.connect(g).connect(this.master);o.start(now);o.stop(now+settings[2]);o.onended=()=>{o.disconnect();g.disconnect();};
  }
  update(speed:number,flying:boolean):void {
    if(!this.context||!this.engine||!this.engineGain)return;
    this.engine.frequency.setTargetAtTime(45+speed*1.4,this.context.currentTime,.15);
    this.engineGain.gain.setTargetAtTime(this.enabled&&flying?.05+speed*.001:0,this.context.currentTime,.12);
  }
  mute(muted:boolean):void {if(this.master&&this.context)this.master.gain.setTargetAtTime(muted||!this.enabled?0:.22,this.context.currentTime,.08);}
}
