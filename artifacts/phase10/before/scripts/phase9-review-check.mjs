import assert from 'node:assert/strict';
import {readFile,stat,writeFile} from 'node:fs/promises';
import {dirname,resolve,relative} from 'node:path';
// Filesystem checks only: do not launch the game or browser.
const report=resolve('artifacts/phase9/review.html'),html=await readFile(report,'utf8'),targets=[...new Set([...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(m=>m[1]))],missing=[];
for(const link of targets){if(/^(https?:|data:|#)/.test(link))continue;try{await stat(resolve(dirname(report),decodeURIComponent(link.split(/[?#]/)[0])));}catch{missing.push(link);}}
const verification=JSON.parse(await readFile('artifacts/phase9/verification.json','utf8'));
assert.ok(verification.unit.pass>=62);assert.equal(verification.unit.fail,0);assert.equal(verification.build,true);assert.equal(verification.acceptance.length,6);assert.ok(verification.acceptance.every(c=>c.passed));
if(verification.run){assert.equal(verification.browser.status,'passed');assert.equal(verification.browser.unexpected,0);assert.ok(verification.browser.expected>=46);assert.equal(verification.production.passed,true);assert.equal(verification.matrixComplete,true);assert.equal(verification.overlap.passed,true);assert.equal(verification.overlap.recordingPassed,true);assert.ok(verification.overlap.samplesWithBreachImpacts>0);assert.ok(verification.overlap.maximumObservedAirborne<=8);assert.equal(verification.deferred.length,0);const roof=verification.acceptance.find(c=>c.name==='roof');assert.equal(roof.start.grounded,true);assert.ok(roof.start.position[1]>=roof.roofExpected-.5);}else{assert.equal(verification.production.passed,null);assert.ok(verification.deferred.length>=4);}assert.deepEqual(missing,[]);
const result={checkedAt:new Date().toISOString(),method:'Filesystem/schema checks only; no browser or live game',report:relative(process.cwd(),report),checkedLinks:targets.length,missing,unit:verification.unit,build:verification.build,captures:verification.acceptance.length,remainingLiveWork:verification.run?'Completed':'Deferred at user request'};
await writeFile('artifacts/phase9/review-check.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
