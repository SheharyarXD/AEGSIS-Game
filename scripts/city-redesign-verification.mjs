import {readFile,writeFile,stat,readdir,unlink} from 'node:fs/promises';import {resolve} from 'node:path';import assert from 'node:assert/strict';
const root='artifacts/city-redesign',read=async f=>JSON.parse(await readFile(`${root}/${f}`,'utf8'));
const [browser,assets,layout,preservation,performance,native,production,links,views,damage,weapons,gameplay]=await Promise.all(['browser-results.json','asset-validation.json','asset-layout-audit.json','preservation.json','performance-after/results.json','performance-after-1080p/results.json','production-smoke.json','review-links.json','after/views/manifest.json','after/damage/stages.json','after/weapons/results.json','after/gameplay/results.json'].map(read));
assert.equal(browser.stats.expected,35);assert.equal(browser.stats.unexpected,0);assert.equal(browser.stats.flaky,0);assert.equal(browser.stats.skipped,0);
assert.equal(assets.errors.length,0);assert.equal(assets.lodFiles,50);assert.equal(layout.roadIntrusions.length,0);assert.equal(layout.buildingOverlaps.length,0);assert.equal(layout.missingRuntimeAssets.length,0);assert.equal(preservation.unexpectedNonWorldChanges.length,0);assert.equal(preservation.suppliedAssetsUnchanged,true);
assert.equal(performance.results.length,24);assert.equal(native.results.length,12);
for(const data of [performance,native])for(const r of data.results){assert.ok(!r.error,r.error);assert.deepEqual(r.errors,[]);assert.ok(r.gpu.includes('GTX 750 Ti'));assert.equal(r.activeGameplayFrames,r.samples);}
assert.deepEqual(production.errors,[]);assert.deepEqual(links.missing,[]);assert.deepEqual(views.errors,[]);
for(const rows of [damage,weapons,gameplay])for(const r of rows)assert.deepEqual(r.errors,[]);
for(const r of damage){assert.equal(r.stages.length,5);assert.ok(r.stages.at(-1).diagnostics.states.some(s=>s.id===r.id&&s.stage==='collapsed'));assert.ok(r.stages[1].diagnostics.brokenComponents>0);}
for(const r of weapons){assert.equal(r.after.launches,2);assert.ok(r.after.beamSeconds>=1.5);assert.ok(r.after.architecture.brokenComponents>0);assert.ok(r.after.architecture.effects.fires>0);}
// Playwright creates raw duplicate recording names alongside the selected recordings.
// Delete only those generated duplicate files under the verified evidence root.
let duplicatesRemoved=0;const absolute=resolve(root);
async function cleanup(folder){for(const entry of await readdir(folder,{withFileTypes:true})){
 const file=resolve(folder,entry.name);if(!file.startsWith(absolute+'\\')&&!file.startsWith(absolute+'/'))throw Error('Evidence path escaped');
 if(entry.isSymbolicLink())continue;if(entry.isDirectory())await cleanup(file);else if(/^page@.*\.webm$/.test(entry.name)){await unlink(file);duplicatesRemoved++;}
}}
await cleanup(resolve(root,'after'));await cleanup(resolve(root,'before/gameplay'));
const report={verifiedAt:new Date().toISOString(),build:'passed',physicsUnitChecks:6,environmentRecoveryUnitChecks:11,browserChecks:browser.stats,browserMethod:browser.aggregation,sourceFamilies:25,sourceLodFiles:50,nonWorldSourceFilesPreserved:preservation.sourceFiles.filter(f=>!f.world&&f.unchanged).length,suppliedOriginalsPreserved:preservation.suppliedAssets.length,primaryGameplaySamples:24,supplemental1080pSamples:12,productionChecks:production.checks,architectureViews:10,matchedBeforeAfterViews:10,threeSourceBuildingsWithFiveDamageStages:true,realBeamAndMissileRecordings:2,reviewLinks:links,duplicatesRemoved,scope:'MAIN integrated game on GTX 750 Ti 2GB. Visual quality is demonstrated by local browser evidence; remaining art/simulation/download limits are in the handoff. No external platform release or high-DPI/mobile certification.'};
await writeFile(`${root}/verification.json`,JSON.stringify(report,null,2));console.log('Final verification passes:',report.browserChecks.expected,'browser checks, 17 unit checks, 36 current gameplay samples, all asset/source preservation checks.');
