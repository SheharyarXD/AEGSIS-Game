import {test,expect} from '@playwright/test';
async function boot(page){await page.addInitScript(()=>localStorage.setItem('aegis-quality','LOW'));await page.goto('/?qa=1');await page.waitForFunction(()=>window.__AEGIS__,null,{timeout:120000});await page.evaluate(()=>window.__AEGIS__.start());}

test('all tall-building families have complete geometry available outside streamed tiles',async({page})=>{
 await boot(page);const result=await page.evaluate(()=>{const q=window.__AEGIS__;return q.city.layout.buildings.filter(b=>b.h>=90).map(b=>{const parts=q.city.assets.parts.get(`${b.family}_${b.assetHeight}_skyline`);return{id:b.id,parts:parts?.length??0,triangles:parts?.reduce((n,p)=>n+p.geometry.index.count/3,0)??0};});});
 expect(result.length).toBeGreaterThan(0);expect(result.every(b=>b.parts>0&&b.triangles>10)).toBe(true);
});

test('complete skyscrapers remain in the distant skyline while orbiting and changing far planes',async({page})=>{
 await boot(page);for(const id of [235,211,9002]){
  await page.evaluate(id=>{const q=window.__AEGIS__,b=q.city.layout.buildings.find(b=>b.id===id);q.teleport(q.player.position.clone().set(-700,180,700));q.player.state='HOVER';q.city.setCaptureView([b.x+700,140,b.z+1100],[b.x,b.h*.5,b.z]);},id);
  await page.waitForFunction(id=>window.__AEGIS__.city.streaming.isSkylineVisible(id),id);
  await page.evaluate(id=>{const q=window.__AEGIS__,b=q.city.layout.buildings.find(b=>b.id===id);q.city.setCaptureView([b.x-950,b.h+100,b.z-800],[b.x,b.h*.5,b.z]);},id);
  await page.waitForFunction(id=>window.__AEGIS__.city.streaming.isSkylineVisible(id),id);
 }
});

test('damage updates only owned triangle buffers and keeps surviving floor collision resident',async({page})=>{
 await boot(page);const result=await page.evaluate(async()=>{const q=window.__AEGIS__,b=q.city.layout.buildings.find(b=>b.id===235);await q.city.assets.ensure(b.family,b.assetHeight,'near');q.teleport(q.player.position.clone().set(b.x,20,b.z+b.d/2+20));q.player.state='HOVER';
 const parts=q.city.assets.parts.get(`${b.family}_${b.assetHeight}_near`),sourceIndices=parts.map(p=>Array.from(p.geometry.index.array));q.city.architecture.demonstrate(235,'windows');const state=q.city.architecture.states.get(235),coarse=state.coarse.map(c=>c.handle);q.city.architecture.demonstrate(235,'wall');q.city.architecture.update(.016,q.player.position,true);
 return{broken:state.broken.size,unmodifiedSource:parts.every((p,n)=>p.geometry.index.array.every((v,i)=>v===sourceIndices[n][i])),coarseRetained:coarse.filter(h=>state.coarse.some(c=>c.handle===h)).length,coarseCount:coarse.length,survivors:state.batches.map(b=>({draw:b.mesh.geometry.drawRange.count,live:b.damageIndex.count*3,source:b.original.length})),debris:q.city.architecture.diagnostics().activeDebris,cap:q.city.architecture.diagnostics().debrisCap};});
 expect(result.broken).toBeGreaterThan(0);expect(result.unmodifiedSource).toBe(true);expect(result.coarseRetained).toBeGreaterThan(result.coarseCount/2);expect(result.survivors.every(b=>b.draw===b.live)).toBe(true);expect(result.survivors.some(b=>b.draw<b.source)).toBe(true);expect(result.debris).toBeLessThanOrEqual(result.cap);
});
