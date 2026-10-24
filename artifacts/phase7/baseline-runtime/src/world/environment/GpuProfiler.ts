import { WebGLRenderer } from 'three';
interface TimerExtension {TIME_ELAPSED_EXT:number;GPU_DISJOINT_EXT:number;}
export interface GpuStats {supported:boolean;samples:number;meanMs:number;p95Ms:number;}
/** Asynchronous GPU queries around actual render calls, including compositor passes. */
export class GpuProfiler {
 private gl:WebGL2RenderingContext;private extension:TimerExtension|null;
 private pending:{frame:number;query:WebGLQuery}[]=[];private values:number[]=[];private frame=0;private handle=0;private inside=false;
 private original:WebGLRenderer['render'];
 constructor(private renderer:WebGLRenderer){
  this.gl=renderer.getContext() as WebGL2RenderingContext;this.extension=this.gl.getExtension('EXT_disjoint_timer_query_webgl2');this.original=renderer.render;
  if(!this.extension)return;
  renderer.render=(...args)=>{
   if(this.inside||this.pending.length>48)return this.original.apply(renderer,args);
   const query=this.gl.createQuery();if(!query)return this.original.apply(renderer,args);
   this.inside=true;this.gl.beginQuery(this.extension!.TIME_ELAPSED_EXT,query);
   try{this.original.apply(renderer,args);}finally{this.gl.endQuery(this.extension!.TIME_ELAPSED_EXT);this.inside=false;this.pending.push({frame:this.frame,query});}
  };
  const tick=()=>{this.poll();this.frame++;this.handle=requestAnimationFrame(tick);};this.handle=requestAnimationFrame(tick);
 }
 private poll():void{
  if(this.gl.getParameter(this.extension!.GPU_DISJOINT_EXT)){for(const p of this.pending)this.gl.deleteQuery(p.query);this.pending=[];return;}
  while(this.pending.length){
   const frame=this.pending[0].frame,group=this.pending.filter(p=>p.frame===frame);
   if(frame>=this.frame||group.some(p=>!this.gl.getQueryParameter(p.query,this.gl.QUERY_RESULT_AVAILABLE)))break;
   let elapsed=0;for(const p of group){elapsed+=Number(this.gl.getQueryParameter(p.query,this.gl.QUERY_RESULT))/1e6;this.gl.deleteQuery(p.query);}
   this.pending=this.pending.filter(p=>p.frame!==frame);this.values.push(elapsed);if(this.values.length>240)this.values.shift();
  }
 }
 stats():GpuStats{const sorted=[...this.values].sort((a,b)=>a-b);return {supported:!!this.extension,samples:sorted.length,meanMs:sorted.reduce((a,b)=>a+b,0)/Math.max(1,sorted.length),p95Ms:sorted[Math.floor(sorted.length*.95)]??0};}
 dispose():void{cancelAnimationFrame(this.handle);this.renderer.render=this.original;for(const p of this.pending)this.gl.deleteQuery(p.query);this.pending=[];}
}
