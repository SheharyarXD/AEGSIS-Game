"""Original AEGIS active-corridor architecture. Blender 4.5, no changes to supplied models or character rig."""
from pathlib import Path
import bpy, math, random
R=Path(__file__).resolve().parents[3]
# Shared authoring helpers and PBR material names, no Phase 9 asset regeneration.
helpers=(R/'art/environment/phase9/build_phase9.py').read_text().split('def ruin(')[0]
exec(compile(helpers,str(R/'art/environment/phase9/build_phase9.py'),'exec'))

def panel(x,y,z,w,h,seed,material):
 q=random.Random(seed)
 # Broken polygon cladding; varying inner edge keeps the original opening irregular.
 v=[(x,y,z),(x+w,y,z+.07),(x+w*.95,y,z+h*.65),(x+w*.65,y,z+h*.94),(x+w*.43,y,z+h*.55),(x+w*.2,y,z+h),(x,y,z+h*.84)]
 o=mesh('shattered partition',v,[tuple(range(7))],material)
 mod=o.modifiers.new('material thickness','SOLIDIFY');mod.thickness=.045;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)

def office():
 for side in [-1,1]:
  x=side*3.18
  block((x,0,2.35),(.24,4.9,4.7),concrete,.025)
  for y in [-2.25,0,2.25]:
   block((side*2.97,y,2.35),(.17,.16,4.6),steel,.018)
   panel(side*2.92,y-.8,.3,.2,3.3,int(y*8)+side,glass)
  for j in range(6):wedge((side*(2.55+j*.08),-1.9+j*.67,.15),(.14,.3,.11),concrete,301+j+side)
  for j in range(4):block((side*2.72,-2+j*1.25,4.65),(.75,1.1,.08),paint,.015)
 block((0,0,4.95),(6.5,.26,.38),steel,.025)
 for y in [-1.5,1.5]:
  block((0,y,5.13),(5.8,.3,.11),paint,.015)
  for x in [-1.8,-.6,.6,1.8]:rod((x,y,4.96),(x,y,5.22),.025,steel)
 for side in [-1,1]:rod((side*2.6,-2.4,4.85),(side*2.7,2.3,4.5),.024,steel)
 block((0,.2,4.72),(1.6,.09,.06),light,.01)

def stonehall():
 for side in [-1,1]:
  for y in [-2.15,2.15]:
   x=side*3.25
   block((x,y,2.1),(.6,.6,4.2),stone,.06)
   for z in [.35,3.8,4.2]:block((x,y,z),(.92,.86,.18),stone,.03)
   for j in range(3):rod((x+side*.3,y+j*.12-.12,.5),(x+side*.3,y+j*.12-.12,3.75),.065,stone,8)
  for j in range(7):wedge((side*(2.5+j*.065),-2.3+j*.68,.12),(.21,.28,.15),stone,601+j+side)
 # Pointed vault rises above the physically clear flight envelope.
 for y in [-2.15,2.15]:
  for side in [-1,1]:
   for i in range(9):
    a=i/9;b=(i+1)/9
    x0=side*3.3*(1-a);x1=side*3.3*(1-b);z0=4.35+1.8*math.sin(a*math.pi/2);z1=4.35+1.8*math.sin(b*math.pi/2)
    rod((x0,y,z0),(x1,y,z1),.17,stone,6)
 for side in [-1,1]:panel(side*3.0,-1.5,.3,.22,3.3,440+side,stone)

def utility():
 for side in [-1,1]:
  for y in [-2.2,2.2]:
   block((side*3.2,y,2.4),(.26,.24,4.8),steel,.02)
   rod((side*3.2,y,.2),(side*3.2,-y,4.7),.075,steel)
  for z in [1.4,3.4,4.6]:
   rod((side*3.1,-2.6,z),(side*3.1,2.2,z),.11,paint,10)
   rod((side*3.1,2.2,z),(side*2.85,2.4,z-.3),.11,paint,10)
 block((0,0,4.95),(6.6,.34,.46),steel,.025)
 for j in range(9):block((-2.8+j*.7,0,4.85),(.12,1.1,.07),steel,.01)

def awning():
 block((0,0,3.4),(5.4,1.7,.16),steel,.035)
 block((0,-.65,3.52),(5.5,.12,.24),paint,.02)
 for x in [-2.5,2.5]:rod((x,.65,2.9),(x,-.6,3.4),.045,steel)
 block((0,.6,1.6),(4.4,.12,3.0),glass,.02)
 for x in [-2.25,0,2.25]:block((x,.48,1.6),(.09,.16,3.2),steel,.015)
 block((0,.3,.12),(5.2,1.3,.22),stone,.025)
 for x in [-1.4,1.4]:block((x,-.1,3.25),(.9,.12,.035),light,.01)

for key,fn in [('titan10_interior_office',office),('titan10_interior_stone',stonehall),('titan10_interior_utility',utility),('titan10_lobby_canopy',awning)]:module(key,fn)
for o in bpy.data.objects:
 if o.get('aegisKey','').startswith('titan10_'):o['author']='AEGIS original Phase10'
for p in ['art/environment/phase10','public/assets/environment/metropolis']:(R/p).mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(R/'art/environment/phase10/cinematic-corridors.blend'))
bpy.ops.export_scene.gltf(filepath=str(R/'public/assets/environment/metropolis/phase10-cinematic-kit.glb'),export_format='GLB',export_extras=True,export_normals=True,export_texcoords=True)
# Inspectable asset-browser collections. GLB above contains all origin-aligned modules;
# the .blend opens with the office visible instead of four prototypes overlapping.
for key in ['titan10_interior_office','titan10_interior_stone','titan10_interior_utility','titan10_lobby_canopy']:
 c=bpy.data.collections.new(key);bpy.context.scene.collection.children.link(c);c.asset_mark();c.asset_data.description='Original AEGIS prepared cinematic architecture; metre scale, shared PBR materials, UVs and normals.'
 for o in list(bpy.data.objects):
  if o.get('aegisKey')!=key:continue
  for old in list(o.users_collection):old.objects.unlink(o)
  c.objects.link(o)
 c.hide_viewport=key!='titan10_interior_office'
bpy.ops.wm.save_as_mainfile(filepath=str(R/'art/environment/phase10/cinematic-corridors.blend'))
print('Phase 10 authored office, stone vault, utility passage and entrance exported')
