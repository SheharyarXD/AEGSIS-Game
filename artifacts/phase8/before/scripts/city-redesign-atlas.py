"""Pack Blender source-view bakes into one BC3 atlas with a WebP fallback."""
from PIL import Image
from pathlib import Path
import json,struct,io,math
R=Path(__file__).resolve().parents[1];specs=json.loads((R/'art/environment/city-redesign/used-families.json').read_text());out=R/'public/assets/environment/metropolis';out.mkdir(parents=True,exist_ok=True)
height=math.ceil(len(specs)*5/16)*256;atlas=Image.new('RGBA',(4096,height));meta={}
for i,f in enumerate(specs):
 views=json.loads((R/'art/environment/city-redesign/bakes'/(f['id']+'.json')).read_text());meta[f['id']]=[]
 for j,v in enumerate(views):
  n=i*5+j;x=n%16*256;y=n//16*256
  atlas.paste(Image.open(R/'art/environment/city-redesign/bakes'/f'{f["id"]}-{j}.png').convert('RGBA'),(x,y))
  pad_x=(1-v['width']/v['ortho'])/2;pad_y=(1-v['height']/v['ortho'])/2
  meta[f['id']].append(dict(side=j,uv=[(x+pad_x*256)/4096,1-(y+(1-pad_y)*256)/height,(x+(1-pad_x)*256)/4096,1-(y+pad_y*256)/height]))
atlas.save(out/'source-facades.png');atlas.save(out/'source-facades.webp',quality=94)
mips=[];first=None;current=atlas
while True:
 stream=io.BytesIO();current.save(stream,format='DDS',pixel_format='DXT5');encoded=stream.getvalue();first=first or bytearray(encoded[:128]);mips.append(encoded[128:])
 if current.size==(1,1):break
 current=current.resize((max(1,current.width//2),max(1,current.height//2)),Image.Resampling.LANCZOS)
struct.pack_into('<I',first,8,struct.unpack_from('<I',first,8)[0]|0x20000);struct.pack_into('<I',first,28,len(mips));struct.pack_into('<I',first,108,0x401008);(out/'source-facades.dds').write_bytes(first+b''.join(mips))
(out/'atlas-views.json').write_text(json.dumps(meta,indent=2));print('Authored-source atlas',len(specs),'families; BC3 bytes',sum(map(len,mips)))
