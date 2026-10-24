"""Preserve supplied architecture, UVs and materials; cut actual surfaces into damage sections.
Only generated copies change. The external originals remain untouched.
"""
import bpy,bmesh,math,json
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parent;PROJECT=ROOT.parents[2];OUT=PROJECT/'public/assets/environment/premium/provided';OUT.mkdir(parents=True,exist_ok=True);SOURCE=ROOT/'provided';SOURCE.mkdir(exist_ok=True)
SPECS=[{'id':'aer_glass','source':'free_london_skyscraper.glb','name':'Crown / London glass tower','buildingId':235,'x':170,'z':-390,'height':168,'style':'financial','district':'financial','orientation':0}, {'id':'aer_gothic','source':'gothic_building_for_aria_pack_1.0.glb','name':'Saint Vesper / Aria Gothic tower','buildingId':211,'x':-534,'z':-390,'height':152,'style':'gothic','district':'gothic','orientation':0}]
ALL=[];global_id=0
for spec in SPECS:
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(PROJECT/'art/external'/spec['source']));bpy.context.view_layer.update();objects=[]
 for obj in list(bpy.context.scene.objects):
  if obj.type!='MESH':continue
  world=[obj.matrix_world@Vector(v) for v in obj.bound_box];cx=(min(v.x for v in world)+max(v.x for v in world))/2
  if spec['id']=='aer_gothic' and not 11180<cx<12820:continue
  if spec['id']=='aer_glass' and any(t in m.name for m in obj.data.materials if m for t in ['Sidewalk','Color_Pallete']):continue
  objects.append(obj)
 if not objects:raise RuntimeError('No architecture selected')
 bounds=[obj.matrix_world@Vector(v) for obj in objects for v in obj.bound_box];lo=Vector([min(v[i] for v in bounds) for i in range(3)]);hi=Vector([max(v[i] for v in bounds) for i in range(3)]);scale=spec['height']/(hi.z-lo.z);center=Vector(((hi.x+lo.x)/2,(hi.y+lo.y)/2,lo.z));W=(hi.x-lo.x)*scale;D=(hi.y-lo.y)*scale;H=spec['height'];spec.update(width=round(W,5),depth=round(D,5),heights=[H],facade='source model',roof='source roof')
 # Convert original geometry uniformly into metres; do not stretch the silhouette.
 for obj in objects:
  transform=Matrix.Scale(scale,4)@Matrix.Translation(-center)@obj.matrix_world;obj.data=obj.data.copy();obj.data.transform(transform);obj.parent=None;obj.matrix_world=Matrix.Identity(4)
 for obj in list(bpy.data.objects):
  if obj not in objects:bpy.data.objects.remove(obj,do_unlink=True)
 for image in bpy.data.images:
  if image.size[0]>0:image.pack()
 bpy.context.scene.name=spec['name']+' / complete source';bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/(spec['id']+'-source.blend')))
 components=[];component_lookup={};buffers={};groups={};floor_bounds={}
 for obj in objects:
  print('SEGMENT',spec['id'],obj.name,flush=True);mesh=obj.data;bm=bmesh.new();bm.from_mesh(mesh);uv_layer=bm.loops.layers.uv.active
  # Physical cuts preserve geometry and interpolated original UVs. Whole-height facade triangles become local sections.
  geom=lambda:list(bm.verts)+list(bm.edges)+list(bm.faces)
  if obj.dimensions.z>4.2:
   for z in range(4,H,4):bmesh.ops.bisect_plane(bm,geom=geom(),dist=.00001,plane_co=(0,0,z),plane_no=(0,0,1),clear_inner=False,clear_outer=False)
  if obj.dimensions.x>6:
   for x in range(math.ceil(-W/2/5)*5,math.floor(W/2/5)*5+1,5):bmesh.ops.bisect_plane(bm,geom=geom(),dist=.00001,plane_co=(x,0,0),plane_no=(1,0,0),clear_inner=False,clear_outer=False)
  if obj.dimensions.y>6:
   for y in range(math.ceil(-D/2/5)*5,math.floor(D/2/5)*5+1,5):bmesh.ops.bisect_plane(bm,geom=geom(),dist=.00001,plane_co=(0,y,0),plane_no=(0,1,0),clear_inner=False,clear_outer=False)
  bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.normal_update()
  for face in bm.faces:
   material=obj.data.materials[face.material_index];name=material.name;point=face.calc_center_median();floor=max(0,min(H//4,int(point.z/4)));side=0 if point.y<-D*.28 else 2 if point.y>D*.28 else 1 if point.x>W*.28 else 3 if point.x<-W*.28 else -1
   kind='glass' if 'glass' in name.lower() else 'roof' if floor>=H//4-1 else 'support' if 'Pillar' in obj.name or 'Concrete_Pillar' in name else 'decoration' if any(t in obj.name for t in ['Logo','Furniture','Light','Circle']) else 'wall'
   group=(kind,floor,side,math.floor(point.x/5),math.floor(point.y/5))
   if group not in groups:
    cid=global_id;global_id+=1;groups[group]=cid;components.append({'id':cid,'family':spec['id'],'key':f"{spec['id']}_c{cid:05d}",'kind':kind,'floor':floor,'side':side,'structural':False,'hp':{'glass':18,'wall':180,'roof':180,'support':360,'decoration':80}[kind],'vertices':[]})
   cid=groups[group];c=component_lookup.setdefault(cid,components[-1]);b=buffers.setdefault(name,{'v':[],'n':[],'uv':[],'f':[],'cid':[],'material':material});start=len(b['v'])
   for loop in face.loops:
    v=loop.vert.co.copy();b['v'].append(tuple(v));b['n'].append(tuple(loop.vert.normal if face.smooth else face.normal));b['uv'].append(tuple(loop[uv_layer].uv) if uv_layer else (0,0));b['cid'].append(float(cid));c['vertices'].append(tuple(v))
    floor_bounds.setdefault(floor,[]).append(tuple(v))
   b['f'].append(tuple(range(start,len(b['v']))))
  bm.free()
 # Hidden structural rooms and floor sections are additions, not replacements for original external architecture.
 concrete=bpy.data.materials.new('p_concrete');concrete.use_nodes=True;concrete.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.2,.23,.26,1)
 def section(kind,floor,p,size,structural=False):
  global global_id
  cid=global_id;global_id+=1;x,y,z=p;a,d,h=[n/2 for n in size];verts=[(x+sx*a,y+sy*d,z+sz*h) for sx,sy,sz in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]];faces=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)];b=buffers.setdefault('p_concrete',{'v':[],'n':[],'uv':[],'f':[],'cid':[],'material':concrete})
  for f in faces:
   vv=[Vector(verts[i]) for i in f];n=(vv[1]-vv[0]).cross(vv[2]-vv[0]).normalized();start=len(b['v'])
   for v in vv:b['v'].append(tuple(v));b['n'].append(tuple(n));b['uv'].append((v.x,v.z));b['cid'].append(float(cid))
   b['f'].append(tuple(range(start,start+4)))
  components.append({'id':cid,'family':spec['id'],'key':f"{spec['id']}_c{cid:05d}",'kind':kind,'floor':floor,'side':-1,'structural':structural,'hp':480 if structural else 240,'vertices':verts,'collisionBoxes':[{'center':[x,z,-y],'size':[size[0],size[2],size[1]]}]})
 def hull(points):
  points=sorted(set((round(p[0],5),round(p[1],5)) for p in points))
  def cross(o,a,b):return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
  low=[];high=[]
  for p in points:
   while len(low)>=2 and cross(low[-2],low[-1],p)<=0:low.pop()
   low.append(p)
  for p in reversed(points):
   while len(high)>=2 and cross(high[-2],high[-1],p)<=0:high.pop()
   high.append(p)
  return low[:-1]+high[:-1]
 def clipped(points,axis,center,sign):
  result=[]
  for a,b in zip(points,points[1:]+points[:1]):
   va=(a[axis]-center)*sign;vb=(b[axis]-center)*sign
   if va>=0:result.append(a)
   if (va>=0)!=(vb>=0):
    t=va/(va-vb);result.append((a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])))
  return result
 def floor_section(floor,points):
  global global_id
  if len(points)<3:return
  cid=global_id;global_id+=1;N=len(points);verts=[(x,y,floor*4+z) for z in [.02,.28] for x,y in points];faces=[tuple(range(N-1,-1,-1)),tuple(range(N,N*2))]+[(i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N)];b=buffers.setdefault('p_concrete',{'v':[],'n':[],'uv':[],'f':[],'cid':[],'material':concrete})
  for f in faces:
   vv=[Vector(verts[i]) for i in f];normal=(vv[1]-vv[0]).cross(vv[2]-vv[0]).normalized();start=len(b['v'])
   for v in vv:b['v'].append(tuple(v));b['n'].append(tuple(normal));b['uv'].append((v.x,v.y));b['cid'].append(float(cid))
   b['f'].append(tuple(range(start,len(b['v']))))
  components.append({'id':cid,'family':spec['id'],'key':f"{spec['id']}_c{cid:05d}",'kind':'slab','floor':floor,'side':-1,'structural':False,'hp':240,'vertices':verts})
 # Derive changing envelopes from the supplied model, avoiding a stretched generic collision tower.
 profiles=[]
 for floor in range(math.ceil(H/4)):
  pts=floor_bounds.get(floor) or floor_bounds.get(max(0,floor-1)) or [(0,0,0)];wx=max(.12,min(1,(max(p[0] for p in pts)-min(p[0] for p in pts))/W));dy=max(.12,min(1,(max(p[1] for p in pts)-min(p[1] for p in pts))/D));profiles.append([floor*4/H,min(4,H-floor*4)/H,wx,dy])
  # Convex floor contours follow the actual curved skin; Gothic spires receive no room boxes.
  outline=hull(pts);cx=sum(p[0] for p in outline)/max(1,len(outline));cy=sum(p[1] for p in outline)/max(1,len(outline))
  if min(W*wx,D*dy)<6 or floor*4>H*.86:continue
  shrink=.90 if spec['id']=='aer_glass' else .64;outline=[(cx+(x-cx)*shrink,cy+(y-cy)*shrink) for x,y in outline]
  for sx in [-1,1]:
   for sy in [-1,1]:
    floor_section(floor,clipped(clipped(outline,0,cx,sx),1,cy,sy))
    section('support',floor,(cx+sx*W*wx*.19,cy+sy*D*dy*.19,floor*4+2),(.62,.62,4),True)
  section('support',floor,(cx,cy,floor*4+2),(min(2.2,W*wx*.17),min(2.2,D*dy*.17),4),True)
 spec['profiles']=profiles
 for c in components:
  vs=c.pop('vertices');low=[min(v[i] for v in vs) for i in range(3)];high=[max(v[i] for v in vs) for i in range(3)];c['center']=[(low[0]+high[0])/2,(low[2]+high[2])/2,-(low[1]+high[1])/2];c['size']=[max(.04,high[0]-low[0]),max(.04,high[2]-low[2]),max(.04,high[1]-low[1])];ALL.append(c)
 # Runtime copies use shared 1K maps; full-detail original materials remain in the source Blender file.
 for image in bpy.data.images:
  if image.size[0]>0 and max(image.size)>1024:image.scale(max(1,round(image.size[0]*1024/max(image.size))),max(1,round(image.size[1]*1024/max(image.size))))
 for obj in objects:obj.hide_render=True;obj.hide_set(True)
 near_objects=[]
 for lod in ['near','mid','far']:
  exported=[]
  for name,b in buffers.items():
   material=b['material'];material.name='src_'+('london_' if spec['id']=='aer_glass' else 'aria_')+name if not name.startswith('p_') else name
   m=bpy.data.meshes.new(spec['id']+'_'+lod+'_'+name);m.from_pydata([(x/W,y/D,z/H) for x,y,z in b['v']],[],b['f']);m.update();m.materials.append(material);uv=m.uv_layers.new(name='Source UV');attr=m.attributes.new(name='_CID',type='FLOAT',domain='POINT');attr.data.foreach_set('value',b['cid'])
   for loop in m.loops:uv.data[loop.index].uv=b['uv'][loop.vertex_index]
   for p in m.polygons:p.use_smooth=True
   m.normals_split_custom_set([tuple(Vector((b['n'][loop.vertex_index][0]*W,b['n'][loop.vertex_index][1]*D,b['n'][loop.vertex_index][2]*H)).normalized()) for loop in m.loops]);obj=bpy.data.objects.new(f"{spec['id']}_{H}_{lod}__{material.name}",m);bpy.context.collection.objects.link(obj);exported.append(obj)
   if lod!='near':
    # The damage export deliberately splits vertices by section. Reconnect coincident
    # vertices before reducing LODs, otherwise isolated triangles are deleted as islands.
    bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000005);bm.to_mesh(obj.data);bm.free();obj.data.update()
    bpy.context.view_layer.objects.active=obj;dec=obj.modifiers.new('Preserve authored silhouette LOD','DECIMATE');dec.ratio=.46 if lod=='mid' else .13;bpy.ops.object.modifier_apply(modifier=dec.name)
  bpy.ops.object.select_all(action='DESELECT')
  for obj in exported:obj.select_set(True)
  bpy.ops.export_scene.gltf(filepath=str(OUT/(spec['id']+'-'+lod+'.glb')),export_format='GLB',use_selection=True,export_attributes=True,export_normals=True,export_texcoords=True,export_image_format='JPEG',export_jpeg_quality=90)
  for obj in exported:
   obj.hide_set(True);obj.hide_render=True
  if lod=='near':near_objects=exported[:]
 for obj in near_objects:obj.hide_set(False);obj.hide_render=False;obj.scale=(W,D,H)
 bpy.context.scene.name=spec['name']+' / UV-preserving destruction and LODs';bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/(spec['id']+'-destructible.blend')));print('PREPARED',spec,len(components),flush=True)
(OUT/'components.json').write_text(json.dumps({'families':SPECS,'components':ALL,'method':'Actual source geometry cut at floor and bay boundaries; source UVs and materials preserved, hidden interior structural additions.'},indent=2));print('PROVIDED BUILDINGS READY',len(ALL))
