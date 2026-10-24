"""Original AEGIS environment kit. Blender 4.5: blender -b --python build.py.

All coordinates are authored in metres, Three.js Y-up, converted at creation.
Templates are normalized building envelopes; rooftops and street modules use metres.
Every exported object is one material and can be directly GPU-instanced.
"""
import bpy, bmesh, math, json, os, random
from mathutils import Vector

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(ROOT, '../../public/assets/environment'))
os.makedirs(OUT, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
random.seed(4197)

COLORS = {'stone':('#48515a',.02,.86), 'brick':('#73594e',.01,.9),
 'steel':('#647481',.72,.43), 'glass':('#35586b',.65,.25),
 'roof':('#29333a',.08,.89), 'warm':('#cba975',.05,.48),
 'neon':('#56b9d5',.1,.3), 'green':('#3b6150',0,.98),
 'road':('#323d46',.03,.93), 'paint':('#c4bca1',.0,.8)}
MATS={}
for style,base in [('financial','glass'),('deco','stone'),('gothic','stone'),('industrial','stone'),('residential','brick')]:COLORS['wall_'+style]=COLORS[base]
def srgb(v): return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
for name,(hexcol,metal,rough) in COLORS.items():
 mat=bpy.data.materials.new(name); mat.use_nodes=True
 p=mat.node_tree.nodes.get('Principled BSDF')
 rgb=tuple(srgb(int(hexcol[i:i+2],16)/255) for i in (1,3,5))
 p.inputs['Base Color'].default_value=(*rgb,1)
 p.inputs['Roughness'].default_value=rough; p.inputs['Metallic'].default_value=metal
 if name in ('warm','neon'):
  p.inputs['Emission Color'].default_value=(*rgb,1);p.inputs['Emission Strength'].default_value=.8
 MATS[name]=mat

# Editable PBR graph, shared texture atlas, physical UVs, correct tangent normal convention.
images={}
for suffix in ('color','normal','orm'):
 path=os.path.join(ROOT,'textures',f'atlas-{suffix}.png')
 if os.path.exists(path):
  images[suffix]=bpy.data.images.load(path)
  if suffix!='color':images[suffix].colorspace_settings.name='Non-Color'
for name,mat in MATS.items():
 if not images or name in ('warm','neon','green','glass','wall_financial'):continue
 nodes=mat.node_tree.nodes;links=mat.node_tree.links;p=nodes.get('Principled BSDF')
 tex=nodes.new('ShaderNodeTexImage');tex.image=images['color'];links.new(tex.outputs['Color'],p.inputs['Base Color'])
 tex=nodes.new('ShaderNodeTexImage');tex.image=images['normal'];n=nodes.new('ShaderNodeNormalMap');n.inputs['Strength'].default_value=.28;links.new(tex.outputs['Color'],n.inputs['Color']);links.new(n.outputs['Normal'],p.inputs['Normal'])
 tex=nodes.new('ShaderNodeTexImage');tex.image=images['orm'];separate=nodes.new('ShaderNodeSeparateColor');links.new(tex.outputs['Color'],separate.inputs['Color']);links.new(separate.outputs['Green'],p.inputs['Roughness'])

PARTS={}
def xyz(v):return (v[0],-v[2],v[1])
def remember(obj,kit,mat):
 obj.data.materials.clear();obj.data.materials.append(MATS[mat])
 PARTS.setdefault((kit,mat),[]).append(obj)
 return obj
def box(kit,mat,p,s,bevel=0):
 bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(p));o=bpy.context.object
 o.scale=(s[0],s[2],s[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel:
  mod=o.modifiers.new('Architectural edge bevel','BEVEL');mod.width=bevel;mod.segments=1
  bpy.ops.object.modifier_apply(modifier=mod.name)
 return remember(o,kit,mat)
def cyl(kit,mat,p,r,h,vertices=12,top=None):
 bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r,radius2=r if top is None else top,depth=h,location=xyz(p))
 return remember(bpy.context.object,kit,mat)
def beam(kit,mat,a,b,r=.12):
 a,b=Vector(xyz(a)),Vector(xyz(b));d=b-a
 bpy.ops.mesh.primitive_cylinder_add(vertices=6,radius=r,depth=d.length,location=(a+b)/2)
 o=bpy.context.object;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();return remember(o,kit,mat)
def mesh(kit,mat,verts,faces):
 m=bpy.data.meshes.new(kit);m.from_pydata([xyz(v) for v in verts],[],faces);m.update()
 o=bpy.data.objects.new(kit,m);bpy.context.collection.objects.link(o);return remember(o,kit,mat)
def chamfered(kit,mat,y,h,w,d,cut=.12):
 pts=[(-w/2+cut,-d/2),(w/2-cut,-d/2),(w/2,-d/2+cut),(w/2,d/2-cut),(w/2-cut,d/2),(-w/2+cut,d/2),(-w/2,d/2-cut),(-w/2,-d/2+cut)]
 verts=[(x,y+dy,z) for dy in (0,h) for x,z in pts]
 faces=[tuple(range(7,-1,-1)),tuple(range(8,16))]+[(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)]
 return mesh(kit,mat,verts,faces)
def arch(kit,mat,cx,cy,z,w,h,depth=.22):
 # pointed Gothic arch: two curved voussoir bands, real open centre
 for side in (-1,1):
  pts=[]
  for i in range(7):
   t=i/6; x=side*w*.5*(1-t);y=cy+h*(.55+.45*math.sin(t*math.pi*.5))
   pts.append((cx+x,y,z))
  for a,b in zip(pts,pts[1:]):beam(kit,mat,a,b,depth)
  box(kit,mat,(cx+side*w*.5,cy+h*.28,z),(depth*1.6,h*.56,depth*2))
def pointed_panel(kit,mat,cx,cy,z,w,h):
 verts=[(cx-w/2,cy,z),(cx+w/2,cy,z),(cx+w/2,cy+h*.55,z),(cx+w*.37,cy+h*.76,z),(cx+w*.2,cy+h*.92,z),(cx,cy+h,z),(cx-w*.2,cy+h*.92,z),(cx-w*.37,cy+h*.76,z),(cx-w/2,cy+h*.55,z)]
 return mesh(kit,mat,verts,[tuple(range(9))])
def tower(style,lod):
 kit=f'{style}_{lod}'
 profiles={
  'financial':[(0,.72,1,1),(.72,.2,.78,.82),(.92,.08,.54,.62)],
  'deco':[(0,.62,1,1),(.62,.21,.83,.85),(.83,.12,.66,.7),(.95,.05,.44,.52)],
  'gothic':[(0,.87,1,1),(.87,.13,.86,.9)],
  'industrial':[(0,.82,1,1),(.82,.18,.68,.8)],
  'residential':[(0,.94,1,1),(.94,.06,.88,.9)]}[style]
 for start,height,w,d in profiles:
  if style in ('financial','deco'):chamfered(kit,'wall_'+style,start,height,w,d,.10 if style=='financial' else .06)
  else:box(kit,'wall_'+style,(0,start+height/2,0),(w,height,d))
  box(kit,'steel' if style=='financial' else 'stone',(0,start+height-.0045,0),(w+.014,.009,d+.014))
 # Visible base/plinth and recessed doors, even in the silhouette LOD.
 box(kit,'stone',(0,.018,0),(1.055,.036,1.055))
 if lod=='near':
  for s in (-1,1):
   for x in (-.44,-.22,0,.22,.44):
    box(kit,'steel' if style=='financial' else 'stone',(x,.43,s*.507),(.012,.82,.025))
   for z in (-.4,-.2,0,.2,.4):
    box(kit,'stone',(s*.507,.43,z),(.025,.82,.018))
   box(kit,'roof',(0,.018,s*.535),(.16,.036,.012))
   box(kit,'steel',(0,.04,s*.56),(.24,.006,.09))
  for y in ([.12,.24,.36,.48,.60,.72,.84] if style!='industrial' else [.12,.7]):
   profile=next(p for p in profiles if p[0]<=y<=p[0]+p[1])
   box(kit,'stone',(0,y,0),(profile[2]+.012,.006,profile[3]+.012))
  if style=='deco':
   for x in (-.42,-.3,-.18,.18,.3,.42):box(kit,'steel',(x,.47,.513),(.018,.79,.03))
  if style=='gothic':
   for s in (-1,1):
    for x in (-.42,-.21,.21,.42):
     box(kit,'stone',(x,.45,s*.54),(.032,.88,.08))
     for y in (.16,.36,.56,.76):arch(kit,'stone',x,y,s*.543,.14,.13,.006)
     cyl(kit,'roof',(x,.94,s*.51),.037,.17,4,top=0)
   for x in (-.4,-.2,0,.2,.4):
    box(kit,'stone',(x,.895,.48),(.10,.10,.10))
    box(kit,'stone',(x,.895,-.48),(.10,.10,.10))
  if style=='residential':
   for s in (-1,1):
    for y in (.12,.24,.36,.48,.6,.72,.84):
     box(kit,'steel',(0,y,s*.55),(.85,.005,.14))
  if style=='industrial':
   for x in (-.4,-.2,0,.2,.4):box(kit,'steel',(x,.9,0),(.015,.21,.84))
 # A compact mechanical crown in both LODs gives every roof a readable silhouette.
 box(kit,'roof',(.12,1.025,.08),(.2,.05,.22))
 box(kit,'steel',(-.20,1.018,-.1),(.12,.035,.18))
 if style=='gothic':
  for s in (-1,1):cyl(kit,'roof',(s*.37,1.075,-.3),.085,.18,4,top=0)
 if style=='financial':
  mesh(kit,'steel',[(-.2,1,-.1),(.2,1,-.1),(0,1.12,-.1),(-.2,1,.1),(.2,1,.1),(0,1.12,.1)],[(0,1,2),(3,5,4),(0,3,4,1),(0,2,5,3),(1,4,5,2)])
 rw,rd=profiles[-1][2],profiles[-1][3]
 mesh(kit,'roof',[(-rw/2,1.00001,-rd/2),(-rw/2,1.00001,rd/2),(rw/2,1.00001,rd/2),(rw/2,1.00001,-rd/2)],[(0,1,2,3)])

for style in ('financial','deco','gothic','industrial','residential'):
 for lod in ('far','near'):tower(style,lod)

# Reusable real-scale architectural modules.
box('parapet','stone',(0,.5,0),(1,1,.18),.015)
box('parapet','steel',(0,1.02,0),(1,.05,.24))
for s in (-1,1):
 box('portal','stone',(s*2.1,2.5,0),(.6,5,.6),.08)
 arch('portal','stone',0,0,0,4.2,6,.23)
 box('portal','roof',(s*.85,1.5,.18),(1.65,3,.16),.05)
 for y in (.25,1.25,2.25):box('portal','steel',(s*.85,y,.29),(1.5,.08,.1))
box('portal','stone',(0,.12,1),(5,.24,2.6),.04)

for i in range(3):
 box('roofkit','steel',(-4+i*4,1.1,0),(3,2.2,4),.15)
 for z in (-1.4,-.7,0,.7,1.4):box('roofkit','roof',(-4+i*4,2.24,z),(2.5,.05,.18))
 cyl('roofkit','roof',(-4+i*4,2.28,0),.8,.1,16)
box('roofkit','stone',(0,1.8,7),(5,3.6,4),.06)
box('roofkit','roof',(0,1.5,9.05),(1.4,2.8,.08))
for i in range(8):box('roofkit','steel',(3, .2+i*.45,7),(1.7,.2,.24))
beam('roofkit','steel',(3,0,7),(3,4,7),.06)
box('roofkit','roof',(0,.08,-6),(12,.16,2))
cyl('tank','steel',(0,3,0),2,4,16)
cyl('tank','roof',(0,5.15,0),2.2,.3,16,top=0)
for x in (-1.4,1.4):
 for z in (-1.4,1.4):beam('tank','steel',(x,0,z),(x,2,z),.1)
beam('tank','steel',(0,5,0),(0,7,0),.07)
cyl('helipad','roof',(0,.012,0),6.5,.025,32)
bpy.ops.mesh.primitive_torus_add(major_segments=32,minor_segments=4,major_radius=5.8,minor_radius=.07,location=xyz((0,.045,0)))
remember(bpy.context.object,'helipad','paint')
for x in (-1.5,1.5):box('helipad','paint',(x,.045,0),(.35,.04,4.5))
box('helipad','paint',(0,.045,0),(3.2,.04,.35))
for x in (-5,5):cyl('helipad','warm',(x,.12,0),.13,.2,8)
for s in (-1,1):
 box('spire','stone',(s*1.3,2.4,0),(.5,4.8,2.6),.05)
cyl('spire','stone',(0,4,0),1.9,8,8,top=1.1)
cyl('spire','roof',(0,12,0),1.9,9,8,top=0)
beam('spire','steel',(0,16,0),(0,19,0),.06)

# Lamppost, benches, original shop front and wayfinding panel.
beam('lamp','steel',(0,0,0),(0,7.5,0),.09)
beam('lamp','steel',(0,7.5,0),(2.5,7.5,0),.08)
box('lamp','steel',(2.5,7.45,0),(1.4,.2,.6),.08)
box('lamp','warm',(2.5,7.31,0),(1.15,.05,.42))
for y in (.52,1.05):box('bench','roof',(0,y,0),(2.6,.1,.7),.03)
for x in (-1,1):box('bench','steel',(x,.45,0),(.13,.9,.5))
box('shop','steel',(0,3.9,0),(8,.3,2),.07)
for x in (-3,-1,1,3):box('shop','glass',(x,1.8,-.5),(1.8,3.4,.1))
box('shop','neon',(0,3.65,.7),(7,.18,.08))
box('sign','steel',(0,1.7,0),(5.2,3.5,.22),.08)
box('sign','neon',(0,1.7,.14),(4.9,3.2,.02))

# Container, crane, steel bridge bay and original ambient automobile.
box('container','steel',(0,1.3,0),(2.5,2.6,6),.04)
for s in (-1,1):
 for z in range(-27,28,5):box('container','roof',(s*1.26,1.3,z/10),(.04,2.45,.04))
 for x in (-.8,.8):box('container','roof',(x,1.3,s*3.02),(.05,2.4,.05))
for x in (-3,3):
 for z in (-3,3):beam('crane','steel',(x,0,z),(x,30,z),.28)
 for y in range(0,30,5):
  beam('crane','steel',(x,y,-3),(x,y+5,3),.1)
  beam('crane','steel',(x,y,3),(x,y+5,-3),.1)
box('crane','steel',(0,30,12),(7,2,38),.08)
for z in range(-6,30,4):
 beam('crane','steel',(-3,30,z),(-3,34,z+4),.12)
 beam('crane','steel',(-3,34,z),(-3,30,z+4),.12)
beam('crane','roof',(0,30,22),(0,8,22),.045)
box('crane','warm',(0,8,22),(2.8,.5,2.8))
box('bridge','road',(0,0,0),(24,1.5,64),.04)
for s in (-1,1):
 for y in (2,11):beam('bridge','steel',(s*11.7,y,-32),(s*11.7,y,32),.2)
 for z in range(-32,32,8):
  beam('bridge','steel',(s*11.7,2,z),(s*11.7,11,z+8),.18)
  beam('bridge','steel',(s*11.7,11,z),(s*11.7,2,z+8),.18)
box('car','steel',(0,.6,0),(1.9,.7,4.4),.15)
box('car','glass',(0,1.1,-.25),(1.6,.7,2.3),.16)
for x in (-.93,.93):
 for z in (-1.3,1.3):
  o=cyl('car','roof',(x,.4,z),.4,.18,12);o.rotation_euler.y=math.pi/2
for x in (-.6,.6):box('car','warm',(x,.65,2.23),(.45,.13,.025))

# Tree: bent branching trunk and an irregular triangulated canopy, not a sphere sprite.
beam('tree','stone',(0,0,0),(.2,5,0),.17)
for i in range(5):
 a=i*2.4;p=(math.cos(a)*1.3,5+i*.3,math.sin(a)*1.4)
 beam('tree','stone',(.15,3.5,0),p,.08)
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=2.3,location=xyz(p))
 o=bpy.context.object;o.scale=(1.2,1.1,.9);remember(o,'tree','green')

# Unique civic cathedral: flying buttresses, nave, transept, twin towers, rose window.
box('cathedral','stone',(0,12,0),(30,24,64),.12)
box('cathedral','stone',(0,8,0),(54,16,17),.12)
mesh('cathedral','roof',[(-15,24,-32),(15,24,-32),(0,36,-32),(-15,24,32),(15,24,32),(0,36,32)],[(0,1,2),(3,5,4),(0,3,4,1),(0,2,5,3),(1,4,5,2)])
for s in (-1,1):
 for z in (-24,-12,0,12,24):
  box('cathedral','stone',(s*22,6,z),(2.2,12,2.5),.1)
  beam('cathedral','stone',(s*22,12,z),(s*15,22,z),.8)
 for z in (-24,-12,12,24):
  box('cathedral','glass',(s*15.08,14,z),(.12,11,4))
  beam('cathedral','stone',(s*15.3,8,z),(s*15.3,22,z),.12)
 box('cathedral','stone',(s*14,23,34),(10,46,12),.08)
 for corner in (-1,1):
  box('cathedral','stone',(s*14+corner*4.5,24,40.6),(1.1,48,1.4),.08)
 for y in (8,19,29,44):box('cathedral','stone',(s*14,y,34),(11.4,.55,13.4),.1)
 cyl('cathedral','roof',(s*14,54,34),6,18,4,top=0)
 for x in (-3.8,3.8):cyl('cathedral','stone',(s*14+x,47,34),.6,7,8,top=0)
 arch('cathedral','stone',s*14,30,40.1,6,10,.45)
 pointed_panel('cathedral','glass',s*14,30,40.15,5.6,9.8)
 beam('cathedral','stone',(s*14,30,40.45),(s*14,39.5,40.45),.16)
 for y in (10,21):
  arch('cathedral','stone',s*14,y,40.18,4.8,7.5,.24)
  pointed_panel('cathedral','glass',s*14,y,40.25,4.6,7.2)
arch('cathedral','stone',0,0,32.4,7,12,.5)
pointed_panel('cathedral','roof',0,0,32.5,6.8,11.8)
for y in (4,8,15,28):box('cathedral','stone',(0,y,32.6),(27.8,.4,.75),.04)
for x in (-12,-8,8,12):
 box('cathedral','stone',(x,12,33.0),(.9,24,1.4),.08)
 pointed_panel('cathedral','glass',x,8,32.8,2.8,8)
 arch('cathedral','stone',x,8,33.0,3.2,8.5,.18)
for i in range(4):box('cathedral','stone',(0,.12+i*.23,35-i*.6),(11, .24,6-i*1.2),.03)
bpy.ops.mesh.primitive_torus_add(major_segments=24,minor_segments=6,location=xyz((0,22,32.3)),major_radius=4.8,minor_radius=.45,rotation=(math.pi/2,0,0))
remember(bpy.context.object,'cathedral','stone')
for i in range(12):
 a=i*math.tau/12;beam('cathedral','steel',(0,22,32.6),(math.cos(a)*4.4,22+math.sin(a)*4.4,32.6),.12)
cyl('cathedral','glass',(0,22,32.2),4.4,.1,24).rotation_euler.x=math.pi/2

# Distinctive Crown Exchange: faceted taper, four exoskeleton fins, split crown.
for start,height,w,d in ((0,90,54,44),(90,90,46,40),(180,70,34,32),(250,30,24,24)):
 box('crown','glass',(0,start+height/2,0),(w,height,d),.3)
 box('crown','steel',(0,start+height,0),(w+1,.8,d+1),.08)
for s in (-1,1):
 for x in (-1,1):
  beam('crown','steel',(x*27,0,s*22),(x*12,280,s*12),.75)
  box('crown','steel',(x*9,285,s*9),(2,45,2),.1)
for y in range(6,250,8):
 w=54 if y<90 else 46 if y<180 else 34
 for s in (-1,1):box('crown','steel',(0,y,s*(22 if y<90 else 20 if y<180 else 16)),(w,.25,.2))
beam('crown','neon',(-9,306,0),(9,306,0),.22)

# Join by kit/material, apply transforms, author planar UVs and flat/correct normals.
objects=[]
for (kit,mat),parts in PARTS.items():
 bpy.ops.object.select_all(action='DESELECT')
 for obj in parts:obj.select_set(True)
 bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();obj=bpy.context.object
 bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free();obj.data.update()
 obj.name=f'{kit}__{mat}'
 obj.data.name=obj.name
 # Reusable trim-atlas UVs. Runtime supplies the physical metre-scale projection.
 uv=obj.data.uv_layers.new(name='TrimAtlasUV')
 for poly in obj.data.polygons:
  n=poly.normal;axis=max(range(3),key=lambda i:abs(n[i]));axes=[i for i in range(3) if i!=axis]
  coordinates=[obj.data.vertices[obj.data.loops[li].vertex_index].co for li in poly.loop_indices]
  low=[min(v[a] for v in coordinates) for a in axes];span=[max(v[a] for v in coordinates)-low[i] for i,a in enumerate(axes)]
  for li in poly.loop_indices:
   v=obj.data.vertices[obj.data.loops[li].vertex_index].co
   tile=1 if mat in ('brick','wall_residential') else 2 if mat=='steel' else 3 if mat in ('roof','road') else 0
   uv.data[li].uv=(.005+(v[axes[0]]-low[0])/max(.00001,span[0])*.49+(tile%2)*.5,.005+(v[axes[1]]-low[1])/max(.00001,span[1])*.49+(tile//2)*.5)
 obj.data.set_sharp_from_angle(angle=math.radians(40));objects.append(obj)

bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'aegis-city-kit.glb'),export_format='GLB',export_apply=True,export_yup=True,export_normals=True,export_texcoords=True,export_materials='EXPORT')
for file,predicate in [('aegis-skyline-lod.glb',lambda o:'_far__' in o.name),('aegis-landmarks.glb',lambda o:o.name.startswith(('cathedral__','crown__')))]:
 bpy.ops.object.select_all(action='DESELECT')
 for obj in objects:obj.select_set(predicate(obj))
 bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,file),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_normals=True,export_texcoords=True,export_materials='EXPORT')
manifest={'name':'AEGIS original architectural kit','creator':'AEGIS project, procedural Blender authoring',
 'source':'art/environment/build.py','license':'Original project assets; no third-party model content',
 'commercialUse':True,'authoredDate':'2026-10-11','units':'metres, Y-up after glTF export',
 'blenderVersion':bpy.app.version_string,'objects':[]}
for obj in objects:
 obj.data.calc_loop_triangles();bm=bmesh.new();bm.from_mesh(obj.data);volume=bm.calc_volume(signed=True);bm.free()
 if '__wall_' in obj.name:assert volume>0,f'Inverted shell normals: {obj.name}'
 manifest['objects'].append({'name':obj.name,'vertices':len(obj.data.vertices),'triangles':len(obj.data.loop_triangles),'material':obj.data.materials[0].name,'uv':True,'signedVolume':volume})
manifest['glbBytes']=os.path.getsize(os.path.join(OUT,'aegis-city-kit.glb'))
manifest['exports']=[{'file':file,'bytes':os.path.getsize(os.path.join(OUT,file))} for file in ('aegis-city-kit.glb','aegis-skyline-lod.glb','aegis-landmarks.glb')]
with open(os.path.join(OUT,'authored-manifest.json'),'w') as f:json.dump(manifest,f,indent=2)
# Organize editable sources, and open the blend on a separate display gallery.
# Exported modules keep their origin and dimensions; gallery instances never enter the GLBs.
library_scene=bpy.context.scene;library_scene.name='LIBRARY_EXPORT'
collections={}
for obj in objects:
 kit=obj.name.split('__')[0]
 if kit not in collections:
  col=bpy.data.collections.new('Kit | '+kit);library_scene.collection.children.link(col);collections[kit]=col
  if hasattr(col,'asset_mark'):col.asset_mark()
 for col in list(obj.users_collection):col.objects.unlink(obj)
 collections[kit].objects.link(obj)
gallery=bpy.data.scenes.new('AEGIS | Asset Gallery')
gallery['instructions']='Editable originals are in LIBRARY_EXPORT, in Kit collections. Gallery contains only display instances. Rebuild with factory startup.'
for i,(kit,col) in enumerate(collections.items()):
 preview=bpy.data.objects.new('Preview | '+kit,None);preview.instance_type='COLLECTION';preview.instance_collection=col
 gallery.collection.objects.link(preview);preview.location=((i%6)*125,-(i//6)*145,0)
 if kit.endswith(('_near','_far')):preview.scale=(32,32,75)
bpy.context.window.scene=gallery
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':area.spaces.active.region_3d.view_distance=650;area.spaces.active.region_3d.view_location=(300,-300,40)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'aegis-environment.blend'))
print('AEGIS ENVIRONMENT KIT',manifest['glbBytes'],'bytes',len(objects),'instancable meshes')
