import json,hashlib,shutil
from pathlib import Path
R=Path(__file__).resolve().parents[1];out=R/'artifacts/city-redesign';before=out/'before';records=[]
for p in sorted((before/'src').rglob('*')):
 if not p.is_file():continue
 rel=p.relative_to(before);now=R/rel;same=now.exists() and now.read_bytes()==p.read_bytes();records.append(dict(file=rel.as_posix(),unchanged=same,world=rel.as_posix().startswith('src/world/')))
inventory=json.loads((R/'artifacts/phase7/provided-asset-inventory.json').read_text());assets=[]
for e in inventory:
 p=R/'art/external'/e['file'];assets.append(dict(file=e['file'],unchanged=hashlib.sha256(p.read_bytes()).hexdigest()==e['sha256']))
# Archive the current regression outputs and restore the user's historical artifacts.
control=json.loads((R.parent/'Aegis-Art-Backups/active-phase7.json').read_text());backup=Path(control['backup'])
restored=[]
for name in ['performance.json','browser-results.json','qa-boss.png','qa-destruction.png','qa-flight.png','qa-ragdoll-wall.png','qa-beam.png','qa-beam-hover.png','qa-form-armor.png','qa-form-change.png','qa-form-pilot.png','qa-form-stepout.png','qa-landing.png']:
 src=backup/'working-state/artifacts'/name;target=R/'artifacts'/name
 if src.exists() and target.exists() and src.read_bytes()!=target.read_bytes():
  archive=out/'historical-artifact-regression'/name;archive.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,archive);shutil.copy2(src,target);restored.append(name)
report=dict(sourceFiles=records,unexpectedNonWorldChanges=[r['file'] for r in records if not r['world'] and not r['unchanged']],suppliedAssets=assets,suppliedAssetsUnchanged=all(a['unchanged'] for a in assets),restoredHistoricalArtifacts=restored)
(out/'preservation.json').write_text(json.dumps(report,indent=2));print('Non-world changes:',report['unexpectedNonWorldChanges'],'original assets preserved:',report['suppliedAssetsUnchanged'])
