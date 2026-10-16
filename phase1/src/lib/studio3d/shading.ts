import * as THREE from 'three';
/** Viewport shading preview. 'normals' swaps every mesh under the root to the shared normal-color material; 'shaded' restores each mesh's own material. View-only: the document and its materials are never touched. */
export type ShadingMode='shaded'|'normals';
/** Applies the shading mode under root. Originals are remembered in `orig` (one WeakMap per viewport). A material the user changed while the preview was on is never clobbered: restoring only writes back when the mesh still shows the preview material. */
export function applyShading(root:THREE.Object3D,mode:ShadingMode,normal:THREE.Material,orig:WeakMap<THREE.Mesh,THREE.Material|THREE.Material[]>):void{
 root.traverse(o=>{
  const m=o as THREE.Mesh;if(!m.isMesh)return;
  if(mode==='normals'){
   if(m.material!==normal){orig.set(m,m.material);m.material=normal;}
  }else{
   const o0=orig.get(m);
   if(o0){if(m.material===normal)m.material=o0;orig.delete(m);}
  }
 });
}
