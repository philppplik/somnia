import {evaluate} from './interpolate';
import {findLayer,type Composition,type Layer,type Vec2} from './model';
export type Matrix=readonly [number,number,number,number,number,number];
const mul=(a:Matrix,b:Matrix):Matrix=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
export const IDENTITY:Matrix=[1,0,0,1,0,0];
/** Local matrix: translate(position) rotate(rotation) scale(scale) translate(-anchor). */
export function localMatrix(l:Layer,t:number):Matrix{
 const a=evaluate(l.transform.anchor,t) as Vec2,p=evaluate(l.transform.position,t) as Vec2,s=evaluate(l.transform.scale,t) as Vec2,r=(evaluate(l.transform.rotation,t) as number)*Math.PI/180;
 const c=Math.cos(r),n=Math.sin(r);
 return mul([1,0,0,1,p[0],p[1]],mul([c*s[0]/100,n*s[0]/100,-n*s[1]/100,c*s[1]/100,0,0],[1,0,0,1,-a[0],-a[1]]));
}
/** World matrix of a layer at tick `t` (parents applied, cycle safe). */
export function worldMatrix(comp:Composition,l:Layer,t:number,seen=new Set<string>()):Matrix{
 const m=localMatrix(l,t);if(!l.parent||seen.has(l.id))return m;seen.add(l.id);
 const p=findLayer(comp,l.parent);return p?mul(worldMatrix(comp,p,t,seen),m):m;
}
/** Matrix that maps a layer's parent space (where its position keys live) to composition space. */
export function parentMatrix(comp:Composition,l:Layer,t:number):Matrix{
 const p=l.parent?findLayer(comp,l.parent):undefined;return p?worldMatrix(comp,p,t):IDENTITY;
}
export function invertMatrix(m:Matrix):Matrix|null{
 const det=m[0]*m[3]-m[1]*m[2];if(!Number.isFinite(det)||Math.abs(det)<1e-12)return null;
 return [m[3]/det,-m[1]/det,-m[2]/det,m[0]/det,(m[2]*m[5]-m[3]*m[4])/det,(m[1]*m[4]-m[0]*m[5])/det];
}
export const applyMatrix=(m:Matrix,p:Vec2):Vec2=>[m[0]*p[0]+m[2]*p[1]+m[4],m[1]*p[0]+m[3]*p[1]+m[5]];
export interface DrawLayer{layer:Layer;matrix:Matrix;opacity:number}
/** Layers visible at tick `t`, bottom-most first (paint order), with world matrices. Opacity is not inherited. */
export function sceneAt(comp:Composition,t:number):DrawLayer[]{
 const solo=comp.layers.some(l=>l.solo);
 return [...comp.layers].reverse().filter(l=>l.visible&&(!solo||l.solo)&&t>=l.inT+l.offset&&t<l.outT+l.offset&&l.kind!=='null'&&l.kind!=='audio')
  .map(l=>({layer:l,matrix:worldMatrix(comp,l,t),opacity:Math.min(1,Math.max(0,(evaluate(l.transform.opacity,t) as number)/100))}));
}
/** Matrix multiplication exported for explicit keep-world reparenting. */
export const multiplyMatrix=mul;
/** Decompose a representable translate/rotate/positive-scale matrix. Reject shear/reflection rather than changing the image. */
export function decomposeMatrix(m:Matrix,anchor:Vec2):{position:Vec2;scale:Vec2;rotation:number}|null{
 const sx=Math.hypot(m[0],m[1]);if(sx<1e-8)return null;const det=m[0]*m[3]-m[1]*m[2],sy=det/sx;
 if(sy<1e-8||Math.abs(m[0]*m[2]+m[1]*m[3])>1e-6*Math.max(1,sx*sy))return null;
 return {position:[m[4]+m[0]*anchor[0]+m[2]*anchor[1],m[5]+m[1]*anchor[0]+m[3]*anchor[1]],scale:[sx*100,sy*100],rotation:Math.atan2(m[1],m[0])*180/Math.PI};
}
