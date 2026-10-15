import {getDocumentsState,patchDocuments} from './store';
export const MIN_ZOOM=0.5,MAX_ZOOM=2;
/** Space the scroll area keeps around the pages (its padding, both sides). */
export const SCROLL_PAD=48;
export type FitMode='width'|'page';
/** The zoom (0.5 to 2, in 1% steps) that makes the page fill the box's width, or fit whole inside it. Null for a box or page without size. */
export function fitZoom(mode:FitMode,box:{width:number;height:number},page:{width:number;height:number},pad=SCROLL_PAD):number|null{
 const ok=(n:number)=>Number.isFinite(n)&&n>0;
 if(!ok(box.width)||!ok(box.height)||!ok(page.width)||!ok(page.height))return null;
 const w=(box.width-pad)/page.width,h=(box.height-pad)/page.height;
 const z=mode==='width'?w:Math.min(w,h);
 if(!Number.isFinite(z))return null;
 return Math.min(MAX_ZOOM,Math.max(MIN_ZOOM,Math.floor(z*100)/100));
}
/** Zooms so the widest page fits the width, or the page at the caret (else the first) fits the window. False without an open document. */
export function zoomToFit(mode:FitMode):boolean{
 const s=getDocumentsState();if(s.status!=='ready'||s.pageSizes.length===0||typeof document==='undefined')return false;
 const el=document.querySelector<HTMLElement>('[data-testid="documents-scroll"]');if(!el)return false;
 const idx=mode==='page'?Math.min(Math.max(s.caretBox?.page??0,0),s.pageSizes.length-1):0;
 const page=mode==='width'?{width:Math.max(...s.pageSizes.map(p=>p.width)),height:s.pageSizes[0].height}:s.pageSizes[idx];
 const z=fitZoom(mode,{width:el.clientWidth,height:el.clientHeight},page);
 if(z===null)return false;patchDocuments({zoom:z});return true;
}
