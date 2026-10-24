import {CityLayout} from '../src/world/CityLayout.ts';
import {readFile,writeFile} from 'node:fs/promises';
const source=JSON.parse(await readFile('public/assets/environment/premium/destructible/components.json','utf8'));
const families=source.families.map(f=>({...f,heights:[f.height],facade:f.id==='aer_gothic'?'lancet':f.id==='aer_commercial'?'arcade':'diagrid',roof:f.id==='aer_gothic'?'pinnacles':f.id==='aer_commercial'?'mansard':'blade'}));
await writeFile('src/world/DestructibleFamilies.ts','// Generated from editable Blender architecture metadata.\nexport const DESTRUCTIBLE_FAMILIES = '+JSON.stringify(families,null,1)+' as const;\n');
const layout=new CityLayout();await writeFile('art/environment/phase7/city-layout.json',JSON.stringify({name:'AEGIS authored layout',worldSize:[2048,2048],seed:layout.seed,prototypePlacements:source.families,buildings:layout.buildings,landmarks:[{id:'Vesper Cathedral',x:-640,z:-368},{id:'Crown Exchange',x:328,z:-496}],note:'Fixed existing street reservations and lot positions, with deliberate prototype replacements. No random tower generation at runtime.'},null,2));
console.log('Saved fixed layout and three architectural families');
