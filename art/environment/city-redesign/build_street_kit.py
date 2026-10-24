"""Blender street kit: licensed PBR props plus authored drains, curbs, ramps and signal furniture."""
import bpy,math,json
from pathlib import Path
from mathutils import Vector,Matrix
R=Path(__file__).resolve().parents[3];out=R/'public/assets/environment/metropolis';out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(R/'art/external/pbr_street_props_pack_game_ready.glb'))
source=[o for o in bpy.context.scene.objects if o.type=='MESH'];selected=[]
groups={'urban_bin':['Object_4','Object_6','Object_8','Object_10'],'urban_bollard':['Object_44'],'urban_hydrant':['Object_108'],'urban_mailbox':['Object_114'],'urban_barrier':['Object_110'],'urban_cone':['Object_96'],'urban_lamp':['Object_112'],'urban_bench':['Object_76','Object_78'],'urban_bag':['Object_66'],'urban_bin_round':['Object_84']}
for key,names in groups.items():
 objs=[o for o in source if o.name in names];points=[o.matrix_world@Vector(v) for o in objs for v in o.bound_box];lo=Vector([min(v[i] for v in points) for i in range(3)]);hi=Vector([max(v[i] for v in points) for i in range(3)]);center=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))
 rotation=Matrix.Rotation(math.pi/2,4,'Z') if key in ['urban_bench','urban_barrier'] else Matrix.Identity(4)
 for obj in objs:
  obj.data=obj.data.copy();obj.data.transform(rotation@Matrix.Translation(-center)@obj.matrix_world);obj.parent=None;obj.matrix_world=Matrix.Identity(4);obj.name=key+'__source';obj['aegisKey']=key;obj['source']='PBR Street Props Pack / MadeByYeshe / CC BY 4.0';selected.append(obj)
for obj in list(bpy.data.objects):
 if obj not in selected:bpy.data.objects.remove(obj,do_unlink=True)
for img in bpy.data.images:
 if img.size[0] and max(img.size)>1024:img.scale(round(img.size[0]*1024/max(img.size)),round(img.size[1]*1024/max(img.size)))
 if img.size[0]:img.pack()
def material(name,color,metal=0,rough=.75):
 m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(*color,1);n.inputs['Metallic'].default_value=metal;n.inputs['Roughness'].default_value=rough;return m
concrete=material('urban_concrete',(.46,.48,.49));metal=material('urban_metal',(.075,.092,.10),.65,.42);paint=material('urban_signal',(.20,.23,.22),.3,.6);yellow=material('urban_safety',(.79,.55,.08),.1,.65)
def box(name,p,size,mat,bevel=.015):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat)
 if bevel:
  mod=o.modifiers.new('Authored edge chamfer','BEVEL');mod.width=bevel;mod.segments=1;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
 return o
def cylinder(name,p,r,d,mat,verts=12):
 bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r,depth=d,location=p);o=bpy.context.object;o.name=name;o.data.materials.append(mat);return o
def module(key,objects):
 for o in objects:o['aegisKey']=key;o.name=key+'__authored';o['source']='AEGIS original Blender urban furniture'
 return objects
module('urban_curb',[box('curb',(0,0,.09),(2,.28,.18),concrete,.018)])
module('urban_slab',[box('slab',(0,0,-.025),(1.99,1.99,.05),concrete,.006)])
o=box('ramp',(0,0,.065),(2,1.7,.13),concrete,.0)
for v in o.data.vertices:v.co.z=-.055 if v.co.y<0 else .065
module('urban_ramp',[o])
module('urban_drain',[box('drain',(0,0,.015),(.72,.38,.03),metal,.01)]+[box('grate',(n*.08,0,.033),(.025,.34,.018),concrete,0) for n in range(-4,5)])
module('urban_manhole',[cylinder('manhole',(0,0,.012),.43,.025,metal,24)]+[box('cover ribs',(0,n*.1,.03),(.66,.018,.012),concrete,0) for n in range(-3,4)])
module('urban_treepit',[box('frame',(0,s*.84,.016),(1.8,.08,.032),metal,0) for s in [-1,1]]+[box('frame',(s*.84,0,.016),(.08,1.8,.032),metal,0) for s in [-1,1]]+[box('bars',(n*.12,0,.018),(.022,1.7,.032),metal,0) for n in range(-6,7)])
module('urban_signal',[cylinder('pole',(0,0,2.4),.075,4.8,metal)]+[box('lights',(0,0,4.5),(.30,.28,.95),paint,.025)]+[cylinder('lenses',(0,-.153,4.5+n*.27),.10,.035,mat,10) for n,mat in [(-1,yellow),(0,paint),(1,yellow)]])
module('urban_meter',[cylinder('meter pole',(0,0,.62),.045,1.24,metal),box('meter head',(0,0,1.31),(.23,.20,.28),paint,.035)])
module('urban_utility',[box('cabinet',(0,0,.55),(.8,.42,1.1),paint,.035)]+[box('vent',(0,-.218,.35+n*.09),(.59,.015,.018),metal,0) for n in range(6)])
module('urban_busstop',[cylinder('post',(s*1.8,0,1.4),.055,2.8,metal) for s in [-1,1]]+[box('canopy',(0,0,2.82),(4.2,1.8,.10),metal,.04),box('route panel',(1.8,0,1.6),(.45,.05,.65),yellow,.015),box('bench',(0,0,.52),(3.1,.42,.09),concrete,.02)])
coat=material('urban_people_coat',(.24,.29,.31),0,.9);skin=material('urban_people_skin',(.48,.32,.23),0,.94);boots=material('urban_people_boots',(.045,.055,.06),0,.8)
people=[box('tailored coat',(0,0,1.06),(.47,.28,.64),coat,.06),box('shoulders',(0,0,1.39),(.50,.29,.13),coat,.04)]
for side in [-1,1]:
 people.extend([box('trouser leg',(side*.12,0,.48),(.16,.20,.68),coat,.025),box('shoe',(side*.12,-.045,.09),(.17,.28,.16),boots,.025),box('sleeve',(side*.30,0,1.16),(.14,.18,.50),coat,.03),box('hand',(side*.30,0,.86),(.10,.11,.14),skin,.025)])
bpy.ops.mesh.primitive_uv_sphere_add(segments=10,ring_count=6,radius=.145,location=(0,0,1.62));head=bpy.context.object;head.scale=(.85,.9,1.12);head.data.materials.append(skin);people.append(head)
people.append(box('hair',(0,.018,1.76),(.24,.23,.09),boots,.03));module('urban_citizen',people)
for o in bpy.context.scene.objects:
 if o.type=='MESH':
  bpy.context.view_layer.objects.active=o;o.select_set(True)
  if not o.data.uv_layers:bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.15192);bpy.ops.object.mode_set(mode='OBJECT')
  o.select_set(False)
bpy.ops.wm.save_as_mainfile(filepath=str(R/'art/environment/city-redesign/metropolis-street-kit.blend'))
bpy.ops.export_scene.gltf(filepath=str(out/'metropolis-street-kit.glb'),export_format='GLB',export_extras=True,export_image_format='JPEG',export_jpeg_quality=90,export_normals=True,export_texcoords=True)
print('EXPORTED licensed and authored street kit',len(bpy.context.scene.objects))
