from pathlib import Path
import shutil,json,hashlib
ROOT=Path(__file__).resolve().parents[1];control=json.loads((ROOT.parent/'Aegis-Art-Backups/active-phase7.json').read_text());out=Path(control['backup'])/'provided-assets';out.mkdir(exist_ok=True);records=[]
for p in (ROOT/'art/external').iterdir():
 if not p.is_file():continue
 dest=out/p.name;shutil.copy2(p,dest);source=hashlib.sha256(p.read_bytes()).hexdigest();assert source==hashlib.sha256(dest.read_bytes()).hexdigest();records.append({'name':p.name,'bytes':p.stat().st_size,'sha256':source})
(out/'verified-inventory.json').write_text(json.dumps(records,indent=2));print('Verified supplied asset backup',len(records),sum(r['bytes'] for r in records),str(out))
