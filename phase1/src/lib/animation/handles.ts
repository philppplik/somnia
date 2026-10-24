import type {Composition,Layer} from './model';
import {worldMatrix,invertMatrix,type Matrix} from './scene';
/** On-canvas transform handles: pure geometry for scaling and rotating a layer about its anchor. Viewer only. */
export type Pt=readonly [number,number];
const apply=(m:Matrix,p:Pt):[number,number]=>[m[0]*p[0]+m[2]*p[1]+m[4],m[1]*p[0]+m[3]*p[1]+m[5]];
export const ROTATE_OFFSET=28;
export const SCALE_RANGE={min:0,max:10000};
export const ROTATE_RANGE={min:-36000,max:36000};
export interface HandleSet{corners:[Pt,Pt,Pt,Pt];rotate:Pt;anchor:Pt}
export const TEXT_WIDTH_PER_EM=0.45;
export const TEXT_LINE_EM=1.2;
export interface SizedAsset{id:string;width:number;height:number}
/** Content box size in layer space. Solids, shapes and nulls use their size, images their size or the asset's. Text is ESTIMATED (no font metrics here): longest line times 0.45 em, one 1.2 em line each. Null for everything else (text on a path, precomps, audio). */
export function contentSize(l:Layer,assets:readonly SizedAsset[]=[]):[number,number]|null{
 const s=l.source,ok=(n:unknown):n is number=>typeof n==='number'&&n>0&&Number.isFinite(n);
 if(l.kind==='text'){if(s.textPath||!s.text)return null;const size=ok(s.size)?s.size:48,lines=s.text.split('\n');
  return [Math.max(1,Math.max(...lines.map(x=>x.length))*size*TEXT_WIDTH_PER_EM),lines.length*size*TEXT_LINE_EM];}
 if(l.kind==='raster'){const a=assets.find(x=>x.id===s.assetId);const w=s.width??a?.width,h=s.height??a?.height;return ok(w)&&ok(h)?[w,h]:null;}
 return ok(s.width)&&ok(s.height)?[s.width,s.height]:null;
}
/** Corners TL, TR, BR, BL of a content box in layer space. */
export const boxCorners=(w:number,h:number):[Pt,Pt,Pt,Pt]=>[[0,0],[w,0],[w,h],[0,h]];
/** Handles exist for layers with a content size. Corners go TL, TR, BR, BL in composition space. */
export function handleSet(comp:Composition,l:Layer,t:number,assets:readonly SizedAsset[]=[]):HandleSet|null{
 const sz=contentSize(l,assets);if(!sz)return null;
 const m=worldMatrix(comp,l,t);const c=boxCorners(sz[0],sz[1]).map(p=>apply(m,p)) as unknown as [Pt,Pt,Pt,Pt];
 const mid:Pt=[(c[0][0]+c[1][0])/2,(c[0][1]+c[1][1])/2],cen:Pt=[(c[0][0]+c[2][0])/2,(c[0][1]+c[2][1])/2];
 const dx=mid[0]-cen[0],dy=mid[1]-cen[1],len=Math.hypot(dx,dy)||1;
 const a=l.transform.anchor.value as readonly number[];
 return {corners:c,rotate:[mid[0]+dx/len*ROTATE_OFFSET,mid[1]+dy/len*ROTATE_OFFSET],anchor:apply(m,[a[0]??0,a[1]??0])};
}
const clampTo=(n:number,r:{min:number;max:number})=>Math.min(r.max,Math.max(r.min,n));
const r2=(n:number)=>Math.round(n*100)/100;
/** New scale (percent) when a corner handle moves from `p0` to `p`, scaling about `anchor` (any fixed content point: the anchor, or the opposite corner when pinning). Uniform keeps the aspect ratio; free scales each content axis. Null when the start point sits on the anchor. */
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
/** Position (parent space) that keeps content point `origin` where it was when scale goes s0 -> s1 at rotation `rotDeg`. Equals pos0 when origin is the anchor. */
export function pinnedPosition(pos0:Pt,rotDeg:number,s0:readonly number[],s1:readonly number[],anchor:readonly number[],origin:Pt):[number,number]{
 const r=rotDeg*Math.PI/180,c=Math.cos(r),n=Math.sin(r),dx=origin[0]-(anchor[0]??0),dy=origin[1]-(anchor[1]??0);
 const f=(sx:number,sy:number):[number,number]=>{const x=dx*sx/100,y=dy*sy/100;return [c*x-n*y,n*x+c*y];};
 const a=f(s0[0],s0[1]),b=f(s1[0],s1[1]);return [r2(pos0[0]+a[0]-b[0]),r2(pos0[1]+a[1]-b[1])];
}
