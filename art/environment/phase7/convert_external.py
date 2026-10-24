"""Convert actual CC0 source modules to metre-scale GLB assets; preserve original sources."""
import bpy,json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parent;OUT=ROOT.parents[2]/'public/assets/environment/premium';OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True);records=[];originals=[];exports=[]
selections={'modular_urban_apartments_facade':['door_centered_small_01','window_centered_small_01','cornice01_standard_standard_01'],'modular_factory_facade':['window_centered_medium_03','door_centered_small_01','cornice02_standard_standard_01'],'exterior_aircon_unit':['exterior_aircon_unit'],'modular_fire_escape':None,'street_lamp_02':['street_lamp_02']}
for asset,names in selections.items():
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(ROOT/'external'/asset/(asset+'.gltf')));imported=[o for o in bpy.data.objects if o not in before];meshes=[o for o in imported if o.type=='MESH']
 chosen=[o for o in meshes if names is None or any(o.name==n for n in names)]
 if asset=='street_lamp_02' and not chosen:chosen=meshes[:1]
 if not chosen:raise RuntimeError('No selected source meshes: '+asset)
 for obj in chosen:
  original=obj.copy();original.data=obj.data.copy();bpy.context.collection.objects.link(original);original.hide_render=True;original.hide_set(True);originals.append(original)
  bounds=[obj.matrix_world@Vector(v) for v in obj.bound_box];low=Vector([min(v[i] for v in bounds) for i in range(3)]);high=Vector([max(v[i] for v in bounds) for i in range(3)]);center=Vector(((low.x+high.x)/2,(low.y+high.y)/2,low.z));key='ph_'+{'modular_urban_apartments_facade':'apartment','modular_factory_facade':'factory','exterior_aircon_unit':'aircon','modular_fire_escape':'escape','street_lamp_02':'lamp'}[asset]+'_'+obj.name.replace('modular_fire_escape_','').replace('exterior_aircon_unit','unit').replace('street_lamp_02','bracket')
  for lod,ratio in [('near',.16 if asset in ('exterior_aircon_unit','street_lamp_02') else .7),('mid',.05 if asset in ('exterior_aircon_unit','street_lamp_02') else .28)]:
   clone=obj.copy();clone.data=obj.data.copy();clone.matrix_world=obj.matrix_world.copy();bpy.context.collection.objects.link(clone);bpy.ops.object.select_all(action='DESELECT');clone.select_set(True);bpy.context.view_layer.objects.active=clone;bpy.ops.object.transform_apply(location=False,rotation=True,scale=True);clone.location-=center
   dec=clone.modifiers.new('Runtime silhouette preserving reduction','DECIMATE');dec.ratio=ratio;bpy.ops.object.modifier_apply(modifier=dec.name)
   # Separate source PBR materials, so the runtime importer can batch and retain their UVs.
   for index,material in enumerate(clone.data.materials):
    if material:material.name='ph_'+material.name.removeprefix('ph_')
   clone.name=key+'_'+lod;clone['aegisKey']=clone.name;exports.append(clone);records.append({'key':clone.name,'sourcePack':asset,'sourceMesh':obj.name,'dimensions':list(high-low),'faces':len(clone.data.polygons),'lod':lod})
 for obj in imported:bpy.data.objects.remove(obj,do_unlink=True)
# 512px runtime copies, full downloaded source maps are untouched.
for img in bpy.data.images:
 if img.source=='FILE' and img.size[0]>0:
  if max(img.size)>512:img.scale(512,512)
  img.pack()
bpy.ops.object.select_all(action='DESELECT')
for obj in exports:obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'aegis-cc0-modules.glb'),export_format='GLB',use_selection=True,export_extras=True,export_materials='EXPORT',export_image_format='JPEG',export_jpeg_quality=88,export_yup=True)
bpy.context.scene.name='AEGIS licensed modules and preserved source geometry';bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'aegis-licensed-modules.blend'))
(OUT/'external-modules.json').write_text(json.dumps(records,indent=2));print('EXTERNAL MODULES',len(exports),records)
