interface Support {id:number;floor:number;center:number[];size:number[];kind:string;structural?:boolean;}
/** Lightweight floor/column connectivity. Facade skins carry no global building load. */
export class SupportGraph {
 readonly floors=new Map<number,{id:number;weight:number;column:string}[]>();
 constructor(components:readonly Support[]){for(const c of components){if(c.kind!=='support'||c.structural===false||c.structural===undefined&&!(c.size[0]>4||c.size[0]<1&&c.size[2]<1))continue;const nodes=this.floors.get(c.floor)??[],core=Math.hypot(c.center[0],c.center[2])<2||c.size[0]>4;nodes.push({id:c.id,weight:core?2:1,column:`${Math.sign(c.center[0])},${Math.sign(c.center[2])}`});this.floors.set(c.floor,nodes);}}
 status(floor:number,broken:ReadonlySet<number>){const nodes=this.floors.get(floor)??[],capacity=nodes.reduce((n,c)=>n+c.weight,0),lost=nodes.filter(c=>broken.has(c.id)),remaining=nodes.reduce((n,c)=>n+(broken.has(c.id)?0:c.weight),0),above=this.floors.get(floor+1)??[],unsupported=above.filter(c=>lost.some(l=>l.column===c.column)).length;return {integrity:capacity?remaining/capacity:1,lost:lost.length,supports:nodes.length,unsupportedAbove:unsupported,partial:lost.length>=2&&remaining/Math.max(1,capacity)<=.72,complete:lost.length>=4&&remaining/Math.max(1,capacity)<=.4};}
}
