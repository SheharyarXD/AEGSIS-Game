"""The supplied-asset converter, applied to curated district models without altering originals."""
from pathlib import Path
import json
root=Path(__file__).resolve().parent;source=(root/'prepare_provided.py').read_text();specs=json.loads((root/'city-specs.json').read_text())
start=source.index('SPECS=');end=source.index('\nALL=',start);source=source[:start]+'SPECS='+repr(specs)+source[end:]
source=source.replace("premium/provided'","premium/city'").replace("SOURCE=ROOT/'provided'","SOURCE=ROOT/'city'")
source=source.replace("  if spec['id']=='aer_gothic' and not 11180<cx<12820:continue", "  if 'xRange' in spec and not spec['xRange'][0]<cx<spec['xRange'][1]:continue\n  if spec.get('selector'):\n   node=obj;matched=False\n   while node:\n    if node.name==spec['selector'] or node.name.startswith(spec['selector']+'_'):matched=True;break\n    node=node.parent\n   if not matched:continue")
source=source.replace("material.name='src_'+('london_' if spec['id']=='aer_glass' else 'aria_')+name if not name.startswith('p_') else name", "material.name='src_'+spec['materialPrefix']+'_'+name if not name.startswith('p_') else name")
source=source.replace("dec.ratio=.46 if lod=='mid' else .13", "dec.ratio=.32 if lod=='mid' else min(.12,450/max(1,len(m.polygons)))")
exec(compile(source,str(root/'prepare_provided.py'),'exec'))
