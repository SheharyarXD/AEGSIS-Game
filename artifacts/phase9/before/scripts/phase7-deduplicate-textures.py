"""Share byte-identical runtime maps; archive redundant generated files without deleting sources."""
from pathlib import Path
import hashlib,json,shutil
ROOT=Path(__file__).resolve().parents[1]
runtime=ROOT/'public/assets/environment/premium'
archive=ROOT/'art/environment/phase7/runtime-source'
canonical={};replacements={};moves=[]
for namespace in ['provided','city']:
 folder=runtime/namespace/'textures'
 for dds in sorted(folder.glob('*.dds')):
  webp=dds.with_suffix('.webp')
  digest=hashlib.sha256(dds.read_bytes()+webp.read_bytes()).hexdigest()
  url='/assets/environment/premium/'+dds.relative_to(runtime).as_posix()[:-4]
  if digest not in canonical:canonical[digest]=url;continue
  replacements[url]=canonical[digest]
  for p in [dds,webp]:
   target=archive/p.relative_to(runtime)
   if not p.resolve().is_relative_to(runtime.resolve()) or not target.resolve().is_relative_to(archive.resolve()):raise RuntimeError('Texture path escaped verified roots')
   if target.exists():raise RuntimeError('Archive target already exists')
   target.parent.mkdir(parents=True,exist_ok=True)
   sha=hashlib.sha256(p.read_bytes()).hexdigest();size=p.stat().st_size
   shutil.move(str(p),str(target))
   assert hashlib.sha256(target.read_bytes()).hexdigest()==sha
   moves.append({'path':p.relative_to(ROOT).as_posix(),'bytes':size,'sha256':sha})
def rewrite(value):
 if isinstance(value,str):return replacements.get(value,value)
 if isinstance(value,list):return [rewrite(v) for v in value]
 if isinstance(value,dict):return {k:rewrite(v) for k,v in value.items()}
 return value
for namespace in ['provided','city']:
 p=runtime/namespace/'texture-manifest.json'
 p.write_text(json.dumps(rewrite(json.loads(p.read_text())),indent=2))
report={'duplicateMaps':len(replacements),'archivedBytes':sum(m['bytes'] for m in moves),'urlAliases':replacements,'files':moves,'method':'DDS and WebP bytes both identical; original UV transforms, materials and full-detail source maps are retained.'}
(ROOT/'artifacts/phase7/texture-sharing.json').write_text(json.dumps(report,indent=2))
# Reflect the restored active CC0 module in the earlier packaging inventory.
p=ROOT/'artifacts/phase7/runtime-packaging.json';pack=json.loads(p.read_text(encoding='utf-8-sig'));pack['files']=[f for f in pack['files'] if f['path']!='aegis-cc0-modules.glb'];pack['runtimeBytes']=sum(f.stat().st_size for f in runtime.rglob('*') if f.is_file());pack['archivedBytes']=pack['beforeBytes']-pack['runtimeBytes'];pack['textureSharingReport']='artifacts/phase7/texture-sharing.json';p.write_text(json.dumps(pack,indent=2))
print('Shared',len(replacements),'duplicate maps; archived',report['archivedBytes'],'bytes; runtime',pack['runtimeBytes'],'bytes')
