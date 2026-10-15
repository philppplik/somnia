import type {VectorDocument,VectorPath} from '../vectorio';
import {flatten} from './geometry';
import {objectsOf} from './transforms';
import {booleanContours,BOOL_OPS,type BoolOp,type Pt} from './polyBoolean';
import {newId} from './shapes';
export {BOOL_OPS,type BoolOp};
/** Combines the selected objects into one new compound path.
 *  Objects are the visible selected shapes (a compound counts once), in paint order. Subtract cuts every object above the lowest one out of the lowest one;
 *  the other operations treat all objects alike. The result takes the style of the lowest object for subtract and of the topmost object otherwise,
 *  sits where the lowest selected object was, and is polygonal: curves are flattened first, so it is an approximation. Open shapes are refused. */
export function applyBoolean(doc:VectorDocument,ids:readonly string[],op:BoolOp):{doc:VectorDocument;ids:string[]}{
  if(!(BOOL_OPS as readonly string[]).includes(op))throw Error('Unknown boolean operation');
  const objs=objectsOf(doc,ids,false);if(!objs||objs.length<2)throw Error('Select at least two shapes to combine them');
  const index=new Map(doc.paths.map((p,i)=>[p.id,i]));
  const ordered=objs.map(o=>({...o,at:Math.min(...o.ids.map(id=>index.get(id)!))})).sort((a,b)=>a.at-b.at);
  const operands=ordered.map(o=>{
    const paths=o.ids.map(id=>doc.paths[index.get(id)!]);
    if(paths.some(p=>!p.closed||p.nodes.length<3))throw Error('Boolean operations need closed shapes with at least three points');
    return {paths,contours:paths.map(p=>flatten(p)),rule:(paths[0].style?.fillRule??'nonzero') as 'nonzero'|'evenodd'};
  });
  const loops:Pt[][]=booleanContours(operands.map(o=>({contours:o.contours,rule:o.rule})),op);
  if(!loops.length)throw Error('The result would be empty');
  const source=op==='subtract'?operands[0]:operands[operands.length-1],first=source.paths[0],compound=loops.length>1?newId('c'):undefined;
  const made:VectorPath[]=loops.map((l,i)=>({id:newId('p'),closed:true,nodes:l.map(p=>({id:newId('n'),x:p.x,y:p.y,kind:'corner' as const})),
    style:{...first.style,fillRule:loops.length>1?'evenodd':first.style?.fillRule},...(compound?{compound}:{}),...(first.layer?{layer:first.layer}:{}),...(first.group&&ordered.every(o=>o.ids.every(id=>doc.paths[index.get(id)!].group===first.group))?{group:first.group}:{}),name:i===0?first.name:undefined}));
  const drop=new Set(ordered.flatMap(o=>o.ids)),at=ordered[0].at;
  const paths:VectorPath[]=[];doc.paths.forEach((p,i)=>{if(i===at)paths.push(...made);if(!drop.has(p.id))paths.push(p);});
  return {doc:{...doc,paths},ids:made.map(p=>p.id)};
}
