import {evaluate} from './interpolate';
import type {Layer,MaskPath,MaskPoint} from './model';
/** Path effects for path shape layers: zig zag (straight) and wave (smooth) ridges, round corners (size = radius px) and twist (size = degrees at the farthest point). */
export type PathFx=NonNullable<Layer['pathFx']>;
export const PATH_FX_KINDS=['zigzag','wave','round','twist'] as const;
export const DEFAULT_PATH_FX:PathFx={kind:'zigzag',size:12,ridges:4};
const r4=(n:number)=>Math.round(n*1e4)/1e4;
type V=readonly [number,number];
function cubic(a:MaskPoint,b:MaskPoint,u:number):V{
 const p0:V=[a.x,a.y],p1:V=[a.x+(a.outX??0),a.y+(a.outY??0)],p2:V=[b.x+(b.inX??0),b.y+(b.inY??0)],p3:V=[b.x,b.y],m=1-u;
 return [m*m*m*p0[0]+3*m*m*u*p1[0]+3*m*u*u*p2[0]+u*u*u*p3[0],m*m*m*p0[1]+3*m*m*u*p1[1]+3*m*u*u*p2[1]+u*u*u*p3[1]];
}
/** Points are in layer pixels. Original anchors stay where they are; interior samples alternate +size and -size along the normal. */
/** The effect with its keyed size sampled at `tick`; the result carries no `sizeAnim`. */
export function pathFxAt(fx:PathFx,tick:number):PathFx{
 if(!fx.sizeAnim?.keys.length)return fx;
 const {sizeAnim,...rest}=fx;return {...rest,size:evaluate(sizeAnim,tick) as number};
}
const KAPPA=0.5523;
function roundCorners(p:MaskPath,radius:number):MaskPath{
 const n=p.points.length,r=Math.max(0,radius);if(n<3||r===0)return p;
 const corner=(i:number)=>{const q=p.points[i];return q.inX===undefined&&q.inY===undefined&&q.outX===undefined&&q.outY===undefined&&(p.closed||(i>0&&i<n-1));};
 const out:MaskPoint[]=[];
 for(let i=0;i<n;i++){
  const q=p.points[i];if(!corner(i)){out.push(q);continue;}
  const a=p.points[(i+n-1)%n],b=p.points[(i+1)%n],da=Math.hypot(a.x-q.x,a.y-q.y),db=Math.hypot(b.x-q.x,b.y-q.y);
  const cut=Math.min(r,da/2,db/2);if(cut<=0.01){out.push(q);continue;}
  const pa:V=[q.x+(a.x-q.x)/da*cut,q.y+(a.y-q.y)/da*cut],pb:V=[q.x+(b.x-q.x)/db*cut,q.y+(b.y-q.y)/db*cut];
  out.push({x:r4(pa[0]),y:r4(pa[1]),outX:r4((q.x-pa[0])*KAPPA),outY:r4((q.y-pa[1])*KAPPA)});
  out.push({x:r4(pb[0]),y:r4(pb[1]),inX:r4((q.x-pb[0])*KAPPA),inY:r4((q.y-pb[1])*KAPPA)});
 }
 return {closed:p.closed,points:out};
}
function twist(p:MaskPath,deg:number,ridges:number):MaskPath{
 const n=p.points.length;if(n<2)return p;
 const segs=p.closed?n:n-1,sub=ridges*2,pts:MaskPoint[]=[];
 for(let i=0;i<segs;i++){const a=p.points[i],b=p.points[(i+1)%n];for(let k=0;k<sub;k++){const c=cubic(a,b,k/sub);pts.push({x:c[0],y:c[1]});}}
 if(!p.closed){const l=p.points[n-1];pts.push({x:l.x,y:l.y});}
 const xs=pts.map(q=>q.x),ys=pts.map(q=>q.y),cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
 const far=Math.max(...pts.map(q=>Math.hypot(q.x-cx,q.y-cy)))||1;
 const rot=(q:{x:number;y:number}):V=>{const d=Math.hypot(q.x-cx,q.y-cy),a=deg*Math.PI/180*(d/far),c=Math.cos(a),s=Math.sin(a);return [cx+(q.x-cx)*c-(q.y-cy)*s,cy+(q.x-cx)*s+(q.y-cy)*c];};
 const moved=pts.map(rot);
 return {closed:p.closed,points:moved.map((m,i)=>{const nb=moved[Math.min(moved.length-1,i+1)],pv=moved[Math.max(0,i-1)],tx=nb[0]-pv[0],ty=nb[1]-pv[1],len=Math.hypot(tx,ty)||1,h=Math.hypot(nb[0]-m[0],nb[1]-m[1])/3;return {x:r4(m[0]),y:r4(m[1]),inX:r4(-tx/len*h),inY:r4(-ty/len*h),outX:r4(tx/len*h),outY:r4(ty/len*h)};})};
}
export function applyPathFx(p:MaskPath,fx:PathFx):MaskPath{
 const n=p.points.length;if(n<2||fx.size===0)return p;
 if(fx.kind==='round')return roundCorners(p,fx.size);
 if(fx.kind==='twist')return twist(p,fx.size,fx.ridges);
 const segs=p.closed?n:n-1,sub=fx.ridges*2,out:MaskPoint[]=[];
 for(let i=0;i<segs;i++){
  const a=p.points[i],b=p.points[(i+1)%n];
  const pts:V[]=[];for(let k=0;k<=sub;k++)pts.push(cubic(a,b,k/sub));
  out.push({x:a.x,y:a.y});
  for(let k=1;k<sub;k++){
   const prev=pts[k-1],next=pts[k+1],tx=next[0]-prev[0],ty=next[1]-prev[1],len=Math.hypot(tx,ty)||1,nx=-ty/len,ny=tx/len,s=k%2?fx.size:-fx.size;
   const q:MaskPoint={x:r4(pts[k][0]+nx*s),y:r4(pts[k][1]+ny*s)};
   if(fx.kind==='wave'){const h=len/6;out.push({...q,inX:r4(-tx/len*h),inY:r4(-ty/len*h),outX:r4(tx/len*h),outY:r4(ty/len*h)});}else out.push(q);
  }
 }
 if(!p.closed)out.push({x:p.points[n-1].x,y:p.points[n-1].y});
 if(fx.kind==='wave')return {closed:p.closed,points:out.map((q,i)=>{if(q.inX!==undefined)return q;const nb=out[Math.min(out.length-1,i+1)],pv=out[Math.max(0,i-1)],tx=nb.x-pv.x,ty=nb.y-pv.y,len=Math.hypot(tx,ty)||1,h=len/6;return {...q,inX:r4(-tx/len*h),inY:r4(-ty/len*h),outX:r4(tx/len*h),outY:r4(ty/len*h)};})};
 return {closed:p.closed,points:out};
}
