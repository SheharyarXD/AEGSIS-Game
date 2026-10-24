import {prepareGeometry,GeometryPayload} from './GeometryPreparation';
export class GeometryWorker {
 private worker?:Worker;private next=0;private disposed=false;private pending=new Map<number,{resolve:(r:ReturnType<typeof prepareGeometry>)=>void;reject:(e:Error)=>void}>();
 constructor(){if(typeof Worker!=='undefined')try{
  this.worker=new Worker(new URL('./geometry.worker.ts',import.meta.url),{type:'module'});
  this.worker.onmessage=e=>{const job=this.pending.get(e.data.id);if(!job)return;this.pending.delete(e.data.id);if(e.data.error)job.reject(new Error(e.data.error));else job.resolve(e.data.result);};
  this.worker.onerror=()=>this.fail(new Error('Geometry worker failed; later requests use the scheduled fallback'));
  this.worker.onmessageerror=()=>this.fail(new Error('Geometry worker returned an unreadable response'));
 }catch{this.worker=undefined;}}
 private fail(error:Error){this.worker?.terminate();this.worker=undefined;for(const p of this.pending.values())p.reject(error);this.pending.clear();}
 async prepare(input:GeometryPayload){
  if(this.disposed)throw new Error('Geometry preparation disposed');
  if(!this.worker){await new Promise(r=>setTimeout(r,0));if(this.disposed)throw new Error('Geometry preparation disposed');return prepareGeometry(input);}
  const id=++this.next;return new Promise<ReturnType<typeof prepareGeometry>>((resolve,reject)=>{
   this.pending.set(id,{resolve,reject});const buffers=[...new Set([...input.attributes.map(a=>a.array.buffer),...(input.index?[input.index.buffer]:[])])];
   try{this.worker!.postMessage({id,input},buffers);}catch(error){this.pending.delete(id);reject(error instanceof Error?error:new Error(String(error)));}
  });
 }
 dispose(){this.disposed=true;this.fail(new Error('Geometry preparation disposed'));}
}
