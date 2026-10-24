"""Original authored fracture/ruin and urban-detail kit. Existing source buildings are not edited."""
import bpy, math, random
from pathlib import Path
R=Path(__file__).resolve().parents[3]
bpy.ops.wm.read_factory_settings(use_empty=True)
rng=random.Random(90017)
def mat(name,c,metal=0,emission=0):
 m=bpy.data.materials.new('titan9_'+name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Roughness'].default_value=.88;p.inputs['Metallic'].default_value=metal
 if emission:p.inputs['Emission Color'].default_value=(*c,1);p.inputs['Emission Strength'].default_value=emission
 return m
concrete=mat('concrete',(.30,.29,.26));stone=mat('stone',(.22,.235,.24));steel=mat('steel',(.12,.15,.17),.75);glass=mat('glass',(.15,.25,.28),.6);brick=mat('brick',(.28,.13,.08));light=mat('light',(.92,.61,.29),0,2);paint=mat('paint',(.30,.40,.40),.25)
def mesh(name,v,f,m):
 g=bpy.data.meshes.new(name);g.from_pydata(v,[],f);g.materials.append(m);o=bpy.data.objects.new(name,g);bpy.context.collection.objects.link(o);return o
def block(p,d,m,bevel=0):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.dimensions=d;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
 if bevel:mod=o.modifiers.new('machined edges','BEVEL');mod.width=bevel;mod.segments=2;bpy.ops.object.modifier_apply(modifier=mod.name)
 return o
def rod(a,b,r,m,n=6):
 a,b=__import__('mathutils').Vector(a),__import__('mathutils').Vector(b);v=b-a;bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=r,depth=v.length,location=(a+b)/2);o=bpy.context.object;o.rotation_euler=v.to_track_quat('Z','Y').to_euler();o.data.materials.append(m);return o
def wedge(p,s,m,seed):
 q=random.Random(seed);v=[(p[0]+x*s[0]*(.65+q.random()*.35),p[1]+y*s[1]*(.65+q.random()*.35),p[2]+z*s[2]*(.65+q.random()*.35)) for x,y,z in [(-1,-1,0),(1,-1,0),(1,1,0),(-1,1,0),(-.7,-.8,1),(.8,-.7,1),(.6,.9,1),(-.8,.6,1)]]
 return mesh('irregular fracture',v,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],m)
def slab(z,w,d,m,seed):
 q=random.Random(seed);v=[];n=12
 for height in [z,z+.035]:
  for i in range(n):
   a=i*math.tau/n;v.append((math.cos(a)*w*(.83+q.random()*.17),math.sin(a)*d*(.83+q.random()*.17),height+q.uniform(-.018,.018)))
 return mesh('ruptured floor plate',v,[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],m)
def module(key,fn):
 before=set(bpy.data.objects);fn();objects=list(set(bpy.data.objects)-before)
 for o in objects:
  if o.type!='MESH':continue
  bpy.context.view_layer.objects.active=o;o.select_set(True)
  if not o.data.uv_layers:bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project();bpy.ops.object.mode_set(mode='OBJECT')
  o.select_set(False)
 groups={}
 for o in objects:
  if o.type=='MESH':groups.setdefault(o.data.materials[0],[]).append(o)
 for m,group in groups.items():
  bpy.ops.object.select_all(action='DESELECT')
  for o in group:o.select_set(True)
  bpy.context.view_layer.objects.active=group[0];bpy.ops.object.join();o=bpy.context.object;o.name=key+'__'+m.name;o['aegisKey']=key;o['author']='AEGIS original Phase9';bpy.ops.object.select_all(action='DESELECT')
def ruin(kind,lod):
 # Normalized footprint; detailed fractured strata, broken cores and bent framing, not stacked cubes.
 material=stone if kind=='gothic' else brick if kind=='industrial' else concrete
 for i in range([260,90,24][lod]):
  x,y=rng.uniform(-.46,.46),rng.uniform(-.46,.46);h=max(.06,.34*(1-math.hypot(x,y)*1.2));wedge((x,y,0),(.012+rng.random()*.028,.012+rng.random()*.035,h*rng.uniform(.06,.32)),material,i+lod*71)
 for cluster,(x,y) in enumerate([(-.19,-.16),(.12,.18),(.24,-.22)]):
  for i in range([5,3,1][lod]):
   o=slab(.06+i*.028,.13+i*.006,.17-i*.008,material,i+713+cluster*8);o.location.x=x;o.location.y=y;o.rotation_euler.x=(-1 if i%2 else 1)*(.12+i*.07);o.rotation_euler.y=(i%3-1)*.18;o.rotation_euler.z=cluster*.8
 for side in [-1,1]:
  wedge((side*.105,0,.08),(.065,.11,.48 if kind=='gothic' else .35),material,80+side)
  for j in range([9,4,2][lod]):
   x=side*(.12+j*.025);rod((x,-.23,.04),(x+rng.uniform(-.03,.04),.15,.18+rng.random()*.18),.0045,steel)
 if lod<2:
  for i in range([23,9][lod]):
   x,y=rng.uniform(-.4,.4),rng.uniform(-.4,.4);rod((x,y,.04),(x+.05,y+.07,.08+rng.random()*.18),.003,steel)
  for i in range([18,7][lod]):wedge((rng.uniform(-.4,.4),rng.uniform(-.4,.4),.02),(.03,.04,.035),glass,140+i)
 if kind=='gothic':
  for side in [-1,1]:
   for j in range(7):
    a=(j/7)*math.pi;rod((side*.25+math.cos(a)*.10,-.18,.21+math.sin(a)*.20),(side*.25+math.cos(a+.3)*.10,-.18,.21+math.sin(a+.3)*.20),.016,stone)
 if kind=='industrial':
  for y in [-.3,.15]:
   for i in range(6):rod((-.4+i*.13,y,.06),(-.27+i*.13,y,.18 if i%2 else .09),.008,steel)
for kind in ['glass','gothic','industrial']:
 for lod in range(3):module('titan9_ruin_'+kind+'_'+str(lod),lambda k=kind,l=lod:ruin(k,l))
def lining(kind):
 m=stone if kind=='stone' else concrete
 for side in [-1,1]:
  for i in range(8):wedge((side*(2.7+rng.random()*.3),rng.uniform(-.24,.24),i*.55),(.22,.35,.4),m,200+i)
  rod((side*2.64,-.12,.3),(side*2.55,.15,4.1),.045,steel)
 for i in range(7):wedge((-2.6+i*.82,0,4.5),(.46,.38,.20+rng.random()*.15),m,221+i)
 rod((-2.9,0,4.3),(2.9,0,4.3),.065,steel)
 for i in range(3):rod((.4+i*.18,0,4.2),(.3+i*.18,.10,3.5-i*.21),.018,steel)
 for i in range(6):wedge((-2.4+i*.9,.25,0),(.5,.65,.08),m,240+i)
 if kind=='glass':
  for i in range(7):wedge((-2.5+i*.85,-.15,4.25),(.13,.03,.32),glass,260+i)
for kind in ['glass','stone','concrete']:module('titan9_breach_'+kind,lambda k=kind:lining(k))

def breach_floor():
 # A continuous slab strip, chipped only at its long edges. It follows the
 # clearance floor rather than repeating circular plates inside the opening.
 edge=[(-2.92,-2.6),(-2.84,-1.7),(-3.02,-.8),(-2.86,.2),(-2.98,1.4),(-2.9,2.6),(2.91,2.6),(2.84,1.7),(3.01,.7),(2.86,-.4),(2.97,-1.6),(2.9,-2.6)]
 v=[(x,y,z) for z in [-.10,.045] for x,y in edge];n=len(edge)
 mesh('continuous chipped passage slab',v,[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],concrete)
module('titan9_breach_floor',breach_floor)
def storefront():
 for x in [-2.7,2.7]:block((x,0,1.7),(.18,.2,3.4),steel,.02)
 block((0,.04,1.5),(5.2,.06,2.9),glass);block((0,-.1,3.45),(5.8,.3,.45),paint,.025)
 for x in [-1.7,0,1.7]:block((x,-.02,1.5),(.07,.1,2.95),steel)
 block((0,-.6,3.2),(5.8,1.25,.13),paint,.035);block((0,-.12,3.15),(5.1,.08,.08),light)
 for x in [-.30,.30]:rod((x,-.12,1.2),(x,-.12,1.7),.022,steel)
module('titan9_storefront',storefront)
def escape():
 for z in [3.,6.,9.]:
  for y in [-.65,.65]:rod((-1.8,y,z),(1.8,y,z),.04,steel)
  for i in range(13):rod((-1.8+i*.3,-.65,z),(-1.8+i*.3,.65,z),.018,steel)
  for x in [-1.8,1.8]:rod((x,-.65,z),(x,-.65,z+1.0),.025,steel)
  rod((-1.8,-.65,z+1),(1.8,-.65,z+1),.035,steel)
  for x in [-.45,.45]:rod((x,0,z),(x,.6,z+3),.03,steel)
  for i in range(9):rod((-.45,i*.067,z+i*.333),(.45,i*.067,z+i*.333),.018,steel)
module('titan9_fire_escape',escape)
def services():
 for x in [-.6,.6]:rod((x,0,.15),(x,0,3.5),.10,steel,10)
 for z in [.4,1.8,3.2]:rod((-.8,0,z),(.8,0,z),.04,steel)
 block((0,.12,1.5),(.8,.35,1.1),paint,.04)
 for z in [1.2,1.4,1.6,1.8]:block((0,-.07,z),(.65,.08,.045),steel)
module('titan9_service_bank',services)
def fence():
 for x in [-1.5,1.5]:rod((x,0,0),(x,0,1.4),.045,steel)
 for z in [.25,1.25]:rod((-1.5,0,z),(1.5,0,z),.03,steel)
 for i in range(16):rod((-1.5+i*.2,0,.2),(-1.5+i*.2,0,1.4),.014,steel)
module('titan9_railing',fence)
def sedan():
 # Lofted body and cabin profiles, inset glazing, wheel wells, lamps and trim.
 rings=[(-2.2,.67,.37),(-1.95,.88,.54),(-1.2,.94,.64),(.8,.94,.64),(1.75,.87,.52),(2.15,.66,.38)];v=[]
 for y,w,h in rings:
  for x,z in [(-w*.9,.25),(-w,.43),(-w*.86,h),(w*.86,h),(w,.43),(w*.9,.25)]:v.append((x,y,z))
 f=[]
 for j in range(len(rings)-1):
  for i in range(6):f.append((j*6+i,j*6+(i+1)%6,(j+1)*6+(i+1)%6,(j+1)*6+i))
 f.extend([tuple(reversed(range(6))),tuple(range((len(rings)-1)*6,len(rings)*6))]);mesh('lofted sedan shell',v,f,paint)
 mesh('inset cabin glazing',[(-.76,-1.05,.67),(.76,-1.05,.67),(.66,-.55,1.25),(-.66,-.55,1.25),(-.66,.65,1.25),(.66,.65,1.25),(.79,1.23,.66),(-.79,1.23,.66)],[(0,1,2,3),(3,2,5,4),(4,5,6,7),(0,3,4,7),(1,6,5,2)],glass)
 block((0,.02,1.26),(1.31,1.16,.07),paint,.035)
 for x in [-.79,.79]:
  rod((x,-1.05,.67),(x*.84,-.55,1.25),.032,steel);rod((x,1.23,.66),(x*.84,.65,1.25),.032,steel);rod((x,0,.65),(x*.84,0,1.25),.035,paint)
  for y in [-1.28,1.28]:
   rod((x-.10,y,.35),(x+.10,y,.35),.34,steel,16);rod((x-.115,y,.35),(x+.115,y,.35),.22,concrete,12)
  for y in [-.48,.67]:block((x,y,.74),(.03,.24,.035),steel,.01)
 for y in [-2.13,2.08]:
  block((0,y,.36),(1.4,.12,.13),steel,.025)
  for x in [-.57,.57]:block((x,y,.5),(.32,.065,.12),light,.02)
 block((0,2.15,.46),(.65,.04,.12),steel,.01)
module('titan9_sedan',sedan)
def bridge():
 for x in [-3.,3.]:block((x,0,1.1),(.45,2,2.2),stone,.04)
 # A complete masonry arch and a usable deck, for courtyards within a saved block.
 n=16
 for i in range(n):
  a=i*math.pi/n;b=(i+1)*math.pi/n
  v=[]
  for y in [-.8,.8]:
   for r,t in [(3.05,a),(3.05,b),(2.63,b),(2.63,a)]:v.append((math.cos(t)*r,y,1+math.sin(t)*r))
  mesh('voussoir',v,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],stone)
 block((0,0,4.1),(6.5,2,.22),stone,.025)
 for y in [-.9,.9]:
  rod((-3.1,y,4.9),(3.1,y,4.9),.035,steel)
  for i in range(22):rod((-3.1+i*.29,y,4.2),(-3.1+i*.29,y,4.9),.018,steel)
module('titan9_courtyard_span',bridge)
for folder in ['art/environment/phase9','public/assets/environment/metropolis']:(R/folder).mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(R/'art/environment/phase9/demolition-and-living-block.blend'))
bpy.ops.export_scene.gltf(filepath=str(R/'public/assets/environment/metropolis/phase9-demolition-kit.glb'),export_format='GLB',export_extras=True,export_normals=True,export_texcoords=True)
print('Phase9 original architecture kit exported')
