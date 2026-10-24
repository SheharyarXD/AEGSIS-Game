import { Vector3, WebGLRenderer } from 'three';
import { getQualitySettings, QUALITY_ORDER } from '../../config';
import { City } from '../City';
import { DISTRICTS } from '../CityLayout';
import { WEATHER_NAMES, WeatherPreset } from './WeatherState';
import { GpuProfiler } from './GpuProfiler';
/** Entirely opt-in, isolated from the tactical HUD; production builds never install it. */
export function installEnvironmentDebug(city:City,renderer:WebGLRenderer,teleport:(p:Vector3)=>void):()=>void{
 const params=new URLSearchParams(location.search);
 if(import.meta.env.DEV&&(params.has('qa')||params.has('envDebug'))){const profiler=new GpuProfiler(renderer);city.gpuStats=()=>profiler.stats();city.cleanupTasks.push(()=>profiler.dispose());}
 if(!import.meta.env.DEV||!params.has('envDebug'))return()=>{};
 const panel=document.createElement('aside');panel.className='environment-debug';panel.setAttribute('aria-label','Environment diagnostics');
 panel.innerHTML=`<details open><summary>Environment laboratory</summary>
 <label>Weather <select data-env="weather">${WEATHER_NAMES.map(p=>`<option value="${p}">${p}</option>`).join('')}</select></label>
 <label>Hour <input data-env="hour" type="range" min="0" max="24" step=".1" value="${city.weather.hour}"></label>
 <label>Pause clock <input data-env="pause" type="checkbox" ${city.weather.paused?'checked':''}></label>
 <label>Intensity <input data-env="intensity" type="range" min="0" max="1" step=".05" value="1"></label>
 <label>Quality <select data-env="quality">${QUALITY_ORDER.map(q=>`<option>${q}</option>`).join('')}</select></label>
 <label>District <select data-env="district">${Object.entries(DISTRICTS).map(([id,d])=>`<option value="${id}">${d.name}</option>`).join('')}</select></label>
 <button data-env="teleport">Visit district</button><label>Reduced lightning <input data-env="flashes" type="checkbox" checked></label>
 <label>Ambient sound <input data-env="audio" type="checkbox" checked></label><pre></pre></details>`;
 const style=document.createElement('style');style.textContent='.environment-debug{position:fixed;left:14px;top:90px;width:245px;padding:12px;background:#101b26ed;border:1px solid #68809170;color:#d4e3ec;z-index:9;font:11px/1.6 monospace;max-height:75vh;overflow:auto}.environment-debug summary{cursor:pointer;margin-bottom:12px}.environment-debug label{display:flex;align-items:center;justify-content:space-between;margin:7px 0;gap:6px}.environment-debug select{max-width:140px;padding:4px;font-size:10px}.environment-debug input[type=range]{width:115px}.environment-debug button{background:#355467;border:0;color:#fff;padding:7px;width:100%}.environment-debug pre{font-size:9px;white-space:pre-wrap;margin-bottom:0}';
 document.head.append(style);document.body.append(panel);
 const element=<T extends HTMLElement>(id:string)=>panel.querySelector<T>(`[data-env="${id}"]`)!;
 element<HTMLSelectElement>('weather').value=city.weather.preset;element<HTMLSelectElement>('quality').value=city.quality;
 element('weather').onchange=()=>city.setWeather(element<HTMLSelectElement>('weather').value as WeatherPreset,8);
 element('hour').oninput=()=>city.weather.setTime(Number(element<HTMLInputElement>('hour').value));
 element('pause').onchange=()=>city.weather.paused=element<HTMLInputElement>('pause').checked;
 element('intensity').oninput=()=>city.weather.intensity=Number(element<HTMLInputElement>('intensity').value);
 element('quality').onchange=()=>{const q=element<HTMLSelectElement>('quality').value as typeof QUALITY_ORDER[number];city.setQuality(q);renderer.setPixelRatio(Math.min(devicePixelRatio,getQualitySettings(q).pixelRatio));renderer.shadowMap.enabled=getQualitySettings(q).shadows;city.sun.castShadow=getQualitySettings(q).shadows;};
 element('teleport').onclick=()=>{const id=element<HTMLSelectElement>('district').value as keyof typeof DISTRICTS,point=DISTRICTS[id].test.clone();city.prepareAt(point);teleport(point);};
 element('flashes').onchange=()=>city.reducedFlashes=element<HTMLInputElement>('flashes').checked;
 element('audio').onchange=()=>city.audio.enabled=element<HTMLInputElement>('audio').checked;
 const timer=window.setInterval(()=>{const d=city.diagnostics();panel.querySelector('pre')!.textContent=`${d.district} · ${d.hour.toFixed(1)} h\nTiles ${d.tiles}/${d.maxTiles} · queue ${d.pending}\nBuildings ${d.buildings} · colliders ${d.worldColliders}\nDraws ${renderer.info.render.calls} · triangles ${renderer.info.render.triangles}\nKit ${(d.assetBytes/1e6).toFixed(2)} MB · textures ${(d.textureBytesEstimate/1e6).toFixed(2)} MB\nTile generation ${d.generationMs.toFixed(2)} ms\nWet ${d.wetness.toFixed(2)} · snow ${d.snowCover.toFixed(2)}`;},500);
 const cleanup=()=>{clearInterval(timer);panel.remove();style.remove();};city.cleanupTasks.push(cleanup);return cleanup;
}
