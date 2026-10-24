import {readFile,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';
const path='artifacts/world-realism/deployment-environment-files.json',files=new Set(JSON.parse(await readFile('artifacts/city-redesign/deployment-environment-files.json','utf8'))),catalog=JSON.parse(await readFile('public/assets/environment/metropolis/runtime-components.json','utf8'));
// The 32 m Arcade uses its existing atlas far LOD; complete skyline meshes start at 90 m.
for(const f of catalog.families)if(f.id!=='city_meridian_arcade')files.add(`assets/environment/premium/${f.id.startsWith('aer_')?'provided':'city'}/${f.id}-far-optimized.glb`);
for(const file of ['street-details-optimized.glb','WORLD-REALISM-LICENSES.txt','concrete-color.webp','concrete-normal.webp','concrete-rough.webp','atlas-views.json'])files.add('assets/environment/metropolis/'+file);
await writeFile(path,JSON.stringify([...files].sort(),null,2));console.log(files.size,'environment package files');
