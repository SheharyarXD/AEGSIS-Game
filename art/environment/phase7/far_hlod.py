"""Closed distant silhouettes derived from each supplied model's real cross-sections.
Near models retain the full source geometry. This is a generated HLOD, not a replacement model.
"""
import bpy,math,json,sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3];namespace=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'city';folder=ROOT/'public/assets/environment/premium'/namespace;specs=json.loads((folder/'components.json').read_text())['families']
def hull(points):
 points=sorted(set((round(p[0],6),round(p[1],6)) for p in points))
 def cross(o,a,b):return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
 a=[];b=[]
 for p in points:
  while len(a)>1 and cross(a[-2],a[-1],p)<=0:a.pop()
  a.append(p)
 for p in reversed(points):
  while len(b)>1 and cross(b[-2],b[-1],p)<=0:b.pop()
  b.append(p)
 result=a[:-1]+b[:-1]
 while len(result)>12:
  scores=[abs(cross(result[i-1],p,result[(i+1)%len(result)])) for i,p in enumerate(result)];result.pop(scores.index(min(scores)))
 return result
for spec in specs:
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(folder/(spec['id']+'-near.glb')));bpy.context.view_layer.update();objects=[o for o in bpy.context.scene.objects if o.type=='MESH'];points=[]
 for obj in objects:
  if all(m.name.startswith('p_') for m in obj.data.materials):continue
  mesh=obj.data;uv=mesh.uv_layers.active
  for face in mesh.polygons:
   material=mesh.materials[face.material_index]
   for loop_index in face.loop_indices:
    loop=mesh.loops[loop_index];p=obj.matrix_world@mesh.vertices[loop.vertex_index].co;points.append((p.x,p.y,p.z,tuple(uv.data[loop_index].uv) if uv else (0,0),material))
 buffers={};H=spec['height'];levels=math.ceil(H/8)
 for level in range(levels):
  low=level*8/H;high=min(1,(level+1)*8/H);sample=[p for p in points if low-.00001<=p[2]<=high+.00001];outline=hull(sample)
  if len(outline)<3:continue
  for a,b in zip(outline,outline[1:]+outline[:1]):
   cx=(a[0]+b[0])/2;cy=(a[1]+b[1])/2;closest=min(sample,key=lambda p:(p[0]-cx)**2+(p[1]-cy)**2);material=closest[4];buffer=buffers.setdefault(material.name,{'material':material,'v':[],'f':[],'uv':[]});start=len(buffer['v'])
   for x,y,z in [(a[0],a[1],low),(b[0],b[1],low),(b[0],b[1],high),(a[0],a[1],high)]:
    source=min(sample,key=lambda p:(p[0]-x)**2+(p[1]-y)**2+(p[2]-z)**2);buffer['v'].append((x,y,z));buffer['uv'].append(source[3])
   buffer['f'].append((start,start+1,start+2,start+3))
  material=sample[0][4];buffer=buffers.setdefault(material.name,{'material':material,'v':[],'f':[],'uv':[]});start=len(buffer['v']);buffer['v'] += [(x,y,high) for x,y in outline];buffer['uv'] += [min(sample,key=lambda p:(p[0]-x)**2+(p[1]-y)**2)[3] for x,y in outline];buffer['f'].append(tuple(range(start,len(buffer['v']))))
 for obj in objects:bpy.data.objects.remove(obj,do_unlink=True)
 for name,b in buffers.items():
  mesh=bpy.data.meshes.new(spec['id']+'_far');mesh.from_pydata(b['v'],[],b['f']);mesh.update();uv=mesh.uv_layers.new(name='Source UV approximation')
  for loop in mesh.loops:uv.data[loop.index].uv=b['uv'][loop.vertex_index]
  mesh.materials.append(b['material']);obj=bpy.data.objects.new(f"{spec['id']}_{H}_far__{name}",mesh);bpy.context.collection.objects.link(obj)
 bpy.ops.export_scene.gltf(filepath=str(folder/(spec['id']+'-far.glb')),export_format='GLB',export_normals=True,export_texcoords=True,export_image_format='JPEG',export_jpeg_quality=90);print('CLOSED SOURCE HLOD',spec['id'],sum(len(b['f']) for b in buffers.values()),flush=True)
