"""Blender renders the real source architecture into a shared, alpha-tested distant atlas."""
import bpy,json,math,sys
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[3];out=R/'art/environment/city-redesign/bakes';out.mkdir(parents=True,exist_ok=True)
specs=json.loads((R/'art/environment/city-redesign/used-families.json').read_text());arguments=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [];top_only='top-only' in arguments;selected=[a for a in arguments if a!='top-only']
if selected:specs=[f for f in specs if f['id'] in selected]
for f in specs:
 path=R/'art/environment/phase7'/('provided' if f['id'].startswith('aer_') else 'city')/(f['id']+'-source.blend')
 if f['id']=='city_meridian_arcade':path=R/'art/environment/city-redesign/families/city_meridian_arcade-source.blend'
 bpy.ops.wm.open_mainfile(filepath=str(path));scene=bpy.context.scene
 for obj in list(scene.objects):
  if obj.type!='MESH':bpy.data.objects.remove(obj,do_unlink=True)
 scene.render.engine='BLENDER_EEVEE_NEXT';scene.render.resolution_x=256;scene.render.resolution_y=256;scene.render.resolution_percentage=100
 scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
 scene.render.image_settings.color_depth='8';scene.render.threads_mode='FIXED';scene.render.threads=6
 scene.view_settings.view_transform='Standard';scene.view_settings.look='Medium High Contrast';scene.view_settings.exposure=0;scene.view_settings.gamma=1
 scene.world=bpy.data.worlds.new('Neutral atlas lighting');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.45,.52,.61,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.8
 # Render with stable neutral light; runtime fog/day/night grade the same model views.
 for pos in [(1,-1,2),(-1,1,1.5)]:
  light=bpy.data.lights.new('Facade bake sun','SUN');light.energy=1.6 if pos[0]>0 else .6;light.angle=.12
  o=bpy.data.objects.new(light.name,light);scene.collection.objects.link(o);o.rotation_euler=(-Vector(pos)).to_track_quat('-Z','Y').to_euler()
 for mat in bpy.data.materials:
  if mat.use_nodes:
   for n in mat.node_tree.nodes:
    if n.type=='BSDF_PRINCIPLED':
     if 'Emission Strength' in n.inputs:n.inputs['Emission Strength'].default_value=.08
 camera=bpy.data.cameras.new('Orthographic source-view bake');obj=bpy.data.objects.new('Atlas camera',camera);scene.collection.objects.link(obj);scene.camera=obj;camera.type='ORTHO';camera.lens=50
 W,H,D=f['width'],f['height'],f['depth'];center=Vector((0,0,H/2));metadata=[]
 for side,delta,ww,hh in [(0,(0,-1,0),W,H),(1,(1,0,0),D,H),(2,(0,1,0),W,H),(3,(-1,0,0),D,H),(4,(0,0,1),W,D)]:
  target=center if side!=4 else Vector((0,0,H/2));obj.location=target+Vector(delta)*max(W,H,D)*3;obj.rotation_euler=(target-obj.location).to_track_quat('-Z','Y').to_euler()
  if side==4:obj.rotation_euler=(0,0,0)
  camera.ortho_scale=max(ww,hh)*1.025;camera.clip_end=max(W,H,D)*10
  scene.render.filepath=str(out/f'{f["id"]}-{side}.png')
  if not top_only or side==4:bpy.ops.render.render(write_still=True)
  metadata.append(dict(side=side,width=ww,height=hh,ortho=camera.ortho_scale))
 (out/(f['id']+'.json')).write_text(json.dumps(metadata));print('BAKED SOURCE',f['id'],flush=True)
