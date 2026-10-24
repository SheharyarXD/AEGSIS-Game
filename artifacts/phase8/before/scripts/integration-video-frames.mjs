import {chromium} from '@playwright/test';
import sharp from 'sharp';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {baseURL,dir} from './integration-browser.mjs';
await mkdir(`${dir}/video-frames`,{recursive:true});
await writeFile(`${dir}/video-review.html`,'<!doctype html><meta charset="utf-8"><title>AEGIS recorded gameplay review</title><body style="margin:0;background:#111"><video muted playsinline style="width:1280px;height:720px"></video>');
const manifest=JSON.parse(await readFile(`${dir}/capture-manifest.json`,'utf8')),browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage(),frames=[];
await page.goto(`${baseURL}/${dir}/video-review.html`);
const captures=[...manifest.captures].sort((a,b)=>a.name.localeCompare(b.name));
for(const c of captures){
 const duration=await page.evaluate(async url=>{const video=document.querySelector('video');video.src=url;await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(new Error('Video decode failed'));});video.pause();return video.duration;},`${baseURL}/${c.video}`);
 if(!Number.isFinite(duration)||duration<=0)throw new Error(`Invalid recorded video duration: ${c.name}`);
 for(const fraction of c.name.startsWith('03-')?[.2,.55,.97]:[.2,.55,.85]){
  const at=duration*fraction,encoded=await page.evaluate(async time=>{const v=document.querySelector('video');await new Promise(resolve=>{v.onseeked=resolve;v.currentTime=time;});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const canvas=document.createElement('canvas');canvas.width=v.videoWidth;canvas.height=v.videoHeight;canvas.getContext('2d').drawImage(v,0,0);return canvas.toDataURL('image/png').split(',')[1];},at);
  const path=`${dir}/video-frames/${c.name}-${Math.round(fraction*100)}.png`;await writeFile(path,Buffer.from(encoded,'base64'));frames.push({video:c.video,frame:path,timeSeconds:at,durationSeconds:duration});
 }
 console.log(`Decoded ${c.name}: ${duration.toFixed(1)} s`);
}
for(let part=0;part<2;part++){
 const chosen=frames.slice(part*18,(part+1)*18),rows=Math.ceil(chosen.length/3),composites=[];
 for(let i=0;i<chosen.length;i++){
  const f=chosen[i],left=(i%3)*320,top=Math.floor(i/3)*202;
  composites.push({input:await sharp(f.frame).resize(320,180).toBuffer(),left,top});
  const label=f.video.split('/').at(-1).replace('.webm','').slice(0,36)+` / ${f.timeSeconds.toFixed(1)}s`;
  const svg=Buffer.from(`<svg width="320" height="22"><rect width="320" height="22" fill="#121b25"/><text x="6" y="15" font-family="Arial" font-size="11" fill="white">${label}</text></svg>`);composites.push({input:svg,left,top:top+180});
 }
 await sharp({create:{width:960,height:rows*202,channels:3,background:'#121b25'}}).composite(composites).png().toFile(`${dir}/video-frames/review-sheet-${part+1}.png`);
}
await writeFile(`${dir}/video-frame-manifest.json`,JSON.stringify({decodedFromActualWebM:true,frames},null,2));await browser.close();
