from pathlib import Path
import json,hashlib,shutil
ROOT=Path(__file__).resolve().parents[1];control=json.loads((ROOT.parent/'Aegis-Art-Backups/active-phase7.json').read_text());backup=Path(control['backup']);inventory=json.loads((backup/'inventory.json').read_text());out=ROOT/'artifacts/phase7/preservation';out.mkdir(exist_ok=True)
changed=[];same=[];allowed=[]
for entry in inventory['files']:
 relative=entry['path'];p=ROOT/relative
 if not p.exists():changed.append({'path':relative,'status':'missing'});continue
 digest=hashlib.sha256(p.read_bytes()).hexdigest()
 if digest==entry['sha256']:same.append(relative);continue
 if relative.startswith('artifacts/'):
  archive=out/'regression-output'/relative;archive.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,archive);shutil.copy2(backup/'working-state'/relative,p);same.append(relative);continue
 if relative.startswith('src/world/') or relative in ['src/main.ts','src/physics/Destruction.ts','tests/browser.spec.mjs','tests/environment.test.ts','tests/environment.browser.spec.mjs','tests/integration.browser.spec.mjs']:
  allowed.append({'path':relative,'before':entry['sha256'],'after':digest});continue
 changed.append({'path':relative,'before':entry['sha256'],'after':digest})
provided=json.loads((backup/'provided-assets/verified-inventory.json').read_text());assetChanges=[]
for entry in provided:
 p=ROOT/'art/external'/entry['name'];digest=hashlib.sha256(p.read_bytes()).hexdigest()
 if digest!=entry['sha256']:assetChanges.append(entry['name'])
report={'backup':str(backup),'verifiedOriginalFiles':len(same),'authorizedWorldAndIntegrationChanges':allowed,'unexpectedChanges':changed,'suppliedAssetsUnchanged':not assetChanges,'suppliedAssetChanges':assetChanges}
(out/'audit.json').write_text(json.dumps(report,indent=2));print('Preservation audit',len(same),'unchanged',len(allowed),'authorized',len(changed),'unexpected',assetChanges)
