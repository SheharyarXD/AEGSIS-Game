import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
if(process.env.PHASE8_LIVE_VERIFICATION!=='1')throw new Error('Explicit live-verification authorization is required.');
// Isolated browser profile: preserve the user's normal Chrome tabs and settings.
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--window-size=1440,900']}),context=await browser.newContext({viewport:null}),page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{if(!localStorage.getItem('aegis-quality'))localStorage.setItem('aegis-quality','LOW');});
await page.goto('http://127.0.0.1:5192/');await page.waitForFunction(()=>window.aegisDiagnostics,null,{timeout:180000});await page.bringToFront();
await writeFile('artifacts/phase8/live-2026-10-18/open-game.json',JSON.stringify({openedAt:new Date().toISOString(),url:page.url(),quality:'LOW',qaHooks:await page.evaluate(()=>!!window.__AEGIS__),diagnostics:await page.evaluate(()=>window.aegisDiagnostics()),errors},null,2));
console.log('AEGIS is open in a visible isolated Chrome window. Close that window to end this helper.');
await new Promise(resolve=>browser.once('disconnected',resolve));
