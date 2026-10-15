import type {VectorDocument,VectorNode,VectorPath} from '../vectorio';
import {selectedPaths} from './selectionClosure';

export const SIMPLIFY_LIMITS=Object.freeze({min:0.01,max:100});
type P={x:number;y:number};
function dist(p:P,a:P,b:P){const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;if(l<1e-18)return Math.hypot(p.x-a.x,p.y-a.y);return Math.abs((p.x-a.x)*dy-(p.y-a.y)*dx)/Math.sqrt(l);}
/** Ramer-Douglas-Peucker over a run of nodes; returns the kept nodes (both ends always kept). Iterative, so long runs cannot overflow the stack. */
function rdp(run:VectorNode[],tol:number):VectorNode[]{
 const keep=new Array<boolean>(run.length).fill(false);keep[0]=keep[run.length-1]=true;
 const stack:[number,number][]=[[0,run.length-1]];
 while(stack.length){const [i,j]=stack.pop()!;let far=-1,fd=tol;
  for(let k=i+1;k<j;k++){const d=dist(run[k],run[i],run[j]);if(d>fd){fd=d;far=k;}}
  if(far>=0){keep[far]=true;stack.push([i,far],[far,j]);}}
 return run.filter((_,i)=>keep[i]);
}
/** Remove nodes that lie within `tol` of the straight line between their kept neighbours. Only nodes without handles whose two neighbouring
 *  segments are straight are candidates; curved segments and their end nodes are never touched. Returns the same path when nothing was removed. */
export function simplifyPath(p:VectorPath,tol:number):{path:VectorPath;removed:number}{
 const n=p.nodes.length,minKeep=p.closed?3:2;if(n<=minKeep)return {path:p,removed:0};
 const free=p.nodes.map((v,i)=>{
  if(!p.closed&&(i===0||i===n-1))return false;
  const a=p.nodes[(i+n-1)%n],b=p.nodes[(i+1)%n];
  return v.in===undefined&&v.out===undefined&&a.out===undefined&&b.in===undefined;});
 let anchors=free.flatMap((f,i)=>f?[]:[i]);
 if(p.closed&&anchors.length===0){ // plain polygon: pin the first node and the one farthest from it
  let far=1,fd=-1;for(let i=1;i<n;i++){const d=Math.hypot(p.nodes[i].x-p.nodes[0].x,p.nodes[i].y-p.nodes[0].y);if(d>fd){fd=d;far=i;}}
  anchors=[0,far];}
 if(!anchors.length)return {path:p,removed:0};
 const out:VectorNode[]=[];
 const m=anchors.length,runs=p.closed?m:m-1;
 for(let r=0;r<runs;r++){
  const s=anchors[r],e=anchors[(r+1)%m],run:VectorNode[]=[];
  for(let i=s;;i=(i+1)%n){run.push(p.nodes[i]);if(i===e&&run.length>1)break;if(run.length>n+1)break;}
  const kept=rdp(run,tol);out.push(...kept.slice(0,-1));
  if(!p.closed&&r===runs-1)out.push(kept[kept.length-1]);
 }
 if(out.length<minKeep||out.length>=n)return {path:p,removed:0};
 return {path:{...p,nodes:out},removed:n-out.length};
}
/** Simplify every selected path. Refuses when no node could be removed. */
export function simplifySelection(doc:VectorDocument,ids:readonly string[],tol:number):VectorDocument{
 if(!Number.isFinite(tol)||tol<SIMPLIFY_LIMITS.min||tol>SIMPLIFY_LIMITS.max)throw new RangeError(`tolerance must be ${SIMPLIFY_LIMITS.min}-${SIMPLIFY_LIMITS.max}`);
 const set=new Set(selectedPaths(doc,ids).map(p=>p.id));if(!set.size)throw Error('Select at least one shape');
 let total=0;const paths=doc.paths.map(p=>{if(!set.has(p.id))return p;const r=simplifyPath(p,tol);total+=r.removed;return r.path;});
 if(!total)throw Error('Nothing to simplify');
 return {...doc,paths};
}
