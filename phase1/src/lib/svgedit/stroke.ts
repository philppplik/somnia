/** Stroke to path: replaces a shape's stroke with a filled outline (paperjs-offset on paper.js, both MIT). */
import {elementAt,parsePathKey,attr,applyPatches,attrPatches,insertChild,scanSvg,type XEl} from './source';
import * as C from './controller';
import {patchUi} from './store';
const STROKEABLE=new Set(['path','rect','circle','ellipse','line','polygon','polyline']);
const dOf=(el:XEl)=>el.tag==='path'?(attr(el,'d')??''):(C.shapeD(el)??'');
let libP:Promise<{paper:any;PaperOffset:any}>|null=null;
function lib(){if(!libP)libP=Promise.all([import('paper'),import('paperjs-offset')]).then(([p,o])=>{const paper:any=(p as any).default??p;paper.setup(document.createElement('canvas'));return{paper,PaperOffset:(o as any).PaperOffset};});return libP;}
const num=(v:string|undefined,d:number)=>{const n=parseFloat(v??'');return Number.isFinite(n)?n:d;};
export const hasStroke=(el:XEl)=>{const s=C.readPaint(el,'stroke');return !!s&&s!=='none'&&STROKEABLE.has(el.tag);};
export interface StrokeStyle{width:number;join:'miter'|'round'|'bevel';cap:'butt'|'round'|'square';limit:number;paint:string;opacity:string|undefined;dashed:boolean}
export function strokeStyle(el:XEl):StrokeStyle{
 const j=C.readPaint(el,'stroke-linejoin'),c=C.readPaint(el,'stroke-linecap'),da=C.readPaint(el,'stroke-dasharray');
 return{width:num(C.readPaint(el,'stroke-width'),1),join:j==='round'||j==='bevel'?j:'miter',cap:c==='round'||c==='square'?c:'butt',limit:num(C.readPaint(el,'stroke-miterlimit'),4),
  paint:C.readPaint(el,'stroke')!,opacity:C.readPaint(el,'stroke-opacity'),dashed:!!da&&da!=='none'};}
const STROKE_PROPS=['stroke','stroke-width','stroke-linejoin','stroke-linecap','stroke-miterlimit','stroke-dasharray','stroke-dashoffset','stroke-opacity'];
/** Outline path data (in the element's own coordinates) for the stroke of `d`. */
export async function outlineD(d:string,st:StrokeStyle):Promise<string>{
 const {paper,PaperOffset}=await lib();const p=new paper.CompoundPath({pathData:d,insert:false});
 const parts:string[]=[];
 const subs:any[]=p.children?.length?[...p.children]:[p];
 for(const sp of subs){
  const path=new paper.Path({pathData:sp.pathData,insert:false});
  // paperjs-offset has no square cap, so grow open paths by half a width at both ends first
  if(st.cap==='square'&&!path.closed&&path.length>0){const a=path.getTangentAt(0).normalize(),b=path.getTangentAt(path.length).normalize();const h=st.width/2;
   path.insert(0,path.firstSegment.point.subtract(a.multiply(h)));path.add(path.lastSegment.point.add(b.multiply(h)));}
  const out=PaperOffset.offsetStroke(path,st.width/2,{join:st.join,cap:st.cap==='round'?'round':'butt',limit:st.limit,insert:false});
  const pd:string=out.pathData;if(pd)parts.push(pd);}
 return parts.join(' ');}
/** One commit. Shapes with a fill keep the fill (stroke removed) and get the outline as a new sibling right after; stroke-only shapes are replaced. */
export async function strokeToPath(keys:string[]):Promise<boolean>{
 const ks=C.docOrder(C.topKeys(keys)).filter(k=>k!=='');const {root,text:text0}=C.scan();if(!root)return false;
 const els=ks.map(k=>elementAt(root,parsePathKey(k))).filter((e):e is XEl=>!!e);
 const todo=els.filter(hasStroke);
 if(!todo.length){patchUi({notice:'Select a path or shape that has a stroke.'});return false;}
 if(todo.some(e=>strokeStyle(e).dashed)){patchUi({notice:'Dashed strokes cannot be converted yet. Remove the dash pattern first.'});return false;}
 if(todo.some(e=>strokeStyle(e).width<=0)){patchUi({notice:'The stroke width is zero.'});return false;}
 const outlines:string[]=[];
 try{for(const el of todo)outlines.push(await outlineD(dOf(el),strokeStyle(el)));}catch(e){patchUi({notice:`Stroke to path failed: ${String(e)}`});return false;}
 if(outlines.some(o=>!o)){patchUi({notice:'The outline is empty.'});return false;}
 // last element first: inserting after it cannot move the paths of the ones still to do
 let text=text0;
 for(let i=todo.length-1;i>=0;i--){
  const r0=scanSvg(text);if(!r0.ok)return false;const el=elementAt(r0.root,todo[i].path)!;const st=strokeStyle(el);
  const fill=C.readPaint(el,'fill');const filled=el.tag!=='line'&&fill!=='none';
  const keep=el.attrs.filter(a=>['transform','class','opacity','clip-path','mask','filter','display'].includes(a.name)).map(a=>text.slice(a.from,a.to));
  const paint=`fill="${st.paint.replace(/"/g,'&quot;')}"`+(st.opacity&&st.opacity!=='1'?` fill-opacity="${st.opacity}"`:'')+' fill-rule="evenodd"';
  const outline=`<path d="${outlines[i]}" ${paint}${keep.length?' '+keep.join(' '):''}/>`;
  if(filled){
   const ch:Record<string,string|null>={};for(const p of STROKE_PROPS)ch[p]=null;
   const clean=applyPatches(text,attrPatches(el,ch,text));
   const r=scanSvg(clean);if(!r.ok)return false;const el2=elementAt(r.root,todo[i].path)!;const parent=el2.parent!;
   text=insertChild(clean,parent,parent.children[parent.children.indexOf(el2)+1]??null,outline);
  }else{const id=attr(el,'id');text=applyPatches(text,[{from:el.from,to:el.to,insert:id?outline.replace('<path ',`<path id="${id}" `):outline}]);}
 }
 return C.commit(text,ks);}
