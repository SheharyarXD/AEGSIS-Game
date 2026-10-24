import bpy,json
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parent;report={}
for folder in sorted((root/'external').iterdir()):
 if not folder.is_dir():continue
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(folder/(folder.name+'.gltf')))
 entries=[]
 for o in bpy.context.scene.objects:
  if o.type!='MESH':continue
  bounds=[o.matrix_world@Vector(v) for v in o.bound_box]
  entries.append({'name':o.name,'vertices':len(o.data.vertices),'faces':len(o.data.polygons),'min':[min(v[i] for v in bounds) for i in range(3)],'max':[max(v[i] for v in bounds) for i in range(3)],'materials':[m.name for m in o.data.materials]})
 report[folder.name]=entries
(root/'source-inspection.json').write_text(json.dumps(report,indent=2));print('SOURCE INSPECTION',[(k,len(v)) for k,v in report.items()])
