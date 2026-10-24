/** Small ring buffers. Sorting and percentile work occur only when diagnostics are requested. */
export class FrameProfiler {
 private frames=new Float32Array(900);private count=0;private cursor=0;private scopes=new Map<string,{calls:number;total:number;max:number;last:number}>();private spikes:{stage:string;ms:number;at:number}[]=[];
 frame(ms:number){this.frames[this.cursor++%this.frames.length]=ms;this.count=Math.min(this.frames.length,this.count+1);}
 span<T>(stage:string,run:()=>T):T{const start=performance.now();try{return run();}finally{this.record(stage,performance.now()-start);}}
 record(stage:string,ms:number){const s=this.scopes.get(stage)??{calls:0,total:0,max:0,last:0};s.calls++;s.total+=ms;s.last=ms;s.max=Math.max(s.max,ms);this.scopes.set(stage,s);if(ms>20){this.spikes.push({stage,ms,at:performance.now()});if(this.spikes.length>64)this.spikes.shift();}}
 stats(){const sorted=Array.from(this.frames.subarray(0,this.count)).sort((a,b)=>a-b),p=(q:number)=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*q))]??0;return {samples:this.count,p50Ms:p(.5),p95Ms:p(.95),p99Ms:p(.99),worstMs:p(1),over50:sorted.filter(x=>x>50).length,stages:Object.fromEntries([...this.scopes].map(([key,s])=>[key,{meanMs:s.total/s.calls,maxMs:s.max,lastMs:s.last,calls:s.calls}])),spikes:this.spikes.slice()};}
 reset(){this.count=this.cursor=0;this.scopes.clear();this.spikes=[];}
}
