/**
 * Real-browser video and frame capture for the hero's motion, transformation and
 * propulsion. Everything is recorded from Chrome on the local GPU.
 *
 *   node scripts/hero-capture.mjs [scenario ...]
 *
 * Scenarios (default: all):
 *   walk-armor, walk-pilot   in-game walking: across, stop, back, away, towards, run
 *   suitup-game              in-game T: suit up, walk, step out
 *   flight-game              in-game takeoff, hover, cruise, boost, turns, brake, free fall, landing
 *   landing-game             in-game soft, medium and heavy landings
 *   weapons-game             shoulder missile deployment and guided launch, repulsors, focused beam
 *   targeting-game           soft lock at 20/50/100 m, a shared salvo, a hard lock held through camera movement
 *   flight3d-game            view-steered climb, dive, S-turn, free view in the hover, brake and recovery
 *   launcher-game            close-up of the shoulder launcher opening, firing and stowing
 *   weapons-flight           repulsors standing and hovering, the beam hovering and on the move
 *   combat-game              combination, heavy, guard and counter, dodge, thruster dash, aerial strike, landing into combat
 *   suitup, stepout          studio: the full sequences, front and rear
 *   flight-low, flight-high  studio: every flight state at LOW / HIGH thruster quality
 *   feet                     measures planted-foot slip while walking and running
 *   thruster-cost            frame time with the jets off and at full boost, per quality
 *
 * Output: artifacts/hero-video/<scenario>.webm, frame strips <scenario>-frames.png,
 * feet.json and thrusters.json. Starts its own Vite server unless AEGIS_BASE_URL is set.
 */
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createServer } from 'vite';

const out = 'artifacts/hero-video';
const wanted = process.argv.slice(2);
const want = (name) => wanted.length === 0 || wanted.includes(name);
await fs.mkdir(out, { recursive: true });
let vite = null;
let base = process.env.AEGIS_BASE_URL;
if (!base) {
  vite = await createServer({ server: { port: 5187, strictPort: false, host: '127.0.0.1' }, logLevel: 'error' });
  await vite.listen();
  base = `http://127.0.0.1:${vite.config.server.port}`;
}
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const size = { width: 1280, height: 720 };
const errors = [];
const sleep = (page, ms) => page.waitForTimeout(ms);
/** The third-person camera keeps the character near the middle of the frame. */
const CENTRE = { left: 420, top: 150, width: 440, height: 440 };

function ffmpeg() {
  const root = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'ms-playwright');
  if (!existsSync(root)) return null;
  const dir = readdirSync(root).filter(d => d.startsWith('ffmpeg')).sort().pop();
  const exe = dir && path.join(root, dir, 'ffmpeg-win64.exe');
  return exe && existsSync(exe) ? exe : null;
}

/** Tile evenly spaced frames of a recording into one strip for frame-by-frame review. */
async function frameStrip(video, name, { from = 0, to, count = 12, columns = 6, crop } = {}) {
  const exe = ffmpeg();
  if (!exe) return;
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'aegis-frames-'));
  const span = to - from;
  for (let i = 0; i < count; i++) {
    const t = from + (span * i) / (count - 1);
    try { execFileSync(exe, ['-y', '-loglevel', 'error', '-ss', t.toFixed(3), '-i', video, '-frames:v', '1', path.join(tmp, `f${String(i).padStart(3, '0')}.png`)]); } catch { /* past the end */ }
  }
  const files = (await fs.readdir(tmp)).filter(f => f.endsWith('.png')).sort();
  if (files.length === 0) return;
  const tiles = await Promise.all(files.map(async f => {
    let img = sharp(path.join(tmp, f));
    if (crop) img = img.extract(crop);
    return img.resize({ height: 360 }).png().toBuffer({ resolveWithObject: true });
  }));
  const w = tiles[0].info.width, h = tiles[0].info.height, rows = Math.ceil(tiles.length / columns);
  await sharp({ create: { width: w * columns, height: h * rows, channels: 3, background: '#000' } })
    .composite(tiles.map((t, i) => ({ input: t.data, left: (i % columns) * w, top: Math.floor(i / columns) * h })))
    .png().toFile(`${out}/${name}-frames.png`);
  await fs.rm(tmp, { recursive: true, force: true });
}

async function record(name, url, run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aegis-video-'));
  const context = await browser.newContext({ viewport: size, recordVideo: { dir, size } });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${name}: ${m.text().slice(0, 300)}`); });
  await page.goto(`${base}${url}`, { waitUntil: 'domcontentloaded' });
  const started = Date.now();
  const marks = {};
  const mark = (label) => { marks[label] = (Date.now() - started) / 1000; };
  let result;
  try { result = await run(page, mark); } catch (error) { errors.push(`${name}: ${String(error)}`); }
  const video = page.video();
  await context.close();
  const target = `${out}/${name}.webm`;
  await fs.copyFile(await video.path(), target);
  await fs.rm(dir, { recursive: true, force: true });
  console.log(`recorded ${target}`, JSON.stringify(marks));
  return { target, marks, result };
}

const game = async (page, quality = 'HIGH', range = false) => {
  await page.evaluate(q => { try { localStorage.setItem('aegis-quality', q); } catch { /* optional */ } }, quality);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__AEGIS__, null, { timeout: 120000 });
  await page.evaluate(r => window.__AEGIS__.start(r), range);
  await sleep(page, 700);
};
const hold = async (page, keys, ms) => { for (const k of keys) await page.keyboard.down(k); await sleep(page, ms); for (const k of keys) await page.keyboard.up(k); };
const tap = async (page, key) => { await page.keyboard.down(key); await sleep(page, 70); await page.keyboard.up(key); };

/** Swing the view round by `radians` over `ms`, as a mouse look would (positive = to the left). */
const look = (page, radians, ms) => page.evaluate(([radians, ms]) => new Promise(resolve => {
  const camera = window.__AEGIS__.camera, t0 = performance.now(); let last = t0;
  const frame = (t) => { camera.yaw += radians * Math.min(t - last, t0 + ms - last) / ms; last = t; if (t - t0 < ms) requestAnimationFrame(frame); else resolve(); };
  requestAnimationFrame(frame);
}), [radians, ms]);

/** Walk across the frame, stop, come back, walk away, come towards the camera, then run. */
async function walkTour(page, mark) {
  mark('across'); await hold(page, ['d'], 2600);
  mark('stop'); await sleep(page, 1300);
  mark('back'); await hold(page, ['a'], 2600);
  mark('stop2'); await sleep(page, 1100);
  mark('away'); await hold(page, ['w'], 1800);
  mark('towards'); await hold(page, ['s'], 2400);
  mark('turning'); await hold(page, ['w', 'd'], 1400); await hold(page, ['d'], 900); await hold(page, ['s', 'd'], 1200);
  mark('run'); await hold(page, ['ShiftLeft', 'a'], 2200);
  mark('end'); await sleep(page, 1200);
}

if (want('walk-armor')) {
  const { target, marks } = await record('walk-armor', '/?qa=1', async (page, mark) => { await game(page); await walkTour(page, mark); });
  await frameStrip(target, 'walk-armor', { from: marks.across + 1.0, to: marks.across + 2.2, count: 12, crop: CENTRE });
  await frameStrip(target, 'walk-armor-stop-start', { from: marks.stop - 0.4, to: marks.back + 1.3, count: 12, crop: CENTRE });
  await frameStrip(target, 'walk-armor-towards', { from: marks.towards + 0.9, to: marks.towards + 2.1, count: 12, crop: CENTRE });
  await frameStrip(target, 'walk-armor-legs', { from: marks.across + 0.9, to: marks.across + 2.1, count: 18, crop: { left: 520, top: 300, width: 240, height: 240 } });
  await frameStrip(target, 'walk-armor-away', { from: marks.away + 0.5, to: marks.away + 1.7, count: 12, crop: CENTRE });
  await frameStrip(target, 'run-armor', { from: marks.run + 0.7, to: marks.run + 1.9, count: 12, crop: CENTRE });
}
if (want('walk-pilot')) {
  const { target, marks } = await record('walk-pilot', '/?qa=1', async (page, mark) => {
    await game(page); await tap(page, 't');
    await page.waitForFunction(() => window.__AEGIS__.player.form === 'pilot', null, { timeout: 15000 });
    await sleep(page, 500); await walkTour(page, mark);
  });
  await frameStrip(target, 'walk-pilot', { from: marks.across + 1.0, to: marks.across + 2.2, count: 12, crop: CENTRE });
  await frameStrip(target, 'walk-pilot-stop-start', { from: marks.stop - 0.4, to: marks.back + 1.3, count: 12, crop: CENTRE });
  await frameStrip(target, 'walk-pilot-towards', { from: marks.towards + 0.9, to: marks.towards + 2.1, count: 12, crop: CENTRE });
  await frameStrip(target, 'walk-pilot-away', { from: marks.away + 0.5, to: marks.away + 1.7, count: 12, crop: CENTRE });
  await frameStrip(target, 'run-pilot', { from: marks.run + 0.7, to: marks.run + 1.9, count: 12, crop: CENTRE });
}
if (want('suitup-game')) {
  const { target, marks } = await record('suitup-game', '/?qa=1', async (page, mark) => {
    await game(page);
    await page.evaluate(() => { const q = window.__AEGIS__; q.camera.yaw = q.player.object.rotation.y + Math.PI * 0.86; q.camera.pitch = -0.02; });
    await sleep(page, 900);
    mark('stepout'); await tap(page, 't');
    await page.waitForFunction(() => window.__AEGIS__.player.form === 'pilot', null, { timeout: 15000 });
    await sleep(page, 900);
    mark('suitup'); await tap(page, 't');
    await page.waitForFunction(() => window.__AEGIS__.player.form === 'armor' && !window.__AEGIS__.player.changingForm, null, { timeout: 20000 });
    mark('done'); await sleep(page, 1200);
  });
  await frameStrip(target, 'suitup-game', { from: marks.suitup + 0.2, to: marks.done + 0.3, count: 18, crop: CENTRE });
}
if (want('flight-game')) {
  // the whole flight envelope in one take: takeoff, hover, cruise, boost, both turns, brake, free fall, landing
  const { target, marks } = await record('flight-game', '/?qa=1', async (page, mark) => {
    await game(page);
    await page.evaluate(() => { const q = window.__AEGIS__; q.camera.pitch = 0.02; });
    await sleep(page, 500);
    mark('takeoff'); await tap(page, 'e'); await hold(page, ['Space'], 800);
    mark('hover'); await sleep(page, 1400);
    mark('cruise'); await hold(page, ['w'], 1500);
    // turns are flown with the view alone, as with a mouse: forward stays held throughout.
    // A gentle S down the avenue, so the take stays between the towers.
    await page.keyboard.down('w');
    mark('left'); await look(page, 0.5, 800); await sleep(page, 250);
    mark('right'); await look(page, -1.0, 1400); await sleep(page, 250);
    mark('centre'); await look(page, 0.5, 800);
    await page.keyboard.up('w');
    mark('boost'); await hold(page, ['ShiftLeft', 'w'], 1300);
    mark('brake'); await hold(page, ['q'], 1300);
    mark('climb'); await hold(page, ['Space'], 2200);
    mark('fall'); await tap(page, 'e');
    await page.waitForFunction(() => window.__AEGIS__.player.state === 'GROUND' || window.__AEGIS__.player.ragdoll.active, null, { timeout: 30000 }).catch(() => {});
    mark('landed'); await sleep(page, 2400);
    return page.evaluate(() => { const p = window.__AEGIS__.player; return { landing: p.lastLanding && { tier: p.lastLanding.tier, speed: +p.lastLanding.speed.toFixed(1) }, ragdoll: p.ragdoll.active }; });
  });
  await frameStrip(target, 'flight-game', { from: marks.takeoff, to: marks.brake + 1.2, count: 18, crop: CENTRE });
  await frameStrip(target, 'flight-game-turns', { from: marks.left, to: marks.boost, count: 12, crop: CENTRE });
  await frameStrip(target, 'flight-game-fall', { from: marks.fall, to: marks.landed + 1.9, count: 18, crop: CENTRE });
}
if (want('landing-game')) {
  // three landings of increasing violence: a jump, a short drop and a long one
  const { target, marks, result } = await record('landing-game', '/?qa=1', async (page, mark) => {
    await game(page);
    await page.evaluate(() => { const q = window.__AEGIS__; q.camera.yaw = q.player.object.rotation.y + Math.PI * 0.82; q.camera.pitch = -0.05; });
    const grades = [];
    const settle = async (label) => {
      await page.waitForFunction(() => window.__AEGIS__.player.state === 'GROUND' || window.__AEGIS__.player.ragdoll.active, null, { timeout: 20000 }).catch(() => {});
      mark(`${label}-landed`); await sleep(page, 1900);
      grades.push(await page.evaluate(() => { const l = window.__AEGIS__.player.lastLanding; return l && [l.tier, +l.speed.toFixed(1)]; }));
    };
    await sleep(page, 600);
    mark('jump'); await tap(page, 'Space'); await sleep(page, 250); await settle('jump');
    mark('short'); await tap(page, 'e'); await hold(page, ['Space'], 260); await sleep(page, 380); await tap(page, 'e'); await settle('short');
    mark('long'); await tap(page, 'e'); await hold(page, ['Space'], 1500); await sleep(page, 500); await tap(page, 'e'); await settle('long');
    return grades;
  });
  console.log('landing grades', JSON.stringify(result));
  await fs.writeFile(`${out}/landings.json`, JSON.stringify(result));
  await frameStrip(target, 'landing-soft', { from: marks.jump, to: marks['jump-landed'] + 0.7, count: 12, crop: CENTRE });
  await frameStrip(target, 'landing-medium', { from: marks.short + 0.5, to: marks['short-landed'] + 1.1, count: 12, crop: CENTRE });
  await frameStrip(target, 'landing-heavy', { from: marks['long-landed'] - 0.9, to: marks['long-landed'] + 1.7, count: 18, crop: CENTRE });
}

if (want('weapons-game')) {
  // on the range, with three live targets ahead
  const { target, marks, result } = await record('weapons-game', '/?qa=1', async (page, mark) => {
    await game(page, 'HIGH', true);
    const stats = () => page.evaluate(() => { const e = window.__AEGIS__.encounter, m = e.missiles; return { mode: m.mode, ammo: m.ammo, launches: m.launches, hits: m.hits, deployed: +m.deployed.toFixed(2), airborne: m.airborne, shots: e.hands.shots, beam: +e.hands.beamSeconds.toFixed(2), alive: e.enemies.filter(x => x.health > 0).length, health: e.enemies.map(x => Math.round(x.health)) }; });
    // look at the pods from behind and to one side, then face the targets
    await page.evaluate(() => { const q = window.__AEGIS__, e = q.encounter.enemies[1].position, p = q.player.position; q.camera.yaw = Math.atan2(e.x - p.x, e.z - p.z); q.camera.pitch = 0.0; });
    await sleep(page, 900);
    const log = [];
    mark('missiles'); await tap(page, 'f');
    for (let i = 0; i < 9; i++) { await sleep(page, 120); log.push(await stats()); }
    await sleep(page, 1900); mark('stowed'); log.push(await stats());
    mark('repulsor'); await hold(page, ['z'], 1700); log.push(await stats()); await sleep(page, 700);
    mark('laser'); await hold(page, ['l'], 1900); log.push(await stats()); await sleep(page, 600);
    mark('end');
    return log;
  });
  await fs.writeFile(`${out}/weapons.json`, JSON.stringify(result, null, 1));
  console.log('weapons', JSON.stringify(result.map(r => [r.mode, r.deployed, r.launches, r.airborne, r.hits, r.shots, r.beam, r.health.join('/')])));
  await frameStrip(target, 'weapons-missiles', { from: marks.missiles, to: marks.missiles + 2.6, count: 18, crop: CENTRE });
  await frameStrip(target, 'weapons-repulsor', { from: marks.repulsor, to: marks.repulsor + 1.8, count: 12, crop: CENTRE });
  await frameStrip(target, 'weapons-laser', { from: marks.laser, to: marks.laser + 2.0, count: 12, crop: CENTRE });
}

// ---------------------------------------------------------------------------------- Phase 4
/** Range helpers: hold the targets still, stand off from one, and put the reticle on it. */
const holdStill = (page, only = -1) => page.evaluate(only => { const q = window.__AEGIS__; q.encounter.enemies.forEach((enemy, i) => { enemy.update = () => {}; enemy.health = only >= 0 && i !== only ? 0 : 95; }); }, only);
const standOff = (page, index, metres, side = 0) => page.evaluate(([index, metres, side]) => { const q = window.__AEGIS__, p = q.player, at = q.encounter.enemies[index].position.clone(); at.z += metres; at.x += side; at.y = p.position.y; p.body.teleport(at); p.velocity.set(0, 0, 0); p.object.rotation.y = Math.PI; }, [index, metres, side]);
const reticleOn = (page, index) => page.evaluate(async index => { const q = window.__AEGIS__, enemy = q.encounter.enemies[index];
  for (let i = 0; i < 4; i++) { const d = enemy.position.clone(); d.y += 1; d.sub(q.camera.camera.position); q.camera.yaw = Math.atan2(d.x, d.z); q.camera.pitch = Math.asin(d.y / d.length()); await new Promise(r => setTimeout(r, 150)); } }, index);
const pitchTo = (page, pitch) => page.evaluate(pitch => { window.__AEGIS__.camera.pitch = pitch; }, pitch);
/** Put the game camera on a fixed boom relative to the hero (close-ups); null restores the chase camera. */
const boom = (page, offset) => page.evaluate(offset => { const q = window.__AEGIS__, rig = q.camera;
  if (!offset) { if (rig.chase) { rig.update = rig.chase; rig.chase = null; } return; }
  rig.chase ??= rig.update;
  rig.update = function (dt, target) { const yaw = q.player.object.rotation.y, s = Math.sin(yaw), c = Math.cos(yaw);
    this.camera.position.set(target.x + c * offset[0] + s * offset[2], target.y + offset[1], target.z - s * offset[0] + c * offset[2]);
    this.camera.lookAt(target.x, target.y + offset[3], target.z); this.camera.fov = offset[4] ?? 40; this.camera.updateProjectionMatrix(); }; }, offset);

if (want('targeting-game')) {
  const { target, marks, result } = await record('targeting-game', '/?qa=1', async (page, mark) => {
    await game(page, 'HIGH', true); await holdStill(page);
    const seen = () => page.evaluate(() => { const e = window.__AEGIS__.encounter, t = e.targeting; return { label: e.targetLabel, soft: t.soft ? e.enemies.indexOf(t.soft) : -1, hard: t.hard ? e.enemies.indexOf(t.hard) : -1, hits: e.missiles.hits, launches: e.missiles.launches }; });
    const log = [];
    for (const metres of [20, 50, 100]) { mark(`soft${metres}`); await standOff(page, 1, metres); await reticleOn(page, 1); await sleep(page, 900); log.push([`soft lock at ${metres} m`, await seen()]); }
    mark('salvo'); await tap(page, 'f'); await sleep(page, 4200); log.push(['pair fired from 100 m', await seen()]);
    await holdStill(page); mark('spread'); await standOff(page, 1, 60, 2); await reticleOn(page, 1); await sleep(page, 500); await tap(page, 'f'); await sleep(page, 900);
    log.push(['pair shared between targets', await page.evaluate(() => { const e = window.__AEGIS__.encounter; return e.missiles.flights.map(f => e.enemies.indexOf(f.target)); })]); await sleep(page, 2600);
    await holdStill(page); mark('hard'); await reticleOn(page, 1); await tap(page, 'Tab'); await sleep(page, 400); await look(page, 0.7, 900); await sleep(page, 400); await look(page, -1.3, 1300); await sleep(page, 400);
    log.push(['hard lock after swinging the view away and back', await seen()]);
    mark('end'); return log;
  });
  await fs.writeFile(`${out}/targeting.json`, JSON.stringify(result, null, 1));
  console.log('targeting', JSON.stringify(result));
  await frameStrip(target, 'targeting-ranges', { from: marks.soft20 + 0.8, to: marks.salvo + 3.8, count: 12 });
  await frameStrip(target, 'targeting-hard-lock', { from: marks.hard, to: marks.end, count: 12 });
}
if (want('flight3d-game')) {
  // the whole envelope steered by the view: climb, level, dive, S-turn, hover with a free view, brake and recover
  const { target, marks, result } = await record('flight3d-game', '/?qa=1', async (page, mark) => {
    await game(page);
    const fly = () => page.evaluate(() => { const p = window.__AEGIS__.player, a = p.armor; return { state: p.state, y: +p.position.y.toFixed(1), vy: +p.velocity.y.toFixed(1), speed: +p.velocity.length().toFixed(1), climb: +a.climbNow.toFixed(2), pitch: +a.pitchNow.toFixed(2), roll: +a.rollNow.toFixed(2), ragdoll: p.ragdoll.active }; });
    const log = [];
    await sleep(page, 400); mark('takeoff'); await tap(page, 'e'); await hold(page, ['Space'], 500); await sleep(page, 900);
    mark('hoverlook'); await look(page, 0.8, 500); await pitchTo(page, 0.5); await sleep(page, 400); await pitchTo(page, -0.4); await sleep(page, 400); await look(page, -0.8, 500); await pitchTo(page, 0); log.push(['hover, view moved freely', await fly()]);
    await page.keyboard.down('w'); mark('level'); await sleep(page, 900); log.push(['level cruise', await fly()]);
    mark('climb'); await pitchTo(page, 0.5); await sleep(page, 1500); log.push(['climb', await fly()]);        // stays under the skybridge
    mark('dive'); await pitchTo(page, -0.45); await sleep(page, 1500); log.push(['dive', await fly()]);
    mark('sturn'); await pitchTo(page, 0.2); await sleep(page, 400); await look(page, 0.45, 600); log.push(['turning left', await fly()]); await look(page, -0.45, 600); log.push(['turning right', await fly()]); await sleep(page, 700);
    await page.keyboard.up('w'); mark('brake'); await hold(page, ['q'], 1100); log.push(['braking', await fly()]); await sleep(page, 900); log.push(['recovered', await fly()]);
    mark('end'); return log;
  });
  await fs.writeFile(`${out}/flight3d.json`, JSON.stringify(result, null, 1));
  console.log('flight3d', JSON.stringify(result));
  await frameStrip(target, 'flight3d-climb-dive', { from: marks.level + 0.3, to: marks.sturn, count: 18, crop: CENTRE });
  await frameStrip(target, 'flight3d-turn-brake', { from: marks.sturn, to: marks.end, count: 12, crop: CENTRE });
}
if (want('launcher-game')) {
  // close on the right shoulder from behind: cap, pod, tubes, launch, retraction
  const { target, marks } = await record('launcher-game', '/?qa=1', async (page, mark) => {
    await game(page, 'HIGH', true); await holdStill(page); await standOff(page, 1, 40); await reticleOn(page, 1); await sleep(page, 300);
    await boom(page, [-0.75, 2.15, -1.55, 1.62, 38]); await sleep(page, 700);
    mark('fire'); await tap(page, 'f'); await sleep(page, 2600); mark('closed');
    await boom(page, [1.6, 1.9, 2.4, 1.5, 44]); await sleep(page, 500); mark('front'); await tap(page, 'f'); await sleep(page, 2400);
    await boom(page, null); mark('end');
  });
  await frameStrip(target, 'launcher-closeup', { from: marks.fire, to: marks.fire + 2.4, count: 18 });
  await frameStrip(target, 'launcher-front', { from: marks.front, to: marks.front + 2.2, count: 12 });
}
if (want('weapons-flight')) {
  const { target, marks, result } = await record('weapons-flight', '/?qa=1', async (page, mark) => {
    await game(page, 'HIGH', true); await holdStill(page); await standOff(page, 1, 24); await sleep(page, 300);
    const hands = () => page.evaluate(() => { const q = window.__AEGIS__, e = q.encounter, a = q.player.armor; const en = e.enemies[1].position.clone(); en.y += 1; return { state: q.player.state, shots: e.hands.shots, beam: +e.hands.beamSeconds.toFixed(2), aimR: +a.aimWeight('R').toFixed(2), beamEndToTarget: +e.hands.beamEnd.distanceTo(en).toFixed(2), health: e.enemies.map(x => Math.round(x.health)), beamTone: q.audio.beamActive, beamStarts: q.audio.beamStarts }; });
    const log = [];
    // each part starts from a fresh range, so the numbers in the log belong to that part alone
    const fresh = async (airborne) => { await page.evaluate(() => window.__AEGIS__.start(true)); await sleep(page, 450); await holdStill(page); await standOff(page, 1, 24);
      if (airborne) { await tap(page, 'e'); await hold(page, ['Space'], 260); await sleep(page, 900); } await reticleOn(page, 1); };
    mark('standing'); await reticleOn(page, 1); await hold(page, ['z'], 1200); log.push(['repulsor, standing', await hands()]); await sleep(page, 600);
    await fresh(true); mark('hover'); await hold(page, ['z'], 1300); log.push(['repulsor, hovering', await hands()]); await sleep(page, 600);
    await fresh(true); mark('laser'); await page.keyboard.down('l'); await sleep(page, 1300); log.push(['beam, hovering', await hands()]); await page.keyboard.up('l'); await sleep(page, 400); log.push(['beam released', await hands()]);
    // climbing with the beam held on the target
    await fresh(true); mark('moving'); await page.keyboard.down('l'); await page.keyboard.down('Space'); await sleep(page, 1100); log.push(['beam while climbing', await hands()]); await page.keyboard.up('Space'); await page.keyboard.up('l');
    await sleep(page, 500); mark('end'); return log;
  });
  await fs.writeFile(`${out}/weapons-flight.json`, JSON.stringify(result, null, 1));
  console.log('weapons-flight', JSON.stringify(result));
  await frameStrip(target, 'weapons-flight', { from: marks.hover, to: marks.end, count: 18, crop: CENTRE });
}
if (want('combat-game')) {
  const { target, marks, result } = await record('combat-game', '/?qa=1', async (page, mark) => {
    await game(page, 'HIGH', true);
    const arena = async (gap) => { await page.evaluate(() => window.__AEGIS__.start(true)); await sleep(page, 450); await holdStill(page, 1); await standOff(page, 1, gap);
      await page.evaluate(() => { const q = window.__AEGIS__; q.camera.yaw = Math.PI * 0.62; q.camera.pitch = -0.08; }); await sleep(page, 700); };
    const fight = () => page.evaluate(() => { const q = window.__AEGIS__, m = q.encounter.melee; return { move: m.move, combo: m.combo, hits: m.hitsLanded, swings: m.swings, health: Math.round(q.encounter.enemies[1].health), state: q.player.state }; });
    const log = [];
    await arena(2.1); mark('combo'); await tap(page, 'j'); await sleep(page, 130); await tap(page, 'j'); await sleep(page, 200); await tap(page, 'j'); await sleep(page, 1100); log.push(['jab, cross, hook', await fight()]);
    await arena(2.3); mark('heavy'); await tap(page, 'k'); await sleep(page, 1300); log.push(['heavy', await fight()]);
    await arena(1.9); mark('counter'); await page.keyboard.down('b'); await sleep(page, 500);
    await page.evaluate(() => { const q = window.__AEGIS__; q.player.damage(12, q.player.forward.clone().negate()); }); await sleep(page, 150); await page.keyboard.up('b'); await tap(page, 'j'); await sleep(page, 900); log.push(['guard, then counter', await fight()]);
    await arena(1.5); mark('dodge'); await page.keyboard.down('a'); await tap(page, 'x'); await page.keyboard.up('a'); await sleep(page, 280); await tap(page, 'j'); await sleep(page, 900); log.push(['dodge, then strike', await fight()]);
    await arena(7.5); mark('dash'); await page.keyboard.down('ShiftLeft'); await tap(page, 'k'); await page.keyboard.up('ShiftLeft'); await sleep(page, 1400); log.push(['thruster dash strike', await fight()]);
    await arena(9); mark('air'); await tap(page, 'e'); await hold(page, ['Space'], 240); await sleep(page, 800); await tap(page, 'j'); await sleep(page, 1300); log.push(['aerial strike', await fight()]);
    // down from height beside the enemy, then straight into the combination
    await arena(2.4); mark('landing'); await tap(page, 'e'); await hold(page, ['Space'], 900); await sleep(page, 300); await tap(page, 'e');
    await page.waitForFunction(() => window.__AEGIS__.player.state === 'GROUND', null, { timeout: 15000 }).catch(() => {});
    await sleep(page, 1500); await tap(page, 'j'); await sleep(page, 140); await tap(page, 'j'); await sleep(page, 900); log.push(['landing, then strikes', await fight()]);
    mark('end'); return log;
  });
  await fs.writeFile(`${out}/combat.json`, JSON.stringify(result, null, 1));
  console.log('combat', JSON.stringify(result));
  for (const [name, from, seconds] of [['combat-combo', 'combo', 1.2], ['combat-heavy', 'heavy', 1.1], ['combat-counter', 'counter', 1.6], ['combat-dodge', 'dodge', 1.3], ['combat-dash', 'dash', 1.2], ['combat-air', 'air', 2.2], ['combat-landing', 'landing', 5.2]])
    await frameStrip(target, name, { from: marks[from], to: marks[from] + seconds, count: 12, crop: CENTRE });
}

const studio = async (page) => { await page.waitForFunction(() => window.ready === true, null, { timeout: 120000 }); await sleep(page, 400); };
for (const [name, direction, view] of [['suitup', 'suit', 'assembly'], ['suitup-rear', 'suit', 'assemblyRear'], ['stepout', 'unsuit', 'assembly']]) {
  if (!want(name.split('-')[0])) continue;
  const { target, marks } = await record(name, '/scripts/character-preview.html?clean', async (page, mark) => {
    await studio(page);
    await page.evaluate(([direction, view]) => { const s = window.studio; s.setForm(direction === 'suit' ? 'pilot' : 'armor'); s.setView(view); }, [direction, view]);
    await sleep(page, 900);
    mark('start'); await page.evaluate(d => window.studio.startAssembly(d), direction);
    await page.waitForFunction(() => window.studio.assembly.active === null, null, { timeout: 20000 });
    mark('done'); await sleep(page, 1300);
  });
  await frameStrip(target, name, { from: marks.start, to: marks.done + 0.4, count: 18, crop: { left: 280, top: 0, width: 720, height: 720 } });
}
for (const quality of ['LOW', 'HIGH']) {
  const name = `flight-${quality.toLowerCase()}`;
  if (!want(name)) continue;
  const { target, marks } = await record(name, `/scripts/character-preview.html?clean&quality=${quality}`, async (page, mark) => {
    await studio(page);
    await page.evaluate(() => window.studio.setView('flightRear'));
    for (const pose of ['takeoff', 'hover', 'flight', 'boost', 'brake', 'landing', 'idle']) {
      mark(pose); await page.evaluate(p => window.studio.setPose(p), pose); await sleep(page, pose === 'idle' ? 900 : 1700);
    }
  });
  await frameStrip(target, name, { from: marks.takeoff + 0.6, to: marks.idle + 0.6, count: 12, crop: { left: 280, top: 0, width: 720, height: 720 } });
}

if (want('feet')) {
  // Planted-foot slip: while a foot is on the ground it should not move over the floor.
  const measure = async (label, pilot, keys, seconds) => {
    const page = await browser.newPage({ viewport: size });
    await page.goto(`${base}/?qa=1`, { waitUntil: 'domcontentloaded' });
    await game(page);
    if (pilot) {
      await tap(page, 't');
      await page.waitForFunction(() => { const p = window.__AEGIS__.player; return p.form === 'pilot' && !p.changingForm; }, null, { timeout: 15000 });
      await sleep(page, 500);
    }
    for (const k of keys) await page.keyboard.down(k);
    await sleep(page, 2200);                                   // reach steady pace (the walk-run blend has settled)
    const data = await page.evaluate(async (seconds) => {
      const q = window.__AEGIS__, p = q.player, T = p.object.position.constructor;
      const feet = ['toeL', 'toeR'].map(n => p.suit.bones.get(n));          // ball of each foot
      const ankles = ['footL', 'footR'].map(n => p.suit.bones.get(n));
      const rows = []; const v = new T();
      await new Promise(resolve => {
        const t0 = performance.now();
        const frame = (t) => {
          p.suit.group.updateMatrixWorld(true);
          rows.push({ t: t / 1000, hp: p.health, body: [p.position.x, p.position.z], feet: feet.map(b => b.getWorldPosition(v).toArray()), ankles: ankles.map(b => b.getWorldPosition(v).y) });
          if (t - t0 < seconds * 1000) requestAnimationFrame(frame); else resolve();
        };
        requestAnimationFrame(frame);
      });
      return { rows, form: p.form };
    }, seconds);
    for (const k of keys) await page.keyboard.up(k);
    await page.close();
    const { rows } = data;
    // A stance = consecutive frames with the ball of the foot on the floor. Slip is how
    // far it ended up from where it was planted (net drift, not frame jitter).
    const stances = []; let disturbed = 0;
    const pace = Math.hypot(rows.at(-1).body[0] - rows[0].body[0], rows.at(-1).body[1] - rows[0].body[1]) / (rows.at(-1).t - rows[0].t);
    for (let f = 0; f < 2; f++) {
      const heights = rows.map(r => r.feet[f][1]).sort((a, b) => a - b);
      const floor = heights[Math.floor(heights.length * 0.05)];
      const ankleFloor = rows.map(r => r.ankles[f]).sort((a, b) => a - b)[Math.floor(rows.length * 0.05)];
      let first = -1;
      for (let i = 0; i <= rows.length; i++) {
        // on the floor, and not merely skimming it mid-swing (then the ankle is high)
        // (a stalled frame also ends the stance: the gait moves on by an unknown amount across it)
        const down = i < rows.length && rows[i].feet[f][1] - floor < 0.012 && rows[i].ankles[f] - ankleFloor < 0.07 && (i === 0 || rows[i].t - rows[i - 1].t < 0.05);
        if (down && first < 0) first = i;
        if (!down && first >= 0) {
          const a = rows[first], b = rows[i - 1];
          // a stance during which the body was knocked off its pace (enemy fire) says nothing about the gait
          const moved = Math.hypot(b.body[0] - a.body[0], b.body[1] - a.body[1]), expected = pace * (b.t - a.t);
          if (b.t - a.t > 0.08 && (b.hp < a.hp || Math.abs(moved - expected) > 0.25 * expected)) disturbed++;
          else if (b.t - a.t > 0.08) stances.push({ seconds: b.t - a.t, drift: Math.hypot(b.feet[f][0] - a.feet[f][0], b.feet[f][2] - a.feet[f][2]) });
          first = -1;
        }
      }
    }
    const span = rows.at(-1).t - rows[0].t;
    const speed = Math.hypot(rows.at(-1).body[0] - rows[0].body[0], rows.at(-1).body[1] - rows[0].body[1]) / span;
    const planted = stances.reduce((n, s) => n + s.seconds, 0), drifted = stances.reduce((n, s) => n + s.drift, 0);
    return { label, form: data.form, bodySpeed: +speed.toFixed(2), stances: stances.length, meanStanceSeconds: +(planted / Math.max(1, stances.length)).toFixed(2),
      meanDriftCm: +(drifted / Math.max(1, stances.length) * 100).toFixed(1), maxDriftCm: +(Math.max(0, ...stances.map(s => s.drift)) * 100).toFixed(1),
      slipPercentOfSpeed: +((drifted / Math.max(planted, 1e-6)) / Math.max(speed, 1e-6) * 100).toFixed(1), fps: +((rows.length - 1) / span).toFixed(0),
      disturbedStances: disturbed, hitsTaken: rows.filter((r, i) => i > 0 && r.hp < rows[i - 1].hp).length, driftsCm: stances.map(s => +(s.drift * 100).toFixed(1)).join(' ') };
  };
  const results = [];
  results.push(await measure('armour walk', false, ['w'], 4));
  results.push(await measure('armour run', false, ['ShiftLeft', 'w'], 2.4));
  results.push(await measure('pilot walk', true, ['w'], 4));
  results.push(await measure('pilot run', true, ['ShiftLeft', 'w'], 2.4));
  await fs.writeFile(`${out}/feet.json`, JSON.stringify(results, null, 2));
  console.table(results);
}

if (want('thruster-cost')) {
  // Same studio view, same pose; only the propulsion effect differs between the two samples.
  const results = [];
  for (const quality of ['LOW', 'MEDIUM', 'HIGH', 'ULTRA']) {
    const page = await browser.newPage({ viewport: size });
    await page.goto(`${base}/scripts/character-preview.html?clean&quality=${quality}`, { waitUntil: 'domcontentloaded' });
    await studio(page);
    await page.evaluate(() => window.studio.setView('flightRear'));
    const sample = async (pose) => {
      await page.evaluate(p => window.studio.setPose(p), pose);
      await sleep(page, 900);
      return page.evaluate(() => new Promise(resolve => {
        const times = []; let last = 0; const info = window.studio.renderer.info;
        const frame = (t) => {
          if (last) times.push(t - last); last = t;
          if (times.length < 240) requestAnimationFrame(frame);
          else { times.sort((a, b) => a - b); resolve({ medianMs: +times[120].toFixed(2), p95Ms: +times[228].toFixed(2), drawCalls: info.render.calls, triangles: info.render.triangles }); }
        };
        requestAnimationFrame(frame);
      }));
    };
    const off = await sample('idle'), boost = await sample('boost');
    results.push({ quality, offMedianMs: off.medianMs, boostMedianMs: boost.medianMs, offP95Ms: off.p95Ms, boostP95Ms: boost.p95Ms, extraDrawCalls: boost.drawCalls - off.drawCalls, extraTriangles: boost.triangles - off.triangles });
    await page.close();
  }
  await fs.writeFile(`${out}/thrusters.json`, JSON.stringify(results, null, 2));
  console.table(results);
}
await browser.close();
if (vite) await vite.close();
if (errors.length) { console.error('ERRORS\n' + errors.join('\n')); process.exitCode = 1; }
