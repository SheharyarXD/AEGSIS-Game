/**
 * Real-browser validation of the AEGIS hero. Opens the character studio in Chrome,
 * checks the rig/clips/mounts/assembly groups, and captures the review set into
 * artifacts/hero-qa/. Starts its own Vite server unless AEGIS_BASE_URL points at one.
 *
 *   node scripts/hero-qa.mjs [--only name,name]
 */
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createServer } from 'vite';

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
const out = 'artifacts/hero-qa';
let vite = null;
let base = process.env.AEGIS_BASE_URL;
if (!base) {
  vite = await createServer({ server: { port: 5179, strictPort: false, host: '127.0.0.1' }, logLevel: 'error' });
  await vite.listen();
  base = `http://127.0.0.1:${vite.config.server.port}`;
}
// name: [view, pose, lighting, options]
const SHOTS = {
  // neutral armour views
  'front': ['front', 'idle', 'neutral'], 'threequarter': ['threequarter', 'idle', 'neutral'],
  'side': ['side', 'idle', 'neutral'], 'back': ['back', 'idle', 'neutral'], 'backquarter': ['backquarter', 'idle', 'neutral'],
  // clay: one matte material, emission off - geometry only
  'clay-front': ['front', 'idle', 'neutral', { clay: true }], 'clay-threequarter': ['threequarter', 'idle', 'neutral', { clay: true }],
  'clay-side': ['side', 'idle', 'neutral', { clay: true }], 'clay-back': ['back', 'idle', 'neutral', { clay: true }],
  // studio lighting and close-ups
  'studio-threequarter': ['threequarter', 'idle', 'studio'], 'studio-back': ['backquarter', 'idle', 'studio'],
  'helmet': ['helmet', 'idle', 'studio'], 'helmet-side': ['helmetSide', 'idle', 'studio'], 'helmet-back': ['helmetBack', 'idle', 'studio'],
  'chest': ['chest', 'idle', 'studio'], 'chest-no-emission': ['chest', 'idle', 'neutral', { emission: false }],
  'arms': ['arms', 'idle', 'studio'], 'hands': ['hands', 'idle', 'studio'], 'legs': ['legs', 'idle', 'studio'],
  'boots': ['boots', 'idle', 'studio'], 'thrusters': ['thrusters', 'idle', 'studio'],
  // motion
  'walk': ['threequarter', 'walk', 'neutral'], 'walk-side': ['side', 'walk', 'neutral'], 'run': ['side', 'run', 'neutral'],
  'pilot-front': ['front', 'idle', 'neutral', { form: 'pilot' }], 'pilot-walk': ['threequarter', 'walk', 'neutral', { form: 'pilot' }],
  'pilot-walk-side': ['side', 'walk', 'neutral', { form: 'pilot' }],
  'pilot-face': ['helmet', 'idle', 'studio', { form: 'pilot' }], 'pilot-face-side': ['helmetSide', 'idle', 'studio', { form: 'pilot' }], 'pilot-head-back': ['helmetBack', 'idle', 'neutral', { form: 'pilot' }],
  // flight, free fall and landing body animation
  'fly-hover': ['threequarter', 'hover', 'studio'], 'fly-cruise': ['flight', 'flight', 'studio'], 'fly-boost': ['flight', 'boost', 'studio'],
  'fly-bank-left': ['flightRear', 'bank left', 'studio'], 'fly-bank-right': ['flightRear', 'bank right', 'studio'], 'fly-brake': ['side', 'brake', 'studio'],
  'fall-slow': ['threequarter', 'fall', 'studio'], 'fall-fast': ['flight', 'dive', 'studio'], 'fall-brace': ['side', 'landing', 'studio'],
  'land-soft': ['side', 'land soft', 'studio', { settle: 0.12 }], 'land-medium': ['side', 'land medium', 'studio', { settle: 0.2 }],
  'land-heavy-impact': ['threequarter', 'land heavy', 'studio', { settle: 0.12 }], 'land-heavy-hold': ['side', 'land heavy', 'studio', { settle: 0.6 }],
  'land-heavy-front': ['front', 'land heavy', 'studio', { settle: 0.6 }], 'land-heavy-rise': ['threequarter', 'land heavy', 'studio', { settle: 1.05 }],
  // propulsion, one shot per flight state
  'jets-takeoff': ['flightRear', 'takeoff', 'studio'], 'jets-hover': ['flightRear', 'hover', 'studio'],
  'jets-flight': ['flight', 'flight', 'studio'], 'jets-boost': ['flight', 'boost', 'studio'],
  'jets-brake': ['flightRear', 'brake', 'studio'], 'jets-landing': ['flightRear', 'landing', 'studio'],
  'jets-close': ['thrusters', 'hover', 'studio'],
  // transformation stills (seconds into the sequence)
  'suitup-0-inbound': ['assemblyWide', 'idle', 'studio', { assembly: ['suit', 0.75] }], 'suitup-1-legs': ['assembly', 'idle', 'studio', { assembly: ['suit', 1.25] }], 'suitup-2-pelvis': ['assembly', 'idle', 'studio', { assembly: ['suit', 2.05] }],
  'suitup-3-torso': ['assembly', 'idle', 'studio', { assembly: ['suit', 2.72] }], 'suitup-4-arms': ['assembly', 'idle', 'studio', { assembly: ['suit', 3.6] }],
  'suitup-5-pack': ['assemblyRear', 'idle', 'studio', { assembly: ['suit', 4.36] }], 'suitup-6-helmet': ['helmetSeal', 'idle', 'studio', { assembly: ['suit', 4.78] }], 'suitup-6b-faceplate': ['helmetSeal', 'idle', 'studio', { assembly: ['suit', 5.14] }],
  'suitup-7-seal': ['helmetSeal', 'idle', 'studio', { assembly: ['suit', 5.36] }], 'suitup-8-online': ['helmetSeal', 'idle', 'studio', { assembly: ['suit', 5.75] }],
  'stepout-mid': ['assembly', 'idle', 'studio', { assembly: ['unsuit', 1.7] }], 'stepout-wide': ['assemblyWide', 'idle', 'studio', { assembly: ['unsuit', 2.2] }],
  'suitup-arms-wide': ['assemblyWide', 'idle', 'studio', { assembly: ['suit', 3.3] }],
};
const LOW_SHOTS = { 'low-jets-hover': ['flightRear', 'hover', 'studio'], 'low-jets-boost': ['flight', 'boost', 'studio'], 'low-jets-close': ['thrusters', 'hover', 'studio'] };

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const errors = [];
let failure = null;
let report = null;
async function capture(url, shots) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 1250 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.goto(`${base}${url}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.ready === true, { timeout: 120000 });
  const info = await page.evaluate(() => ({ ...window.studio.report, gpu: (() => {
    const gl = window.studio.renderer.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
  })() }));
  for (const [name, [view, pose, light, options = {}]] of Object.entries(shots)) {
    if (only && !only.includes(name)) continue;
    if ((options.form === 'pilot' || options.assembly) && !info.pilot) continue;
    await page.evaluate(([view, pose, light, options]) => {
      const s = window.studio;
      s.setForm(options.form || 'armor'); s.setLighting(light); s.setBloom(options.bloom === true);
      s.setClay(options.clay === true); s.setEmission(options.emission !== false && options.clay !== true);
      if (options.assembly) { s.setForm(options.assembly[0] === 'suit' ? 'pilot' : 'armor'); s.playAssemblyTo(options.assembly[0], options.assembly[1]); }
      else { s.setPose(pose); s.settle(options.settle ?? (pose === 'idle' ? 1.0 : 1.45)); }
      s.setView(view);
    }, [view, pose, light, options]);
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${out}/${name}.png` });
  }
  await page.close();
  return info;
}
try {
  await fs.mkdir(out, { recursive: true });
  report = await capture('/scripts/character-preview.html?clean&quality=HIGH', SHOTS);
  await capture('/scripts/character-preview.html?clean&quality=LOW', LOW_SHOTS);
  await fs.writeFile(`${out}/report.json`, JSON.stringify({ report, errors }, null, 2));
  console.log(JSON.stringify({ report: { ...report, clips: report.clips.length }, errors }, null, 1));
  assert.equal(errors.length, 0, `Browser errors: ${errors.join('; ')}`);
  for (const clip of ['aegis_idle', 'aegis_walk', 'aegis_run', 'aegis_suitup']) assert.ok(report.clips.includes(clip), `Missing clip ${clip}`);
  assert.equal(report.mounts.length, 6, 'Expected two back, two palm and two foot thruster mounts');
  assert.ok(report.groups >= 48, 'Expected the armour assembly groups');
  assert.ok(report.bones >= 100, 'Expected the gameplay skeleton');
} catch (error) { failure = error; }
await browser.close();
if (vite) await vite.close();
if (failure) { console.error(String(failure)); process.exit(1); }
