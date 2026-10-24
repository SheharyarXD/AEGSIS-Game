import {Vector3} from 'three';
import {SPAWN} from './DeploymentBay';

/** Recovery beyond the island/water footprint; no perimeter wall or flight ceiling. */
export class WorldRecovery {
  private anchor=SPAWN.clone();
  recoveries=0;
  check(point:Vector3,grounded:boolean):Vector3|null {
    const finite=Number.isFinite(point.x)&&Number.isFinite(point.y)&&Number.isFinite(point.z);
    if(!finite||Math.abs(point.x)>1200||Math.abs(point.z)>1200||point.y<-5){
      this.recoveries++;return this.anchor.clone().add(new Vector3(0,.25,0));
    }
    const dry=point.x<876;
    const bridge=point.y>=24&&Math.abs(point.z-512)<12;
    if(grounded&&point.y>=0&&Math.abs(point.x)<1016&&Math.abs(point.z)<1016&&(dry||bridge))this.anchor.copy(point);
    return null;
  }
  reset():void {this.anchor.copy(SPAWN);this.recoveries=0;}
}
