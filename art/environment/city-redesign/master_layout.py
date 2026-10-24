"""Reviewable Blender master city using linked instances of the complete licensed source models."""
import bpy,json,math
from pathlib import Path
R=Path(__file__).resolve().parents[3];layout=json.loads((R/'art/environment/city-redesign/city-layout.json').read_text());families={f['id']:f for f in json.loads((R/'art/environment/city-redesign/used-families.json').read_text())};plan=json.loads((R/'art/environment/city-redesign/master-plan.json').read_text())
bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene;scene.name='AEGIS / authored metropolis master layout';collections={}
for id,f in families.items():
 path=R/'art/environment/phase7'/('provided' if id.startswith('aer_') else 'city')/(id+'-source.blend')
 if id=='city_meridian_arcade':path=R/'art/environment/city-redesign/families/city_meridian_arcade-source.blend'
 with bpy.data.libraries.load(str(path),link=True) as (src,dst):dst.objects=src.objects
 collection=bpy.data.collections.new(id+' / complete source')
 for obj in dst.objects:
  if obj and obj.type=='MESH':collection.objects.link(obj)
 collections[id]=collection
for b in layout['buildings']:
 f=families[b['family']];obj=bpy.data.objects.new(b.get('landmark') or str(b['id'])+' / '+b['family'],None);obj.instance_type='COLLECTION';obj.instance_collection=collections[b['family']];obj.location=(b['x'],-b['z'],0);obj.rotation_euler.z=b.get('angle',0);obj.scale=(b['w']/f['width'],b['d']/f['depth'],b['h']/f['height']);obj['buildingId']=b['id'];obj['district']=b['district'];obj['damageClass']=b['damageClass'];obj['source']=f['source'];scene.collection.objects.link(obj)
def mat(name,color):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);return m
asphalt=mat('Saved road hierarchy',(.04,.05,.055));ground=mat('Urban ground',(.12,.14,.15))
bpy.ops.mesh.primitive_plane_add(size=2048);bpy.context.object.name='2048 metre navigable footprint';bpy.context.object.location.z=-.02;bpy.context.object.data.materials.append(ground)
for axis in ['X','Z']:
 for value in plan['road'+axis]:
  if axis=='X' and value>880:continue
  avenue=value in plan['avenue'+axis];bpy.ops.mesh.primitive_plane_add(size=1);o=bpy.context.object;o.name=f'{"Avenue" if avenue else "Secondary street"} {axis}{value}';o.location=(value,0,.012) if axis=='X' else (-65,-value,.012);o.scale=(26 if avenue else 16,2015,1) if axis=='X' else (1890,26 if avenue else 16,1);o.data.materials.append(asphalt)
scene['runtimeLayout']='art/environment/city-redesign/city-layout.json';scene['note']='Linked complete source architecture. The browser uses near/mid meshes and source-view distant LODs, plus the detailed separate street kit. Original source libraries are preserved.'
bpy.ops.wm.save_as_mainfile(filepath=str(R/'art/environment/city-redesign/metropolis-master-layout.blend'));print('Saved master Blender layout',len(layout['buildings']),'complete source instances')
