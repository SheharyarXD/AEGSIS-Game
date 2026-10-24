"""Original Phase8 urban sockets, damaged interiors and six material fragment families.
No external source models are modified. All modules retain UVs, normals and material names.
"""
import bpy,math
from pathlib import Path
R=Path(__file__).resolve().parents[3];bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name,c,metal=0,emit=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;s=m.node_tree.nodes.get('Principled BSDF');s.inputs['Base Color'].default_value=(*c,1);s.inputs['Metallic'].default_value=metal;s.inputs['Roughness'].default_value=.72
 if emit:s.inputs['Emission Color'].default_value=(*c,1);s.inputs['Emission Strength'].default_value=emit
 return m
steel=mat('titan_steel',(.10,.13,.14),.7);stone=mat('titan_stone',(.33,.31,.27));concrete=mat('titan_concrete',(.43,.42,.38));brick=mat('titan_brick',(.30,.15,.10));glass=mat('titan_glass',(.19,.31,.34),.55);warm=mat('titan_lamp_glow',(.96,.63,.29),0,2);dark=mat('titan_interior',(.055,.065,.07));wood=mat('titan_door',(.13,.12,.09));insulation=mat('titan_insulation',(.44,.40,.22))
def box(p,d,m,bevel=.018):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.dimensions=d;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
 if bevel:
  mod=o.modifiers.new('Authored edge profile','BEVEL');mod.width=bevel;mod.segments=2;bpy.ops.object.modifier_apply(modifier=mod.name)
 return o
def rod(p,r,h,m,n=10):
 bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=r,depth=h,location=p);o=bpy.context.object;o.data.materials.append(m);return o
def mesh(name,vertices,faces,m):
 g=bpy.data.meshes.new(name);g.from_pydata(vertices,[],faces);g.materials.append(m);o=bpy.data.objects.new(name,g);bpy.context.collection.objects.link(o);return o
def module(key,fn):
 before=set(bpy.data.objects);fn()
 for o in set(bpy.data.objects)-before:o.name=key+'__'+o.name;o['aegisKey']=key;o['author']='AEGIS original, 2026-10-16'
def frame():
 for x in [-2.10,2.10]:
  box((x,0,1.75),(.22,.34,3.5),steel);box((x,.05,.60),(.36,.42,.95),concrete)
  for z in [.35,1.,2.6]:box((x,0,z),(.42,.4,.12),steel)
 box((0,0,3.5),(4.4,.38,.18),steel);box((0,.05,.05),(4.25,1.1,.10),concrete)
 for side in [-1,1]:
  for i in range(4):
   x=side*(1.82+i*.08);box((x,.13,2.85+i*.06),(.16,.28,.30+i*.04),concrete)
  for i in range(3):rod((side*(1.8+i*.08),.18,2.9),.014,.60+i*.12,steel,6)
 o=rod((.55,.10,3.10),.012,.67,steel,6);o.rotation_euler.y=.22
module('titan_breach_frame',frame)
def portal():
 for x in [-1.3,1.3]:box((x,0,1.7),(.22,.3,3.4),stone)
 box((0,0,3.4),(2.86,.36,.25),stone);box((0,.06,1.55),(2.34,.055,3.02),dark)
 for x in [-.58,.58]:
  box((x,-.035,1.55),(1.10,.06,2.9),glass);rod((x,-.10,1.5),.025,.45,steel,8)
 box((0,-.16,3.15),(2.3,.20,.08),warm)
module('titan_lobby_portal',portal)
def stoop():
 for i in range(3):box((0,i*.28,.03+i*.03),(2.7,1.8-i*.56,.06+i*.06),stone)
 for x in [-1.4,1.4]:
  for y in [-.65,0,.65]:rod((x,y,.49),.025,.9,steel)
  box((x,0,.94),(.045,1.7,.045),steel)
module('titan_stoop',stoop)
def grate():
 for x in [-.78,.78]:box((x,0,.016),(.055,1.22,.03),steel,.005)
 for y in [-.59,.59]:box((0,y,.016),(1.55,.055,.03),steel,.005)
 for i in range(15):box((-.7+i*.1,0,.012),(.028,1.16,.025),steel,.003)
module('titan_basement_grate',grate)
def rack():
 for x in [-.52,.52]:
  for y in [-.18,.18]:rod((x,y,.40),.025,.80,steel)
  box((x,0,.81),(.05,.42,.05),steel)
module('titan_bike_rack',rack)
def wall():
 for i in range(4):
  for j in range(4):box((-.9+j*.60+(i%2)*.06,0,.16+i*.30),(.58,.36,.28),stone,.016)
 box((0,0,1.3),(2.48,.48,.15),stone)
 for x in [-1.16,1.16]:box((x,0,.76),(.3,.52,1.52),stone);box((x,0,1.56),(.4,.60,.12),stone)
module('titan_courtyard_wall',wall)
def gate():
 for x in [-1.95,1.95]:box((x,0,1.9),(.44,.60,3.8),stone)
 for side in [-1,1]:
  for i in range(7):
   x=side*(1.75-i*.25);z=3.4+math.sin((i+1)/8*math.pi/2)*.9;o=box((x,0,z),(.32,.64,.28),stone);o.rotation_euler.y=side*(i/7)*.3
module('titan_courtyard_gate',gate)
def lamp():
 rod((0,0,.1),.21,.2,steel);rod((0,0,1.9),.055,3.7,steel);rod((0,0,.45),.12,.65,steel)
 for i in range(4):
  o=box((0,-.16*i,3.7+.10*i),(.055,.20,.055),steel);o.rotation_euler.x=-.35
 box((0,-.58,3.94),(.28,.28,.38),warm)
 for x in [-.15,.15]:
  for y in [-.73,-.43]:rod((x,y,3.94),.018,.45,steel,6)
 box((0,-.58,4.2),(.40,.40,.09),steel);box((0,-.58,3.68),(.34,.34,.07),steel)
module('titan_historic_lamp',lamp)
def fence():
 for x in [-1.1,1.1]:rod((x,0,.95),.04,1.9,steel);box((x,0,.07),(.20,.20,.14),stone)
 for z in [.35,1.35]:box((0,0,z),(2.2,.035,.04),steel)
 for i in range(13):rod((-1+i/6,0,.95),.014,1.6,steel,6)
module('titan_railing',fence)
def fragment(kind,m):
 if kind=='glass':
  mesh('Irregular thin glass shard',[(-.48,-.04,-.45),(.51,-.04,-.31),(.16,-.04,.49),(-.48,.04,-.45),(.51,.04,-.31),(.16,.04,.49)],[(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)],m);return
 if kind=='steel':
  for i in range(3):
   for z in [-.12,.12]:
    o=box((i*.22-.22,0,z),(.28,.32,.035),steel,.008);o.rotation_euler.y=i*.23
   o=box((i*.22-.22,0,0),(.28,.035,.24),steel,.008);o.rotation_euler.y=i*.23
  return
 # Closed irregular prefractured wedge, with repeatable asymmetric break planes.
 v=[(-.52,-.42,-.35),(.44,-.51,-.38),(.53,.35,-.31),(-.42,.51,-.28),(-.44,-.38,.34),(.35,-.39,.29),(.42,.31,.37),(-.33,.41,.31)];f=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
 if kind=='composite':v=[(x,y*.15,z) for x,y,z in v]
 mesh(kind,v,f,m)
 if kind=='steel':
  for i in range(3):o=box((i*.2-.2,0,i*.14),(.28,.07,.07),steel,.008);o.rotation_euler.y=i*.22
 if kind=='concrete':
  for x in [-.18,.18]:o=rod((x,0,.48),.018,.42,steel,6);o.rotation_euler.x=.25
 if kind=='composite':box((0,0,.15),(.6,.6,.06),insulation)
for kind,m in [('stone',stone),('glass',glass),('concrete',concrete),('brick',brick),('steel',steel),('composite',dark)]:module('titan_fragment_'+kind,lambda k=kind,mat=m:fragment(k,mat))
for o in bpy.context.scene.objects:
 if o.type=='MESH':
  bpy.context.view_layer.objects.active=o;o.select_set(True)
  if not o.data.uv_layers:bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project();bpy.ops.object.mode_set(mode='OBJECT')
  o.select_set(False)
bpy.ops.wm.save_as_mainfile(filepath=str(R/'art/environment/phase8/titan-urban-and-fracture.blend'))
bpy.ops.export_scene.gltf(filepath=str(R/'public/assets/environment/metropolis/phase8-titan-kit.glb'),export_format='GLB',export_extras=True,export_normals=True,export_texcoords=True)
print('Exported original Titan modules',len(bpy.context.scene.objects))
