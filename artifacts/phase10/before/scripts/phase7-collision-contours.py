"""Derive resident convex floor-band proxies from actual intact exterior vertices."""
from pathlib import Path
import json,struct,math
ROOT=Path(__file__).resolve().parents[1];path=ROOT/'public/assets/environment/premium/city/runtime-components.json';catalog=json.loads(path.read_text())
def hull(points):
 points=sorted(set((round(x,5),round(z,5)) for x,z in points))
 def cross(o,a,b):return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
 low=[];high=[]
 for p in points:
  while len(low)>1 and cross(low[-2],low[-1],p)<=0:low.pop()
  low.append(p)
 for p in reversed(points):
  while len(high)>1 and cross(high[-2],high[-1],p)<=0:high.pop()
  high.append(p)
 result=low[:-1]+high[:-1]
 while len(result)>12:
  costs=[abs(cross(result[i-1],p,result[(i+1)%len(result)])) for i,p in enumerate(result)];result.pop(costs.index(min(costs)))
 return result
for family in catalog['families']:
 folder='provided' if family['id'].startswith('aer_') else 'city';raw_path=ROOT/'public/assets/environment/premium'/folder/(family['id']+'-near.glb')
 if not raw_path.exists():raw_path=ROOT/'art/environment/phase7/runtime-source'/folder/(family['id']+'-near.glb')
 raw=raw_path.read_bytes();length,typ=struct.unpack_from('<II',raw,12);d=json.loads(raw[20:20+length]);binary=raw[28+length:];bands={};H=family['height']
 for mesh in d['meshes']:
  for primitive in mesh['primitives']:
   if d['materials'][primitive['material']]['name'].startswith('p_'):continue
   a=d['accessors'][primitive['attributes']['POSITION']];view=d['bufferViews'][a['bufferView']];offset=view.get('byteOffset',0)+a.get('byteOffset',0);stride=view.get('byteStride',12)
   for i in range(a['count']):
    x,y,z=struct.unpack_from('<fff',binary,offset+i*stride);floor=max(0,min(math.ceil(H/4)-1,int(y*H/4)));bands.setdefault(floor,[]).append((x,z))
 family['collisionContours']=[hull(bands.get(i) or bands.get(max(0,i-1)) or [(-.1,-.1),(.1,-.1),(.1,.1),(-.1,.1)]) for i in range(math.ceil(H/4))]
path.write_text(json.dumps(catalog,indent=2));(ROOT/'src/world/DestructibleFamilies.ts').write_text('export const DESTRUCTIBLE_FAMILIES = '+json.dumps(catalog['families'],indent=1)+' as const;\n');print('Actual exterior collision contours',len(catalog['families']))
