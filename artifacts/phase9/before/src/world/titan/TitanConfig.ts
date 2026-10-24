/** Building-only damage. Enemy/player values remain in their existing combat systems. */
export type DemolitionMode='standard'|'demolition';
export interface WorldAttack {kind:'missile'|'repulsor'|'laser'|'breakthrough';mode?:DemolitionMode;normal?:[number,number,number];}
export const TITAN_CONFIG={
 missiles:{standard:{environment:3,structure:3,radius:1,impulse:1.25,vfx:1,energy:7,cooldown:.6},demolition:{environment:5,structure:5,radius:1.55,impulse:2.1,vfx:1.7,energy:22,cooldown:8}},
 breakthrough:{key:'KeyY',minSpeed:18,speed:70,energy:32,cooldown:12,range:125,maxDepth:110,radius:1.65,halfHeight:1.4,maxPitch:.22,timeout:5},
 budgets:{LOW:{debris:16,workMs:1.5,components:12,collapsedFloors:1},MEDIUM:{debris:24,workMs:2,components:20,collapsedFloors:1},HIGH:{debris:32,workMs:2.5,components:28,collapsedFloors:2},ULTRA:{debris:40,workMs:3,components:36,collapsedFloors:2}},
} as const;
export const worldAttackScale=(attack?:WorldAttack)=>attack?.kind==='missile'?TITAN_CONFIG.missiles[attack.mode??'standard']:{environment:1,structure:1,radius:1,impulse:1,vfx:1,energy:0,cooldown:0};
