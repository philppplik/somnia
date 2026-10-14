import type {Composition,Layer} from './model';
import {worldMatrix,parentMatrix,invertMatrix,type Matrix} from './scene';
import {defaultOverlays,gridStep,safeRects,type Line,type Overlays} from './guides';
/** Snapping for canvas drags: pure and bounded. Targets come from the comp edges, ruler guides and the overlays that are switched on. */
export interface Targets{xs:readonly number[];ys:readonly number[]}
export const SNAP_PX=8;
const MAX_TARGETS=400;
export function guideTargets(comp:Composition,o:Overlays=defaultOverlays()):Targets{
 const w=comp.width,h=comp.height;const xs=[0,w],ys=[0,h];
 if(o.center){xs.push(w/2);ys.push(h/2);}
 if(o.thirds){xs.push(w/3,2*w/3);ys.push(h/3,2*h/3);}
 if(o.safe){const {action,title}=safeRects(w,h);for(const r of [action,title]){xs.push(r.x,r.x+r.width);ys.push(r.y,r.y+r.height);}}
 if(o.grid){const s=gridStep(w,h);for(let x=s;x<w;x+=s)xs.push(x);for(let y=s;y<h;y+=s)ys.push(y);}
 for(const g of comp.guides??[])(g.axis==='x'?xs:ys).push(g.at);
 return {xs:xs.slice(0,MAX_TARGETS),ys:ys.slice(0,MAX_TARGETS)};
}
const apply=(m:Matrix,x:number,y:number):[number,number]=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
/** Edges and centre (comp space) a layer is snapped by: the rotated content rectangle when it has a size, else just its anchor point. */
export function layerSnapPoints(comp:Composition,l:Layer,t:number):Targets{
 const m=worldMatrix(comp,l,t),{width:w,height:h}=l.source;
 if(w&&h&&w>0&&h>0){const c=[[0,0],[w,0],[0,h],[w,h]].map(([x,y])=>apply(m,x,y));const xs=c.map(p=>p[0]),ys=c.map(p=>p[1]);
  const lo=(a:number[])=>Math.min(...a),hi=(a:number[])=>Math.max(...a);return {xs:[lo(xs),(lo(xs)+hi(xs))/2,hi(xs)],ys:[lo(ys),(lo(ys)+hi(ys))/2,hi(ys)]};}
 const a=l.transform.anchor.value as readonly number[];const [x,y]=apply(m,a[0]??0,a[1]??0);return {xs:[x],ys:[y]};
}
const best=(pts:readonly number[],targets:readonly number[],d:number,thr:number):{shift:number;at:number}|null=>{
 let r:{shift:number;at:number}|null=null;
 for(const p of pts)for(const tg of targets){const s=tg-(p+d);if(Math.abs(s)<=thr&&(!r||Math.abs(s)<Math.abs(r.shift)))r={shift:s,at:tg};}
 return r;
};
/** Snap a drag delta (comp space). Returns the adjusted delta and the snap lines to draw. */
export function snapMove(pts:Targets,d:readonly [number,number],t:Targets,w:number,h:number,thr=SNAP_PX):{delta:[number,number];lines:Line[]}{
 const bx=best(pts.xs,t.xs,d[0],thr),by=best(pts.ys,t.ys,d[1],thr);const lines:Line[]=[];
 if(bx)lines.push({x1:bx.at,y1:0,x2:bx.at,y2:h});if(by)lines.push({x1:0,y1:by.at,x2:w,y2:by.at});
 return {delta:[d[0]+(bx?.shift??0),d[1]+(by?.shift??0)],lines};
}
/** A comp-space delta expressed in the layer's parent space (where position values live). */
export function toParentDelta(comp:Composition,l:Layer,t:number,d:readonly [number,number]):[number,number]{
 const inv=invertMatrix(parentMatrix(comp,l,t));if(!inv)return [d[0],d[1]];
 return [inv[0]*d[0]+inv[2]*d[1],inv[1]*d[0]+inv[3]*d[1]];
}
