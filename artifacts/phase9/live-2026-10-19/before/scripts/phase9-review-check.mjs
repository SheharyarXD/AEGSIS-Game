import assert from 'node:assert/strict';
import {readFile,stat,writeFile} from 'node:fs/promises';
import {dirname,resolve,relative} from 'node:path';
// Filesystem checks only: do not launch the game or browser.
const report=resolve('artifacts/phase9/review.html'),html=await readFile(report,'utf8'),targets=[...new Set([...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(m=>m[1]))],missing=[];
for(const link of targets){if(/^(https?:|data:|#)/.test(link))continue;try{await stat(resolve(dirname(report),decodeURIComponent(link.split(/[?#]/)[0])));}catch{missing.push(link);}}
const verification=JSON.parse(await readFile('artifacts/phase9/verification.json','utf8'));
assert.equal(verification.unit.pass,62);assert.equal(verification.unit.fail,0);assert.equal(verification.build,true);assert.equal(verification.acceptance.length,6);assert.ok(verification.acceptance.every(c=>c.passed));assert.equal(verification.production.passed,null);assert.ok(verification.deferred.length>=4);assert.deepEqual(missing,[]);
const result={checkedAt:new Date().toISOString(),method:'Filesystem/schema checks only; no browser or live game',report:relative(process.cwd(),report),checkedLinks:targets.length,missing,unit:verification.unit,build:verification.build,captures:verification.acceptance.length,remainingLiveWork:'Deferred at user request'};
await writeFile('artifacts/phase9/review-check.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
