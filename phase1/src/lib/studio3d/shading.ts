import * as THREE from 'three';
/** Viewport shading preview. 'normals' swaps every mesh under the root to the shared normal-color material, 'matcap' to the shared matcap material; 'shaded' restores each mesh's own material. View-only: the document and its materials are never touched. */
export type ShadingMode='shaded'|'normals'|'matcap';
/** Applies the shading mode under root. Originals are remembered in `orig` (one WeakMap per viewport). A material the user changed while the preview was on is never clobbered: restoring only writes back when the mesh still shows a preview material, and switching between previews never stores a preview material as the original. */
export function applyShading(root:THREE.Object3D,mode:ShadingMode,normal:THREE.Material,orig:WeakMap<THREE.Mesh,THREE.Material|THREE.Material[]>,matcap?:THREE.Material):void{
 const previews:unknown[]=[normal,...(matcap?[matcap]:[])];
 root.traverse(o=>{
  const m=o as THREE.Mesh;if(!m.isMesh)return;
  if(mode==='shaded'){
   const o0=orig.get(m);
   if(o0){if(previews.includes(m.material))m.material=o0;orig.delete(m);}
  }else{
   const p=mode==='matcap'?(matcap??normal):normal;
   if(m.material!==p){
    if(!previews.includes(m.material))orig.set(m,m.material);
    m.material=p;
   }
  }
 });
}
/** Neutral studio matcap material, drawn at runtime so no asset ships. Preview colors, not application chrome. */
export function createMatcapMaterial():THREE.Material{
 const c=document.createElement('canvas');c.width=c.height=128;
 const g=c.getContext('2d')!;
 const grad=g.createRadialGradient(46,42,6,64,64,86);
 grad.addColorStop(0,'#ffffff');grad.addColorStop(0.35,'#b8bcc4');grad.addColorStop(0.75,'#565a64');grad.addColorStop(1,'#33363d');
 g.fillStyle=grad;g.fillRect(0,0,128,128);
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
 return new THREE.MeshMatcapMaterial({matcap:t});
}
