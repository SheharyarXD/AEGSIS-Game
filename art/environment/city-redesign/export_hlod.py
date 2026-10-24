"""Five authored source-view cards per building; no generated primary box architecture."""
import bpy,json
from pathlib import Path
R=Path(__file__).resolve().parents[3];out=R/'public/assets/environment/metropolis';specs=json.loads((R/'art/environment/city-redesign/used-families.json').read_text());views=json.loads((out/'atlas-views.json').read_text())
bpy.ops.wm.read_factory_settings(use_empty=True)
mat=bpy.data.materials.new('city_hlod_atlas');mat.use_nodes=True;mat.diffuse_color=(1,1,1,1);mat.surface_render_method='DITHERED';shader=mat.node_tree.nodes.get('Principled BSDF');shader.inputs['Roughness'].default_value=1
# Tiny export placeholder; runtime uses the compressed, full shared atlas.
image=bpy.data.images.new('Runtime BC3 atlas placeholder',width=1,height=1);image.pixels[:]=[1,1,1,1];image.pack();tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image;mat.node_tree.links.new(tex.outputs['Color'],shader.inputs['Base Color']);mat.node_tree.links.new(tex.outputs['Alpha'],shader.inputs['Alpha'])
planes=[([(-.5,-.5,0),(.5,-.5,0),(.5,-.5,1),(-.5,-.5,1)],False),([(.5,-.5,0),(.5,.5,0),(.5,.5,1),(.5,-.5,1)],False),([(.5,.5,0),(-.5,.5,0),(-.5,.5,1),(.5,.5,1)],False),([(-.5,.5,0),(-.5,-.5,0),(-.5,-.5,1),(-.5,.5,1)],False),([(-.5,-.5,1),(.5,-.5,1),(.5,.5,1),(-.5,.5,1)],True)]
for f in specs:
 vertices=[];faces=[];uvs=[]
 for side,(verts,top) in enumerate(planes):
  start=len(vertices);vertices+=verts;faces.append(tuple(range(start,start+4)));u0,v0,u1,v1=views[f['id']][side]['uv'];uvs.extend([(u0,v0),(u1,v0),(u1,v1),(u0,v1)])
 mesh=bpy.data.meshes.new(f['id']+' baked silhouette');mesh.from_pydata(vertices,[],faces);mesh.materials.append(mat);layer=mesh.uv_layers.new(name='Authored facade atlas')
 for poly in mesh.polygons:
  for loop in poly.loop_indices:layer.data[loop].uv=uvs[mesh.loops[loop].vertex_index]
 obj=bpy.data.objects.new(f'{f["id"]}_{f["height"]}_far__source',mesh);bpy.context.scene.collection.objects.link(obj);obj['aegisKey']=f'{f["id"]}_{f["height"]}_far';obj['source']=f['source'];obj['LOD']='Baked intact source views for distant presentation only'
bpy.ops.export_scene.gltf(filepath=str(out/'metropolis-hlod.glb'),export_format='GLB',export_extras=True,export_image_format='AUTO',export_normals=True,export_texcoords=True)
# The editable review file shows the real atlas and a separated, metre-scale gallery.
# The runtime GLB above stays normalized and uses the game's shared DDS/WebP atlas.
tex.image=bpy.data.images.load(str(out/'source-facades.png'));tex.image.pack()
for i,f in enumerate(specs):
 obj=bpy.data.objects.get(f'{f["id"]}_{f["height"]}_far__source');obj.location=((i%5)*100,(i//5)*100,0);obj.scale=(f['width'],f['depth'],f['height'])
bpy.ops.wm.save_as_mainfile(filepath=str(R/'art/environment/city-redesign/metropolis-hlod.blend'))
print('EXPORTED source-derived distant atlas cards',len(specs))
