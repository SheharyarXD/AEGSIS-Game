"""Reduce complete source meshes before damage segmentation, retaining skin, UVs and panes."""
import bpy,bmesh,json,sys
from pathlib import Path
from mathutils import Matrix
ROOT=Path(__file__).resolve().parents[3];namespace=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'city';folder=ROOT/'public/assets/environment/premium'/namespace;source=ROOT/'art/environment/phase7'/namespace;specs=json.loads((folder/'components.json').read_text())['families']
arguments=sys.argv[sys.argv.index('--')+2:] if '--' in sys.argv else [];selected=arguments[0].split(',') if arguments else None
for spec in specs:
 if selected and spec['id'] not in selected:continue
 bpy.ops.wm.open_mainfile(filepath=str(source/(spec['id']+'-source.blend')));objects=[o for o in bpy.context.scene.objects if o.type=='MESH'];originals=[(o,o.data.copy(),o.matrix_world.copy(),o.name) for o in objects];W,H,D=spec['width'],spec['height'],spec['depth']
 for image in bpy.data.images:
  if image.size[0]>0 and max(image.size)>1024:image.scale(max(1,round(image.size[0]*1024/max(image.size))),max(1,round(image.size[1]*1024/max(image.size))))
 for lod in ['mid','far']:
  for obj,mesh,world,original_name in originals:
   obj.data=mesh.copy();obj.matrix_world=world.copy();obj.parent=None;bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bmesh.ops.dissolve_limit(bm,angle_limit=.04 if lod=='mid' else .14,use_dissolve_boundaries=False,verts=list(bm.verts),edges=list(bm.edges),delimit={'UV','MATERIAL'});bm.to_mesh(obj.data);bm.free();obj.data.update()
   # Preserve simple planar skins and all glazing. Reduce closed ornament and roof details.
   glass=any('glass' in m.name.lower() for m in obj.data.materials);ornament=any(t in original_name for t in ['Pillar','Pattern','Barrier','Logo','Circle','Furniture','Decoration'])
   structural_detail=any(t in original_name for t in ['Pillar','Barrier'])
   obj.data.calc_loop_triangles();triangles=len(obj.data.loop_triangles)
   # A collapsed 12-triangle pillar can leave its capital floating. Small authored
   # supports retain their full silhouette after conservative planar simplification.
   if not glass and not structural_detail and triangles>512 and (ornament or len(obj.data.polygons)>6000):
    bpy.context.view_layer.objects.active=obj;dec=obj.modifiers.new('Closed source detail reduction','DECIMATE');dec.ratio=max(.42 if lod=='mid' else .08,192/triangles);bpy.ops.object.modifier_apply(modifier=dec.name)
   obj.data.transform(Matrix.Diagonal((1/W,1/D,1/H,1)));obj.matrix_world=Matrix.Identity(4);obj.name=spec['id']+'_'+str(H)+'_'+lod+'__source';obj['aegisKey']=spec['id']+'_'+str(H)+'_'+lod
   prefix=spec.get('materialPrefix','london' if spec['id']=='aer_glass' else 'aria')
   for m in obj.data.materials:
    if not m.name.startswith('src_'):m.name='src_'+prefix+'_'+m.name
  bpy.ops.export_scene.gltf(filepath=str(folder/(spec['id']+'-'+lod+'.glb')),export_format='GLB',export_extras=True,export_normals=True,export_texcoords=True,export_image_format='JPEG',export_jpeg_quality=90)
 print('SOURCE LODS',spec['id'],flush=True)
