import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Applies a self-contained original 3D suit layer without modifying gameplay. */
const patchRoot=path.dirname(fileURLToPath(import.meta.url));
const repo=process.cwd();
const dry=process.argv.includes('--dry-run');
const suitPath=path.join(repo,'src/player/AegisSuit.ts');
const markPath=path.join(repo,'src/player/AegisMarkII.ts');
const previewPath=path.join(repo,'scripts/character-preview.html');
const targetImage=path.join(repo,'public/assets/AEGIS-markII-target.png');
const qaPath=path.join(repo,'scripts/markII-qa.mjs');
if(!fs.existsSync(suitPath)||!fs.existsSync(path.join(repo,'package.json'))){
 throw new Error('Run this command from the AEGSIS-Game repository root.');
}
const original=fs.readFileSync(suitPath,'utf8');
if(original.includes('createAegisMarkII'))throw new Error('Mark II already installed. Refusing duplicate shell mounts.');
if(fs.existsSync(markPath))throw new Error('AegisMarkII.ts already exists; inspect before overwriting.');
let source=original;
function replaceOnce(before,after){
 const first=source.indexOf(before);if(first<0)throw new Error(`Project source differs from expected revision. Missing: ${before.slice(0,75)}`);
 if(source.indexOf(before,first+before.length)!==-1)throw new Error(`Ambiguous patch anchor: ${before}`);
 source=source.slice(0,first)+after+source.slice(first+before.length);
}
replaceOnce("import { FlightState } from './FlightState';", "import { FlightState } from './FlightState';\nimport { createAegisMarkII, type MarkIIHandle } from './AegisMarkII';");
replaceOnce('  private readonly attachments: Attachment[] = [];','  private readonly attachments: Attachment[] = [];\n  private markII: MarkIIHandle | null = null;');
replaceOnce('    this.createFallbackClips(); this.buildPropulsionAndPlates(); this.group.updateMatrixWorld(true);',
'    this.createFallbackClips(); this.buildPropulsionAndPlates(); this.installMarkII(); this.group.updateMatrixWorld(true);');
replaceOnce('    this.lastState = state;', '    this.markII?.update(state, speed, this.assemblyProgress);\n    this.lastState = state;');
replaceOnce('    this.group.removeFromParent();', '    this.markII?.dispose();\n    this.group.removeFromParent();');
replaceOnce('  private transition(name: string, duration: number, once: boolean): void {',
`  /** Keep source rig/clips; replace only visible geometry with original AEGIS armor. */
  private installMarkII(): void {
    // ?legacySuit=1 is the zero-dependency visual fallback for weaker hardware.
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('legacySuit')) return;
    // Legacy supplementary primitives stay allocated for compatibility with
    // original scripted assembly, but are hidden from the new visible suit.
    for (const part of this.attachments) part.object.visible = false;
    this.model.traverse(object => { if (object instanceof Mesh) object.visible = false; });
    this.thrusterMounts.length = 0;
    this.markII = createAegisMarkII(this.group, this.bones, this.thrusterMounts);
  }

  private transition(name: string, duration: number, once: boolean): void {`);
const files=[
 [suitPath,Buffer.from(source)],
 [markPath,fs.readFileSync(path.join(patchRoot,'src/player/AegisMarkII.ts'))],
 [previewPath,fs.readFileSync(path.join(patchRoot,'scripts/character-preview.html'))],
 [targetImage,fs.readFileSync(path.join(patchRoot,'public/assets/AEGIS-markII-target.png'))],
 [qaPath,fs.readFileSync(path.join(patchRoot,'scripts/markII-qa.mjs'))],
];
for(const [f,data] of files)console.log(`${dry?'Would write':'Writing'} ${path.relative(repo,f)} (${data.length} bytes)`);
if(!dry){
 const backup=path.join(repo,'artifacts','aegis-markII-backup');fs.mkdirSync(backup,{recursive:true});
 for(const f of [suitPath,previewPath])if(fs.existsSync(f))fs.copyFileSync(f,path.join(backup,path.basename(f)));
 for(const [f,data] of files){fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,data);}
}
console.log(dry?'Dry run successful. No changes made.':'Installed Mark II. Run npm run build, then npm run dev and inspect 360° preview.');
