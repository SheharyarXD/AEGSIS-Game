import { BoxGeometry, Color, Group, InstancedMesh, Material, Matrix4, Quaternion, Vector3 } from 'three';

/** One draw call per architectural material. Shared by facade ribs, windows and street props. */
export class GeometryBatch {
  private readonly batches=new Map<Material,{matrix:Matrix4;color?:Color}[]>();
  box(material:Material,x:number,y:number,z:number,w:number,h:number,d:number,rotation=0,color?:Color):void {
    const rows=this.batches.get(material)??[];
    rows.push({matrix:new Matrix4().compose(new Vector3(x,y,z),new Quaternion().setFromAxisAngle(new Vector3(0,1,0),rotation),new Vector3(w,h,d)),color});
    this.batches.set(material,rows);
  }
  build(group:Group):void {
    const geo=new BoxGeometry();
    for(const [material,rows] of this.batches) {
      const mesh=new InstancedMesh(geo,material,rows.length);
      rows.forEach((row,i)=>{mesh.setMatrixAt(i,row.matrix);if(row.color)mesh.setColorAt(i,row.color);});
      mesh.castShadow=true;mesh.receiveShadow=true;
      mesh.computeBoundingSphere();group.add(mesh);
    }
    this.batches.clear();
  }
}
