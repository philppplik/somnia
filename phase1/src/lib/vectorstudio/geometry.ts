/** Geometry helpers for Vector Studio. Pure functions over the vectorio document model (no DOM). */
import type {Point,VectorDocument,VectorNode,VectorPath} from '../vectorio';
import {hitTestObject} from '../../components/vectorstudio/tools/operations';
export interface Box {minX:number;minY:number;maxX:number;maxY:number}
const P=(n:VectorNode):Point=>({x:n.x,y:n.y});
export function segmentCount(p:VectorPath):number{const n=p.nodes.length;return n<2?0:p.closed?n:n-1;}
/** Cubic control points of segment i. Missing handles equal the node (straight line). */
export function segment(p:VectorPath,i:number):[Point,Point,Point,Point]{
 const a=p.nodes[i],b=p.nodes[(i+1)%p.nodes.length];return [P(a),a.out??P(a),b.in??P(b),P(b)];}
const cubic=(s:[Point,Point,Point,Point],t:number):Point=>{const u=1-t;
 return {x:u*u*u*s[0].x+3*u*u*t*s[1].x+3*u*t*t*s[2].x+t*t*t*s[3].x,y:u*u*u*s[0].y+3*u*u*t*s[1].y+3*u*t*t*s[2].y+t*t*t*s[3].y};};
const straight=(s:[Point,Point,Point,Point])=>s[1].x===s[0].x&&s[1].y===s[0].y&&s[2].x===s[3].x&&s[2].y===s[3].y;
/** Polyline approximation of the path (24 steps per curved segment). */
export function flatten(p:VectorPath,steps=24):Point[]{
 if(p.nodes.length===1)return [P(p.nodes[0])];const out:Point[]=[];
 for(let i=0;i<segmentCount(p);i++){const s=segment(p,i);if(i===0)out.push(s[0]);
  if(straight(s))out.push(s[3]);else for(let k=1;k<=steps;k++)out.push(cubic(s,k/steps));}
 return out;}
export function pathBox(p:VectorPath):Box|null{
 const pts=flatten(p);if(!pts.length)return null;
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 for(const q of pts){minX=Math.min(minX,q.x);minY=Math.min(minY,q.y);maxX=Math.max(maxX,q.x);maxY=Math.max(maxY,q.y);}
 return {minX,minY,maxX,maxY};}
export function unionBox(a:Box|null,b:Box|null):Box|null{if(!a)return b;if(!b)return a;
 return {minX:Math.min(a.minX,b.minX),minY:Math.min(a.minY,b.minY),maxX:Math.max(a.maxX,b.maxX),maxY:Math.max(a.maxY,b.maxY)};}
export const boxOf=(paths:readonly VectorPath[])=>paths.reduce<Box|null>((a,p)=>unionBox(a,pathBox(p)),null);
function distToSeg(p:Point,a:Point,b:Point):number{const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;
 const t=l===0?0:Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l));return Math.hypot(p.x-(a.x+t*dx),p.y-(a.y+t*dy));}
function inside(pts:Point[],q:Point,evenodd:boolean):boolean{
 let wind=0,cross=0;
 for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];
  if((a.y>q.y)!==(b.y>q.y)){const x=a.x+(q.y-a.y)/(b.y-a.y)*(b.x-a.x);if(x>q.x){cross++;wind+=b.y>a.y?1:-1;}}}
 return evenodd?cross%2===1:wind!==0;}
/** True when the point hits the filled area or the stroke (within `tolerance` document units). */
export function hitPath(p:VectorPath,pt:Point,tolerance=4):boolean{
 if(p.hidden)return false;const fill=p.style?.fill??'#000000';const stroke=p.style?.stroke??'none';
 const pts=flatten(p);
 if(p.closed&&fill!=='none'&&pts.length>2&&inside(pts,pt,p.style?.fillRule==='evenodd'))return true;
 const w=stroke!=='none'?(p.style?.strokeWidth??1)/2:0;const lim=Math.max(tolerance,w);
 const n=p.closed?pts.length:pts.length-1;
 for(let i=0;i<n;i++)if(distToSeg(pt,pts[i],pts[(i+1)%pts.length])<=lim)return true;
 return pts.length===1&&Math.hypot(pt.x-pts[0].x,pt.y-pts[0].y)<=lim;}
/** Topmost path under the point, or null. Paths later in the array paint on top. */
export function hitDocument(doc:VectorDocument,pt:Point,tolerance=4):string|null{
 return hitTestObject(doc,pt,tolerance);}
export function transformPath(p:VectorPath,f:(q:Point)=>Point):VectorPath{
 return {...p,nodes:p.nodes.map(n=>{const q=f(n);const out:VectorNode={...n,x:q.x,y:q.y};
  if(n.in)out.in=f(n.in);if(n.out)out.out=f(n.out);return out;})};}
export const translatePath=(p:VectorPath,dx:number,dy:number)=>transformPath(p,q=>({x:q.x+dx,y:q.y+dy}));
/** Scales the path so that its box maps from `from` to `to`. */
export function fitPath(p:VectorPath,from:Box,to:Box):VectorPath{
 const sx=from.maxX>from.minX?(to.maxX-to.minX)/(from.maxX-from.minX):1,sy=from.maxY>from.minY?(to.maxY-to.minY)/(from.maxY-from.minY):1;
 return transformPath(p,q=>({x:to.minX+(q.x-from.minX)*sx,y:to.minY+(q.y-from.minY)*sy}));}
/** Nearest point on the path outline: segment index, parameter t in (0,1) and distance. Used to insert nodes. */
export function nearestOnPath(p:VectorPath,pt:Point):{segment:number;t:number;distance:number}|null{
 let best:{segment:number;t:number;distance:number}|null=null;
 for(let i=0;i<segmentCount(p);i++){const s=segment(p,i);const steps=straight(s)?1:32;let prev=s[0];
  for(let k=1;k<=steps;k++){const q=straight(s)?s[3]:cubic(s,k/steps);const dx=q.x-prev.x,dy=q.y-prev.y,l=dx*dx+dy*dy;
   const u=l===0?0:Math.max(0,Math.min(1,((pt.x-prev.x)*dx+(pt.y-prev.y)*dy)/l));const d=Math.hypot(pt.x-(prev.x+u*dx),pt.y-(prev.y+u*dy));
   const t=((k-1)+u)/steps;if(!best||d<best.distance)best={segment:i,t:Math.min(0.999,Math.max(0.001,t)),distance:d};prev=q;}}
 return best;}
const lerp=(a:Point,b:Point,t:number):Point=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
/** Inserts a node at parameter t of segment i without changing the shape (de Casteljau). */
export function insertNode(p:VectorPath,i:number,t:number,id:string):VectorPath{
 if(i<0||i>=segmentCount(p)||!(t>0&&t<1))throw new RangeError('segment or t out of range');
 const a=p.nodes[i],j=(i+1)%p.nodes.length,b=p.nodes[j];const s=segment(p,i);
 let nn:VectorNode;let na=a,nb=b;
 if(straight(s)){const m=lerp(s[0],s[3],t);nn={id,x:m.x,y:m.y,kind:'corner'};}
 else{const ab=lerp(s[0],s[1],t),bc=lerp(s[1],s[2],t),cd=lerp(s[2],s[3],t),abc=lerp(ab,bc,t),bcd=lerp(bc,cd,t),m=lerp(abc,bcd,t);
  nn={id,x:m.x,y:m.y,kind:'smooth',in:abc,out:bcd};na={...a,out:ab};nb={...b,in:cd};}
 const nodes=p.nodes.map(n=>n===a?na:n===b?nb:n);nodes.splice(i+1,0,nn);return {...p,nodes};}
