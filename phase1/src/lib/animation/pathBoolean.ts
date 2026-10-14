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
/** Flattens a bezier path (points in pixels) to a ring, or to an open polyline when `p.closed` is false. Curve segments get 2 to 24 pieces by their bulge. */
export function flattenRing(p:MaskPath,w:number,h:number):Pt[]{
 const n=p.points.length,out:Pt[]=[];
 const segN=p.closed?n:n-1;
 for(let i=0;i<segN;i++){
  const a=p.points[i],b=p.points[(i+1)%n],A:Pt=[a.x*w,a.y*h],B:Pt=[b.x*w,b.y*h];out.push(A);
  const curved=a.outX!==undefined||a.outY!==undefined||b.inX!==undefined||b.inY!==undefined;if(!curved)continue;
  const C1:Pt=[A[0]+(a.outX??0)*w,A[1]+(a.outY??0)*h],C2:Pt=[B[0]+(b.inX??0)*w,B[1]+(b.inY??0)*h];
  const len=Math.hypot(B[0]-A[0],B[1]-A[1])||1,dist=(c:Pt)=>Math.abs((B[0]-A[0])*(A[1]-c[1])-(A[0]-c[0])*(B[1]-A[1]))/len;
  const d=Math.max(dist(C1),dist(C2),Math.hypot(C1[0]-A[0],C1[1]-A[1])*0.05+Math.hypot(C2[0]-B[0],C2[1]-B[1])*0.05);
  const k=Math.min(24,Math.max(2,Math.ceil(Math.sqrt(0.75*d/FLATTEN_TOLERANCE))));
  for(let s=1;s<k;s++){const t=s/k,u=1-t;out.push([u*u*u*A[0]+3*u*u*t*C1[0]+3*u*t*t*C2[0]+t*t*t*B[0],u*u*u*A[1]+3*u*u*t*C1[1]+3*u*t*t*C2[1]+t*t*t*B[1]]);}
 }
 if(!p.closed&&n>0)out.push([p.points[n-1].x*w,p.points[n-1].y*h]);
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

/** Douglas-Peucker on a closed ring: anchors at point 0 and the point farthest from it.  */
export function simplifyRing(r:readonly Pt[],tol:number):Pt[]{
 if(r.length<=3)return r.slice();
 let far=1,fd=-1;for(let i=1;i<r.length;i++){const d=Math.hypot(r[i][0]-r[0][0],r[i][1]-r[0][1]);if(d>fd){fd=d;far=i;}}
 const keep=new Set<number>([0,far]);
 const run=(i0:number,i1:number)=>{ // indices on the ring, i1 may wrap past the end
  const n=r.length,a=r[i0%n],b=r[i1%n],dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy)||1;let m=-1,md=tol;
  for(let i=i0+1;i<i1;i++){const p=r[i%n],d=Math.abs((p[0]-a[0])*dy-(p[1]-a[1])*dx)/l;if(d>md){md=d;m=i;}}
  if(m>=0){keep.add(m%n);run(i0,m);run(m,i1);}
 };
 run(0,far);run(far,r.length);
 return [...keep].sort((x,y)=>x-y).map(i=>r[i]);
}
/** Outline of a stroked polyline set (SVG defaults: butt caps, miter joins with limit 4) as even-odd rings. Each input is a flattened polyline with its closed flag. Union of segment rectangles and join wedges. */
export function strokeOutline(lines:readonly {pts:readonly Pt[];closed:boolean}[],width:number):Pt[][]{
 const hw=width/2,pieces:Pt[][]=[];
 for(const {pts,closed} of lines){
  const q=pts.filter((p,i)=>i===0||Math.hypot(p[0]-pts[i-1][0],p[1]-pts[i-1][1])>1e-6);
  if(closed&&q.length>1&&Math.hypot(q[0][0]-q[q.length-1][0],q[0][1]-q[q.length-1][1])<=1e-6)q.pop();
  const n=q.length;if(n<2)continue;const m=closed?n:n-1;
  const nrm=(i:number):Pt=>{const a=q[i],b=q[(i+1)%n],dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy)||1;return [-dy/l,dx/l];};
  for(let i=0;i<m;i++){const a=q[i],b=q[(i+1)%n],[nx,ny]=nrm(i);pieces.push([[a[0]+nx*hw,a[1]+ny*hw],[b[0]+nx*hw,b[1]+ny*hw],[b[0]-nx*hw,b[1]-ny*hw],[a[0]-nx*hw,a[1]-ny*hw]]);}
  for(let i=closed?0:1;i<(closed?n:n-1);i++){
   const v=q[i],[x1,y1]=nrm((i+n-1)%n),[x2,y2]=nrm(i),turn=x1*y2-y1*x2;if(Math.abs(turn)<1e-9&&x1*x2+y1*y2>0)continue;
   const s=turn>0?-1:1,o1:Pt=[v[0]+s*x1*hw,v[1]+s*y1*hw],o2:Pt=[v[0]+s*x2*hw,v[1]+s*y2*hw];
   const cos=x1*x2+y1*y2,ratio=1/Math.sqrt(Math.max(1e-9,(1+cos)/2)); // miter length over width
   if(ratio<=4&&Math.abs(turn)>1e-9){const bx=x1+x2,by=y1+y2,bl=Math.hypot(bx,by)||1,len=hw*ratio;pieces.push([v,o1,[v[0]+s*bx/bl*len,v[1]+s*by/bl*len],o2]);}
   else pieces.push([v,o1,o2]);
  }
 }
 if(!pieces.length)return [];
 let acc:Pt[][]=[pieces[0]];
 for(let i=1;i<pieces.length;i++){const orient=Math.abs(ringArea(pieces[i]))>1e-9;if(!orient)continue;acc=booleanRings(acc,[pieces[i]],'unite');}
 return acc;
}
