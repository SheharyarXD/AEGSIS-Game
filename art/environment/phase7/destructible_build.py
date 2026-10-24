"""Three deliberate original buildings, editable components and matched intact/LOD models.
Geometry is authored in Blender metres. No downloaded executable code is used.
"""
import bpy,json,math,bmesh
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parent
# Reuse our own original relief/UV tools, without running the large district library export.
exec((ROOT/'premium_build.py').read_text().split('for family in FAMILIES:\n')[0])
MATS['p_nocturne']=MATS['p_stone'].copy();MATS['p_nocturne'].name='p_nocturne';MATS['p_nocturne'].node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.06,.08,.12,1)
OUT=PUBLIC/'destructible';OUT.mkdir(parents=True,exist_ok=True);COMPONENTS=[];ACTIVE=None;FLOOR=0;KIND='wall';SIDE=-1
original_poly=poly
original_box=box
def component(kind,floor,side=-1):
 global ACTIVE,FLOOR,KIND,SIDE
 ACTIVE=None;FLOOR=floor;KIND=kind;SIDE=side
def poly(key,mat,vertices,faces):
 global ACTIVE
 if ACTIVE is None:ACTIVE=f'{key}_c{len(COMPONENTS):05d}';COMPONENTS.append({'id':len(COMPONENTS),'family':key,'key':ACTIVE,'kind':KIND,'floor':FLOOR,'side':SIDE})
 original_poly(ACTIVE,mat,vertices,faces)
def box(key,mat,p,s):
 original_box(key,mat,p,s)
 COMPONENTS[-1].setdefault('collisionBoxes',[]).append({'center':list(p),'size':list(s)})

SPECS=[{'id':'aer_glass','name':'Helix Exchange','buildingId':235,'x':170,'z':-390,'width':40,'depth':36,'height':136,'style':'financial','district':'financial','orientation':0,'profiles':[[0,16/136,1,1],[16/136,96/136,.85,.85],[112/136,24/136,.65,.7]]},
 {'id':'aer_gothic','name':'Vesper Nocturne Tower','buildingId':211,'x':-534,'z':-390,'width':38,'depth':38,'height':96,'style':'gothic','district':'gothic','orientation':0,'profiles':[[0,.75,1,1],[.75,.125,.84,.84],[.875,.125,.64,.68]]},
 {'id':'aer_commercial','name':'Orpheum Commerce House','buildingId':287,'x':170,'z':-218,'width':38,'depth':36,'height':32,'style':'deco','district':'financial','orientation':0,'profiles':[[0,.75,1,1],[.75,.25,.86,.84]]}]
for spec in SPECS:
 key=spec['id'];H=spec['height'];W=spec['width'];D=spec['depth'];stone='p_nocturne' if key=='aer_gothic' else 'p_brick' if key=='aer_commercial' else 'p_concrete';metal='p_copper' if key=='aer_gothic' else 'p_metal'
 for floor in range(H//4):
  y=floor*4;profile=next(p for p in spec['profiles'] if p[0]*H<=y<(p[0]+p[1])*H-.01);w=W*profile[2];d=D*profile[3]
  # Four independent slab sections and four load-bearing supports per storey.
  for sx in [-1,1]:
   for sz in [-1,1]:
    component('slab',floor);box(key,'p_concrete',(sx*w*.25,y+.14,sz*d*.25),(w*.5,.28,d*.5))
    component('support',floor);box(key,'p_concrete',(sx*w*.31,y+2,sz*d*.31),(.72,4,.72))
  component('support',floor);box(key,'p_roof',(0,y+2,0),(5.2,4,5.2))
  for side in range(4):
   width=w if side%2==0 else d;edge=(d if side%2==0 else w)*.5;bays=round(width/4.);pitch=width/bays
   for col in range(bays):
    x=-width/2+(col+.5)*pitch;historic=key!='aer_glass';pw=pitch*(.48 if key=='aer_gothic' else .63 if historic else .93);ph=2.85
    # Each wall bay contains real reveals and a sill; no blocking shell behind the panes.
    component('wall',floor,side)
    facade_box(key,stone,(x,y+.52,.08),(pitch,.76,.42),side,edge)
    facade_box(key,stone if historic else metal,(x-pitch/2+(pitch-pw)/4,y+2.3,.04),((pitch-pw)/2,3.2,.5 if historic else .22),side,edge)
    facade_box(key,stone if historic else metal,(x+pitch/2-(pitch-pw)/4,y+2.3,.04),((pitch-pw)/2,3.2,.5 if historic else .22),side,edge)
    for sign in [-1,1]:facade_box(key,metal,(x+sign*pw/2,y+2.35,-.04),(.065,ph,.28),side,edge)
    facade_box(key,stone if historic else metal,(x,y+.89,.25),(pw+.22,.12,.55),side,edge)
    if key=='aer_gothic':arch(key,stone,x,y+.95,side,edge,pw,ph)
    if key=='aer_commercial':
     facade_box(key,'p_limestone',(x,y+3.85,.32),(pitch+.08,.18,.8),side,edge)
     if floor==0:arch(key,'p_limestone',x,y+.95,side,edge,pw,ph)
     if floor in (2,5):
      facade_box(key,stone,(x,y+.82,.65),(pw+.6,.18,1.6),side,edge);facade_box(key,metal,(x,y+1.7,1.3),(pw+.6,.08,.08),side,edge)
      for sx in [-1,1]:facade_box(key,metal,(x+sx*(pw+.4)/2,y+1.3,1.3),(.08,.9,.08),side,edge)
    component('glass',floor,side)
    if key=='aer_gothic':pointed_window(key,'p_glass_warm',stone,x,y+.95,pw,ph,side,edge)
    else:facade_box(key,'p_glass',(x,y+2.35,-.22),(pw,ph,.045),side,edge)
    if historic and col%2==0:
     component('decoration',floor,side);facade_box(key,stone,(x-pitch/2,y+2,.32),(.26,4,.66),side,edge)
   # Corner quoins / blade fins are continuous authored architectural rhythms.
   component('decoration',floor,side)
   facade_box(key,metal if key=='aer_glass' else stone,(width/2-.35,y+2,.38),(.5,4,.95),side,edge)
   if key=='aer_gothic' and floor%4==0:facade_box(key,stone,(0,y+.18,.3),(width+.8,.36,1.0),side,edge)
   if floor==0:
    component('wall',floor,side);facade_box(key,'p_roof',(0,1.5,-.1),(2.8,3,.12),side,edge);facade_box(key,metal,(0,3.6,1.2),(5.5,.22,2.8),side,edge)
    if key=='aer_gothic':arch(key,stone,0,0,side,edge,4.2,6.7)
    component('decoration',floor,side);facade_box(key,'p_warm',(0,3.3,.45),(4,.045,.08),side,edge)
  # Occasional deep bracing and ornament mark the model, rather than random resizing.
  if key=='aer_glass' and floor%4==0:
   for side in [0,2]:
    component('support',floor,side);beam(key,metal,facade_point(-w*.34,y,.55,side,d/2),facade_point(w*.34,min(H,y+16),.55,side,d/2),.14)
  if key=='aer_gothic' and floor%6==0:
   for sign in [-1,1]:component('decoration',floor);box(key,stone,(sign*w*.47,y+1,-d*.47),(1.8,2.0,1.8))
 # Roof structures in physical metres: no scaled rooftop cubes.
 profile=spec['profiles'][-1];rw=W*profile[2];rd=D*profile[3]
 for sign in [-1,1]:
  component('roof',H//4);box(key,stone,(0,H+.6,sign*rd/2),(rw,1.2,.24));component('roof',H//4);box(key,stone,(sign*rw/2,H+.6,0),(.24,1.2,rd))
 component('roof',H//4);box(key,stone,(0,H+1.8,rd*.22),(3.4,3.6,3.2))
 for x in [-rw*.25,rw*.25]:
  component('roof',H//4);box(key,metal,(x,H+.8,0),(2.5,1.6,3))
  for n in range(6):box(key,'p_roof',(x,H+1.5,(n-2.5)*.45),(2.2,.08,.1))
 if key=='aer_gothic':
  for sx in [-1,1]:
   for sz in [-1,1]:
    component('roof',H//4);x=sx*rw*.42;z=sz*rd*.42;box(key,stone,(x,H+2,z),(2,4,2));poly(key,metal,[(x-1.25,H+4,z-1.25),(x+1.25,H+4,z-1.25),(x+1.25,H+4,z+1.25),(x-1.25,H+4,z+1.25),(x,H+12,z)],[(0,1,4),(1,2,4),(2,3,4),(3,0,4)])
 elif key=='aer_glass':
  component('roof',H//4);poly(key,metal,[(-rw*.3,H,-rd*.18),(rw*.3,H,-rd*.18),(rw*.16,H+13,-rd*.18),(-rw*.3,H,rd*.18),(rw*.3,H,rd*.18),(rw*.16,H+13,rd*.18)],[(0,1,2),(3,5,4),(0,3,4,1),(1,4,5,2),(0,2,5,3)])
 else:
  component('roof',H//4)
  for sign in [-1,1]:poly(key,'p_copper',[(-rw*.44,H+.7,sign*rd*.43),(rw*.44,H+.7,sign*rd*.43),(rw*.34,H+3.2,sign*rd*.30),(-rw*.34,H+3.2,sign*rd*.30)],[(0,1,2,3)])

def create(key,mat,buffer,scale):
 mesh=bpy.data.meshes.new(key+'__'+mat);v=buffer['v'];mesh.from_pydata([(x/scale[0],-z/scale[2],y/scale[1]) for x,y,z in v],[],buffer['f']);mesh.update();bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(mesh);bm.free();mesh.update();uv=mesh.uv_layers.new(name='Physical UV')
 for face in mesh.polygons:
  n=face.normal
  for i in face.loop_indices:
   x,y,z=v[mesh.loops[i].vertex_index];uv.data[i].uv=((x,z) if abs(n.z)>.65 else (x,y) if abs(n.y)>abs(n.x) else (z,y))
 if 'cid' in buffer:
  attr=mesh.attributes.new(name='_CID',type='FLOAT',domain='POINT');attr.data.foreach_set('value',buffer['cid'])
 o=bpy.data.objects.new(key+'__'+mat,mesh);bpy.context.collection.objects.link(o);mesh.materials.append(MATS[mat]);o.asset_mark();return o
objects=[]
# Authored fracture wedges, shared by the bounded debris pool. No runtime primitive rubble.
original_poly('fracture_stone','p_concrete',[(-.5,-.4,-.4),(.48,-.5,-.36),(.42,-.43,.5),(-.46,-.34,.42),(-.34,.48,-.43),(.43,.39,-.32),(.35,.44,.41),(-.4,.34,.36)],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
original_poly('fracture_glass','p_glass',[(-.5,-.4,-.02),(.5,-.28,-.02),(.12,.5,-.02),(-.5,-.4,.02),(.5,-.28,.02),(.12,.5,.02)],[(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)])
fragments=[create(key,mat,b,[1,1,1]) for (key,mat),b in BUFS.items() if key.startswith('fracture_')]
bpy.ops.object.select_all(action='DESELECT')
for o in fragments:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'fractures.glb'),export_format='GLB',use_selection=True)
for spec in SPECS:
 scale=[spec['width'],spec['height'],spec['depth']];joined={};parts=[]
 for c in [c for c in COMPONENTS if c['family']==spec['id']]:
  vertices=[];c['parts']=[]
  for (key,mat),b in list(BUFS.items()):
   if key!=c['key']:continue
   obj=create(key,mat,b,scale);parts.append(obj);objects.append(obj);vertices+=b['v'];c['parts'].append({'key':key,'material':mat,'triangles':sum(len(f)-2 for f in b['f'])})
   j=joined.setdefault(mat,{'v':[],'f':[],'cid':[]});start=len(j['v']);j['v']+=b['v'];j['cid'] += [float(c['id'])]*len(b['v']);j['f'] += [tuple(i+start for i in face) for face in b['f']]
  low=[min(v[i] for v in vertices) for i in range(3)];high=[max(v[i] for v in vertices) for i in range(3)];c['center']=[(a+b)/2 for a,b in zip(low,high)];c['size']=[max(.04,b-a) for a,b in zip(low,high)];c['hp']={'glass':12,'wall':140,'support':480,'slab':220,'roof':160,'decoration':70}[c['kind']]
 bpy.ops.object.select_all(action='DESELECT')
 for o in parts:o.select_set(True)
 bpy.ops.export_scene.gltf(filepath=str(OUT/(spec['id']+'-components.glb')),export_format='GLB',use_selection=True,export_normals=True,export_texcoords=True)
 for lod in ['near','mid','far']:
  intact=[]
  for mat,b in joined.items():
   obj=create(f"{spec['id']}_{spec['height']}_{lod}",mat,b,scale)
   if lod!='near':
    bpy.context.view_layer.objects.active=obj;dec=obj.modifiers.new('Authored silhouette LOD','DECIMATE');dec.ratio=.45 if lod=='mid' else .10;bpy.ops.object.modifier_apply(modifier=dec.name)
   intact.append(obj);objects.append(obj)
  bpy.ops.object.select_all(action='DESELECT')
  for o in intact:o.select_set(True)
  bpy.ops.export_scene.gltf(filepath=str(OUT/(spec['id']+'-'+lod+'.glb')),export_format='GLB',use_selection=True,export_attributes=True,export_normals=True,export_texcoords=True)
# Editable source has genuine mapped PBR, with physical UV repeat; runtime shares compressed maps.
for name,asset in {'p_stone':'stone_wall_03','p_nocturne':'stone_wall_03','p_limestone':'old_stone_wall_02','p_brick':'brick_wall_006','p_concrete':'concrete_pavement','p_metal':'metal_plate','p_copper':'rusty_metal_02','p_roof':'concrete_pavement'}.items():
 m=MATS[name];nodes=m.node_tree.nodes;links=m.node_tree.links;p=nodes.get('Principled BSDF');uv=nodes.new('ShaderNodeTexCoord');mapping=nodes.new('ShaderNodeMapping');mapping.inputs['Scale'].default_value=(.25,.25,1);links.new(uv.outputs['UV'],mapping.inputs['Vector'])
 for channel in ['color','normal','rough']:
  t=nodes.new('ShaderNodeTexImage');t.image=bpy.data.images.load(str(ROOT/'materials'/asset/(channel+'.jpg')),check_existing=True);t.image.pack();links.new(mapping.outputs['Vector'],t.inputs['Vector'])
  if channel=='color':links.new(t.outputs['Color'],p.inputs['Base Color'])
  elif channel=='rough':t.image.colorspace_settings.name='Non-Color';links.new(t.outputs['Color'],p.inputs['Roughness'])
  else:t.image.colorspace_settings.name='Non-Color';normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.42;links.new(t.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],p.inputs['Normal'])
# Open on three metre-scale models, with selectable intact and component collections.
library=bpy.context.scene;library.name='AEGIS three architecture and destruction gallery'
for n,spec in enumerate(SPECS):
 parent=bpy.data.objects.new(spec['name'],None);library.collection.objects.link(parent);parent.location.x=(n-1)*90;parent.scale=(spec['width'],spec['depth'],spec['height'])
 collection=bpy.data.collections.new(spec['name']+' / all damage components');library.collection.children.link(collection)
 for obj in objects:
  if not obj.name.startswith(spec['id']+'_'):continue
  obj.parent=parent
  if '_c' in obj.name[len(spec['id']):]:
   for existing in list(obj.users_collection):existing.objects.unlink(obj)
   collection.objects.link(obj);obj.hide_set(True);obj.hide_render=True
  elif '_near__' not in obj.name:obj.hide_set(True);obj.hide_render=True
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'aegis-three-destructible-buildings.blend'))
(OUT/'components.json').write_text(json.dumps({'families':SPECS,'components':COMPONENTS,'author':'AEGIS original architecture','physics':'component AABBs in metres; runtime is selectively activated'},indent=2));print('THREE BUILDINGS',len(COMPONENTS),len(objects))
