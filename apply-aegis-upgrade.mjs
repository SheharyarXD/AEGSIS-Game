/** Applies the additive AEGIS character upgrade to a fresh checkout of commit 784838c. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = process.cwd();
const upgradeRoot = path.dirname(fileURLToPath(import.meta.url));
const dryRun = process.argv.includes('--dry-run');
const suitFile = path.join(packageRoot, 'src/player/AegisSuit.ts');
const qaFile = path.join(packageRoot, 'scripts/character-qa.mjs');
const identityFile = path.join(packageRoot, 'src/player/AegisIdentity.ts');
const previewFile = path.join(packageRoot, 'scripts/character-preview.html');

function requireFound(content, needle, file) {
  if (!content.includes(needle)) throw new Error(`Expected source anchor missing from ${file}: ${needle.slice(0,65)}`);
}
function changeOnce(content, original, replacement, file) {
  requireFound(content, original, file);
  const first = content.indexOf(original);
  if (content.indexOf(original, first + original.length) !== -1) throw new Error(`Ambiguous anchor in ${file}`);
  return content.slice(0, first) + replacement + content.slice(first + original.length);
}
function assertFile(file) { if (!fs.existsSync(file)) throw new Error(`Missing repository file: ${file}`); }
assertFile(suitFile);assertFile(qaFile);assertFile(path.join(packageRoot, 'package.json'));
const source = fs.readFileSync(suitFile, 'utf8');
if (source.includes('installAegisIdentity')) throw new Error('This upgrade is already applied. Refusing to duplicate armour attachments.');

let suit = changeOnce(source,
  "import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';\n",
  '', 'AegisSuit.ts');
suit = changeOnce(suit,
  "import { FlightState } from './FlightState';",
  "import { FlightState } from './FlightState';\nimport { installAegisIdentity } from './AegisIdentity';",
  'AegisSuit.ts');
suit = changeOnce(suit,
  "  private readonly emitter = new MeshStandardMaterial({ color: '#427783', emissive: '#30bcf4', emissiveIntensity: 1.25, metalness: 0.5, roughness: 0.24 });",
  "  private readonly emitter = new MeshStandardMaterial({ color: '#427783', emissive: '#30bcf4', emissiveIntensity: 1.25, metalness: 0.5, roughness: 0.24 });\n" +
  "  private readonly optic = new MeshStandardMaterial({ color: '#219aca', emissive: '#35bfff', emissiveIntensity: 0.85, metalness: 0.35, roughness: 0.22 });\n" +
  "  private readonly composite = new MeshStandardMaterial({ color: '#101923', metalness: 0.32, roughness: 0.73 });",
  'AegisSuit.ts');
suit = changeOnce(suit,
  '    this.emitter.emissiveIntensity = (state === FlightState.Boost ? 2.9 : flying ? 1.9 : 0.7) * (this.assemblyProgress > 0.78 ? 1 : 0.04);',
  '    this.emitter.emissiveIntensity = (state === FlightState.Boost ? 2.1 : flying ? 1.25 : 0.42) * (this.assemblyProgress > 0.78 ? 1 : 0.04);\n' +
  '    this.optic.emissiveIntensity = (flying ? 1.0 : 0.74) * MathUtils.smoothstep(this.assemblyProgress, 0.7, 0.9);',
  'AegisSuit.ts');
suit = changeOnce(suit,
  '    this.shell.dispose(); this.alloy.dispose(); this.emitter.dispose();',
  '    this.shell.dispose(); this.alloy.dispose(); this.emitter.dispose(); this.optic.dispose(); this.composite.dispose();',
  'AegisSuit.ts');
const crestStart = suit.indexOf("    const crest = attach('chest',");
const methodEnd = suit.lastIndexOf('\n  }\n}');
if (crestStart < 0 || methodEnd <= crestStart || !suit.slice(crestStart,methodEnd).includes('const face = attach')) {
  throw new Error('Expected final crest/faceplate implementation not found. Source may have changed.');
}
suit = suit.slice(0,crestStart) +
  '    installAegisIdentity(attach, { shell: this.shell, alloy: this.alloy, composite: this.composite, optic: this.optic });' +
  suit.slice(methodEnd);

let qa = fs.readFileSync(qaFile, 'utf8');
qa = changeOnce(qa,
  "await page.waitForFunction(()=>window.ready,{timeout:30000});await page.screenshot({path:'artifacts/character-front.png'});",
  "await page.waitForFunction(()=>window.ready,{timeout:30000});await page.evaluate(()=>window.setView('front'));await page.screenshot({path:'artifacts/character-front.png'});",
  'character-qa.mjs');
qa = changeOnce(qa,
  "await page.evaluate(()=>{window.camera.position.set(3,2.1,-5);window.camera.lookAt(0,1,0);window.renderStill()});await page.screenshot({path:'artifacts/character-back.png'});",
  "await page.evaluate(()=>window.setView('back'));await page.screenshot({path:'artifacts/character-back.png'});\n"+
  "await page.evaluate(()=>window.setView('side'));await page.screenshot({path:'artifacts/character-side.png'});\n"+
  "await page.evaluate(()=>window.setView('threequarter'));await page.screenshot({path:'artifacts/character-threequarter.png'});\n"+
  "await page.evaluate(()=>window.setView('helmet'));await page.screenshot({path:'artifacts/character-helmet.png'});\n"+
  "await page.evaluate(()=>window.setView('chest'));await page.screenshot({path:'artifacts/character-chest.png'});\n"+
  "await page.evaluate(()=>window.setView('thrusters'));await page.screenshot({path:'artifacts/character-thrusters.png'});\n"+
  "await page.evaluate(()=>{window.setView('full');window.setLighting('bright')});await page.screenshot({path:'artifacts/character-bright.png'});\n"+
  "await page.evaluate(()=>window.setLighting('dark'));await page.screenshot({path:'artifacts/character-dark.png'});",
  'character-qa.mjs');

const changes = [
  [suitFile, suit],
  [identityFile, fs.readFileSync(path.join(upgradeRoot, 'src/player/AegisIdentity.ts'),'utf8')],
  [previewFile, fs.readFileSync(path.join(upgradeRoot, 'scripts/character-preview.html'),'utf8')],
  [qaFile, qa],
];
if (fs.existsSync(identityFile)) throw new Error('AegisIdentity.ts already exists. Not overwriting a potentially customized implementation.');
for(const [destination,content] of changes){
  console.log(`${dryRun ? 'Would update' : 'Updated'} ${path.relative(packageRoot,destination)} (${content.length} characters)`);
  if(!dryRun){fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,content)}
}
console.log(dryRun?'Dry-run successful. No project files changed.':'Files updated. Run npm run build and character QA; inspect all views before merging.');
