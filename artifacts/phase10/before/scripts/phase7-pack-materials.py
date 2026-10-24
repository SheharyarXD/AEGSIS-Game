"""Shared source PBR atlas, WebP fallback and native BC3 mip chain for S3TC GPUs."""
from pathlib import Path
from PIL import Image
import io,struct,json
root=Path(__file__).resolve().parents[1];source=root/'art/environment/phase7/materials';out=root/'public/assets/environment/premium';out.mkdir(parents=True,exist_ok=True)
ids=['stone_wall_03','old_stone_wall_02','brick_wall_006','concrete_pavement','metal_plate','rusty_metal_02']
report=[]
for channel in ['color','normal','orm']:
 atlas=Image.new('RGB',(2048,1024),(128,128,255) if channel=='normal' else (255,255,255))
 for n,name in enumerate(ids):
  img=Image.open(source/name/('rough.jpg' if channel=='orm' else channel+'.jpg')).resize((512,512),Image.Resampling.LANCZOS).convert('RGB')
  if channel=='orm':
   rough=img.convert('L');img=Image.merge('RGB',(Image.new('L',img.size,255),rough,Image.new('L',img.size,255)))
  atlas.paste(img,((n%4)*512,(n//4)*512))
 atlas.save(out/f'pbr-{channel}.webp',quality=94)
 levels=[];current=atlas.convert('RGBA');header=None
 while True:
  data=io.BytesIO();current.save(data,format='DDS',pixel_format='DXT5');raw=data.getvalue();header=header or bytearray(raw[:128]);levels.append(raw[128:])
  if current.size==(1,1):break
  current=current.resize((max(1,current.width//2),max(1,current.height//2)),Image.Resampling.LANCZOS)
 struct.pack_into('<I',header,8,struct.unpack_from('<I',header,8)[0]|0x20000);struct.pack_into('<I',header,28,len(levels));struct.pack_into('<I',header,108,0x401008)
 (out/f'pbr-{channel}.dds').write_bytes(header+b''.join(levels));report.append({'channel':channel,'dimensions':atlas.size,'slots':ids,'mips':len(levels),'compressedBytes':sum(map(len,levels))})
(out/'material-atlas.json').write_text(json.dumps(report,indent=2));print(report)
