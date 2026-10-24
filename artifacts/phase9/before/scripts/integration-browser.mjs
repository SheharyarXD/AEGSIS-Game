import {mkdir} from 'node:fs/promises';
export const baseURL=process.env.AEGIS_BASE_URL??'http://127.0.0.1:5188';
export const dir='artifacts/phase6-integration';
export async function boot(page,quality='LOW',range=false){
  await page.addInitScript(q=>localStorage.setItem('aegis-quality',q),quality);
  await page.goto(`${baseURL}/?qa=1`);await page.waitForFunction(()=>window.__AEGIS__,null,{timeout:45000});
  await page.evaluate(r=>window.__AEGIS__.start(r),range);await page.waitForTimeout(700);await page.keyboard.press('ControlLeft');await page.evaluate(async()=>{await window.__AEGIS__.city.audio.start();await window.__AEGIS__.audio.start();});
}
export async function key(page,key,ms=90){await page.keyboard.down(key);await page.waitForTimeout(ms);await page.keyboard.up(key);}
export async function position(page,point,state='HOVER',yaw=Math.PI,pitch=0){
  await page.evaluate(({point,state,yaw,pitch})=>{const q=window.__AEGIS__;q.teleport(q.player.position.clone().fromArray(point));q.player.state=state;q.camera.yaw=yaw;q.camera.pitch=pitch;},{point,state,yaw,pitch});
}
export async function weather(page,preset='clear',hour=12){
  await page.evaluate(({preset,hour})=>{const c=window.__AEGIS__.city;c.setWeather(preset,0);c.weather.setTime(hour);c.weather.wetness=preset.includes('rain')||preset==='thunderstorm'?1:0;},{preset,hour});
}
export function observe(page){
  const errors=[],assets=new Set();page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('response',r=>{if(r.url().includes('/assets/')){assets.add(new URL(r.url()).pathname);if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);}});
  page.on('requestfailed',r=>{if(r.url().includes('/assets/'))errors.push(`${r.failure()?.errorText} ${r.url()}`);});return {errors,assets};
}
export async function snapshot(page){return page.evaluate(()=>{
  const q=window.__AEGIS__,p=q.player,e=q.encounter;
  return {game:window.aegisDiagnostics(),environment:q.city.diagnostics(),form:p.form,transformation:p.changingForm,landing:p.lastLanding&&{tier:p.lastLanding.tier,speed:p.lastLanding.speed},
    missiles:{launches:e.missiles.launches,hits:e.missiles.hits,airborne:e.missiles.airborne,mode:e.missiles.mode},hands:{shots:e.hands.shots,beamSeconds:e.hands.beamSeconds,beamEnd:e.hands.beamEnd.toArray()},melee:{swings:e.melee.swings,hits:e.melee.hitsLanded},
    environmentAudio:{enabled:q.city.audio.enabled,state:q.city.audio.context?.state,sources:q.city.audio.sources.length,thunder:q.city.audio.thunderSources.size},hud:{visible:!document.querySelector('#game-ui').classList.contains('hidden'),target:document.querySelector('#target-label').textContent,weapons:document.querySelector('#weapons').textContent}};
});}
export async function freezeEnemies(page){await page.evaluate(()=>{const q=window.__AEGIS__;for(const e of q.encounter.enemies){e.update=()=>{};e.health=95;}});}
export async function aim(page,index=1){for(let i=0;i<4;i++){await page.evaluate(index=>{const q=window.__AEGIS__,d=q.encounter.enemies[index].position.clone().add(q.player.position.clone().set(0,1,0)).sub(q.camera.camera.position);q.camera.yaw=Math.atan2(d.x,d.z);q.camera.pitch=Math.asin(d.y/d.length());},index);await page.waitForTimeout(170);}}
export async function directories(){await mkdir(`${dir}/screenshots`,{recursive:true});await mkdir(`${dir}/videos`,{recursive:true});}
