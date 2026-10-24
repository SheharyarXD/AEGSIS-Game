from pathlib import Path
import json,urllib.request,hashlib,time
from datetime import datetime,timezone
root=Path(__file__).resolve().parents[1];out=root/'art/environment/phase7/materials';out.mkdir(parents=True,exist_ok=True)
agent={'User-Agent':'AEGIS Phase7 Environment Art (local material preparation)'}
def get(url):return urllib.request.urlopen(urllib.request.Request(url,headers=agent),timeout=90).read()
catalog=json.loads(get('https://api.polyhaven.com/assets?type=textures'));records=[]
for asset in ['stone_wall_03','brick_wall_006','concrete_pavement','metal_plate','rusty_metal_02','old_stone_wall_02']:
 files=json.loads(get('https://api.polyhaven.com/files/'+asset));folder=out/asset;folder.mkdir(exist_ok=True);downloads=[]
 for target,candidates in [('color',['diff','Diffuse','albedo']),('normal',['nor_gl','Normal']),('rough',['rough','Rough'])]:
  key=next(k for k in candidates if k in files);f=files[key]['2k']['jpg'];dest=folder/(target+'.jpg');data=dest.read_bytes() if dest.exists() else get(f['url']);assert len(data)==f['size'];assert hashlib.md5(data).hexdigest()==f['md5'];dest.write_bytes(data);downloads.append({'kind':target,'sourceURL':f['url'],'bytes':len(data),'md5Verified':f['md5'],'sha256':hashlib.sha256(data).hexdigest(),'originalFormat':'2K JPEG'});print(asset,target,len(data),flush=True);time.sleep(.2)
 records.append({'asset':asset,'name':catalog[asset]['name'],'creator':catalog[asset]['authors'],'source':'https://polyhaven.com/a/'+asset,'license':'CC0-1.0','licenseURL':'https://polyhaven.com/license','commercialUse':True,'attributionRequired':False,'downloadedAt':datetime.now(timezone.utc).isoformat(),'files':downloads,'runtimePreparation':'Shared colour/normal/ORM atlas, 512/1024 texel slots, native BC3 DDS with WebP fallback'})
 (out/'provenance.json').write_text(json.dumps(records,indent=2),encoding='utf8')
