import type {Pt} from './polyBoolean';

export interface Run{pts:Pt[];closed:boolean}
export type Join='miter'|'round'|'bevel';
export type Cap='butt'|'round'|'square';

const area=(c:readonly Pt[])=>{let s=0;for(let i=0;i<c.length;i++){const a=c[i],b=c[(i+1)%c.length];s+=a.x*b.y-b.x*a.y;}return s/2;};
/** Same orientation for every piece, so a nonzero union never cancels overlaps. */
const ccw=(c:Pt[]):Pt[]=>area(c)<0?[...c].reverse():c;
function dedupe(pts:readonly Pt[],closed:boolean):Pt[]{
  const out:Pt[]=[];for(const p of pts){const l=out[out.length-1];if(!l||Math.hypot(p.x-l.x,p.y-l.y)>1e-9)out.push(p);}
  if(closed)while(out.length>1&&Math.hypot(out[0].x-out[out.length-1].x,out[0].y-out[out.length-1].y)<=1e-9)out.pop();
  return out;
}
const arc=(c:Pt,r:number,from:number,to:number):Pt[]=>{
  const n=Math.max(1,Math.ceil(Math.abs(to-from)/(Math.PI/16))),out:Pt[]=[];
  for(let i=0;i<=n;i++){const a=from+(to-from)*i/n;out.push({x:c.x+r*Math.cos(a),y:c.y+r*Math.sin(a)});}
  return out;
};

/** Convex pieces (quads, join wedges, caps) whose union is the stroke of `runs` with half-width `half`. Every piece is counter-clockwise.
 *  Joins follow `join`/`miterLimit` (SVG semantics); caps apply to open runs only. A single point becomes a dot for round caps. */
export function strokePieces(runs:readonly Run[],half:number,join:Join,miterLimit:number,cap:Cap):Pt[][]{
  if(!(half>0))throw new RangeError('half-width must be positive');
  const pieces:Pt[][]=[];
  for(const run of runs){
    const pts=dedupe(run.pts,run.closed);
    if(pts.length===1){if(cap==='round')pieces.push(ccw(arc(pts[0],half,0,2*Math.PI).slice(0,-1)));else if(cap==='square')pieces.push([{x:pts[0].x-half,y:pts[0].y-half},{x:pts[0].x+half,y:pts[0].y-half},{x:pts[0].x+half,y:pts[0].y+half},{x:pts[0].x-half,y:pts[0].y+half}]);continue;}
    if(pts.length<2)continue;
    const count=run.closed?pts.length:pts.length-1;
    const dirs:Pt[]=[];
    for(let i=0;i<count;i++){const a=pts[i],b=pts[(i+1)%pts.length],l=Math.hypot(b.x-a.x,b.y-a.y);dirs.push({x:(b.x-a.x)/l,y:(b.y-a.y)/l});}
    for(let i=0;i<count;i++){
      const a=pts[i],b=pts[(i+1)%pts.length],u=dirs[i],nx=-u.y*half,ny=u.x*half;
      pieces.push(ccw([{x:a.x+nx,y:a.y+ny},{x:b.x+nx,y:b.y+ny},{x:b.x-nx,y:b.y-ny},{x:a.x-nx,y:a.y-ny}]));
    }
    const joinAt=(v:Pt,u1:Pt,u2:Pt)=>{
      const cross=u1.x*u2.y-u1.y*u2.x,dot=u1.x*u2.x+u1.y*u2.y;
      if(Math.abs(cross)<1e-9&&dot>0)return;
      if(Math.abs(cross)<1e-9){pieces.push(ccw(arc(v,half,0,2*Math.PI).slice(0,-1)));return;} // 180 degree turn
      const s=cross>0?-1:1,n1={x:-u1.y*s,y:u1.x*s},n2={x:-u2.y*s,y:u2.x*s};
      const p1={x:v.x+n1.x*half,y:v.y+n1.y*half},p2={x:v.x+n2.x*half,y:v.y+n2.y*half};
      if(join==='round'){
        const a1=Math.atan2(n1.y,n1.x);let a2=Math.atan2(n2.y,n2.x);
        while(a2-a1>Math.PI)a2-=2*Math.PI;while(a2-a1<-Math.PI)a2+=2*Math.PI;
        pieces.push(ccw([v,...arc(v,half,a1,a2)]));return;
      }
      if(join==='miter'&&1/Math.sqrt(Math.max(1e-12,(1+dot)/2))<=miterLimit){
        const k=half/(1+dot),tip={x:v.x+(n1.x+n2.x)*k,y:v.y+(n1.y+n2.y)*k};
        pieces.push(ccw([v,p1,tip,p2]));return;
      }
      pieces.push(ccw([v,p1,p2]));
    };
    for(let i=run.closed?0:1;i<count+(run.closed?0:0);i++){const prev=run.closed?(i-1+count)%count:i-1;joinAt(pts[i],dirs[prev],dirs[i]);}
    if(!run.closed){
      const a=pts[0],u=dirs[0],b=pts[pts.length-1],w=dirs[count-1];
      if(cap==='square'){
        pieces.push(ccw([{x:a.x-u.y*half,y:a.y+u.x*half},{x:a.x-u.y*half-u.x*half,y:a.y+u.x*half-u.y*half},{x:a.x+u.y*half-u.x*half,y:a.y-u.x*half-u.y*half},{x:a.x+u.y*half,y:a.y-u.x*half}]));
        pieces.push(ccw([{x:b.x-w.y*half,y:b.y+w.x*half},{x:b.x-w.y*half+w.x*half,y:b.y+w.x*half+w.y*half},{x:b.x+w.y*half+w.x*half,y:b.y-w.x*half+w.y*half},{x:b.x+w.y*half,y:b.y-w.x*half}]));
      }else if(cap==='round'){
        const ua=Math.atan2(u.y,u.x),wa=Math.atan2(w.y,w.x);
        pieces.push(ccw(arc(a,half,ua+Math.PI/2,ua+Math.PI*1.5)));
        pieces.push(ccw(arc(b,half,wa-Math.PI/2,wa+Math.PI/2)));
      }
    }
  }
  return pieces;
}
