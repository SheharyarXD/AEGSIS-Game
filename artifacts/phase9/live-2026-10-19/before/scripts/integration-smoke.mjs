import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
for(const [port,label] of [[5188,'main-dev-default'],[5191,'main-production-default']]){
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
 await page.addInitScript(()=>localStorage.setItem('aegis-quality','LOW'));await page.goto(`http://127.0.0.1:${port}/`);await page.waitForFunction(()=>window.aegisDiagnostics);await page.waitForTimeout(500);
 const title=await page.evaluate(()=>({diag:window.aegisDiagnostics(),mutationHooks:!!window.__AEGIS__}));
 await page.getByRole('button',{name:/DEPLOY OPERATIVE/}).click();await page.getByRole('button',{name:/Skip sequence/}).click();await page.waitForFunction(()=>window.aegisDiagnostics().mode==='play');
 const initial=await page.evaluate(()=>window.aegisDiagnostics());await page.keyboard.down('d');await page.waitForTimeout(900);await page.keyboard.up('d');const after=await page.evaluate(()=>window.aegisDiagnostics());
 await page.screenshot({path:`artifacts/phase6-integration/screenshots/${label}.png`});
 if(title.mutationHooks||title.diag.environment.buildings!==632||after.position[0]<=initial.position[0]+.4||errors.length)throw new Error(JSON.stringify({label,title,initial,after,errors}));
 results.push({label,url:`http://127.0.0.1:${port}/`,title,after,errors});console.log(`${label}: default city, gameplay input, production assets OK`);await page.close();
}
await writeFile('artifacts/phase6-integration/default-and-production-smoke.json',JSON.stringify(results,null,2));await browser.close();
