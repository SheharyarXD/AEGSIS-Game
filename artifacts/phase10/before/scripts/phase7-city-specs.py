"""Select complete supplied models for district families, retaining their native proportions."""
import json,struct,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];inspection=json.loads((ROOT/'artifacts/phase7/provided/geometry-inspection.json').read_text());specs=[]
def read(file):
 f=open(ROOT/'art/external'/file,'rb');f.read(12);length,typ=struct.unpack('<II',f.read(8));return json.loads(f.read(length))
def add(file,selector,district,style,prefix,unit=1):
 entries=[e for e in inspection[file] if e['name'].startswith(selector)];
 if not entries:return
 low=[min(e['min'][i] for e in entries) for i in range(3)];high=[max(e['max'][i] for e in entries) for i in range(3)];height=max(4,math.ceil((high[2]-low[2])*unit/4)*4)
 specs.append({'id':'city_'+selector.lower().replace('downtown_','').replace('industrial_','iron_'),'source':file,'selector':selector,'name':selector.replace('_',' '),'district':district,'style':style,'materialPrefix':prefix,'height':height,'orientation':0,'unitScale':unit})
file='downtown_buildings_set_-_low_poly_model.glb'
nodes=read(file)['nodes'];roots=next(n for n in nodes if n.get('name')=='RootNode')['children']
for n in roots:
 selector=nodes[n]['name'];district='residential' if 'Residential' in selector else 'commercial' if any(t in selector for t in ['Brownstone','Mall','Public','ArtDeco','Classic']) else 'financial';style='residential' if district=='residential' else 'deco' if district=='commercial' else 'financial';add(file,selector,district,style,'downtown')
file='industrial_buildings_set_-_low_poly_models.glb';names=['Industrial_Building_1','Industrial_Building_10','Industrial_Duplex_1','Industrial_FactoryPlant_1','Industrial_FactoryPlant_2','Industrial_GenericBuilding_2','Industrial_GenericBuilding_3','Industrial_GenericBuilding_4','Industrial_Hangar_2','Industrial_LogisticTerminal_1','Industrial_Warehouse_1','Industrial_Warehouse_3','Industrial_Warehouse_4','Industrial_Warehouse_5','Industrial_WarehouseSmall_4','Industrial_Powerplant_1']
for selector in names:add(file,selector,'industrial','industrial','ironwake')
# Complete Aria Gothic models are separated spatially in the supplied centimetre-scale pack.
for i,(left,right) in enumerate([(1493,2507),(3373,4627),(5283,6717),(7283,8717),(9419,10581),(13304,16114),(19304,22114)]):
 entries=[e for e in inspection['gothic_building_for_aria_pack_1.0.glb'] if left<(e['min'][0]+e['max'][0])/2<right];height=max(4,math.ceil((max(e['max'][2] for e in entries)-min(e['min'][2] for e in entries))*.01/4)*4)
 specs.append({'id':f'city_vesper_{i+1}','source':'gothic_building_for_aria_pack_1.0.glb','xRange':[left,right],'name':f'Vesper Aria architecture {i+1}','district':'gothic','style':'gothic','materialPrefix':'aria','height':height,'orientation':0})
specs.append({'id':'city_citadel','source':'art_deco_citadel.glb','name':'Crown Art Deco Citadel','district':'financial','style':'deco','materialPrefix':'citadel','height':52,'orientation':0})
specs.append({'id':'city_singapore','source':'singapore_office_skyscraper_free.glb','name':'Crown Singapore Exchange','district':'financial','style':'financial','materialPrefix':'singapore','height':108,'orientation':0})
(ROOT/'art/environment/phase7/city-specs.json').write_text(json.dumps(specs,indent=2));print('Selected',len(specs),'complete architecture families');print([(s['id'],s['height']) for s in specs])
