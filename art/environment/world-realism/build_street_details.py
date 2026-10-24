"""Original optimized urban detail modules; source geometry, UVs and normals kept in Blender."""
import bpy,math
from pathlib import Path
R=Path(__file__).resolve().parents[3];out=R/'public/assets/environment/metropolis';bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name,c,metal=0,rough=.65,emit=0):
 m=bpy.data.materials.new('realism_'+name);m.use_nodes=True;s=m.node_tree.nodes.get('Principled BSDF');s.inputs['Base Color'].default_value=(*c,1);s.inputs['Metallic'].default_value=metal;s.inputs['Roughness'].default_value=rough
 if emit:s.inputs['Emission Color'].default_value=(*c,1);s.inputs['Emission Strength'].default_value=emit
 return m
metal=mat('iron',(.07,.085,.09),.7);green=mat('service_green',(.075,.13,.105),.3);paper=mat('paper',(.60,.57,.48));fabric=mat('awning',(.105,.16,.17));red=mat('signal_red',(.9,.09,.025),0,.5,2);white=mat('signal_white',(.75,.79,.72),0,.5,1.2);soil=mat('soil',(.10,.085,.065));leaf=mat('foliage',(.12,.20,.095));wood=mat('bark',(.18,.13,.085));warm=mat('lamp_lens',(.95,.70,.39),0,.4,2)
def box(p,d,m,bevel=.025):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.dimensions=d;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
 if bevel:
  b=o.modifiers.new('Rolled edges','BEVEL');b.width=bevel;b.segments=2;bpy.ops.object.modifier_apply(modifier=b.name)
 return o
def cyl(p,r,h,m,n=12):
 bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=r,depth=h,location=p);o=bpy.context.object;o.data.materials.append(m);return o
def module(key,fn):
 before=set(bpy.data.objects);fn()
 for o in set(bpy.data.objects)-before:o['aegisKey']=key;o.name=key+'__authored';o['source']='AEGIS original urban detail / 2026-10-15'
def news():
 box((0,0,.62),(.52,.44,1.12),green);box((0,-.233,.78),(.40,.025,.56),metal,.008);box((0,-.25,.83),(.33,.012,.37),paper,.001);box((.18,-.265,.57),(.035,.035,.15),metal,.008);box((0,0,.08),(.58,.49,.12),metal);box((0,-.245,1.12),(.40,.018,.10),paper,.003)
module('realism_newspaper',news)
def dumpster():
 box((0,0,.65),(1.9,1.03,.98),green,.06);box((0,0,1.2),(2.03,1.12,.13),metal);box((0,0,1.29),(1.98,.018,.015),metal)
 for x in [-.83,.83]:
  for y in [-.40,.40]:cyl((x,y,.13),.105,.14,metal,10)
 for x in [-.65,0,.65]:box((x,-.532,.65),(.045,.025,.74),metal,.006)
 box((0,-.549,.82),(.38,.018,.22),paper,.003)
module('realism_dumpster',dumpster)
def fence():
 for x in [-1.18,1.18]:cyl((x,0,1.02),.035,2.04,metal);box((x,0,.07),(.6,.40,.10),metal)
 for z in [.36,1.,1.70]:box((0,0,z),(2.36,.026,.022),metal,.005)
 for x in range(-10,11):box((x*.11,0,1.03),(.013,.018,1.40),metal,.002)
module('realism_fence',fence)
def canopy():
 box((0,.5,3.05),(5.1,1.35,.10),metal);box((0,1.10,2.94),(5.1,.08,.28),fabric)
 for x in [-2.35,2.35]:
  o=box((x,.52,2.88),(.045,1.25,.045),metal,.009);o.rotation_euler.x=-.25
module('realism_canopy',canopy)
def planter():
 for y in [-.4,.4]:box((0,y,.29),(1.85,.10,.58),metal)
 for x in [-.88,.88]:box((x,0,.29),(.10,.8,.58),metal)
 box((0,0,.47),(1.66,.7,.08),soil)
 for x in [-.5,0,.5]:
  bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=.36,location=(x,0,.75));bpy.context.object.data.materials.append(leaf)
module('realism_planter',planter)
def pedestrian():
 cyl((0,0,1.7),.055,3.4,metal);box((0,-.10,2.9),(.34,.18,.48),metal)
 for z in [2.79,3.0]:box((0,-.201,z),(.18,.02,.12),white if z<2.9 else red,.012)
module('realism_pedestrian_signal',pedestrian)
def street_sign():
 cyl((0,0,1.8),.044,3.6,metal);box((0,0,3.3),(1.5,.05,.24),green);box((0,-.03,2.9),(.42,.04,.42),paper)
module('realism_signpost',street_sign)
def vent():
 box((0,0,.31),(1.8,.9,.62),metal);box((0,0,.68),(2.02,1.1,.13),metal)
 for z in [.18,.30,.42,.54]:box((0,-.47,z),(1.56,.04,.035),paper,.004)
module('realism_vent',vent)
def tree():
 cyl((0,0,1.6),.11,3.2,wood)
 for n in range(7):
  a=n*2.399;p=(math.cos(a)*.72,math.sin(a)*.62,3.25+(n%3)*.35);o=cyl((p[0]*.5,p[1]*.5,2.7),.035,1.45,wood,8);o.rotation_euler=(.2*math.sin(a),.4*math.cos(a),0)
  bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=7,radius=.85,location=p);o=bpy.context.object;o.scale=(1,.9,1.13);o.data.materials.append(leaf)
  for v in o.data.vertices:v.co*=1.+math.sin(v.co.x*17+v.co.y*23+v.co.z*11)*.09
  for poly in o.data.polygons:poly.use_smooth=True
module('realism_tree',tree)
module('realism_lamp_lens',lambda:box((0,-.14,4.02),(.26,.19,.055),warm,.015))
for o in bpy.context.scene.objects:
 if o.type=='MESH':
  bpy.context.view_layer.objects.active=o;o.select_set(True)
  if not o.data.uv_layers:bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project();bpy.ops.object.mode_set(mode='OBJECT')
  o.select_set(False)
bpy.ops.wm.save_as_mainfile(filepath=str(R/'art/environment/world-realism/urban-details.blend'))
bpy.ops.export_scene.gltf(filepath=str(out/'street-details.glb'),export_format='GLB',export_extras=True,export_normals=True,export_texcoords=True)
print('Saved original authored street details',len(bpy.context.scene.objects))
