import {readFile,writeFile} from 'node:fs/promises';
const provided=JSON.parse(await readFile('public/assets/environment/premium/provided/components.json','utf8')),old=JSON.parse(await readFile('public/assets/environment/premium/destructible/components.json','utf8'));
const families=[...provided.families,...old.families.filter(f=>f.id==='aer_commercial').map(f=>({...f,heights:[f.height],facade:'arcade',roof:'mansard'}))];
await writeFile('src/world/DestructibleFamilies.ts','// Geometry, size and silhouettes derive from user-supplied architecture.\nexport const DESTRUCTIBLE_FAMILIES = '+JSON.stringify(families,null,1)+' as const;\n');
await writeFile('public/assets/environment/premium/provided/runtime-components.json',JSON.stringify({...provided,families,components:[...provided.components,...old.components.filter(c=>c.family==='aer_commercial')]},null,2));console.log('Installed real architectural family metadata');
