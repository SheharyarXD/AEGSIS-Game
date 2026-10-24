"""Apply once during the no-browser offline stage, after final capture closes its browser."""
from pathlib import Path
import time
marker=Path('artifacts/phase10/code-final.log')
deadline=time.monotonic()+150
while not marker.exists():
 if time.monotonic()>deadline:raise RuntimeError('Capture has not completed; no source was changed')
 time.sleep(.05)
p=Path('src/world/titan/TitanCinematicAssault.ts');s=p.read_text()
old='  if(!this.route)return;\n  if(!this.player.suited'
new="""  if(!this.route){
   if(this.pending){this.phaseAge+=dt;if(!this.player.suited||this.player.ragdoll.active||this.player.changingForm||this.player.health<=0)this.interrupt('BREACH · PREPARATION INTERRUPTED');else if(this.phaseAge>8)this.interrupt('BREACH · ASSET PREPARATION TIMED OUT');}
   return;
  }
  if(!this.player.suited"""
assert old in s;s=s.replace(old,new)
a=s.index("  if(!this.city.assets.parts.has('titan10_interior_'")
b=s.index("  this.pending=true;",a)
s=s[:a]+"""  const interior=building.style==='gothic'?'stone':building.style==='industrial'?'utility':'office';
  if(!this.city.assets.parts.has('titan10_interior_'+interior)){this.say('BREACH · INTERIOR ASSET UNAVAILABLE');return;}
"""+s[b:]
p.write_text(s)
print('Preflight guards refined during offline stage; successful prepared capture paths are unchanged.')
