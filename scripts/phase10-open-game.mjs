import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
// Isolated browser profile: preserve the user's normal Chrome tabs and settings.
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--window-size=1440,900']}),context=await browser.newContext({viewport:null}),page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{if(!localStorage.getItem('aegis-quality'))localStorage.setItem('aegis-quality','MEDIUM');});
await page.goto('http://127.0.0.1:5192/');await page.waitForFunction(()=>window.aegisDiagnostics,null,{timeout:180000});
await page.locator('#deploy').click();await page.waitForFunction(()=>window.aegisDiagnostics().mode==='play');await page.waitForTimeout(1000);await page.bringToFront();
await writeFile('artifacts/phase10/open-game.json',JSON.stringify({openedAt:new Date().toISOString(),url:page.url(),quality:'MEDIUM',qaHooks:await page.evaluate(()=>!!window.__AEGIS__),diagnostics:await page.evaluate(()=>window.aegisDiagnostics()),errors},null,2));
console.log('AEGIS is open in a visible isolated Chrome window. Close that window to end this helper.');
await new Promise(resolve=>browser.once('disconnected',resolve));
