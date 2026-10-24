"""Audit the saved city and produce a deployment allowlist without shipping authoring/source files."""
import json,hashlib,math
from pathlib import Path
R=Path(__file__).resolve().parents[1];layout=json.loads((R/'art/environment/city-redesign/city-layout.json').read_text());families=json.loads((R/'art/environment/city-redesign/used-families.json').read_text());plan=json.loads((R/'art/environment/city-redesign/master-plan.json').read_text());counts={};roads=[]
for x in plan['roadX']:
 if x<=880:roads.append(('x',x,26 if x in plan['avenueX'] else 16))
for z in plan['roadZ']:roads.append(('z',z,26 if z in plan['avenueZ'] else 16))
violations=[];overlaps=[];boxes=[]
for b in layout['buildings']:
 counts[b['family']]=counts.get(b['family'],0)+1;a=b.get('angle',0);hx=(abs(math.cos(a))*b['w']+abs(math.sin(a))*b['d'])/2;hz=(abs(math.sin(a))*b['w']+abs(math.cos(a))*b['d'])/2;box=(b['x']-hx,b['z']-hz,b['x']+hx,b['z']+hz);boxes.append((b,box))
 if b.get('deployment'):continue
 for axis,v,w in roads:
  lo,hi=(box[0],box[2]) if axis=='x' else (box[1],box[3])
  if hi>v-w/2+.01 and lo<v+w/2-.01:violations.append(dict(id=b['id'],road=[axis,v,w],box=box))
for i,(a,aa) in enumerate(boxes):
 for b,bb in boxes[i+1:]:
  if a.get('deployment') or b.get('deployment'):continue
  if aa[2]>bb[0]+.01 and aa[0]<bb[2]-.01 and aa[3]>bb[1]+.01 and aa[1]<bb[3]-.01:overlaps.append([a['id'],b['id']])
files={'assets/environment/aegis-city-kit.glb','assets/environment/ATTRIBUTION.txt'}
for path in ['runtime-components.json','metropolis-hlod-optimized.glb','metropolis-street-kit-optimized.glb','street-texture-manifest.json','source-facades.dds','source-facades.webp','LICENSES.txt']:files.add('assets/environment/metropolis/'+path)
for f in families:
 ns='provided' if f['id'].startswith('aer_') else 'city'
 for lod in ['near','mid']:files.add(f'assets/environment/premium/{ns}/{f["id"]}-{lod}-optimized.glb')
 manifest=json.loads((R/f'public/assets/environment/premium/{ns}/texture-manifest.json').read_text());files.add(f'assets/environment/premium/{ns}/texture-manifest.json')
 for maps in manifest[f['id']]['materials'].values():
  for slot in maps.values():
   for ext in ['.dds','.webp']:files.add(slot['url'].lstrip('/')+ext)
street=json.loads((R/'public/assets/environment/metropolis/street-texture-manifest.json').read_text())
for maps in street.values():
 for slot in maps.values():
  for ext in ['.dds','.webp']:files.add(slot['url'].lstrip('/')+ext)
files.add('assets/environment/premium/destructible/fractures-optimized.glb')
for name in ['asphalt-diff','asphalt-normal','asphalt-rough','atlas-color','atlas-normal','atlas-orm']:files.add('assets/environment/'+name+'.webp')
for name in ['color','normal','orm']:
 for ext in ['.dds','.webp']:files.add('assets/environment/premium/pbr-'+name+ext)
missing=[f for f in files if not (R/'public'/f).is_file()]
protected=json.loads((R/'artifacts/city-redesign/before/protected-files.json').read_text(encoding='utf-8-sig'));preservation=[dict(file=e['Path'],unchanged=hashlib.sha256(Path(e['Path']).read_bytes()).hexdigest().upper()==e['Hash']) for e in protected]
report=dict(buildings=len(layout['buildings']),blocks=len(layout['blocks']),families=len(families),familyCounts=counts,footprintCoveragePercent=sum(b['w']*b['d'] for b in layout['buildings'])/2048**2*100,gothicSpireBuildings=sum(b['family']=='aer_gothic' for b in layout['buildings']),fullCollapseBuildings=[b['id'] for b in layout['buildings'] if b['damageClass']=='full'],roadIntrusions=violations,buildingOverlaps=overlaps,protectedFiles=preservation,missingRuntimeAssets=missing,environmentDeploymentBytes=sum((R/'public'/f).stat().st_size for f in files if (R/'public'/f).is_file()),environmentFiles=sorted(files),note='Deployment inventory includes both native BC3 and WebP fallback; gameplay downloads the supported texture format only, and source LODs stream on demand.')
(R/'artifacts/city-redesign/asset-layout-audit.json').write_text(json.dumps(report,indent=2));(R/'artifacts/city-redesign/deployment-environment-files.json').write_text(json.dumps(sorted(files),indent=2));print('Saved asset/layout audit',len(files),'runtime files;',len(violations),'road intrusions;',len(overlaps),'footprint overlaps;',len(missing),'missing assets')
