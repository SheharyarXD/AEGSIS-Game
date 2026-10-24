// Only three individually licensed 1K maps; optimize to 512px WebP, keep provenance.
import { mkdir,writeFile } from 'node:fs/promises';
import sharp from 'sharp';
const out='public/assets/environment';await mkdir(out,{recursive:true});
const assets=[];
for(const [map,name] of [['diff','diff'],['nor_gl','normal'],['rough','rough']]){
 const url=`https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/asphalt_02/asphalt_02_${map}_1k.jpg`;
 const response=await fetch(url);if(!response.ok)throw new Error(`Asset download failed: ${url} (${response.status})`);
 const source=Buffer.from(await response.arrayBuffer());const optimized=await sharp(source).resize(512,512).webp({quality:87}).toBuffer();
 const file=`asphalt-${name}.webp`;await writeFile(`${out}/${file}`,optimized);
 assets.push({name:`Asphalt 02 ${map}`,creator:'Rob Tuytel / Poly Haven',sourceUrl:'https://polyhaven.com/a/asphalt_02',downloadUrl:url,license:'CC0-1.0',licenseUrl:'https://polyhaven.com/license',attributionRequired:false,commercialUse:true,downloadDate:'2026-10-11',originalFormat:'JPEG 1024×1024',originalBytes:source.length,optimizedFormat:'WebP 512×512',optimizedBytes:optimized.length,file,modifications:['Reduced to 512×512','Re-encoded WebP, quality 87','Normal remains OpenGL tangent convention']});
}
await writeFile(`${out}/external-manifest.json`,JSON.stringify({assets,noExternalModels:true},null,2));
await writeFile(`${out}/LICENSE-PolyHaven.txt`,'Asphalt 02 by Rob Tuytel / Poly Haven\nSource: https://polyhaven.com/a/asphalt_02\nLicense: CC0 1.0 Universal, https://creativecommons.org/publicdomain/zero/1.0/\nPoly Haven asset license: https://polyhaven.com/license\nCommercial use permitted; attribution not required.\nThis license applies to the three Asphalt 02 texture maps only.\n');
console.log(assets.map(a=>({file:a.file,sourceBytes:a.originalBytes,optimizedBytes:a.optimizedBytes})));
