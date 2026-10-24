import { CanvasTexture, DoubleSide, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import { AssetLibrary } from './AssetLibrary';
/** One shared opaque atlas and one instanced label draw for original city street names. */
export function installStreetSigns(assets:AssetLibrary){
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;const c=canvas.getContext('2d')!;
 const names=['VANGUARD AV','MERIDIAN ST','ATLAS AV','LANTERN ST','FOUNDRY RD','CROWN AV','ARCHIVE ST','IRONWAKE RD','UNITY AV','BELLWETHER ST','HARBOR AV','TITAN WAY','CHARTER ST','SENTINEL AV','VESPER ST','BREAKWATER AV'];
 c.fillStyle='#1d3c36';c.fillRect(0,0,512,512);c.font='600 25px Arial';c.textAlign='center';c.textBaseline='middle';
 names.forEach((name,i)=>{c.strokeStyle='#b2c8ba';c.lineWidth=1;c.strokeRect(3,i*32+2,506,28);c.fillStyle='#e3e9db';c.fillText(name,256,i*32+16);});
 const map=new CanvasTexture(canvas);map.colorSpace=SRGBColorSpace;map.flipY=true;map.anisotropy=2;
 const material=new MeshStandardMaterial({name:'realism_street_names',map,roughness:.85,side:DoubleSide});
 material.onBeforeCompile=s=>{s.vertexShader=s.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>\n#ifdef USE_MAP\n#ifdef USE_INSTANCING\nfloat streetName=mod(floor(abs(instanceMatrix[3].x)*.13+abs(instanceMatrix[3].z)*.07),16.);vMapUv.y=(vMapUv.y+streetName)/16.;\n#endif\n#endif`);};material.customProgramCacheKey=()=> 'original-street-name-atlas-1';
 assets.materials.adopt(material.name,material);const geometry=new PlaneGeometry(1.44,.21);geometry.translate(0,3.3,.031);assets.parts.set('realism_sign_label',[{geometry,material:material.name}]);
 return ()=>map.dispose();
}
