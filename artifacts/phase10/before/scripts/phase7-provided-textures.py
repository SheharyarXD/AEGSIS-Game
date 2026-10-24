"""Extract optimized source PBR images once and prepare native BC3 plus exact attribution."""
from pathlib import Path
from PIL import Image
import json,struct,io,sys
ROOT=Path(__file__).resolve().parents[1];namespace=sys.argv[1] if len(sys.argv)>1 else 'provided';folder=ROOT/'public/assets/environment/premium'/namespace;out=folder/'textures';out.mkdir(exist_ok=True);manifest={}
for family in [f['id'] for f in json.loads((folder/'components.json').read_text())['families']]:
 raw_path=folder/(family+'-near.glb')
 if not raw_path.exists():raw_path=ROOT/'art/environment/phase7/runtime-source'/namespace/(family+'-near.glb')
 raw=raw_path.read_bytes();length,typ=struct.unpack_from('<II',raw,12);d=json.loads(raw[20:20+length]);binstart=20+length+8;data=raw[binstart:]
 slots={}
 for index,image in enumerate(d.get('images',[])):
  view=d['bufferViews'][image['bufferView']];pixels=Image.open(io.BytesIO(data[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']])).convert('RGBA');stem=f'{family}-{index}';pixels.save(out/(stem+'.webp'),quality=94)
  mips=[];first=None;current=pixels
  while True:
   stream=io.BytesIO();current.save(stream,format='DDS',pixel_format='DXT5');encoded=stream.getvalue();first=first or bytearray(encoded[:128]);mips.append(encoded[128:])
   if current.size==(1,1):break
   current=current.resize((max(1,current.width//2),max(1,current.height//2)),Image.Resampling.LANCZOS)
  struct.pack_into('<I',first,8,struct.unpack_from('<I',first,8)[0]|0x20000);struct.pack_into('<I',first,28,len(mips));struct.pack_into('<I',first,108,0x401008);(out/(stem+'.dds')).write_bytes(first+b''.join(mips));slots[index]={'url':'/assets/environment/premium/'+namespace+'/textures/'+stem,'width':pixels.width,'height':pixels.height,'compressedBytes':sum(map(len,mips))}
 materials={}
 for mat in d['materials']:
  mapping={};pbr=mat.get('pbrMetallicRoughness',{})
  for target,item in [('map',pbr.get('baseColorTexture')),('roughnessMap',pbr.get('metallicRoughnessTexture')),('metalnessMap',pbr.get('metallicRoughnessTexture')),('normalMap',mat.get('normalTexture')),('aoMap',mat.get('occlusionTexture')),('emissiveMap',mat.get('emissiveTexture'))]:
   if item:mapping[target]=slots[d['textures'][item['index']]['source']]
  materials[mat['name']]=mapping
 manifest[family]={'images':slots,'materials':materials}
(folder/'texture-manifest.json').write_text(json.dumps(manifest,indent=2))
inventory=json.loads((ROOT/'artifacts/phase7/provided-asset-inventory.json').read_text());credits=['AEGIS architectural assets / supplied source provenance','Changes: source selection, metre normalization, UV-preserving damage segmentation, hidden structural additions, LOD reduction, texture compression and city arrangement.','']
for e in inventory:
 if e.get('asset',{}).get('extras'):
  a=e['asset']['extras'];credits += [a['title'],a['author'],a['source'],a['license'],'Supplied by the user in art/external/. License recorded in the GLB metadata.','']
 if e.get('licenseTexts'):credits += [e['file']]+list(e['licenseTexts'].values())
(folder.parent.parent/'ATTRIBUTION.txt').write_text('\n'.join(credits),encoding='utf-8');print('Source textures and attribution prepared')
