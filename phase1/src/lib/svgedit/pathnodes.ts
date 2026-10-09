/** Path <-> editable nodes. Parsing reuses the vectorio path parser; writing reuses its canonical serializer. */
import {parsePathData} from '../vectorio/pathData';
import {serializeContour} from '../vectorio/serialize';
import {inferKind} from '../vectorio/nodes';
import type {NodeKind,Point,VectorNode} from '../vectorio/types';
export interface Contour{closed:boolean;nodes:VectorNode[]}
let seq=0;const nid=()=>`n${++seq}`;
const same=(a:{x:number;y:number},b:{x:number;y:number})=>Math.abs(a.x-b.x)<1e-6&&Math.abs(a.y-b.y)<1e-6;
export function pathToContours(d:string):Contour[]|null{
 const r=parsePathData(d);if(r.error)return null;const out:Contour[]=[];let cur:Contour|null=null;let pen={x:0,y:0};
 const start=(x:number,y:number)=>{cur={closed:false,nodes:[{id:nid(),x,y,kind:'corner'}]};out.push(cur);pen={x,y};};
 const last=()=>cur!.nodes[cur!.nodes.length-1];
 for(const s of r.segments){
  if(s.t==='M'){start(s.x,s.y);continue;}
  if(!cur)start(pen.x,pen.y);
  if(s.t==='L'){cur!.nodes.push({id:nid(),x:s.x,y:s.y,kind:'corner'});pen={x:s.x,y:s.y};}
  else if(s.t==='C'){last().out={x:s.x1,y:s.y1};cur!.nodes.push({id:nid(),x:s.x,y:s.y,kind:'corner',in:{x:s.x2,y:s.y2}});pen={x:s.x,y:s.y};}
  else if(s.t==='Q'){const p=last();const c1={x:p.x+2/3*(s.x1-p.x),y:p.y+2/3*(s.y1-p.y)},c2={x:s.x+2/3*(s.x1-s.x),y:s.y+2/3*(s.y1-s.y)};p.out=c1;cur!.nodes.push({id:nid(),x:s.x,y:s.y,kind:'corner',in:c2});pen={x:s.x,y:s.y};}
  else if(s.t==='Z'){const c=out[out.length-1];c.closed=true;if(c.nodes.length>1&&same(last(),c.nodes[0])){const l=c.nodes.pop()!;if(l.in)c.nodes[0].in=l.in;}pen={x:c.nodes[0].x,y:c.nodes[0].y};}
 }
 for(const c of out)for(const n of c.nodes)n.kind=inferKind(n.x,n.y,n.in,n.out);
 return out;}
export const contoursToPath=(cs:Contour[])=>cs.map(c=>serializeContour(c.nodes,c.closed)).join('');
export function moveNode(n:VectorNode,dx:number,dy:number){n.x+=dx;n.y+=dy;if(n.in){n.in={x:n.in.x+dx,y:n.in.y+dy};}if(n.out){n.out={x:n.out.x+dx,y:n.out.y+dy};}}
/** Move a handle; smooth and symmetric nodes keep the opposite handle collinear. */
export function moveHandle(n:VectorNode,which:'in'|'out',p:Point,alt=false){
 n[which]={x:p.x,y:p.y};const other=which==='in'?'out':'in';const o=n[other];
 if(alt){n.kind='corner';return;}
 if(n.kind==='corner'||!o)return;
 const vx=p.x-n.x,vy=p.y-n.y;const len=Math.hypot(vx,vy)||1;
 const ol=n.kind==='symmetric'?len:Math.hypot(o.x-n.x,o.y-n.y);
 n[other]={x:n.x-vx/len*ol,y:n.y-vy/len*ol};}
export function setKind(c:Contour,i:number,kind:NodeKind){
 const n=c.nodes[i];n.kind=kind;
 if(kind==='corner'){delete n.in;delete n.out;return;}
 const prev=c.nodes[(i-1+c.nodes.length)%c.nodes.length],next=c.nodes[(i+1)%c.nodes.length];
 let tx=next.x-prev.x,ty=next.y-prev.y;const tl=Math.hypot(tx,ty)||1;tx/=tl;ty/=tl;
 const lin=Math.hypot(n.x-prev.x,n.y-prev.y)/3,lout=Math.hypot(next.x-n.x,next.y-n.y)/3;
 if(i>0||c.closed)n.in={x:n.x-tx*lin,y:n.y-ty*lin};if(i<c.nodes.length-1||c.closed)n.out={x:n.x+tx*lout,y:n.y+ty*lout};}
export function deleteNode(c:Contour,i:number):boolean{if(c.nodes.length<=2)return false;c.nodes.splice(i,1);return true;}
const lerp=(a:Point,b:Point,t:number):Point=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
export function segmentPoints(a:VectorNode,b:VectorNode):[Point,Point,Point,Point]{return[{x:a.x,y:a.y},a.out??{x:a.x,y:a.y},b.in??{x:b.x,y:b.y},{x:b.x,y:b.y}];}
export const bezierAt=(p:[Point,Point,Point,Point],t:number):Point=>{const u=1-t;return{x:u*u*u*p[0].x+3*u*u*t*p[1].x+3*u*t*t*p[2].x+t*t*t*p[3].x,y:u*u*u*p[0].y+3*u*u*t*p[1].y+3*u*t*t*p[2].y+t*t*t*p[3].y};};
/** Closest point on any segment. Returns segment index (from node i to i+1), parameter t and distance. */
export function nearestOnContour(c:Contour,p:Point):{seg:number;t:number;dist:number;at:Point}|null{
 let best:{seg:number;t:number;dist:number;at:Point}|null=null;const count=c.closed?c.nodes.length:c.nodes.length-1;
 for(let i=0;i<count;i++){const pts=segmentPoints(c.nodes[i],c.nodes[(i+1)%c.nodes.length]);
  for(let k=0;k<=40;k++){const t=k/40;const q=bezierAt(pts,t);const d=Math.hypot(q.x-p.x,q.y-p.y);if(!best||d<best.dist)best={seg:i,t,dist:d,at:q};}}
 return best;}
/** Insert a node on segment `seg` at parameter t (de Casteljau split, shape unchanged). */
export function insertNode(c:Contour,seg:number,t:number){
 const a=c.nodes[seg],bi=(seg+1)%c.nodes.length,b=c.nodes[bi];const [p0,p1,p2,p3]=segmentPoints(a,b);
 const isCurve=!!(a.out||b.in);const mid:VectorNode={id:nid(),x:0,y:0,kind:'corner'};
 if(!isCurve){const m=lerp(p0,p3,t);mid.x=m.x;mid.y=m.y;}
 else{const q0=lerp(p0,p1,t),q1=lerp(p1,p2,t),q2=lerp(p2,p3,t),r0=lerp(q0,q1,t),r1=lerp(q1,q2,t),m=lerp(r0,r1,t);
  a.out=q0;b.in=q2;mid.x=m.x;mid.y=m.y;mid.in=r0;mid.out=r1;mid.kind='smooth';}
 c.nodes.splice(seg+1,0,mid);return mid;}
export function contoursBox(cs:Contour[]){let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const c of cs)for(const n of c.nodes)for(const p of[n,n.in,n.out]){if(!p)continue;x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y);}return{x0,y0,x1,y1};}

// ---- pen and path UX helpers ----------------------------------------------------------------------------------
export const cloneContours=(cs:Contour[]):Contour[]=>cs.map(c=>({closed:c.closed,nodes:c.nodes.map(n=>({...n,in:n.in&&{...n.in},out:n.out&&{...n.out}}))}));
/** Reverse the direction of a contour. Handles swap sides, so every curve keeps its exact shape. */
export function reverseContour(c:Contour):Contour{
 return{closed:c.closed,nodes:[...c.nodes].reverse().map(n=>{const r:VectorNode={...n,in:n.out&&{...n.out},out:n.in&&{...n.in}};if(!r.in)delete r.in;if(!r.out)delete r.out;return r;})};}
/** Endpoint of an open contour: index of the node when `i` is its first or last node, else null. */
export const isEndpoint=(c:Contour,i:number)=>!c.closed&&c.nodes.length>=1&&(i===0||i===c.nodes.length-1);
/** A copy of the contour arranged so that node `i` (an endpoint) is the last node, ready to be continued from there. */
export function contourEndingAt(c:Contour,i:number):Contour|null{
 if(!isEndpoint(c,i))return null;const k=cloneContours([c])[0];return i===c.nodes.length-1?k:reverseContour(k);}
/** Pull the segment `seg` of contour `c` so that the curve point at `t` follows `to`. Both end handles move by the same
 *  amount, weighted by 1/(3t(1-t)) so the point lands exactly on `to`. Straight segments become curves. Smooth and
 *  symmetric end nodes keep their other handle collinear. */
export function dragSegment(c:Contour,seg:number,t:number,to:Point){
 const a=c.nodes[seg],b=c.nodes[(seg+1)%c.nodes.length];const pts=segmentPoints(a,b);const at=bezierAt(pts,t);
 const tt=Math.min(0.85,Math.max(0.15,t));const w=1/(3*tt*(1-tt));
 const dx=(to.x-at.x)*w,dy=(to.y-at.y)*w;
 const p1=a.out??{x:a.x,y:a.y},p2=b.in??{x:b.x,y:b.y};
 // a straight segment first gets its handles at the thirds so the pull starts from the same shape
 const base1=a.out?p1:{x:a.x+(b.x-a.x)/3,y:a.y+(b.y-a.y)/3},base2=b.in?p2:{x:b.x-(b.x-a.x)/3,y:b.y-(b.y-a.y)/3};
 moveHandle(a,'out',{x:base1.x+dx,y:base1.y+dy});moveHandle(b,'in',{x:base2.x+dx,y:base2.y+dy});}
/** Remove an anchor and heal the path: neighbours keep their own handles, the shape changes only around the anchor. */
export function removeAnchor(c:Contour,i:number):boolean{return deleteNode(c,i);}
