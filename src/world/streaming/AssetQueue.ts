/** Bounded, deduplicated asset work. Lower priorities run first; promotion never duplicates a request. */
export class AssetQueue {
 private waiting:{key:string;priority:number;run:()=>Promise<void>;resolve:()=>void;reject:(e:unknown)=>void}[]=[];private jobs=new Map<string,Promise<void>>();private active=0;private closed=false;
 constructor(readonly concurrency=2){}
 request(key:string,priority:number,run:()=>Promise<void>):Promise<void>{const old=this.jobs.get(key);if(old){const job=this.waiting.find(j=>j.key===key);if(job)job.priority=Math.min(priority,job.priority);return old;}if(this.closed)return Promise.resolve();
 const promise=new Promise<void>((resolve,reject)=>{this.waiting.push({key,priority,run,resolve,reject});});this.jobs.set(key,promise);this.pump();return promise;}
 private pump(){while(!this.closed&&this.active<this.concurrency&&this.waiting.length){this.waiting.sort((a,b)=>a.priority-b.priority);const job=this.waiting.shift()!;this.active++;let work:Promise<void>;try{work=job.run();}catch(error){work=Promise.reject(error);}void work.then(()=>{this.jobs.delete(job.key);job.resolve();},error=>{this.jobs.delete(job.key);job.reject(error);}).finally(()=>{this.active--;this.pump();});}}
 stats(){return {active:this.active,queued:this.waiting.length,concurrency:this.concurrency};}
 close(){this.closed=true;for(const j of this.waiting)j.resolve();this.waiting=[];}
}
