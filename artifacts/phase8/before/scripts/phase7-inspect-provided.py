from pathlib import Path
import json,struct,zipfile,hashlib
ROOT=Path(__file__).resolve().parents[1];folder=ROOT/'art/external';report=[]
for p in folder.iterdir():
 entry={'file':p.name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
 if p.suffix=='.glb':
  with p.open('rb') as f:
   f.read(12);size,typ=struct.unpack('<II',f.read(8));d=json.loads(f.read(size))
  entry.update(asset=d.get('asset'),extensions=d.get('extensionsUsed'),extras=d.get('extras'),nodes=len(d.get('nodes',[])),meshes=len(d.get('meshes',[])),materials=[{'name':m.get('name'),'textures':{k:v for k,v in m.get('pbrMetallicRoughness',{}).items() if 'Texture' in k},'extras':m.get('extras')} for m in d.get('materials',[])],images=[{'name':i.get('name'),'mimeType':i.get('mimeType'),'uri':i.get('uri')} for i in d.get('images',[])],sceneNames=[s.get('name') for s in d.get('scenes',[])],rootNames=[n.get('name') for n in d.get('nodes',[]) if 'mesh' not in n][:30])
  entry['triangles']=sum(d['accessors'][prim['indices']]['count']//3 if 'indices' in prim else d['accessors'][prim['attributes']['POSITION']]['count']//3 for m in d.get('meshes',[]) for prim in m['primitives'])
 if p.suffix=='.zip':
  with zipfile.ZipFile(p) as z:
   entry['contents']=[{'name':i.filename,'size':i.file_size} for i in z.infolist()];entry['licenseTexts']={i.filename:z.read(i).decode('utf-8',errors='replace')[:12000] for i in z.infolist() if any(t in i.filename.lower() for t in ['license','readme','attrib']) and i.file_size<200000}
 report.append(entry)
out=ROOT/'artifacts/phase7/provided-asset-inventory.json';out.write_text(json.dumps(report,indent=2))
for e in report:print(e['file'],e.get('triangles'),e.get('asset'),len(e.get('images',[])),len(e.get('contents',[])))
