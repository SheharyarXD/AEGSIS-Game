import {Material,MathUtils,MeshPhysicalMaterial,MeshStandardMaterial} from 'three';
/** Refracting architectural glass forced a second full-city render with unprepared linear shaders.
 * Keep the supplied colors/maps and geometry; use reflective opaque glazing for this browser target.
 * Character, HUD and original disk assets never pass through this policy.
 */
export function browserArchitectureMaterial(source:Material):Material{
 if(!(source instanceof MeshPhysicalMaterial)||source.transmission<=0)return source;
 const glass=new MeshStandardMaterial().copy(source);glass.name=source.name;glass.opacity=1;glass.transparent=false;
 glass.metalness=Math.max(.25,glass.metalness);glass.roughness=MathUtils.clamp(glass.roughness,.12,.5);source.dispose();return glass;
}
