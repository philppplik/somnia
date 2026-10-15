import type {VectorDocument,VectorNode,VectorPath} from '../vectorio';
import {selectedPaths} from './selectionClosure';
import {newId} from './shapes';

export const RADIUS_LIMITS=Object.freeze({min:0.01,max:1000});
const straight=(n:VectorNode,side:'in'|'out')=>n[side]===undefined;

/** Round the corners of one path. A corner is a node whose two neighbouring segments are straight (no handles on either end) and that is not an open end.
 *  The radius is cut down so that rounded neighbours never overlap (at most half of each adjacent segment). Returns the same path when nothing changed. */
export function roundPathCorners(p:VectorPath,radius:number,only?:ReadonlySet<string>):{path:VectorPath;rounded:number}{
 const n=p.nodes.length;if(n<3)return {path:p,rounded:0};
 const out:VectorNode[]=[];let rounded=0;
 for(let i=0;i<n;i++){
  const v=p.nodes[i];
  const end=!p.closed&&(i===0||i===n-1);
  const a=p.nodes[(i+n-1)%n],b=p.nodes[(i+1)%n];
  if(end||(only&&!only.has(v.id))||!straight(v,'in')||!straight(v,'out')||!straight(a,'out')||!straight(b,'in')){out.push(v);continue;}
  const d1x=a.x-v.x,d1y=a.y-v.y,d2x=b.x-v.x,d2y=b.y-v.y,l1=Math.hypot(d1x,d1y),l2=Math.hypot(d2x,d2y);
  if(l1<1e-9||l2<1e-9){out.push(v);continue;}
  const u1={x:d1x/l1,y:d1y/l1},u2={x:d2x/l2,y:d2y/l2},cos=Math.max(-1,Math.min(1,u1.x*u2.x+u1.y*u2.y)),theta=Math.acos(cos);
  if(theta<1e-3||theta>Math.PI-1e-3){out.push(v);continue;} // straight through or a needle
  const tan=Math.tan(theta/2),t=Math.min(radius/tan,Math.min(l1,l2)/2),r=t*tan,phi=Math.PI-theta,k=4/3*Math.tan(phi/4)*r;
  const p1={x:v.x+u1.x*t,y:v.y+u1.y*t},p2={x:v.x+u2.x*t,y:v.y+u2.y*t};
  out.push({id:v.id,x:p1.x,y:p1.y,kind:'corner',out:{x:p1.x-u1.x*k,y:p1.y-u1.y*k}});
  out.push({id:newId('n'),x:p2.x,y:p2.y,kind:'corner',in:{x:p2.x-u2.x*k,y:p2.y-u2.y*k}});
  rounded++;
 }
 return rounded?{path:{...p,nodes:out},rounded}:{path:p,rounded:0};
}

/** Round the straight corners of every selected path (or only the listed nodes). Refuses when no corner could be rounded. */
export function roundCorners(doc:VectorDocument,ids:readonly string[],radius:number,nodeIds?:readonly string[]):VectorDocument{
 if(!Number.isFinite(radius)||radius<RADIUS_LIMITS.min||radius>RADIUS_LIMITS.max)throw new RangeError(`radius must be ${RADIUS_LIMITS.min}-${RADIUS_LIMITS.max}`);
 const set=new Set(selectedPaths(doc,ids).map(p=>p.id));if(!set.size)throw Error('Select at least one shape');
 const only=nodeIds?new Set(nodeIds):undefined;let total=0;
 const paths=doc.paths.map(p=>{if(!set.has(p.id))return p;const r=roundPathCorners(p,radius,only);total+=r.rounded;return r.path;});
 if(!total)throw Error('No straight corners to round');
 return {...doc,paths};
}
