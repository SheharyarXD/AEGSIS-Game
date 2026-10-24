from pathlib import Path
from PIL import Image
import json,struct,io
R=Path(__file__).resolve().parents[1];folder=R/'public/assets/environment/metropolis';raw=(folder/'metropolis-street-kit.glb').read_bytes();length=struct.unpack_from('<I',raw,12)[0];d=json.loads(raw[20:20+length]);data=raw[28+length:];out=folder/'textures';out.mkdir(exist_ok=True);slots={}
for index,im in enumerate(d.get('images',[])):
 view=d['bufferViews'][im['bufferView']];pixels=Image.open(io.BytesIO(data[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']])).convert('RGBA');pixels.thumbnail((512,512),Image.Resampling.LANCZOS);stem=f'street-{index}';pixels.save(out/(stem+'.webp'),quality=94);mips=[];first=None;current=pixels
 while True:
  stream=io.BytesIO();current.save(stream,format='DDS',pixel_format='DXT5');encoded=stream.getvalue();first=first or bytearray(encoded[:128]);mips.append(encoded[128:])
  if current.size==(1,1):break
  current=current.resize((max(1,current.width//2),max(1,current.height//2)),Image.Resampling.LANCZOS)
 struct.pack_into('<I',first,8,struct.unpack_from('<I',first,8)[0]|0x20000);struct.pack_into('<I',first,28,len(mips));struct.pack_into('<I',first,108,0x401008);(out/(stem+'.dds')).write_bytes(first+b''.join(mips));slots[index]={'url':'/assets/environment/metropolis/textures/'+stem}
manifest={}
for mat in d['materials']:
 mapping={};pbr=mat.get('pbrMetallicRoughness',{})
 for target,item in [('map',pbr.get('baseColorTexture')),('roughnessMap',pbr.get('metallicRoughnessTexture')),('metalnessMap',pbr.get('metallicRoughnessTexture')),('normalMap',mat.get('normalTexture')),('aoMap',mat.get('occlusionTexture')),('emissiveMap',mat.get('emissiveTexture'))]:
  if item:mapping[target]=slots[d['textures'][item['index']]['source']]
 if mapping:manifest[mat['name']]=mapping
(folder/'street-texture-manifest.json').write_text(json.dumps(manifest,indent=2));print('Native BC3 street maps',len(slots),'images',len(manifest),'materials')
