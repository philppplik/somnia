import type {VectorDocument,Point} from '../vectorio';
import {boxOf} from './geometry';
/** Geometry-only transforms preserve stroke widths and compound membership. */
function chosen(doc:VectorDocument,ids:readonly string[]){const groups=new Set(doc.paths.filter(p=>ids.includes(p.id)&&!p.hidden&&p.compound).map(p=>p.compound));return doc.paths.filter(p=>!p.hidden&&(ids.includes(p.id)||!!(p.compound&&groups.has(p.compound))));}
export function selectionBounds(doc:VectorDocument,ids:readonly string[]){const b=boxOf(chosen(doc,ids));return b?{x:b.minX,y:b.minY,width:b.maxX-b.minX,height:b.maxY-b.minY}:null;}
function transform(doc:VectorDocument,ids:readonly string[],fn:(pt:Point)=>Point):VectorDocument{const keys=new Set(chosen(doc,ids).map(p=>p.id));return {...doc,paths:doc.paths.map(p=>!keys.has(p.id)?p:{...p,nodes:p.nodes.map(n=>({...n,...fn(n),...(n.in?{in:fn(n.in)}:{}),...(n.out?{out:fn(n.out)}:{})}))})};}
export function scaleSelection(doc:VectorDocument,ids:readonly string[],sx:number,sy:number,origin:Point){return transform(doc,ids,p=>({x:origin.x+(p.x-origin.x)*sx,y:origin.y+(p.y-origin.y)*sy}));}
export function rotateSelection(doc:VectorDocument,ids:readonly string[],degrees:number){const b=selectionBounds(doc,ids);if(!b)return doc;const cx=b.x+b.width/2,cy=b.y+b.height/2,a=degrees*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return transform(doc,ids,p=>({x:cx+(p.x-cx)*c-(p.y-cy)*s,y:cy+(p.x-cx)*s+(p.y-cy)*c}));}

export const ALIGN_MODES=['left','centerX','right','top','centerY','bottom'] as const;
export type AlignMode=typeof ALIGN_MODES[number];
export const ALIGN_TARGETS=['selection','page'] as const;
export type AlignTarget=typeof ALIGN_TARGETS[number];
/** One painted object: a compound counts once, every other visible path is its own object. Bounds are geometric (no stroke padding). */
function objectsOf(doc:VectorDocument,ids:readonly string[]){
  const out=new Map<string,{ids:string[];box:{minX:number;minY:number;maxX:number;maxY:number}}>();
  for(const p of chosen(doc,ids)){const key=p.compound?'c:'+p.compound:'p:'+p.id;const e=out.get(key)??{ids:[],box:null as never};e.ids.push(p.id);out.set(key,e);}
  for(const e of out.values()){const b=boxOf(doc.paths.filter(p=>e.ids.includes(p.id)));if(!b)return null;e.box=b;}
  return [...out.values()];
}
function shift(doc:VectorDocument,moves:Map<string,{dx:number;dy:number}>):VectorDocument{
  return {...doc,paths:doc.paths.map(p=>{const m=moves.get(p.id);return !m||(!m.dx&&!m.dy)?p:{...p,nodes:p.nodes.map(n=>({...n,x:n.x+m.dx,y:n.y+m.dy,...(n.in?{in:{x:n.in.x+m.dx,y:n.in.y+m.dy}}:{}),...(n.out?{out:{x:n.out.x+m.dx,y:n.out.y+m.dy}}:{})}))};})};
}
/** Aligns whole objects to the selection bounds (2 or more objects) or to the page (one or more). Throws when the selection cannot be aligned. */
export function alignSelection(doc:VectorDocument,ids:readonly string[],mode:AlignMode,to:AlignTarget):VectorDocument{
  if(!(ALIGN_MODES as readonly string[]).includes(mode)||!(ALIGN_TARGETS as readonly string[]).includes(to))throw Error('Unknown align option');
  const objs=objectsOf(doc,ids);if(!objs||!objs.length)throw Error('Nothing to align');
  if(to==='selection'&&objs.length<2)throw Error('Select at least two objects to align them to each other');
  if(!Number.isFinite(doc.width)||!Number.isFinite(doc.height))throw Error('Page size is not valid');
  const frame=to==='page'?{minX:0,minY:0,maxX:doc.width,maxY:doc.height}:{minX:Math.min(...objs.map(o=>o.box.minX)),minY:Math.min(...objs.map(o=>o.box.minY)),maxX:Math.max(...objs.map(o=>o.box.maxX)),maxY:Math.max(...objs.map(o=>o.box.maxY))};
  const moves=new Map<string,{dx:number;dy:number}>();
  for(const o of objs){const b=o.box;let dx=0,dy=0;
    if(mode==='left')dx=frame.minX-b.minX;else if(mode==='right')dx=frame.maxX-b.maxX;else if(mode==='centerX')dx=(frame.minX+frame.maxX)/2-(b.minX+b.maxX)/2;
    else if(mode==='top')dy=frame.minY-b.minY;else if(mode==='bottom')dy=frame.maxY-b.maxY;else dy=(frame.minY+frame.maxY)/2-(b.minY+b.maxY)/2;
    if(!Number.isFinite(dx+dy))throw Error('Alignment is not finite');
    for(const id of o.ids)moves.set(id,{dx,dy});}
  return shift(doc,moves);
}
/** Spaces three or more objects so the gaps between neighbouring bounds are equal. The outermost objects stay where they are. */
export function distributeSelection(doc:VectorDocument,ids:readonly string[],axis:'horizontal'|'vertical'):VectorDocument{
  if(axis!=='horizontal'&&axis!=='vertical')throw Error('Unknown distribute axis');
  const objs=objectsOf(doc,ids);if(!objs||objs.length<3)throw Error('Select at least three objects to distribute them');
  const lo=(o:typeof objs[number])=>axis==='horizontal'?o.box.minX:o.box.minY,hi=(o:typeof objs[number])=>axis==='horizontal'?o.box.maxX:o.box.maxY;
  const sorted=[...objs].sort((a,b)=>lo(a)-lo(b)||hi(a)-hi(b));
  const span=hi(sorted.reduce((m,o)=>hi(o)>hi(m)?o:m,sorted[0]))-lo(sorted[0]),sizes=sorted.reduce((s,o)=>s+hi(o)-lo(o),0),gap=(span-sizes)/(sorted.length-1);
  const moves=new Map<string,{dx:number;dy:number}>();let at=lo(sorted[0]);
  for(const o of sorted){const d=at-lo(o);if(!Number.isFinite(d))throw Error('Distribution is not finite');for(const id of o.ids)moves.set(id,axis==='horizontal'?{dx:d,dy:0}:{dx:0,dy:d});at+=hi(o)-lo(o)+gap;}
  return shift(doc,moves);
}
