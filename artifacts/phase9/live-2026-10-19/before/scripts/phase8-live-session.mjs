import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
if(process.env.PHASE8_LIVE_VERIFICATION!=='1')throw new Error('Live verification requires an explicit user request.');
const dir='artifacts/phase8/live-2026-10-18';await mkdir(dir,{recursive:true});
const errors=[];
const browser=await chromium.launch({channel:'chrome',headless:process.env.PHASE8_HEADLESS==='1'});
const context=await browser.newContext({viewport:{width:1440,height:900},...(process.env.PHASE8_VIDEO==='1'?{recordVideo:{dir:dir+'/videos',size:{width:1440,height:900}}}:{})});
const page=await context.newPage();
page.on('pageerror',e=>errors.push({kind:'page',text:e.message}));page.on('console',m=>{if(m.type()==='error')errors.push({kind:'console',text:m.text()});});page.on('response',r=>{if(r.status()>=400)errors.push({kind:'http',text:`${r.status()} ${r.url()}`});});
await page.addInitScript(q=>localStorage.setItem('aegis-quality',q),process.env.PHASE8_QUALITY??'LOW');
await page.goto('http://127.0.0.1:5192/?qa=1');await page.waitForFunction(()=>window.__AEGIS__,null,{timeout:180000});
console.log(JSON.stringify({ready:true,errors,diagnostics:await page.evaluate(()=>window.aegisDiagnostics())}));
// Local developer automation input only. Each submitted line is an awaited JS statement sequence.
const input=createInterface({input:process.stdin,crlfDelay:Infinity});
for await(const line of input){if(line.trim()==='exit')break;try{const result=await eval(`(async()=>{${line}\n})()`);console.log(JSON.stringify({result,errors}));}catch(e){console.log(JSON.stringify({error:e.stack,errors}));}}
input.close();process.stdin.pause();
await writeFile(dir+'/session-errors.json',JSON.stringify(errors,null,2));await context.close();await browser.close();
