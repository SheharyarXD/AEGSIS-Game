import {chromium} from '@playwright/test';import {writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
await page.goto('http://127.0.0.1:5192/artifacts/city-redesign/review.html');await page.locator('h1').waitFor();await page.waitForFunction(()=>document.querySelector('img')?.complete&&document.querySelector('img')?.naturalWidth>0);
await page.screenshot({path:'artifacts/city-redesign/review-preview.png'});
const movie=page.locator('video').first();await movie.scrollIntoViewIfNeeded();await movie.evaluate(v=>{v.preload='metadata';v.load();});await page.waitForFunction(()=>document.querySelector('video').readyState>=1);
const media=await movie.evaluate(v=>({duration:v.duration,width:v.videoWidth,height:v.videoHeight}));assert.ok(media.width>0);assert.ok(media.duration>5);
const attribution=await page.locator('a[href="/assets/environment/metropolis/LICENSES.txt"]').getAttribute('href');assert.ok(attribution);assert.equal((await page.request.get(new URL(attribution,page.url()).href)).status(),200);assert.deepEqual(errors,[]);
await writeFile('artifacts/city-redesign/review-browser-validation.json',JSON.stringify({verifiedAt:new Date().toISOString(),url:page.url(),browser:browser.version(),heading:await page.locator('h1').innerText(),recordingMetadata:media,attributionStatus:200,errors},null,2));await browser.close();console.log('Review opens, source map renders, recorded WebM metadata loads, license URL returns 200; no browser errors.');
