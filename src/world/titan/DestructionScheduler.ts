/** Prioritized damage tasks; no whole-building fracture or boolean work runs here. */
export class DestructionScheduler {
 private jobs:{id:number;run:()=>void}[]=[];private limit=12;private budget=1.5;maxMs=0;
 setQuality(q:string){this.limit=q==='LOW'?12:q==='MEDIUM'?20:q==='HIGH'?28:36;this.budget=q==='LOW'?1.5:q==='MEDIUM'?2:q==='HIGH'?2.5:3;}
 enqueue(id:number,run:()=>void){if(this.jobs.length>=4096)return false;this.jobs.push({id,run});return true;}
 update(){const start=performance.now();let count=0;while(this.jobs.length&&count<this.limit&&(count===0||performance.now()-start<this.budget)){this.jobs.shift()!.run();count++;}this.maxMs=Math.max(this.maxMs,performance.now()-start);return count;}
 get pending(){return this.jobs.length;}
 clear(){this.jobs=[];this.maxMs=0;}
}
