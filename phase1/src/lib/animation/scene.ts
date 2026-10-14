import {evaluateMod,MAX_LINK_DEPTH,type LinkResolver} from './modifiers';
import {TICKS_PER_SECOND} from './time';
import {findLayer,type Composition,type Layer,type Vec2} from './model';
export type Matrix=readonly [number,number,number,number,number,number];
const mul=(a:Matrix,b:Matrix):Matrix=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
export const IDENTITY:Matrix=[1,0,0,1,0,0];
/** Resolves property links of one composition: a linked value is the source layer's evaluated property (its own modifiers and links included). Chains stop at MAX_LINK_DEPTH and a loop falls back to the unlinked value, so evaluation always ends. */
export function linkResolver(comp:Composition,depth=0):LinkResolver{
 return (layer,prop,t)=>{
  if(depth>=MAX_LINK_DEPTH)return undefined;
  const l=findLayer(comp,layer),p=l?.transform[prop as keyof Layer['transform']];
  return p?evaluateMod(p,t,linkResolver(comp,depth+1)):undefined;
 };
}
/** Local matrix: translate(position) rotate(rotation) scale(scale) translate(-anchor). */
export function localMatrix(l:Layer,t:number,comp?:Composition):Matrix{
 const k=comp?linkResolver(comp):undefined;
 const a=evaluateMod(l.transform.anchor,t,k) as Vec2,p=evaluateMod(l.transform.position,t,k) as Vec2,s=evaluateMod(l.transform.scale,t,k) as Vec2,r=(evaluateMod(l.transform.rotation,t,k) as number)*Math.PI/180;
 const c=Math.cos(r),n=Math.sin(r);
 return mul([1,0,0,1,p[0],p[1]],mul([c*s[0]/100,n*s[0]/100,-n*s[1]/100,c*s[1]/100,0,0],[1,0,0,1,-a[0],-a[1]]));
}
/** World matrix of a layer at tick `t` (parents applied, cycle safe). */
export function worldMatrix(comp:Composition,l:Layer,t:number,seen=new Set<string>()):Matrix{
 const m=localMatrix(l,t,comp);if(!l.parent||seen.has(l.id))return m;seen.add(l.id);
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
 const solo=comp.layers.some(l=>l.solo);const mattes=new Set(comp.layers.flatMap(l=>l.matte?[l.matte.source]:[]));
 return [...comp.layers].reverse().filter(l=>l.visible&&(!solo||l.solo)&&t>=l.inT+l.offset&&t<l.outT+l.offset&&l.kind!=='null'&&l.kind!=='audio'&&!mattes.has(l.id))
  .map(l=>({layer:l,matrix:worldMatrix(comp,l,t),opacity:Math.min(1,Math.max(0,(evaluateMod(l.transform.opacity,t,linkResolver(comp)) as number)/100))}));
}
/** Matrix multiplication exported for explicit keep-world reparenting. */
export const multiplyMatrix=mul;
/** Decompose a representable translate/rotate/positive-scale matrix. Reject shear/reflection rather than changing the image. */
export function decomposeMatrix(m:Matrix,anchor:Vec2):{position:Vec2;scale:Vec2;rotation:number}|null{
 const sx=Math.hypot(m[0],m[1]);if(sx<1e-8)return null;const det=m[0]*m[3]-m[1]*m[2],sy=det/sx;
 if(sy<1e-8||Math.abs(m[0]*m[2]+m[1]*m[3])>1e-6*Math.max(1,sx*sy))return null;
 return {position:[m[4]+m[0]*anchor[0]+m[2]*anchor[1],m[5]+m[1]*anchor[0]+m[3]*anchor[1]],scale:[sx*100,sy*100],rotation:Math.atan2(m[1],m[0])*180/Math.PI};
}

/** Motion blur samples of one layer: its matrix at evenly spread times inside the shutter window (centered on `t`). Empty when blur is off or fewer than two samples fall inside the layer's time. */
export interface BlurSample{tick:number;matrix:Matrix}
/** Shutter samples with the tick each one stands for (the matrix is the layer's world matrix at that tick). */
export function motionBlurTicks(comp:Composition,layer:Layer,t:number):readonly BlurSample[]{
 const s=comp.shutter;if(!s||!layer.motionBlur)return [];
 const frame=TICKS_PER_SECOND*comp.fps.den/comp.fps.num,w=frame*s.angle/360;const out:BlurSample[]=[];
 for(let j=0;j<s.samples;j++){const tj=Math.round(t-w/2+w*(j+0.5)/s.samples);if(tj>=layer.inT+layer.offset&&tj<layer.outT+layer.offset)out.push({tick:tj,matrix:worldMatrix(comp,layer,tj)});}
 return out.length>=2?out:[];
}
export function motionBlurSamples(comp:Composition,layer:Layer,t:number):readonly Matrix[]{return motionBlurTicks(comp,layer,t).map(x=>x.matrix);}
/** Text whose own content (animators, reveal) changes over time, so each blur sample draws it at its own tick. */
export const contentSampled=(l:Layer)=>l.kind==='text'&&(!!l.animators?.some(a=>a.enabled)||!!l.textReveal?.keys.length);
