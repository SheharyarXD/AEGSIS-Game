import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
const size=512,cell=256,heights=new Float32Array(size*size),color=Buffer.alloc(size*size*3),normal=Buffer.alloc(size*size*3),orm=Buffer.alloc(size*size*3);
let seed=4197;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for(let y=0;y<size;y++)for(let x=0;x<size;x++){
 const quadrant=(x>=cell?1:0)+(y>=cell?2:0),px=x%cell,py=y%cell,noise=random();
 let mortar=false,base=150,rough=225,h=.55;
 if(quadrant===0){const row=Math.floor(py/42);mortar=py%42<3||(px+(row%2)*31)%64<3;base=160+(noise-.5)*30;h=mortar?.12:.6+noise*.09;}
 if(quadrant===1){const row=Math.floor(py/22);mortar=py%22<2||(px+(row%2)*32)%64<2;base=160+(noise-.5)*35;h=mortar?.12:.65+noise*.05;}
 if(quadrant===2){base=158+(noise-.5)*24;h=.5+noise*.018;rough=110+(noise-.5)*35;}
 if(quadrant===3){mortar=px%64<1||py%64<1;base=150+(noise-.5)*55;h=mortar?.1:.6+noise*.10;rough=235;}
 const i=(y*size+x)*3,v=mortar?base*.55:base;
 color[i]=Math.round(v*(quadrant===1?1.07:1));color[i+1]=Math.round(v*(quadrant===1?.92:1));color[i+2]=Math.round(v*(quadrant===1?.84:1.02));
 heights[y*size+x]=h;orm[i]=mortar?180:255;orm[i+1]=rough;orm[i+2]=quadrant===2?180:0;
}
for(let y=0;y<size;y++)for(let x=0;x<size;x++){
 const ox=Math.floor(x/cell)*cell,oy=Math.floor(y/cell)*cell,get=(xx,yy)=>heights[(oy+(yy-oy+cell)%cell)*size+ox+(xx-ox+cell)%cell];
 const dx=(get(x+1,y)-get(x-1,y))*2,dy=(get(x,y+1)-get(x,y-1))*2,length=Math.hypot(dx,dy,1),i=(y*size+x)*3;
 normal[i]=Math.round((-dx/length*.5+.5)*255);normal[i+1]=Math.round((dy/length*.5+.5)*255);normal[i+2]=Math.round((1/length*.5+.5)*255);
}
const out='public/assets/environment';await mkdir(out,{recursive:true});
await mkdir('art/environment/textures',{recursive:true});
for(const [name,data] of [['atlas-color',color],['atlas-normal',normal],['atlas-orm',orm]])await sharp(data,{raw:{width:size,height:size,channels:3}}).webp({lossless:name!=='atlas-color',quality:92}).toFile(`${out}/${name}.webp`);
for(const [name,data] of [['atlas-color',color],['atlas-normal',normal],['atlas-orm',orm]])await sharp(data,{raw:{width:size,height:size,channels:3}}).png().toFile(`art/environment/textures/${name}.png`);
await writeFile(`${out}/atlas-manifest.json`,JSON.stringify({creator:'AEGIS original procedural material pipeline',license:'Original project assets',source:'scripts/prepare-environment-materials.mjs',size:[512,512],quadrants:['cut stone','brick','weathered steel','roofing tar'],maps:['base color','OpenGL normal','packed occlusion / roughness / metallic'],seed:4197},null,2));
