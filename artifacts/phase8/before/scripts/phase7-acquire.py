"""Download selected CC0 source models via Poly Haven's documented public API."""
from pathlib import Path
import urllib.request,json,hashlib,time
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'art/environment/phase7/external';OUT.mkdir(parents=True,exist_ok=True)
AGENT={'User-Agent':'AEGIS Phase7 Environment Art (local asset preparation)'}
assets=['modular_urban_apartments_facade','modular_factory_facade','exterior_aircon_unit','modular_fire_escape','street_lamp_02']
def get(url):return urllib.request.urlopen(urllib.request.Request(url,headers=AGENT),timeout=90).read()
catalog=json.loads(get('https://api.polyhaven.com/assets?type=models'));records=[]
for name in assets:
    files=json.loads(get('https://api.polyhaven.com/files/'+name));entry=files['gltf']['1k']['gltf'];folder=OUT/name;folder.mkdir(exist_ok=True)
    downloads={name+'.gltf':entry,**entry.get('include',{})}
    # Preserve editable source geometry as well as glTF + its complete 1K PBR maps.
    downloads[name+'.blend']=files['blend']['1k']['blend']
    entries=[]
    for relative,f in downloads.items():
        dest=folder/relative;assert dest.resolve().is_relative_to(folder.resolve());dest.parent.mkdir(parents=True,exist_ok=True)
        data=dest.read_bytes() if dest.exists() else get(f['url'])
        assert len(data)==f['size'],relative
        assert hashlib.md5(data).hexdigest()==f['md5'],relative
        if not dest.exists():dest.write_bytes(data)
        entries.append({'path':str(dest.relative_to(ROOT)).replace('\\','/'),'url':f['url'],'originalBytes':len(data),'md5Verified':f['md5'],'sha256':hashlib.sha256(data).hexdigest()})
        print(name,relative,len(data),flush=True);time.sleep(.15)
    records.append({'asset':name,'name':catalog[name]['name'],'creators':catalog[name]['authors'],'source':'https://polyhaven.com/a/'+name,'license':'CC0-1.0','licenseURL':'https://polyhaven.com/license','attributionRequired':False,'commercialUse':True,'downloadedAt':datetime.now(timezone.utc).isoformat(),'originalFormats':['glTF + binary buffers + 1K maps','Blender source geometry (maps from glTF download)'],'files':entries,'conversion':'Pending Blender normalization/LOD export and shared PBR preparation'})
    (OUT/'provenance.json').write_text(json.dumps(records,indent=2),encoding='utf8')
(OUT/'LICENSE.txt').write_text('Poly Haven assets: CC0 1.0 Universal. Commercial use, modification and redistribution permitted; attribution optional. https://polyhaven.com/license\nhttps://creativecommons.org/publicdomain/zero/1.0/\nAsset creators, source URLs and verified downloads are recorded in provenance.json.\n',encoding='utf8')
