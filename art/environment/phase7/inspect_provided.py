import bpy,json,math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3];out=ROOT/'artifacts/phase7/provided';out.mkdir(exist_ok=True);report={}
for source in sorted((ROOT/'art/external').glob('*.glb')):
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(source));bpy.context.view_layer.update();entries=[]
 for obj in bpy.context.scene.objects:
  if obj.type!='MESH':continue
  bounds=[obj.matrix_world@Vector(v) for v in obj.bound_box];entries.append({'name':obj.name,'parent':obj.parent.name if obj.parent else None,'vertices':len(obj.data.vertices),'triangles':sum(len(p.vertices)-2 for p in obj.data.polygons),'min':[min(v[i] for v in bounds) for i in range(3)],'max':[max(v[i] for v in bounds) for i in range(3)],'materials':[m.name for m in obj.data.materials if m],'uvLayers':list(obj.data.uv_layers.keys())})
 report[source.name]=entries;(out/'geometry-inspection.json').write_text(json.dumps(report,indent=2));print('INSPECTED',source.name,len(entries),flush=True)
 if source.name not in ['singapore_office_skyscraper_free.glb','gothic_building_for_aria_pack_1.0.glb','art_deco_citadel.glb','gothic_architectural_structures.glb','free_london_skyscraper.glb']:continue
 points=[Vector(e[k]) for e in entries for k in ['min','max']];low=Vector([min(v[i] for v in points) for i in range(3)]);high=Vector([max(v[i] for v in points) for i in range(3)]);center=(high+low)/2;r=max(high-low)
 scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE_NEXT';scene.render.resolution_x=1000;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.world=bpy.data.worlds.new('Neutral asset inspection sky');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.20,.25,.32,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.7
 cam=bpy.data.objects.new('Inspection camera',bpy.data.cameras.new('Inspection camera'));scene.collection.objects.link(cam);cam.location=center+Vector((r*1.18,-r*1.65,r*.75));cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=r*1.35;scene.camera=cam
 light=bpy.data.objects.new('Inspection sunlight',bpy.data.lights.new('Inspection sunlight','SUN'));scene.collection.objects.link(light);light.data.energy=2.0;light.rotation_euler=(.5,-.4,-.5)
 scene.render.filepath=str(out/(source.stem+'.png'));bpy.ops.render.render(write_still=True)
print('PROVIDED INSPECTION COMPLETE',len(report))
