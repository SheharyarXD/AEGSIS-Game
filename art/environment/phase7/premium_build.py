"""AEGIS original architecture. High source detail, three runtime LODs, physical facade bays.
Run Blender 4.5 --background --factory-startup --python premium_build.py.
CC0 source modules are imported as data; no downloaded scripts are executed.
"""
import bpy,bmesh,math,json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parent;PUBLIC=ROOT.parents[2]/'public/assets/environment/premium';PUBLIC.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
FAMILIES=json.loads((ROOT/'families.json').read_text());BUFS={};OBJS=[];RECORDS=[]
COLORS={'p_stone':('#84838a',.02,.78),'p_limestone':('#b3ab99',0,.82),'p_brick':('#795e50',0,.85),'p_concrete':('#949b9e',0,.82),'p_metal':('#6b818c',.8,.32),'p_copper':('#556a65',.72,.38),'p_roof':('#404952',.12,.78),'p_glass':('#27434f',.12,.19),'p_glass_warm':('#4c4940',.1,.23),'p_warm':('#f1c584',.1,.4),'p_neon':('#78cde5',.2,.3)}
MATS={}
for name,(c,metal,rough) in COLORS.items():
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*[int(c[i:i+2],16)/255 for i in (1,3,5)],1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;MATS[name]=m
 if name in ('p_warm','p_neon'):p.inputs['Emission Color'].default_value=p.inputs['Base Color'].default_value;p.inputs['Emission Strength'].default_value=.7

def buf(key,mat):return BUFS.setdefault((key,mat),{'v':[],'f':[],'uv':[]})
def poly(key,mat,verts,faces):
 b=buf(key,mat);start=len(b['v']);b['v']+=verts;b['f'] += [tuple(start+i for i in f) for f in faces]
def box(key,mat,p,s):
 x,y,z=p;a,h,d=[n/2 for n in s];v=[(x+sx*a,y+sy*h,z+sz*d) for sx,sy,sz in [(-1,-1,-1),(1,-1,-1),(1,-1,1),(-1,-1,1),(-1,1,-1),(1,1,-1),(1,1,1),(-1,1,1)]];poly(key,mat,v,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
def beam(key,mat,a,b,r=.1):
 a,b=Vector(a),Vector(b);direction=(b-a).normalized();axis=direction.cross(Vector((0,1,0)))
 if axis.length<.01:axis=direction.cross(Vector((1,0,0)))
 axis.normalize();other=direction.cross(axis).normalized();v=[tuple(p+axis*math.cos(t*math.tau/4)*r+other*math.sin(t*math.tau/4)*r) for p in [a,b] for t in range(4)];poly(key,mat,v,[(3,2,1,0),(4,5,6,7)]+[(i,(i+1)%4,(i+1)%4+4,i+4) for i in range(4)])
def facade_box(key,mat,p,s,side,edge):
 x,y,depth=p;w,h,d=s
 if side in (0,2):box(key,mat,(x,y,(edge+depth)*(1 if side==0 else -1)),(w,h,d))
 else:box(key,mat,((edge+depth)*(1 if side==1 else -1),y,x),(d,h,w))
def facade_point(x,y,depth,side,edge):
 return (x,y,(edge+depth)*(1 if side==0 else -1)) if side in (0,2) else ((edge+depth)*(1 if side==1 else -1),y,x)
def pointed_window(key,glass,stone,x,y,pw,ph,side,edge):
 outline=[(-pw/2,0),(pw/2,0),(pw/2,ph*.62),(pw*.35,ph*.82),(0,ph),(-pw*.35,ph*.82),(-pw/2,ph*.62)]
 verts=[facade_point(x+xx,y+yy,-.21,side,edge) for xx,yy in outline];poly(key,glass,verts,[tuple(range(len(verts)))])
 # The stone above the true pointed opening occludes its rectangular bounding-box corners.
 for sign in [-1,1]:
  vs=[facade_point(x,y+ph,0,side,edge),facade_point(x+sign*pw*.35,y+ph*.82,0,side,edge),facade_point(x+sign*pw/2,y+ph*.62,0,side,edge),facade_point(x+sign*pw/2,y+ph,0,side,edge)];poly(key,stone,vs,[(0,1,2,3)])
def arch(key,mat,x,y,side,edge,w,h):
 for sign in [-1,1]:
  pts=[facade_point(x+sign*w*.5*(1-i/4),y+h*(.62+.38*math.sin(i/4*math.pi/2)),.18,side,edge) for i in range(5)]
  for a,b in zip(pts,pts[1:]):beam(key,mat,a,b,.085)
  facade_box(key,mat,(x+sign*w*.5,y+h*.3,.16),(.17,h*.6,.3),side,edge)
def building(family,height,lod):
 key=f"{family['id']}_{height}_{lod}";W,D=family['width'],family['depth'];stone='p_stone' if family['district']=='gothic' else 'p_brick' if family['district'] in ('industrial','residential') else 'p_limestone';metal='p_copper' if family['roof']=='copper' else 'p_metal';style=family['facade'];glass='p_glass_warm' if family['district'] in ('gothic','residential') else 'p_glass'
 for start,portion,wx,dz in family['profiles']:
  y=start*height;h=portion*height;w=W*wx;d=D*dz
  # Physical slabs and real openings: no opaque giant box behind the recessed windows.
  box(key,'p_roof',(0,y+h-.13,0),(w,.26,d));box(key,stone,(0,y+.12,0),(w,.24,d))
  if lod=='far':
   for side in range(4):
    width=w if side in (0,2) else d;edge=(d if side in (0,2) else w)/2
    facade_box(key,stone,(0,y+h/2,0),(width,h,.22),side,edge)
    # Distant identity is maintained by authored strips and the full roof silhouette.
    for row in range(max(1,round(h/12))):facade_box(key,metal,(0,y+row*12+.45,.025),(width,.14,.16),side,edge)
   continue
  rows=max(1,round(h/4));rise=h/rows
  for side in range(4):
   width=w if side in (0,2) else d;edge=(d if side in (0,2) else w)/2;bays=max(2,round(width/(5 if family['district']=='industrial' else 4)));pitch=width/bays
   # Piers bridge several floors; mullions, spandrels and reveals give real shadow depth.
   historic=family['district']=='gothic' or style in ('tenement','arcade','factory_arch','loading')
   pier_width=pitch*.50 if historic else .58
   for col in range(bays+1):
    x=-width/2+col*pitch;facade_box(key,stone if style not in ('fins','ribbon','diagrid','steel') else metal,(x,y+h/2,.08),(pier_width,h,.48),side,edge)
    if lod=='near' and style in ('buttress','colonnade','fluted','fins'):facade_box(key,stone if family['district']=='gothic' else metal,(x,y+h/2,.32),(.22,h,.64),side,edge)
   for row in range(rows):
    by=y+row*rise;facade_box(key,stone,(0,by+.36,.06),(width,.72,.4),side,edge)
    if lod=='near' or row%2==0:facade_box(key,metal if style in ('ribbon','fins','steel') else stone,(0,by+.7,.23),(width+.22,.12,.5),side,edge)
    for col in range(bays):
     x=-width/2+(col+.5)*pitch;pw=pitch-pier_width;ph=rise-.9
     if family['district']=='gothic':pointed_window(key,glass,stone,x,by+.75,pw,ph,side,edge)
     else:facade_box(key,glass,(x,by+.75+ph/2,-.18),(pw,ph,.035),side,edge)
     if lod=='near':
      for sx in [-1,1]:facade_box(key,metal,(x+sx*pw/2,by+.75+ph/2,-.07),(.075,ph,.22),side,edge)
      facade_box(key,metal,(x,by+.75+ph/2,-.06),(.065,ph,.22),side,edge)
      facade_box(key,stone,(x,by+.74,.12),(pw+.22,.13,.5),side,edge)
      if family['district']=='gothic':
       arch(key,stone,x,by+.75,side,edge,pw,ph)
       if style=='triple_lancet':facade_box(key,stone,(x,by+.75+ph*.4,.12),(.16,ph*.8,.28),side,edge)
      if style in ('balcony','oriel') and row>0 and col%2==0:
       facade_box(key,stone,(x,by+.7,.6),(pw+.2,.16,1.4),side,edge);facade_box(key,metal,(x,by+1.3,1.17),(pw+.2,.08,.07),side,edge)
       for sx in [-1,1]:facade_box(key,metal,(x+sx*pw*.5,by+1.0,1.17),(.07,.65,.07),side,edge)
      if style=='loading' and row==0 and col%2==0:
       facade_box(key,metal,(x,by+1.8,.25),(pw,2.8,.3),side,edge)
       for n in range(6):facade_box(key,'p_roof',(x,by+.6+n*.4,.42),(pw,.05,.05),side,edge)
      if style=='factory_arch':arch(key,stone,x,by+.75,side,edge,pw,ph)
   if style=='diagrid' and lod=='near':
    for row in range(0,rows,4):
     yy=y+row*rise;hh=min(h-row*rise,4*rise)
     for col in range(0,bays,2):
      xx=-width/2+col*pitch;beam(key,metal,facade_point(xx,yy,.3,side,edge),facade_point(min(width/2,xx+pitch*2),yy+hh,.3,side,edge),.10)
   if start==0 and lod=='near':
    # Road-facing public entrance, scaled in metres, not normalised to a ten-storey opening.
    facade_box(key,'p_roof',(0,1.6,-.03),(2.4,3.2,.12),side,edge);facade_box(key,metal,(0,3.42,.55),(3.8,.18,1.2),side,edge)
    for sx in [-1,1]:facade_box(key,stone,(sx*1.5,1.7,.3),(.42,3.4,.65),side,edge)
    if family['district']=='gothic':arch(key,stone,0,0,side,edge,3.0,4.2)
 # Coherent, family-specific roof signatures; top remains a real flat landing surface.
 profile=family['profiles'][-1];rw=W*profile[2];rd=D*profile[3]
 for sign in [-1,1]:box(key,stone,(0,height+.5,sign*rd/2),(rw,1,.25));box(key,stone,(sign*rw/2,height+.5,0),(.25,1,rd))
 roof=family['roof']
 if roof in ('pinnacles','belfry','lantern'):
  count=4 if roof=='pinnacles' else 1
  for n in range(count):
   x=(-.32 if n%2==0 else .32)*rw if count>1 else 0;z=(-.3 if n<2 else .3)*rd if count>1 else 0;rh=4.2 if count>1 else 6
   box(key,stone,(x,height+rh*.35,z),(1.6,rh*.7,1.6));poly(key,metal,[(x-.9,height+rh*.7,z-.9),(x+.9,height+rh*.7,z-.9),(x+.9,height+rh*.7,z+.9),(x-.9,height+rh*.7,z+.9),(x,height+rh+2,z)],[(0,1,4),(1,2,4),(2,3,4),(3,0,4)])
 elif roof in ('mansard','copper','barrel'):
  for sign in [-1,1]:poly(key,metal,[(-rw*.42,height+.7,sign*rd*.42),(rw*.42,height+.7,sign*rd*.42),(rw*.32,height+3,sign*rd*.28),(-rw*.32,height+3,sign*rd*.28)],[(0,1,2,3)])
 elif roof=='blade':poly(key,metal,[(-rw*.3,height,-rd*.15),(rw*.3,height,-rd*.15),(rw*.18,height+10,-rd*.15),(-rw*.3,height,rd*.15),(rw*.3,height,rd*.15),(rw*.18,height+10,rd*.15)],[(0,1,2),(3,5,4),(0,3,4,1),(1,4,5,2),(0,2,5,3)])
 elif roof in ('stacks','antenna','gantry'):
  for x in [-rw*.22,rw*.22]:box(key,metal,(x,height+3,-rd*.15),(.8,6,.8))
 elif roof=='sawtooth':
  for z in range(3):
   zz=-rd*.3+z*rd*.25;poly(key,metal,[(-rw*.4,height+.6,zz),(rw*.4,height+.6,zz),(-rw*.4,height+3,zz+rd*.2),(rw*.4,height+3,zz+rd*.2)],[(0,1,3,2)])
 elif roof=='tank':
  for n in range(12):
   a=n*math.tau/12;b=(n+1)*math.tau/12;r=1.65;x=rw*.25;z=-rd*.22;poly(key,'p_brick',[(x+math.cos(a)*r,height+1,z+math.sin(a)*r),(x+math.cos(b)*r,height+1,z+math.sin(b)*r),(x+math.cos(b)*r,height+4.5,z+math.sin(b)*r),(x+math.cos(a)*r,height+4.5,z+math.sin(a)*r)],[(0,1,2,3)])
  for sx in [-1,1]:box(key,metal,(rw*.25+sx,height+.6,-rd*.22),(.12,1.2,2.5))
 elif roof=='garden':
  for x in [-rw*.24,rw*.24]:box(key,stone,(x,height+.45,-rd*.24),(3.5,.9,1.5));box(key,'p_copper',(x,height+.98,-rd*.24),(3.2,.18,1.2))
  for x in [-rw*.2,rw*.2]:box(key,metal,(x,height+1.8,rd*.12),(.1,3.6,.1))
  for z in range(4):box(key,metal,(0,height+3.6,rd*.12+(z-1.5)*.6),(rw*.45,.1,.12))
 if lod!='far':
  box(key,'p_roof',(rw*.13,height+.85,rd*.08),(3.2,1.7,2.8));box(key,metal,(-rw*.21,height+.65,-rd*.1),(2.1,1.3,2.4))
  if lod=='near':
   for n in range(6):box(key,metal,(rw*.13,height+1.73,rd*.08+(n-2.5)*.32),(2.9,.06,.08))
   box(key,stone,(0,height+1.8,rd*.27),(3.2,3.6,3.1));box(key,'p_roof',(0,height+1.5,rd*.27+1.58),(1.2,2.8,.06))
 # Normalise only after physical modules/UVs are authored; runtime dimensions match nominal height.
 for (k,mat),b in list(BUFS.items()):
  if k!=key:continue
  b['physical']=b['v'][:];b['v']=[(x/W,y/height,z/D) for x,y,z in b['v']]
 return key

for family in FAMILIES:
 for height in family['heights']:
  for lod in ['near','mid','far']:building(family,height,lod)

# Signature cathedral: actual buttress aisles, deeply framed portals, rose tracery and roof.
key='premium_cathedral';stone='p_stone';metal='p_copper'
box(key,stone,(0,2,0),(30,4,64));box(key,stone,(0,23,0),(30,2,64))
for side in [1,3]:
 for z in range(-28,33,8):
  facade_box(key,stone,(z,13,.1),(1.15,22,.8),side,15)
  if z<32:
   facade_box(key,'p_glass_warm',(z+4,15,-.35),(5.8,11,.05),side,15);arch(key,stone,z+4,9,side,15,5.9,12)
  x=1 if side==1 else -1;box(key,stone,(x*23,6,z),(2.2,12,2.2));beam(key,stone,(x*15,21,z),(x*23,12,z),.48)
for sign in [-1,1]:
 x=sign*14;box(key,stone,(x,23,34),(10,46,12))
 # Towers are relieved by lancet panels, string courses and angular corner piers.
 for yy in [7,19,32]:
  facade_box(key,'p_glass_warm',(x,yy+3,.06),(5.4,6,.05),0,40);arch(key,stone,x,yy,0,40,5.7,8)
  box(key,stone,(x,yy-1,34),(11,.32,13))
 for sx in [-1,1]:box(key,stone,(x+sx*4.65,23,40.35),(.6,46,.8))
 poly(key,metal,[(x-5,46,28),(x+5,46,28),(x+5,46,40),(x-5,46,40),(x,64,34)],[(0,1,4),(1,2,4),(2,3,4),(3,0,4)])
box(key,stone,(0,13,32),(20,26,.55))
for x in [-6,0,6]:
 box(key,'p_roof',(x,3,32.4),(4.3,6,.08));arch(key,stone,x,0,0,32.7,4.5,7.8)
 # Warm archivolt at the genuinely recessed doors.
 box(key,'p_warm',(x,6.5,33),(3.2,.06,.12))
def ring(cx,cy,z,r,thickness):
 for i in range(40):
  a=i*math.tau/40;b=(i+1)*math.tau/40;beam(key,stone,(cx+math.cos(a)*r,cy+math.sin(a)*r,z),(cx+math.cos(b)*r,cy+math.sin(b)*r,z),thickness)
ring(0,18,32.9,5.3,.34);ring(0,18,33.1,4.55,.13);ring(0,18,33.3,1.5,.12)
poly(key,'p_glass',[(0,18,32.6)]+[(math.cos(i*math.tau/40)*5,18+math.sin(i*math.tau/40)*5,32.6) for i in range(40)],[(0,i+1,(i+1)%40+1) for i in range(40)])
for n in range(12):
 a=n*math.tau/12;beam(key,stone,(math.cos(a)*1.5,18+math.sin(a)*1.5,33.3),(math.cos(a)*4.7,18+math.sin(a)*4.7,33.3),.10)
for sign in [-1,1]:poly(key,metal,[(sign*15,24,-32),(sign*15,24,32),(0,36,32),(0,36,-32)],[(0,1,2,3)])
for z in range(-30,33,5):beam(key,metal,(0,36,z),(0,36,z+2.5),.22)
# Exchange landmark keeps its collision envelope, with fluted bays, terraces and a split crown.
crown={'id':'premium_crown','district':'financial','width':54,'depth':44,'facade':'diagrid','roof':'blade','profiles':[[0,90/280,1,1],[90/280,90/280,46/54,40/44],[180/280,70/280,34/54,32/44],[250/280,30/280,24/54,24/44]]}
ck=building(crown,280,'near')
for (k,mat),b in list(BUFS.items()):
 if k==ck:BUFS[('premium_crown',mat)]=dict(b,v=b['physical']);del BUFS[(k,mat)]
for sign in [-1,1]:box('premium_crown','p_metal',(sign*9,294,0),(1.3,28,20));box('premium_crown','p_neon',(sign*9,294,10.05),(.1,25,.1))

def create_mesh(key,mat,b):
 mesh=bpy.data.meshes.new(key+'__'+mat);mesh.from_pydata([(x,-z,y) for x,y,z in b['v']],[],b['f']);mesh.update();bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(mesh);bm.free();mesh.update();uv=mesh.uv_layers.new(name='Physical UV')
 physical=b.get('physical',b['v'])
 for face in mesh.polygons:
  n=face.normal
  for idx in face.loop_indices:
   x,y,z=physical[mesh.loops[idx].vertex_index];uv.data[idx].uv=((x,z) if abs(n.z)>.65 else (x,y) if abs(n.y)>abs(n.x) else (z,y))
 o=bpy.data.objects.new(key+'__'+mat,mesh);bpy.context.collection.objects.link(o);mesh.materials.append(MATS[mat]);o.asset_mark();OBJS.append(o);RECORDS.append({'asset':key,'material':mat,'vertices':len(mesh.vertices),'triangles':sum(len(p.vertices)-2 for p in mesh.polygons)})
for (key,mat),b in BUFS.items():create_mesh(key,mat,b)
# Editable original library, with all authored variants and inspectable physical UVs.
bpy.context.scene.name='AEGIS Premium Architecture Library';bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'aegis-premium-architecture.blend'))
bpy.ops.export_scene.gltf(filepath=str(PUBLIC/'aegis-premium-architecture.glb'),export_format='GLB',export_yup=True,export_materials='EXPORT',export_texcoords=True,export_normals=True)
(PUBLIC/'families.json').write_text(json.dumps(FAMILIES,indent=2));(PUBLIC/'authored-manifest.json').write_text(json.dumps({'original':True,'author':'AEGIS project','families':FAMILIES,'meshes':RECORDS,'triangles':sum(r['triangles'] for r in RECORDS),'source':'art/environment/phase7/premium_build.py'},indent=2));print('PREMIUM EXPORT',len(OBJS),sum(r['triangles'] for r in RECORDS))
