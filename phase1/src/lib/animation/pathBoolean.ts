/** Small polygon boolean engine for path layers. No dependencies; leaf module (types only).
 *  Curves are FLATTENED to polylines (tolerance about 0.25 px in layer pixels), so results are corner points without bezier handles.
 *  Method: split every edge of A and B at their mutual crossings, probe both sides of each piece against both regions (even-odd), keep pieces where the result changes, chain them into rings.
 *  Limits: inputs must be closed and must not cross themselves (only A against B crossings are split); pieces that overlap exactly are handled, near-degenerate slivers under about 1e-5 px are dropped. */
import type {MaskPath} from './model';
export type Pt=readonly [number,number];
export type BoolOp='unite'|'subtract'|'intersect'|'exclude';
export const BOOL_OPS:readonly BoolOp[]=['unite','subtract','intersect','exclude'];
/** Flattened segments allowed per input and points the result may have. */
export const MAX_FLAT_SEGMENTS=1200;
export const MAX_RESULT_POINTS=512;
export const FLATTEN_TOLERANCE=0.25;
export class BooleanError extends Error{}
/** Flattens a closed bezier path (points in pixels) to a ring. Curve segments get 2 to 24 pieces by their bulge. */
export function flattenRing(p:MaskPath,w:number,h:number):Pt[]{
 const n=p.points.length,out:Pt[]=[];
 for(let i=0;i<n;i++){
  const a=p.points[i],b=p.points[(i+1)%n],A:Pt=[a.x*w,a.y*h],B:Pt=[b.x*w,b.y*h];out.push(A);
  const curved=a.outX!==undefined||a.outY!==undefined||b.inX!==undefined||b.inY!==undefined;if(!curved)continue;
  const C1:Pt=[A[0]+(a.outX??0)*w,A[1]+(a.outY??0)*h],C2:Pt=[B[0]+(b.inX??0)*w,B[1]+(b.inY??0)*h];
  const len=Math.hypot(B[0]-A[0],B[1]-A[1])||1,dist=(c:Pt)=>Math.abs((B[0]-A[0])*(A[1]-c[1])-(A[0]-c[0])*(B[1]-A[1]))/len;
  const d=Math.max(dist(C1),dist(C2),Math.hypot(C1[0]-A[0],C1[1]-A[1])*0.05+Math.hypot(C2[0]-B[0],C2[1]-B[1])*0.05);
  const k=Math.min(24,Math.max(2,Math.ceil(Math.sqrt(0.75*d/FLATTEN_TOLERANCE))));
  for(let s=1;s<k;s++){const t=s/k,u=1-t;out.push([u*u*u*A[0]+3*u*u*t*C1[0]+3*u*t*t*C2[0]+t*t*t*B[0],u*u*u*A[1]+3*u*u*t*C1[1]+3*u*t*t*C2[1]+t*t*t*B[1]]);}
 }
 return out;
}
/** Signed shoelace area of rings with even-odd semantics is not defined per ring; this is the plain sum of absolute ring areas minus nesting is left to callers. */
export const ringArea=(r:readonly Pt[])=>{let s=0;for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length];s+=a[0]*b[1]-b[0]*a[1];}return s/2;};
const inside=(rings:readonly (readonly Pt[])[],x:number,y:number)=>{
 let c=false;
 for(const r of rings)for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])c=!c;}
 return c;
};
type Seg={a:Pt;b:Pt;cuts:{t:number;p:Pt}[]};
const segs=(rings:readonly (readonly Pt[])[])=>{const o:Seg[]=[];for(const r of rings)for(let i=0;i<r.length;i++)o.push({a:r[i],b:r[(i+1)%r.length],cuts:[]});return o;};
const TOL=1e-7;
const param=(s:Seg,p:Pt)=>{const dx=s.b[0]-s.a[0],dy=s.b[1]-s.a[1];return ((p[0]-s.a[0])*dx+(p[1]-s.a[1])*dy)/(dx*dx+dy*dy||1);};
const distTo=(s:Seg,p:Pt)=>{const dx=s.b[0]-s.a[0],dy=s.b[1]-s.a[1],l=Math.hypot(dx,dy)||1;return Math.abs((p[0]-s.a[0])*dy-(p[1]-s.a[1])*dx)/l;};
function cross(s:Seg,t:Seg){
 const d1x=s.b[0]-s.a[0],d1y=s.b[1]-s.a[1],d2x=t.b[0]-t.a[0],d2y=t.b[1]-t.a[1],den=d1x*d2y-d1y*d2x;
 if(Math.abs(den)>1e-12){
  const ex=t.a[0]-s.a[0],ey=t.a[1]-s.a[1],u=(ex*d2y-ey*d2x)/den,v=(ex*d1y-ey*d1x)/den;
  if(u>-TOL&&u<1+TOL&&v>-TOL&&v<1+TOL){
   const p:Pt=u<TOL?s.a:u>1-TOL?s.b:v<TOL?t.a:v>1-TOL?t.b:[s.a[0]+u*d1x,s.a[1]+u*d1y];
   if(u>TOL&&u<1-TOL)s.cuts.push({t:u,p});if(v>TOL&&v<1-TOL)t.cuts.push({t:v,p});
  }
  return;
 }
 // parallel: collinear overlap splits each at the other's endpoints
 for(const [x,y] of [[s,t],[t,s]] as const)for(const p of [y.a,y.b]){if(distTo(x,p)<1e-6){const u=param(x,p);if(u>TOL&&u<1-TOL)x.cuts.push({t:u,p});}}
}
const key=(p:Pt)=>`${Math.round(p[0]*1e5)},${Math.round(p[1]*1e5)}`;
const pick=(op:BoolOp,a:boolean,b:boolean)=>op==='unite'?a||b:op==='intersect'?a&&b:op==='subtract'?a&&!b:a!==b;
/** Result rings of `a op b`. Each input is a list of closed rings read even-odd. Throws BooleanError when the work is too big or the result would be empty. */
export function booleanRings(a:readonly (readonly Pt[])[],b:readonly (readonly Pt[])[],op:BoolOp):Pt[][]{
 const SA=segs(a),SB=segs(b);
 if(SA.length>MAX_FLAT_SEGMENTS||SB.length>MAX_FLAT_SEGMENTS)throw new BooleanError('The paths are too detailed for a boolean operation.');
 for(const s of SA)for(const t of SB)cross(s,t);
 let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;for(const s of [...SA,...SB]){for(const p of [s.a,s.b]){minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);minY=Math.min(minY,p[1]);maxY=Math.max(maxY,p[1]);}}
 const eps=1e-6*Math.max(1,Math.hypot(maxX-minX,maxY-minY));
 const edges=new Map<string,{a:Pt;b:Pt}>();
 for(const s of [...SA,...SB]){
  const pts:Pt[]=[s.a,...s.cuts.sort((p,q)=>p.t-q.t).map(c=>c.p),s.b];
  for(let i=0;i+1<pts.length;i++){
   const p=pts[i],q=pts[i+1],dx=q[0]-p[0],dy=q[1]-p[1],len=Math.hypot(dx,dy);
   if(len<1e-5||key(p)===key(q))continue;
   const mx=(p[0]+q[0])/2,my=(p[1]+q[1])/2,nx=-dy/len*eps,ny=dx/len*eps;
   const L=pick(op,inside(a,mx+nx,my+ny),inside(b,mx+nx,my+ny)),R=pick(op,inside(a,mx-nx,my-ny),inside(b,mx-nx,my-ny));
   if(L===R)continue;
   const e=L?{a:p,b:q}:{a:q,b:p};edges.set(key(e.a)+'>'+key(e.b),e);
  }
 }
 const from=new Map<string,{a:Pt;b:Pt}[]>();for(const e of edges.values()){const k=key(e.a);(from.get(k)??from.set(k,[]).get(k)!).push(e);}
 const used=new Set<{a:Pt;b:Pt}>(),rings:Pt[][]=[];
 for(const e0 of edges.values()){
  if(used.has(e0))continue;
  const ring:Pt[]=[];let e:{a:Pt;b:Pt}|undefined=e0;
  while(e&&!used.has(e)){used.add(e);ring.push(e.a);e=(from.get(key(e.b))??[]).find(x=>!used.has(x));}
  if(ring.length>=3)rings.push(ring);
 }
 // drop collinear points
 const out:Pt[][]=[];
 for(const r of rings){
  let q=r.slice(),ch=true;
  while(ch&&q.length>=3){ch=false;for(let i=0;i<q.length;i++){const p=q[(i+q.length-1)%q.length],c=q[i],n=q[(i+1)%q.length];if(Math.abs((c[0]-p[0])*(n[1]-p[1])-(c[1]-p[1])*(n[0]-p[0]))<1e-6*Math.max(1,Math.hypot(n[0]-p[0],n[1]-p[1]))){q.splice(i,1);ch=true;break;}}}
  if(q.length>=3&&Math.abs(ringArea(q))>1e-6)out.push(q);
 }
 return out;
}
