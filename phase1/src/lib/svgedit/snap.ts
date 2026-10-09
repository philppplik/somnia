/** Snapping for the inline SVG editor: pure maths on boxes and lines, no DOM. */
export interface SBox{x:number;y:number;w:number;h:number}
export interface Guide{axis:'x'|'y';pos:number}
export type LineKind='object'|'doc'|'guide'|'grid';
/** A snap line. axis 'x' is a vertical line at x=pos; from/to is its extent along the other axis. */
export interface SnapLine{axis:'x'|'y';pos:number;from:number;to:number;kind:LineKind}
export interface SnapResult{dx:number;dy:number;lines:SnapLine[]}
const EPS=1e-6;
const xs=(b:SBox)=>[b.x,b.x+b.w/2,b.x+b.w];
const ys=(b:SBox)=>[b.y,b.y+b.h/2,b.y+b.h];
/** Candidate lines from object boxes, the document box and user guides. */
export function buildLines(objects:SBox[],doc:SBox|null,guides:Guide[]):SnapLine[]{
 const out:SnapLine[]=[];
 const add=(b:SBox,kind:LineKind)=>{for(const x of xs(b))out.push({axis:'x',pos:x,from:b.y,to:b.y+b.h,kind});for(const y of ys(b))out.push({axis:'y',pos:y,from:b.x,to:b.x+b.w,kind});};
 for(const o of objects)add(o,'object');if(doc)add(doc,'doc');
 for(const g of guides)out.push({axis:g.axis,pos:g.pos,from:-Infinity,to:Infinity,kind:'guide'});
 return out;}
function bestAxis(cands:number[],lines:SnapLine[],axis:'x'|'y',threshold:number,grid:number):{d:number;pos:number;kind:LineKind}|null{
 let best:{d:number;pos:number;kind:LineKind}|null=null;
 for(const l of lines){if(l.axis!==axis)continue;for(const c of cands){const d=l.pos-c;if(Math.abs(d)<=threshold&&(!best||Math.abs(d)<Math.abs(best.d)-EPS))best={d,pos:l.pos,kind:l.kind};}}
 if(!best&&grid>0){for(const c of [cands[0],cands[cands.length-1]]){const g=Math.round(c/grid)*grid;const d=g-c;if(Math.abs(d)<=threshold&&(!best||Math.abs(d)<Math.abs(best.d)-EPS))best={d,pos:g,kind:'grid'};}}
 return best;}
/** Move `box` by the smallest nudge that puts an edge or centre on a line (or on the grid). Only the axes in `axes` snap. */
export function snapBox(box:SBox,lines:SnapLine[],threshold:number,grid=0,axes:{x:boolean;y:boolean}={x:true,y:true}):SnapResult{
 let dx=0,dy=0;const hit:SnapLine[]=[];
 const bx=axes.x?bestAxis(xs(box),lines,'x',threshold,grid):null;if(bx)dx=bx.d;
 const by=axes.y?bestAxis(ys(box),lines,'y',threshold,grid):null;if(by)dy=by.d;
 const m:SBox={x:box.x+dx,y:box.y+dy,w:box.w,h:box.h};
 // every line the snapped box now sits on gets drawn, not only the closest one
 const seen=new Set<string>();
 const add=(axis:'x'|'y',cands:number[])=>{for(const l of lines){if(l.axis!==axis||!cands.some(c=>Math.abs(c-l.pos)<1e-4))continue;const k=axis+l.pos.toFixed(3)+l.kind;if(seen.has(k))continue;seen.add(k);hit.push(...show(axis,l.pos,l.kind,m,lines));}};
 if(bx)add('x',xs(m));if(by)add('y',ys(m));
 if(grid>0&&bx?.kind==='grid')hit.push(...show('x',bx.pos,'grid',m,lines));if(grid>0&&by?.kind==='grid')hit.push(...show('y',by.pos,'grid',m,lines));
 return{dx,dy,lines:hit};}
/** The lines to draw for a snap: every line at that position, stretched to also cover the moved box. */
function show(axis:'x'|'y',pos:number,kind:LineKind,m:SBox,lines:SnapLine[]):SnapLine[]{
 const lo=axis==='x'?m.y:m.x,hi=axis==='x'?m.y+m.h:m.x+m.w;
 const same=lines.filter(l=>l.axis===axis&&Math.abs(l.pos-pos)<1e-4);
 let from=lo,to=hi;for(const l of same){if(Number.isFinite(l.from))from=Math.min(from,l.from);if(Number.isFinite(l.to))to=Math.max(to,l.to);}
 return[{axis,pos,from,to,kind}];}
/** Snap a single point (a resize handle being dragged). */
export function snapPoint(p:{x:number;y:number},lines:SnapLine[],threshold:number,grid=0,axes:{x:boolean;y:boolean}={x:true,y:true}):SnapResult&{x:number;y:number}{
 const r=snapBox({x:p.x,y:p.y,w:0,h:0},lines,threshold,grid,axes);return{...r,x:p.x+r.dx,y:p.y+r.dy};}
