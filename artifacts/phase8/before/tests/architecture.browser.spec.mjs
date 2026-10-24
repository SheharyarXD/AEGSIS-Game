import {test,expect} from '@playwright/test';
async function boot(page){await page.addInitScript(()=>localStorage.setItem('aegis-quality','LOW'));await page.goto('/?qa=1');await page.waitForFunction(()=>window.__AEGIS__,null,{timeout:90000});await page.evaluate(()=>window.__AEGIS__.start());}

test('ordinary game URL exposes architecture attribution without mutable QA hooks',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('aegis-quality','LOW'));await page.goto('/');await page.waitForFunction(()=>window.aegisDiagnostics,null,{timeout:90000});
 expect(await page.evaluate(()=>!!window.__AEGIS__)).toBe(false);await page.getByRole('button',{name:'Credits',exact:true}).click();await expect(page.getByRole('link',{name:'Architecture licenses and full attribution'})).toHaveAttribute('href','/assets/environment/ATTRIBUTION.txt');
 const response=await page.request.get('/assets/environment/ATTRIBUTION.txt');expect(response.ok()).toBe(true);expect(await response.text()).toContain('ChamberSu1996');
});

test('capture cameras retain visible source landmarks and cull them when looking away',async({page})=>{
 await boot(page);await page.evaluate(()=>{const q=window.__AEGIS__,b=q.city.layout.buildings.find(b=>b.id===235);q.teleport(q.player.position.clone().set(-700,120,700));q.player.state='HOVER';q.city.setCaptureView([b.x,80,b.z+100],[b.x,80,b.z]);});
 await page.waitForFunction(()=>window.__AEGIS__.city.streaming.isFarVisible(235));
 await page.evaluate(()=>{const q=window.__AEGIS__,b=q.city.layout.buildings.find(b=>b.id===235);q.city.setCaptureView([b.x,80,b.z+100],[b.x,80,b.z+200]);});
 await page.waitForFunction(()=>!window.__AEGIS__.city.streaming.isFarVisible(235));
});
test('all fixed source buildings have damage templates and collision, with complete licensed near models',async({page})=>{
 await boot(page);const data=await page.evaluate(async()=>{const q=window.__AEGIS__;for(const id of [235,211,287]){const b=q.city.layout.buildings.find(b=>b.id===id);await q.city.assets.ensure(b.family,b.assetHeight,'near');}return {diagnostics:q.city.architecture.diagnostics(),count:q.city.layout.buildings.length,parts:[235,211,287].map(id=>{const b=q.city.layout.buildings.find(b=>b.id===id);return {id,parts:q.city.assets.parts.get(`${b.family}_${b.assetHeight}_near`).map(p=>({cid:!!p.geometry.getAttribute('_cid'),ranges:p.componentRanges.size,triangles:p.geometry.index.count/3}))};})};});
 expect(data.diagnostics.supportedBuildings).toBe(data.count);expect(data.parts.every(b=>b.parts.every(p=>p.cid&&p.ranges>0&&p.triangles>0))).toBe(true);
});
test('source damage opens collision, survives tile eviction and resets without debris or collider leaks',async({page})=>{
 await boot(page);const result=await page.evaluate(async()=>{
  const q=window.__AEGIS__,b=q.city.layout.buildings.find(b=>b.id===235);await q.city.assets.ensure(b.family,b.assetHeight,'near');q.teleport(q.player.position.clone().set(128,20,-330));q.player.state='HOVER';q.city.prepareAt(q.player.position);q.physics.world.step();
  const p=q.city.architecture.demonstrate(235,'wall');q.physics.world.step();const damaged=q.city.architecture.diagnostics(),before=q.physics.world.colliders.len();q.teleport(q.player.position.clone().set(-800,80,750));q.city.prepareAt(q.player.position);q.teleport(q.player.position.clone().set(128,20,-330));q.city.prepareAt(q.player.position);const returned=q.city.architecture.diagnostics();q.reset();q.physics.world.step();return {damaged,returned,reset:q.city.architecture.diagnostics(),before,after:q.physics.world.colliders.len(),p};
 });expect(result.damaged.brokenComponents).toBeGreaterThan(0);expect(result.returned.brokenComponents).toBe(result.damaged.brokenComponents);expect(result.reset.damagedBuildings).toBe(0);expect(result.reset.activeDebris).toBe(0);expect(result.after).toBeLessThan(result.before+100);
});
test('support loss drives partial and complete collapse while debris stays capped',async({page})=>{
 await boot(page);await page.evaluate(async()=>{const q=window.__AEGIS__,b=q.city.layout.buildings.find(b=>b.id===211);await q.city.assets.ensure(b.family,b.assetHeight,'near');q.teleport(q.player.position.clone().set(-576,25,-330));q.player.state='HOVER';q.city.prepareAt(q.player.position);q.city.architecture.demonstrate(211,'structure');});
 await page.waitForTimeout(3800);const partial=await page.evaluate(()=>window.__AEGIS__.city.architecture.diagnostics());expect(partial.states[0].stage).toBe('partial');expect(partial.activeDebris).toBeLessThanOrEqual(partial.debrisCap);
 await page.evaluate(()=>window.__AEGIS__.city.architecture.demonstrate(211,'collapse'));await page.waitForTimeout(6000);const collapsed=await page.evaluate(()=>window.__AEGIS__.city.architecture.diagnostics());expect(collapsed.states[0].stage).toBe('collapsed');expect(collapsed.brokenComponents).toBeGreaterThan(partial.brokenComponents);expect(collapsed.activeDebris).toBeLessThanOrEqual(collapsed.debrisCap);
});

test('destroyed harbor cranes restore their source instances and support collision on restart',async({page})=>{
 await boot(page);await page.waitForFunction(()=>window.__AEGIS__.city.diagnostics().props.registered>0);
 const result=await page.evaluate(()=>{
  const q=window.__AEGIS__,valid=()=>q.city.infrastructure.colliders.filter(c=>c.isValid()).length;
  const cranes=()=>{let count=0;q.city.group.traverse(o=>{if(o.isInstancedMesh&&o.name==='crane')for(let i=0;i<o.count;i++){const matrix=o.instanceMatrix.array.slice(i*16,i*16+16);if(Math.abs(matrix[0])+Math.abs(matrix[5])+Math.abs(matrix[10])>.001)count++;}});return count;};
  const before={colliders:valid(),cranes:cranes()};q.city.propDestruction.blast(q.player.position.clone().set(780,15,630),32,2000);
  const destroyed={colliders:valid(),cranes:cranes(),props:q.city.diagnostics().props};q.reset();
  return {before,destroyed,after:{colliders:valid(),cranes:cranes(),props:q.city.diagnostics().props}};
 });expect(result.destroyed.cranes).toBeLessThan(result.before.cranes);expect(result.destroyed.colliders).toBeLessThan(result.before.colliders);expect(result.after.colliders).toBe(result.before.colliders);expect(result.after.cranes).toBe(result.before.cranes);expect(result.after.props.broken).toBe(0);
});
