import type {VectorDocument,VectorPath} from '../vectorio';
import {flatten} from './geometry';
import {objectsOf} from './transforms';
import {booleanContours,type Pt} from './polyBoolean';
import {strokePieces,type Run} from './strokeBand';
import {newId} from './shapes';
import {refuseClipped} from './clip';

export const OFFSET_LIMITS=Object.freeze({min:0.01,max:500});
type Obj={ids:string[];paths:VectorPath[]};
const toRuns=(o:Obj):Run[]=>o.paths.map(p=>({pts:flatten(p),closed:p.closed}));
const asOperand=(c:Pt[][],rule:'nonzero'|'evenodd'='nonzero')=>({contours:c,rule});
function paintOf(first:VectorPath,loops:Pt[][],style:VectorPath['style']):VectorPath[]{
  const compound=loops.length>1?newId('c'):undefined;
  return loops.map(l=>({id:newId('p'),closed:true,nodes:l.map(p=>({id:newId('n'),x:p.x,y:p.y,kind:'corner' as const})),
    style:{...style,...(loops.length>1?{fillRule:'evenodd' as const}:{})},
    ...(compound?{compound}:{}),...(first.layer?{layer:first.layer}:{}),...(first.group?{group:first.group}:{}),...(first.name?{name:first.name}:{})}));
}
function objects(doc:VectorDocument,ids:readonly string[]):{objs:Obj[];index:Map<string,number>}{
  const objs=objectsOf(doc,ids,false);if(!objs?.length)throw Error('Select at least one shape');
  const index=new Map(doc.paths.map((p,i)=>[p.id,i]));
  return {objs:objs.map(o=>({ids:o.ids,paths:o.ids.map(id=>doc.paths[index.get(id)!])})),index};
}
function replace(doc:VectorDocument,index:Map<string,number>,plan:{obj:Obj;made:VectorPath[]}[]):{doc:VectorDocument;ids:string[]}{
  const at=new Map<number,VectorPath[]>(),drop=new Set<string>();
  for(const {obj,made} of plan){at.set(Math.min(...obj.ids.map(id=>index.get(id)!)),made);obj.ids.forEach(id=>drop.add(id));}
  const paths:VectorPath[]=[];doc.paths.forEach((p,i)=>{const m=at.get(i);if(m)paths.push(...m);if(!drop.has(p.id))paths.push(p);});
  return {doc:{...doc,paths},ids:plan.flatMap(x=>x.made.map(p=>p.id))};
}

/** Grow (distance > 0) or shrink (< 0) every selected closed shape by `distance` document units, as the union with / difference from a round-joined band around its outline.
 *  Curves are flattened first, so the result is polygonal. Compound shapes (holes) offset together. Refuses open shapes and an empty result. */
export function offsetSelection(doc:VectorDocument,ids:readonly string[],distance:number):{doc:VectorDocument;ids:string[]}{
  refuseClipped(doc,ids,'combine or offset it');
  if(!Number.isFinite(distance)||Math.abs(distance)<OFFSET_LIMITS.min||Math.abs(distance)>OFFSET_LIMITS.max)throw new RangeError(`distance must be ${OFFSET_LIMITS.min}-${OFFSET_LIMITS.max} (negative shrinks)`);
  const {objs,index}=objects(doc,ids),plan:{obj:Obj;made:VectorPath[]}[]=[];
  for(const obj of objs){
    if(obj.paths.some(p=>!p.closed||p.nodes.length<3))throw Error('Offset needs closed shapes with at least three points');
    const shape=asOperand(obj.paths.map(p=>flatten(p)),obj.paths[0].style?.fillRule??'nonzero');
    const band=strokePieces(toRuns(obj),Math.abs(distance),'round',4,'butt').map(p=>asOperand([p]));
    const loops=booleanContours([shape,...band],distance>0?'union':'subtract');
    if(!loops.length)throw Error('The result would be empty');
    plan.push({obj,made:paintOf(obj.paths[0],loops,obj.paths[0].style)});
  }
  return replace(doc,index,plan);
}

/** Turn the stroke of every selected shape into a filled shape (joins, caps and miter limit as drawn). A closed shape that also has a fill keeps its fill as a stroke-less
 *  shape below the outline. Objects without a visible stroke are refused. Curves are flattened, so the outline is polygonal. */
export function outlineStroke(doc:VectorDocument,ids:readonly string[]):{doc:VectorDocument;ids:string[]}{
  refuseClipped(doc,ids,'combine or offset it');
  const {objs,index}=objects(doc,ids),plan:{obj:Obj;made:VectorPath[]}[]=[];
  for(const obj of objs){
    const first=obj.paths[0],st=first.style??{},stroke=st.stroke??'none',width=st.strokeWidth??1;
    if(stroke==='none'||!(width>0))throw Error('Selected shapes need a visible stroke to outline');
    if(stroke.startsWith('url('))throw Error('Gradient strokes cannot be outlined');
    const pieces=strokePieces(toRuns(obj),width/2,st.lineJoin??'miter',st.miterLimit??4,st.lineCap??'butt').map(p=>asOperand([p]));
    const loops=pieces.length>1?booleanContours(pieces,'union'):pieces.map(o=>o.contours[0]);
    if(!loops.length)throw Error('The result would be empty');
    const outline=paintOf(first,loops,{fill:stroke,stroke:'none',fillOpacity:st.strokeOpacity??1,opacity:st.opacity??1});
    const filled=(st.fill??'#000000')!=='none'&&obj.paths.every(p=>p.closed);
    const keep=filled?obj.paths.map(p=>({...p,style:{...p.style,stroke:'none' as const}})):[];
    plan.push({obj,made:[...keep,...outline]});
  }
  return replace(doc,index,plan);
}
