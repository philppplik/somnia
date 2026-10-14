import type {Composition,Layer} from './model';
import {worldMatrix,invertMatrix,type Matrix} from './scene';
/** On-canvas transform handles: pure geometry for scaling and rotating a layer about its anchor. Viewer only. */
export type Pt=readonly [number,number];
const apply=(m:Matrix,p:Pt):[number,number]=>[m[0]*p[0]+m[2]*p[1]+m[4],m[1]*p[0]+m[3]*p[1]+m[5]];
export const ROTATE_OFFSET=28;
export const SCALE_RANGE={min:0,max:10000};
export const ROTATE_RANGE={min:-36000,max:36000};
export interface HandleSet{corners:[Pt,Pt,Pt,Pt];rotate:Pt;anchor:Pt}
/** Handles exist for layers with a content size (solid, shape...). Corners go TL, TR, BR, BL in composition space. */
export function handleSet(comp:Composition,l:Layer,t:number):HandleSet|null{
 const {width:w,height:h}=l.source;if(!w||!h||!(w>0)||!(h>0))return null;
 const m=worldMatrix(comp,l,t);const c=([[0,0],[w,0],[w,h],[0,h]] as Pt[]).map(p=>apply(m,p)) as unknown as [Pt,Pt,Pt,Pt];
 const mid:Pt=[(c[0][0]+c[1][0])/2,(c[0][1]+c[1][1])/2],cen:Pt=[(c[0][0]+c[2][0])/2,(c[0][1]+c[2][1])/2];
 const dx=mid[0]-cen[0],dy=mid[1]-cen[1],len=Math.hypot(dx,dy)||1;
 const a=l.transform.anchor.value as readonly number[];
 return {corners:c,rotate:[mid[0]+dx/len*ROTATE_OFFSET,mid[1]+dy/len*ROTATE_OFFSET],anchor:apply(m,[a[0]??0,a[1]??0])};
}
const clampTo=(n:number,r:{min:number;max:number})=>Math.min(r.max,Math.max(r.min,n));
const r2=(n:number)=>Math.round(n*100)/100;
/** New scale (percent) when a corner handle moves from `p0` to `p`, scaling about the anchor. Uniform keeps the aspect ratio; free scales each content axis. Null when the start point sits on the anchor. */
export function scaleDrag(start:Matrix,anchor:readonly number[],s0:readonly number[],p0:Pt,p:Pt,uniform:boolean):[number,number]|null{
 const a:Pt=[anchor[0]??0,anchor[1]??0],aw=apply(start,a);
 if(uniform){const d0=Math.hypot(p0[0]-aw[0],p0[1]-aw[1]);if(d0<1e-6)return null;const f=Math.hypot(p[0]-aw[0],p[1]-aw[1])/d0;
  return [r2(clampTo(s0[0]*f,SCALE_RANGE)),r2(clampTo(s0[1]*f,SCALE_RANGE))];}
 const inv=invertMatrix(start);if(!inv)return null;const l0=apply(inv,p0),l1=apply(inv,p);
 const dx=l0[0]-a[0],dy=l0[1]-a[1];const rx=Math.abs(dx)<1e-6?1:(l1[0]-a[0])/dx,ry=Math.abs(dy)<1e-6?1:(l1[1]-a[1])/dy;
 return [r2(clampTo(s0[0]*rx,SCALE_RANGE)),r2(clampTo(s0[1]*ry,SCALE_RANGE))];
}
/** Angle in degrees of point `p` around `centre`, 0 pointing right. */
export const angleOf=(centre:Pt,p:Pt)=>Math.atan2(p[1]-centre[1],p[0]-centre[0])*180/Math.PI;
/** Shortest signed difference between two angles in degrees. */
export const angleDelta=(from:number,to:number)=>{let d=(to-from)%360;if(d>180)d-=360;if(d<-180)d+=360;return d;};
/** Rotation value after dragging; `step` snaps to multiples (e.g. 15) when given. Clamped to the property range. */
export const rotateTo=(r0:number,total:number,step?:number)=>{const v=r0+total;return r2(clampTo(step?Math.round(v/step)*step:v,ROTATE_RANGE));};
