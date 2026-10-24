/** Building-only damage. Enemy/player values remain in their existing combat systems. */
export type DemolitionMode='standard'|'demolition';
export interface WorldAttack {kind:'missile'|'repulsor'|'laser'|'breakthrough';mode?:DemolitionMode;normal?:[number,number,number];}
export const TITAN_CONFIG={
 missiles:{standard:{environment:3,structure:3,radius:1,impulse:1.25,vfx:1,energy:7,cooldown:.6},demolition:{environment:8,structure:14,radius:2.1,impulse:2.7,vfx:2.2,energy:14,cooldown:4.5}},
 breakthrough:{key:'KeyY',minSpeed:0,speed:0,energy:48,cooldown:16,range:180,maxDepth:80,radius:2.75,halfHeight:2.3,maxPitch:.22,timeout:16,waves:[3,3,2],acquire:.4,deploy:.6,penetration:16},
 budgets:{LOW:{debris:16,workMs:1.5,components:12,collapsedFloors:1},MEDIUM:{debris:24,workMs:2,components:20,collapsedFloors:1},HIGH:{debris:32,workMs:2.5,components:28,collapsedFloors:2},ULTRA:{debris:40,workMs:3,components:36,collapsedFloors:2}},
} as const;
export const worldAttackScale=(attack?:WorldAttack)=>attack?.kind==='missile'?TITAN_CONFIG.missiles[attack.mode??'standard']:{environment:1,structure:1,radius:1,impulse:1,vfx:1,energy:0,cooldown:0};
