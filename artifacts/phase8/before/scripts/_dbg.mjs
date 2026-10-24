// Walk review: stills through one cycle from several views, plus shoulder-girdle numbers.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import sharp from 'sharp';
import fs from 'node:fs/promises';
const out = process.argv[2], pose = process.argv[3] || 'walk', form = process.argv[4] || 'armor';
const views = (process.argv[5] || 'shouldersFront,shouldersBack,front,back,side').split(',');
await fs.mkdir(out, { recursive: true });
const vite = await createServer({ server: { port: 5183, strictPort: false, host: '127.0.0.1' }, logLevel: 'error' });
await vite.listen();
const base = `http://127.0.0.1:${vite.config.server.port}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 700, height: 875 }, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('PAGE ERROR', e.message));
await page.goto(`${base}/scripts/character-preview.html?clean&quality=HIGH`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.ready === true, { timeout: 120000 });
const N = 8;
const cycle = await page.evaluate(([pose, form]) => {
  const s = window.studio; s.setForm(form); s.setLighting('neutral'); s.setBloom(false); s.setPose(pose); s.advance(1.5);
  const suit = s.suit(); const clip = { walk: 'aegis_walk', run: 'aegis_run', idle: 'aegis_idle' }[pose];
  return { seconds: suit.mixer.clipAction(suit.mixer._actions.find(a => a.getClip().name === clip)?.getClip()).getClip().duration, walk: suit.walkSpeed, run: suit.runSpeed };
}, [pose, form]);
console.log('cycle', cycle);
const rows = [];
const frames = {};
for (let i = 0; i < N; i++) {
  const m = await page.evaluate(([step]) => {
    const s = window.studio, T = s.T; s.advance(step); 
    const suit = s.suit(), b = n => suit.bones.get(n);
    suit.group.updateMatrixWorld(true);
    const q = n => b(n).getWorldQuaternion(new s.Q()), p = n => b(n).getWorldPosition(new s.V());
    const chestInv = q('chest').invert();
    const deg = r => +(r * 180 / Math.PI).toFixed(1);
    const rel = n => { const r = chestInv.clone().multiply(q(n)); return r; };
    const out = {};
    for (const side of ['L', 'R']) {
      const sh = p('upper_arm' + side), el = p('forearm' + side), wr = p('palm' + side), ch = p('chest');
      const arm = el.clone().sub(sh).normalize(), fore = wr.clone().sub(el).normalize();
      const root = suit.group.getWorldQuaternion(new s.Q()).invert();
      const armL = arm.clone().applyQuaternion(root), foreL = fore.clone().applyQuaternion(root), shL = sh.clone().sub(ch).applyQuaternion(root);
      out[side] = { shoulderY: +shL.y.toFixed(3), shoulderX: +shL.x.toFixed(3), shoulderZ: +shL.z.toFixed(3),
        armOut: deg(Math.asin(armL.x * (side === 'L' ? 1 : -1))), armFwd: deg(Math.atan2(armL.z, -armL.y)),
        foreOut: deg(Math.asin(foreL.x * (side === 'L' ? 1 : -1))), foreFwd: deg(Math.atan2(foreL.z, -foreL.y)),
        elbow: deg(Math.acos(Math.max(-1, Math.min(1, arm.dot(fore))))),
        clav: deg(2 * Math.acos(Math.min(1, Math.abs(rel('shoulder' + side).w)))), pad: deg(2 * Math.acos(Math.min(1, Math.abs(rel('shoulderpad' + side).w)))) };
    }
    const root = suit.group.getWorldQuaternion(new s.Q()).invert();
    const e = new s.E().setFromQuaternion(root.clone().multiply(q('chest')), 'YXZ'), h = new s.E().setFromQuaternion(root.clone().multiply(q('hips')), 'YXZ');
    out.chest = { yaw: deg(e.y), pitch: deg(e.x), roll: deg(e.z) }; out.hips = { yaw: deg(h.y), pitch: deg(h.x), roll: deg(h.z) };
    return out;
  }, [i === 0 ? 0 : cycle.seconds / N]).catch(e => ({ error: String(e) }));
  rows.push(m);
  for (const view of views) {
    await page.evaluate(v => { const s = window.studio; s.hold(); s.setView(v); }, view);
    await page.waitForTimeout(120);
    (frames[view] ??= []).push(await page.screenshot());
    await page.evaluate(() => window.studio.release());
  }
}
for (const view of views) {
  const pick = process.env.PICK ? process.env.PICK.split(',').map(Number) : null;
  const chosen = pick ? pick.map(i => frames[view][i]) : frames[view];
  const cols = pick ? pick.length : 4, w = pick ? 700 : 350, h = pick ? 875 : 438;
  const tiles = await Promise.all(chosen.map(b => sharp(b).resize(w, h).toBuffer()));
  await sharp({ create: { width: w * cols, height: h * Math.ceil(chosen.length / cols), channels: 3, background: '#000' } })
    .composite(tiles.map((input, i) => ({ input, left: (i % cols) * w, top: Math.floor(i / cols) * h }))).png().toFile(`${out}/${pose}-${form}-${view}${pick ? '-big' : ''}.png`);
}
await fs.writeFile(`${out}/${pose}-${form}.json`, JSON.stringify(rows, null, 1));
for (const side of ['L', 'R']) { console.log(side); for (const r of rows) console.log(r.error ?? JSON.stringify(r[side])); }
console.log('chest'); for (const r of rows) console.log(JSON.stringify(r.chest), JSON.stringify(r.hips));
await browser.close(); await vite.close();
