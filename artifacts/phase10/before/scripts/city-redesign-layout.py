"""Save street-front parcels using complete licensed source buildings, never random primitives."""
import json, math
from pathlib import Path
R=Path(__file__).resolve().parents[1]
p=json.loads((R/'art/environment/city-redesign/master-plan.json').read_text())
catalog=json.loads((R/'public/assets/environment/premium/city/runtime-components.json').read_text())
families={f['id']:f for f in catalog['families']}
pools={
 'financial':['city_modernoffice_4','city_modernoffice_1_b','city_modernoffice_5_b','city_flatiron_1','city_artdeco_1','city_classicoffice_1'],
 'commercial':['city_brownstoneoffice_1','city_brownstoneoffice_2','city_classicoffice_1','city_modernoffice_1_b','city_artdeco_1','city_residential_2','city_meridian_arcade','city_brutal_1'],
 'residential':['city_brownstoneoffice_1','city_brownstoneoffice_2','city_classicoffice_1','city_residential_2','city_meridian_arcade','city_residential_4','city_publicbuilding_1','city_artdeco_1'],
 'gothic':['city_brownstoneoffice_1','city_classicoffice_1','city_artdeco_1','city_meridian_arcade','city_publicbuilding_1'],
 'industrial':['city_iron_warehouse_1','city_iron_warehouse_3','city_iron_warehouse_4','city_iron_warehouse_5','city_iron_genericbuilding_4','city_iron_hangar_2','city_iron_duplex_1']}
for d in p['districts']:d['families']=pools[d['id']]
(R/'art/environment/city-redesign/master-plan.json').write_text(json.dumps(p,indent=2))
def district(x,z):
 if x>420 and z>180:return 'industrial'
 if x<-300 and z<-160:return 'gothic'
 if x<-300:return 'residential'
 if z<-176:return 'financial'
 return 'commercial'
width=lambda v,axis:p['avenueWidth'] if v in p['avenue'+axis] else p['secondaryWidth']
side={d['id']:d['sidewalkWidth'] for d in p['districts']}
buildings=[];blocks=[];next_id=10000
def add(f,x,z,s=1,angle=0,id=None,landmark=None,damage='section',block=None,category=None):
 global next_id
 if id is None:id=next_id;next_id+=1
 a=families[f];d=district(x,z)
 b=dict(id=id,x=round(x,3),z=round(z,3),w=round(a['width']*s,4),d=round(a['depth']*s,4),h=round(a['height']*s,4),assetHeight=a['height'],family=f,style=a['style'],district=d,angle=angle,roof='roofkit',damageClass=damage,category=category or ('industrial' if d=='industrial' else 'midrise'),block=block)
 if landmark:b['landmark']=landmark
 buildings.append(b);return b
# Keep the existing character deployment, court and mission geometry exactly where Claude integrated it.
old=json.loads((R/'artifacts/city-redesign/before/city-layout.json').read_text())['buildings']
for b in old:
 if b.get('deployment'):buildings.append({**b,'damageClass':'section','category':'midrise'})
landmarks={
 (9,4):('aer_glass',235,1.12,'Crown Helix','full'),
 (10,2):('city_singapore',9002,1.72,'Northlight Exchange','major'),
 (8,2):('aer_glass',9003,1.34,'Aeon Needle','major'),
 (3,3):('aer_gothic',211,1.18,'Saint Vesper','full'),
 (1,1):('aer_gothic',9011,.74,'Vesper Archive','major'),
 (4,1):('city_citadel',9012,1.55,'Obsidian Civic Hall','major'),
 (2,9):('city_citadel',9013,1.55,'Meridian Citadel','major'),
 (9,5):('city_meridian_arcade',287,1.15,'Prism Exchange','full'),
 (13,11):('city_iron_hangar_2',9014,1.0,'Ironwake Works','full')}
for j,(z0,z1) in enumerate(zip(p['roadZ'],p['roadZ'][1:])):
 for i,(x0,x1) in enumerate(zip(p['roadX'],p['roadX'][1:])):
  cx,cz=(x0+x1)/2,(z0+z1)/2
  if x0<112 and x1>-112 and z0<100 and z1>-160:continue
  # Reserve existing harbor bridge/ramp, cranes and freight court.
  d=district(cx,cz);sw=side[d]
  left=x0+width(x0,'X')/2+sw+1.2;right=min(876,x1-width(x1,'X')/2-sw-1.2)
  front=z0+width(z0,'Z')/2+sw+1.2;back=z1-width(z1,'Z')/2-sw-1.2
  bw,bd=right-left,back-front
  if bw<13:continue
  key=f'{i}:{j}';block=dict(id=key,district=d,bounds=[left,front,right,back],alleyWidth=6,buildings=[])
  if (i,j) in landmarks:
   f,id,s,name,damage=landmarks[(i,j)];a=families[f];s=min(s,bw/a['width'],bd/a['depth'])
   b=add(f,cx,cz,s,0,id,name,damage,key,'landmark');block['buildings'].append(b['id'])
   if f=='aer_gothic':
    # A civic ensemble gives the slender authored spire an intentional urban base.
    for sign in [-1,1]:
     shoulder=add('city_citadel',cx+sign*min(30,bw*.34),cz+17,.88,math.pi if sign<0 else 0,block=key,category='civic');block['buildings'].append(shoulder['id'])
   # Lands around a signature structure are deliberately its entrance/service plaza.
   block['plaza']=True
  else:
   half=(bd-6)/2
   for row in range(2):
    x=left;slot=0
    while right-x>13:
     order=pools[d];f=order[(i*3+j*5+row*2+slot)%len(order)];a=families[f]
     rotation=math.pi if row==0 else 0
     # Change corners and footprints without stretching an authored facade.
     desired=1.25 if d=='financial' and abs(cx-260)<350 else 1.0 if d!='industrial' else 1.15
     s=min(desired,half/a['depth'],(right-x)/a['width'])
     if s<.66:
      fitting=[families[n] for n in order if families[n]['width']*.7<=right-x and families[n]['depth']*.7<=half]
      if not fitting:break
      a=min(fitting,key=lambda a:abs(a['width']-min(36,right-x)));f=a['id'];s=min(desired,half/a['depth'],(right-x)/a['width'])
     w=a['width']*s;dep=a['depth']*s
     z=front+dep/2 if row==0 else back-dep/2
     b=add(f,x+w/2,z,s,rotation,block=key,category='corner' if slot==0 else 'standard-tower' if d=='financial' else 'midrise')
     block['buildings'].append(b['id']);x+=w+1.3;slot+=1
  blocks.append(block)
# Exact infrastructure reservations replace the old empty, whole-block harbor exclusion.
def overlaps(b,rect):
 return b['x']+b['w']/2>rect[0] and b['x']-b['w']/2<rect[2] and b['z']+b['d']/2>rect[1] and b['z']-b['d']/2<rect[3]
reservations=[(440,490,579,538),(768,608,797,671),(768,728,797,786),(741,653,770,687)]+[(x-6,506,x+6,518) for x in [576,704,832,960]]
buildings=[b for b in buildings if b.get('deployment') or not any(overlaps(b,r) for r in reservations)]
valid={b['id'] for b in buildings}
for block in blocks:block['buildings']=[id for id in block['buildings'] if id in valid]
# Collision/gameplay district test points remain on public streets.
data=dict(worldSize=[2048,2048],version=2,buildings=buildings,blocks=blocks,roads=p['roadX'],source='Saved street-front parcels and complete licensed architectural families')
(R/'art/environment/city-redesign/city-layout.json').write_text(json.dumps(data,indent=2))
(R/'src/world/FixedCityLayout.ts').write_text('// Authored metropolis parcels; regenerate with scripts/city-redesign-layout.py.\nexport const FIXED_CITY_BUILDINGS = '+json.dumps(buildings,separators=(',',':'))+';\n')
(R/'src/world/CityPlan.ts').write_text('// Saved avenue and neighborhood design.\nexport const CITY_PLAN = '+json.dumps(p,separators=(',',':'))+' as const;\n')
used=sorted({b['family'] for b in buildings});(R/'art/environment/city-redesign/used-families.json').write_text(json.dumps([families[n] for n in used],indent=2))
(R/'src/world/DestructibleFamilies.ts').write_text('export const DESTRUCTIBLE_FAMILIES = '+json.dumps([families[n] for n in used],separators=(',',':'))+' as const;\n')
(R/'public/assets/environment/metropolis/runtime-components.json').write_text(json.dumps(dict(families=[families[n] for n in used],components=[c for c in catalog['components'] if c['family'] in used]),separators=(',',':')))
# Reviewable plan drawing, using the same source footprints and streets as runtime.
svg=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1050 -1050 2100 2100"><rect x="-1050" y="-1050" width="2100" height="2100" fill="#13242a"/>']
colors=dict(financial='#79bdd1',commercial='#bcad86',residential='#a39aaa',gothic='#7e8bb0',industrial='#bd8559')
for x in p['roadX']:svg.append(f'<path d="M{x} -1000V1000" stroke="#34464b" stroke-width="{width(x,"X")}"/>')
for z in p['roadZ']:svg.append(f'<path d="M-1000 {z}H940" stroke="#34464b" stroke-width="{width(z,"Z")}"/>')
for b in buildings:
 svg.append(f'<rect x="{b["x"]-b["w"]/2}" y="{b["z"]-b["d"]/2}" width="{b["w"]}" height="{b["d"]}" fill="{colors[b["district"]]}" opacity=".85"><title>{b.get("landmark",b["family"])} / {b["h"]:.0f}m</title></rect>')
svg.append('</svg>');(R/'art/environment/city-redesign/master-plan.svg').write_text(''.join(svg))
print('Saved',len(buildings),'buildings,',len(blocks),'blocks,',len(used),'source families; footprint coverage',round(sum(b['w']*b['d'] for b in buildings)/2048**2*100,2),'%')
