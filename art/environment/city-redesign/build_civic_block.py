"""Original 8-storey Meridian arcade, composed from the user's CC0 facade/cornice/roof kit."""
import bpy,json,math
from pathlib import Path
from mathutils import Matrix,Vector
R=Path(__file__).resolve().parents[3];folder=R/'art/environment/city-redesign/quaternius/Exports/glTF (Godot)';out=R/'art/environment/city-redesign';bpy.ops.wm.read_factory_settings(use_empty=True);templates={}
for name in ['Brick_Inset_Window','Brick_Plain_3','Trim_FirstFloor_Window_Columns','DoorFrame_Trim','Door_2','Cornice_Trim_Center','Roof_4x4','Stairs_Entrance_Concrete']:
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(folder/(name+'.gltf')));objects=[o for o in set(bpy.data.objects)-before if o.type=='MESH'];templates[name]=[]
 for obj in objects:
  mesh=obj.data.copy();mesh.transform(obj.matrix_world);templates[name].append(mesh)
 for obj in set(bpy.data.objects)-before:bpy.data.objects.remove(obj,do_unlink=True)
def place(name,x,y,z,angle=0,sx=1):
 for mesh in templates[name]:
  o=bpy.data.objects.new('Meridian / '+name,mesh.copy());bpy.context.scene.collection.objects.link(o);o.location=(x,y,z);o.rotation_euler.z=angle;o.scale.x=sx;o['source']='Quaternius Downtown City MegaKit / CC0';return o
for floor in range(8):
 for side in range(4):
  count=6 if side%2==0 else 5
  for bay in range(count):
   along=(bay-(count-1)/2)*4;angle=side*math.pi/2
   x,y=(along,-10) if side==0 else (12,along) if side==1 else (-along,10) if side==2 else (-12,-along)
   if floor==0 and side==0 and bay in [2,3]:
    place('DoorFrame_Trim',x-1,y,0,angle);place('Door_2',x-1,y+.025,0,angle);place('Trim_FirstFloor_Window_Columns',x+1,y,0,angle);place('Stairs_Entrance_Concrete',x-1,y,0,angle)
   else:place('Brick_Inset_Window' if floor else 'Trim_FirstFloor_Window_Columns',x,y,floor*3,angle,1 if floor else 1.85)
   if floor==7:place('Cornice_Trim_Center',x,y,24,angle,2)
for x in range(-10,11,4):
 for y in range(-8,9,4):place('Roof_4x4',x,y,24.8)
# Rooftop service structures use the licensed original architectural pieces as well.
for x in [-4,0,4]:place('Brick_Plain_3',x,0,24.6,0);place('Brick_Plain_3',x,4,24.6,math.pi)
for y in [1,3]:place('Brick_Plain_3',-6,y,24.6,-math.pi/2);place('Brick_Plain_3',6,y,24.6,math.pi/2)
for x in [-4,0,4]:place('Roof_4x4',x,2,27.8)
for image in bpy.data.images:
 if image.size[0]:image.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(out/'meridian-arcade-authored.blend'))
bpy.ops.export_scene.gltf(filepath=str(out/'meridian-arcade-source.glb'),export_format='GLB',export_extras=True,export_image_format='AUTO',export_normals=True,export_texcoords=True)
# Use the already validated UV-preserving section pipeline, scoped to this new family only.
source=(R/'art/environment/phase7/prepare_provided.py').read_text();spec=dict(id='city_meridian_arcade',source='../environment/city-redesign/meridian-arcade-source.glb',name='AEGIS original Meridian Arcade / Quaternius CC0 modular composition',height=28,style='deco',district='residential',materialPrefix='meridian',orientation=0)
start=source.index('SPECS=');end=source.index('\nALL=',start);source=source[:start]+'SPECS='+repr([spec])+source[end:]
source=source.replace('ROOT=Path(__file__).resolve().parent;PROJECT=ROOT.parents[2];','ROOT=Path('+repr(str(R/'art/environment/phase7'))+');PROJECT=ROOT.parents[2];')
source=source.replace("premium/provided'","premium/city'").replace("SOURCE=ROOT/'provided'","SOURCE=PROJECT/'art/environment/city-redesign/families'")
source=source.replace("SOURCE.mkdir(exist_ok=True)","SOURCE.mkdir(parents=True,exist_ok=True)")
catalog=json.loads((R/'public/assets/environment/premium/city/runtime-components.json').read_text());next_id=max(c['id'] for c in catalog['components'])+1
source=source.replace('global_id=0','global_id='+str(next_id)).replace("material.name='src_'+('london_' if spec['id']=='aer_glass' else 'aria_')+name if not name.startswith('p_') else name","material.name='src_meridian_'+name if not name.startswith('p_') else name")
source=source.replace("(OUT/'components.json').write_text","(PROJECT/'art/environment/city-redesign/civic-components.json').write_text")
exec(compile(source,str(out/'civic-UV-sections.py'),'exec'))
