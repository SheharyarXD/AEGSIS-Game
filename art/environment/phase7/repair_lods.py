"""Rebuild LODs from intact meshes without deleting disconnected facade islands."""
import bpy,bmesh,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];namespace=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'city';folder=ROOT/'public/assets/environment/premium'/namespace;specs=json.loads((folder/'components.json').read_text())['families']
for spec in specs:
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(folder/(spec['id']+'-near.glb')));objects=[o for o in bpy.context.scene.objects if o.type=='MESH'];originals=[(o,o.data.copy(),o.name) for o in objects]
 for lod,angle in [('mid',.06),('far',.28)]:
  for obj,mesh,name in originals:
   obj.data=mesh.copy();obj.name=name.replace('_near__','_'+lod+'__');bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000002)
   # UVs remain loop data after welding. Planar dissolve retains isolated glass panes and walls.
   bmesh.ops.dissolve_limit(bm,angle_limit=angle,use_dissolve_boundaries=False,verts=list(bm.verts),edges=list(bm.edges),delimit={'UV','MATERIAL'});bm.to_mesh(obj.data);bm.free();obj.data.update()
  bpy.ops.export_scene.gltf(filepath=str(folder/(spec['id']+'-'+lod+'.glb')),export_format='GLB',export_normals=True,export_texcoords=True,export_attributes=True,export_image_format='JPEG',export_jpeg_quality=90)
 print('REPAIRED LODS',spec['id'],flush=True)
