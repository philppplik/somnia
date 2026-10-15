import type {VectorDocument,VectorPath} from '../vectorio';
import {DEFAULT_STYLE,textBoxRotated} from '../vectorio';
import {pathBox,translatePath,type Box} from './geometry';
import {selectedPaths} from './selectionClosure';

export type ExportArea='page'|'selection'|'content';
export const EXPORT_AREAS:readonly ExportArea[]=['page','selection','content'];
export const PADDING_LIMITS=Object.freeze({min:0,max:1000});
export const MAX_EXPORT_SIDE=16384;
/** Visual bounds of a path: geometric bounds grown by half the stroke width. Miter spikes are covered by the miter limit (capped at 4 here), so the box can be a little generous but never clips. */
export function visualBox(p:VectorPath):Box|null{
 const b=pathBox(p);if(!b)return null;
 const st={...DEFAULT_STYLE,...p.style},stroked=st.stroke!=='none'&&st.strokeWidth>0&&st.strokeOpacity>0;
 const pad=stroked?st.strokeWidth/2*(st.lineJoin==='miter'?Math.min(Math.max(st.miterLimit,1),4):1)*(st.lineCap==='square'?1.5:1):0;
 return {minX:b.minX-pad,minY:b.minY-pad,maxX:b.maxX+pad,maxY:b.maxY+pad};
}
const r3=(v:number)=>Math.round(v*1000)/1000;
/** The document to export for an area. `page` is the document unchanged. `selection` and `content` crop the page to the visual bounds of the selected / all visible
 *  objects (plus `padding`), move them to the origin and drop the guides, which would no longer line up. Throws when there is nothing to export. */
export function exportAreaDoc(doc:VectorDocument,selection:readonly string[],area:ExportArea,padding=0):VectorDocument{
 if(!EXPORT_AREAS.includes(area))throw new RangeError('area must be page, selection or content');
 if(!Number.isFinite(padding)||padding<PADDING_LIMITS.min||padding>PADDING_LIMITS.max)throw new RangeError(`padding must be ${PADDING_LIMITS.min}-${PADDING_LIMITS.max}`);
 if(area==='page')return doc;
 const chosen:VectorPath[]=area==='selection'?selectedPaths(doc,selection):doc.paths.filter(p=>!p.hidden);
 const texts=area==='content'?doc.texts??[]:[];
 if(!chosen.length&&!texts.length)throw Error(area==='selection'?'Select at least one object to export':'Nothing visible to export');
 let box:Box|null=null;
 // inside a clipping group only the part within the mask counts; the mask shape itself is not painted
 const masks=new Map<string,Box>();
 for(const p of chosen)if(p.clip&&p.group!==undefined){const b=pathBox(p);if(b){const m=masks.get(p.group);masks.set(p.group,m?{minX:Math.min(m.minX,b.minX),minY:Math.min(m.minY,b.minY),maxX:Math.max(m.maxX,b.maxX),maxY:Math.max(m.maxY,b.maxY)}:b);}}
 const withContent=new Set(chosen.filter(p=>!p.clip&&p.group!==undefined).map(p=>p.group));
 for(const p of chosen){
  const mk=p.group!==undefined&&withContent.has(p.group)?masks.get(p.group):undefined;
  if(p.clip&&mk)continue;
  let b=visualBox(p);if(!b)continue;
  if(mk){b={minX:Math.max(b.minX,mk.minX),minY:Math.max(b.minY,mk.minY),maxX:Math.min(b.maxX,mk.maxX),maxY:Math.min(b.maxY,mk.maxY)};if(b.maxX<b.minX||b.maxY<b.minY)continue;}
  box=box?{minX:Math.min(box.minX,b.minX),minY:Math.min(box.minY,b.minY),maxX:Math.max(box.maxX,b.maxX),maxY:Math.max(box.maxY,b.maxY)}:b;}
 for(const t of texts){const b=textBoxRotated(t);box=box?{minX:Math.min(box.minX,b.minX),minY:Math.min(box.minY,b.minY),maxX:Math.max(box.maxX,b.maxX),maxY:Math.max(box.maxY,b.maxY)}:b;}
 if(!box)throw Error('Nothing to export');
 const x0=box.minX-padding,y0=box.minY-padding,w=r3(box.maxX-box.minX+2*padding),h=r3(box.maxY-box.minY+2*padding);
 if(w<=0||h<=0)throw Error('The export area is empty');
 if(w>MAX_EXPORT_SIDE||h>MAX_EXPORT_SIDE)throw Error(`Export area is larger than ${MAX_EXPORT_SIDE} units`);
 const {guides:_g,texts:_t,...rest}=doc;
 return {...rest,width:w,height:h,paths:chosen.map(p=>translatePath(p,-x0,-y0)),...(texts.length?{texts:texts.map(t=>({...t,x:r3(t.x-x0),y:r3(t.y-y0)}))}:{})};
}
