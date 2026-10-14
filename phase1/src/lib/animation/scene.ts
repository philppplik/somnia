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
export interface DrawLayer{layer:Layer;matrix:Matrix;opacity:number}
/** Layers visible at tick `t`, bottom-most first (paint order), with world matrices. Opacity is not inherited. */
export function sceneAt(comp:Composition,t:number):DrawLayer[]{
 const solo=comp.layers.some(l=>l.solo);
 const world=(l:Layer,seen=new Set<string>()):Matrix=>{
  const m=localMatrix(l,t);if(!l.parent||seen.has(l.id))return m;seen.add(l.id);
  const p=findLayer(comp,l.parent);return p?mul(world(p,seen),m):m;
 };
 return [...comp.layers].reverse().filter(l=>l.visible&&(!solo||l.solo)&&t>=l.inT+l.offset&&t<l.outT+l.offset&&l.kind!=='null')
  .map(l=>({layer:l,matrix:world(l),opacity:Math.min(1,Math.max(0,(evaluate(l.transform.opacity,t) as number)/100))}));
}
