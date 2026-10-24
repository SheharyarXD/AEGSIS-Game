import bpy,json
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[3];folder=R/'art/environment/city-redesign/quaternius/Exports/glTF (Godot)';result=[]
for name in ['Trim_FirstFloor_Window_Columns','Trim_Window','Brick_Inset_Window','Brick_TopTrim','Cornice_Trim_Center','Roof_4x4','DoorFrame_Trim','Stairs_Entrance_Concrete','Roof_Slate_Window_1']:
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(folder/(name+'.gltf')));p=[o.matrix_world@Vector(v) for o in bpy.context.scene.objects if o.type=='MESH' for v in o.bound_box];lo=[min(v[i] for v in p) for i in range(3)];hi=[max(v[i] for v in p) for i in range(3)];result.append(dict(name=name,min=lo,max=hi,size=[hi[i]-lo[i] for i in range(3)]))
(R/'art/environment/city-redesign/modular-inspection.json').write_text(json.dumps(result,indent=2));print(result)
