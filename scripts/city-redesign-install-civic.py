from pathlib import Path
from PIL import Image
import json,struct,io
R=Path(__file__).resolve().parents[1];folder=R/'public/assets/environment/premium/city';extra=json.loads((R/'art/environment/city-redesign/civic-components.json').read_text());catalog=json.loads((folder/'runtime-components.json').read_text())
for f in extra['families']:
 f['collisionContours']=[[[-p[2]/2,-p[3]/2],[p[2]/2,-p[3]/2],[p[2]/2,p[3]/2],[-p[2]/2,p[3]/2]] for p in f['profiles']]
catalog['families']=[f for f in catalog['families'] if f['id'] not in {e['id'] for e in extra['families']}]+extra['families'];catalog['components']=[c for c in catalog['components'] if c['family'] not in {e['id'] for e in extra['families']}]+extra['components']
(folder/'runtime-components.json').write_text(json.dumps(catalog,indent=2));(R/'src/world/DestructibleFamilies.ts').write_text('export const DESTRUCTIBLE_FAMILIES = '+json.dumps(catalog['families'],indent=1)+' as const;\n')
manifest=json.loads((folder/'texture-manifest.json').read_text());out=folder/'textures';out.mkdir(exist_ok=True)
for f in extra['families']:
 family=f['id'];raw=(folder/(family+'-near.glb')).read_bytes();length=struct.unpack_from('<I',raw,12)[0];d=json.loads(raw[20:20+length]);data=raw[20+length+8:];slots={}
 for index,im in enumerate(d.get('images',[])):
  view=d['bufferViews'][im['bufferView']];pixels=Image.open(io.BytesIO(data[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']])).convert('RGBA');stem=f'{family}-{index}';pixels.save(out/(stem+'.webp'),quality=94);mips=[];first=None;current=pixels
  while True:
   stream=io.BytesIO();current.save(stream,format='DDS',pixel_format='DXT5');encoded=stream.getvalue();first=first or bytearray(encoded[:128]);mips.append(encoded[128:])
   if current.size==(1,1):break
   current=current.resize((max(1,current.width//2),max(1,current.height//2)),Image.Resampling.LANCZOS)
  struct.pack_into('<I',first,8,struct.unpack_from('<I',first,8)[0]|0x20000);struct.pack_into('<I',first,28,len(mips));struct.pack_into('<I',first,108,0x401008);(out/(stem+'.dds')).write_bytes(first+b''.join(mips));slots[index]={'url':'/assets/environment/premium/city/textures/'+stem}
 materials={}
 for mat in d['materials']:
  mapping={};pbr=mat.get('pbrMetallicRoughness',{})
  for target,item in [('map',pbr.get('baseColorTexture')),('roughnessMap',pbr.get('metallicRoughnessTexture')),('metalnessMap',pbr.get('metallicRoughnessTexture')),('normalMap',mat.get('normalTexture')),('aoMap',mat.get('occlusionTexture')),('emissiveMap',mat.get('emissiveTexture'))]:
   if item:mapping[target]=slots[d['textures'][item['index']]['source']]
  materials[mat['name']]=mapping
 manifest[family]={'materials':materials}
(folder/'texture-manifest.json').write_text(json.dumps(manifest,indent=2));print('Installed original civic family, source license CC0,',len(extra['components']),'damage sections')
