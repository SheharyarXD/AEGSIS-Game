import fs from 'node:fs/promises';
const base='https://raw.githubusercontent.com/godotengine/tps-demo/a82f15448e9b015440d3bbdf5e10801b260c4e9f/enemies/red_robot/';
await fs.mkdir('assets-source/godot-tps/red-robot',{recursive:true});
for(const path of ['model/red_robot.glb',...['albedo','normal','orm','emission'].map(n=>`textures/red_robot_${n}.png`)]){
 const dest='assets-source/godot-tps/red-robot/'+path.split('/').pop();try{await fs.access(dest)}catch{const r=await fetch(base+path);if(!r.ok)throw new Error('Download '+path+' '+r.status);await fs.writeFile(dest,Buffer.from(await r.arrayBuffer()));}console.log(dest);
}
const b=await fs.readFile('assets-source/godot-tps/red-robot/red_robot.glb');const j=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)));await fs.writeFile('assets-source/godot-tps/red-robot/gltf-inspect.json',JSON.stringify(j,null,2));console.log(JSON.stringify({nodes:j.nodes.map(n=>({name:n.name,mesh:n.mesh,skin:n.skin})),materials:j.materials,images:j.images,animations:j.animations.map(a=>a.name),skin:j.skins?.map(s=>({name:s.name,bones:s.joints.length}))},null,2));
