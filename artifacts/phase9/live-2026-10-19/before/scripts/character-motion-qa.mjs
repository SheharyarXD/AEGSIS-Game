import { chromium } from '@playwright/test';
const b=await chromium.launch({channel:'chrome',headless:true});const p=await b.newPage({viewport:{width:1000,height:1000}});await p.goto('http://127.0.0.1:5173/scripts/character-preview.html');await p.waitForFunction(()=>window.ready);
await p.evaluate(()=>{window.suit.playAction('heavy');for(let i=0;i<31;i++)window.suit.animate(1/60,'GROUND',0,0,0);window.renderStill()});await p.screenshot({path:'artifacts/character-heavy.png'});
await p.evaluate(()=>{for(let i=0;i<90;i++)window.suit.animate(1/60,'CRUISE',1,0.4,30);window.renderStill()});await p.screenshot({path:'artifacts/character-flight.png'});await b.close();
