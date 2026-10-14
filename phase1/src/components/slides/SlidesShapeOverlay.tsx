import {useEffect,useRef,useState,type RefObject} from 'react';
import {useSlidesSession} from '../../lib/slides/session';
import {useShapeSelection,type ShapeSelection} from '../../lib/slides/shapeSelection';
import {useSlidesPanelText} from '../../lib/slides/panelI18n';
import {commandDispatcher} from '../../lib/commandDispatcher';
import {hitTest,limitsOf,overlayRect,moveBox,resizeBox,resizeBoxAspect,boxOf,HANDLES,EMU_PER_PT,type Box,type Handle} from '../../lib/slides/shapeGeometry';
import {boundsEditIssue,type ShapeRef} from '../../lib/slides/deckPackage';
import type {PointerEvent as ReactPointerEvent} from 'react';

/** The selection that is still valid for the current deck and slide, else null. */
export function useValidShape():{shape:ShapeRef;selection:ShapeSelection}|null{
  const s=useSlidesSession(),sel=useShapeSelection();
  if(!sel||sel.source!==s.source||s.slideIds[s.index]!==sel.slideId||s.presenting)return null;
  const shape=s.model?.slides.find(x=>x.id===sel.slideId)?.shapes.find(x=>x.id===sel.shapeId&&x.parentId===null);
  return shape?{shape,selection:sel}:null;
}
export function describeShape(shape:ShapeRef,t:(k:string,p?:Record<string,string|number>)=>string):string{
  const b=shape.bounds,limits=limitsOf(shape).filter(l=>l!=='nested'&&l!=='locked').map(l=>t(`slides.limit.${l}`));
  return t('slides.shapeSelected',{name:shape.name||`#${shape.id}`,kind:t(`slides.kind.${shape.kind}`),width:b?Math.round(b.w/EMU_PER_PT):0,height:b?Math.round(b.h/EMU_PER_PT):0,limits:limits.length?` (${limits.join(', ')})`:''});
}
const HANDLE_POS:Record<Handle,string>={nw:'left-0 top-0 cursor-nwse-resize',n:'left-1/2 top-0 cursor-ns-resize',ne:'left-full top-0 cursor-nesw-resize',e:'left-full top-1/2 cursor-ew-resize',se:'left-full top-full cursor-nwse-resize',s:'left-1/2 top-full cursor-ns-resize',sw:'left-0 top-full cursor-nesw-resize',w:'left-0 top-1/2 cursor-ew-resize'};
const DRAG_PX=3;
const place=(el:HTMLElement|null,r:{left:number;top:number;width:number;height:number;rotateDeg?:number}|null)=>{
  if(!el)return;if(!r){el.hidden=true;return;}el.hidden=false;
  el.style.left=`${r.left}%`;el.style.top=`${r.top}%`;el.style.width=`${r.width}%`;el.style.height=`${r.height}%`;el.style.transform=r.rotateDeg?`rotate(${r.rotateDeg}deg)`:'';
};
/**
 * Transparent hit layer exactly covering the rendered slide image. Positions are slide-relative percentages, so the
 * overlay follows window size and zoom. It only selects; moving and resizing arrive in P2b.
 */
export function SlidesShapeOverlay({image}:{image:RefObject<HTMLImageElement|null>}){
  const s=useSlidesSession(),t=useSlidesPanelText(),valid=useValidShape();
  const layer=useRef<HTMLDivElement>(null),selBox=useRef<HTMLDivElement>(null),hoverBox=useRef<HTMLDivElement>(null);
  const [,tick]=useState(0);
  const drag=useRef<{aspect:boolean;mode:'move'|Handle;sx:number;sy:number;from:Box;cur:Box;moved:boolean}|null>(null);
  const editable=!!valid&&boundsEditIssue(valid.shape)===null;
  const slide=s.model?.slides.find(x=>x.id===s.slideIds[s.index]);
  const size=s.model?.slideSize;
  // Keep the layer glued to the <img>, which is letterboxed by object-contain.
  useEffect(()=>{
    const img=image.current,el=layer.current;if(!img||!el)return;
    const fit=()=>{el.style.left=`${img.offsetLeft}px`;el.style.top=`${img.offsetTop}px`;el.style.width=`${img.offsetWidth}px`;el.style.height=`${img.offsetHeight}px`;};
    fit();const ro=new ResizeObserver(fit);ro.observe(img);if(img.parentElement)ro.observe(img.parentElement);img.addEventListener('load',fit);
    return()=>{ro.disconnect();img.removeEventListener('load',fit);};
  },[image,s.image]);
  // The status line below the slide re-centres the image without resizing it, so re-fit after every render.
  useEffect(()=>{const img=image.current,el=layer.current;if(!img||!el)return;el.style.left=`${img.offsetLeft}px`;el.style.top=`${img.offsetTop}px`;});
  useEffect(()=>{place(selBox.current,valid?.shape.bounds&&size?overlayRect(valid.shape.bounds,size):null);},[valid?.shape,size,s.image]);
  if(!slide||!size||!s.image||s.presenting||s.busy)return null;
  const run=(id:string,params?:unknown)=>void commandDispatcher.tryRunCommand(id,params,{origin:'ui'});
  const restore=()=>{drag.current=null;place(selBox.current,valid?.shape.bounds?overlayRect(valid.shape.bounds,size):null);};
  const begin=(e:ReactPointerEvent<HTMLElement>,mode:'move'|Handle)=>{
    if(e.button!==0||!valid?.shape.bounds||!editable)return;e.stopPropagation();e.preventDefault();layer.current?.focus();
    e.currentTarget.setPointerCapture(e.pointerId);const from=boxOf(valid.shape.bounds);drag.current={aspect:valid.shape.kind==='picture',mode,sx:e.clientX,sy:e.clientY,from,cur:from,moved:false};
  };
  const track=(e:ReactPointerEvent<HTMLElement>)=>{
    const d=drag.current;if(!d||!layer.current)return;
    if(!d.moved&&Math.hypot(e.clientX-d.sx,e.clientY-d.sy)<DRAG_PX)return;d.moved=true;
    const r=layer.current.getBoundingClientRect(),dx=(e.clientX-d.sx)/r.width*size.cx,dy=(e.clientY-d.sy)/r.height*size.cy;
    d.cur=d.mode==='move'?moveBox(d.from,dx,dy,size):(d.aspect?resizeBoxAspect:resizeBox)(d.from,d.mode,dx,dy,size);
    place(selBox.current,overlayRect({...d.cur,rot:0,flipH:false,flipV:false,source:'slide'},size));
  };
  const finish=(e:ReactPointerEvent<HTMLElement>)=>{
    const d=drag.current;if(!d||!valid)return;drag.current=null;e.currentTarget.releasePointerCapture?.(e.pointerId);
    const same=d.cur.x===d.from.x&&d.cur.y===d.from.y&&d.cur.w===d.from.w&&d.cur.h===d.from.h;
    if(!d.moved||same){restore();return;}
    void commandDispatcher.tryRunCommand('slides.setShapeBounds',{source:s.source,slideId:valid.selection.slideId,shapeId:valid.shape.id,expected:d.from,next:d.cur},{origin:'ui'}).then(r=>{if(!r.ok)restore();});
  };
  const at=(e:{clientX:number;clientY:number})=>{const r=layer.current!.getBoundingClientRect();return hitTest(slide.shapes,size,(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);};
  return <div ref={layer} tabIndex={0} role="group" aria-label={t('slides.shapeOverlay')} data-slot="slides-shape-overlay" className="absolute cursor-default outline-none focus-visible:ring-2 focus-visible:ring-accent"
    onClick={e=>{const hit=at(e);run('slides.selectShape',{source:s.source,slideId:slide.id,shapeId:hit?.id??null});}}
    onPointerMove={e=>{const hit=at(e);place(hoverBox.current,hit?.bounds&&hit.id!==valid?.shape.id?overlayRect(hit.bounds,size):null);tick(n=>n);}}
    onPointerLeave={()=>place(hoverBox.current,null)}
    onKeyDown={e=>{
      const arrow={ArrowRight:[1,0],ArrowLeft:[-1,0],ArrowDown:[0,1],ArrowUp:[0,-1]}[e.key];
      if(e.key==='Escape'&&drag.current){e.preventDefault();restore();}
      else if(arrow&&editable&&(e.altKey||e.shiftKey)){const step=e.ctrlKey||e.metaKey?10:1;e.preventDefault();run('slides.nudgeShape',{mode:e.altKey?'move':'resize',dxPt:arrow[0]*step,dyPt:arrow[1]*step});}
      else if(e.key==='Escape'&&valid){e.preventDefault();run('slides.selectShape',{source:s.source,slideId:slide.id,shapeId:null});}
      else if(e.key==='ArrowRight'||e.key==='ArrowDown'){e.preventDefault();run('slides.selectNextShape');}
      else if(e.key==='ArrowLeft'||e.key==='ArrowUp'){e.preventDefault();run('slides.selectPreviousShape');}
    }}>
    <div ref={hoverBox} hidden className="pointer-events-none absolute border border-dashed border-accent"/>
    <div ref={selBox} hidden data-slot="slides-shape-selection" title={editable?t('slides.shapeDragHint'):undefined} onClick={e=>e.stopPropagation()} onPointerDown={e=>begin(e,'move')} onPointerMove={track} onPointerUp={finish} onPointerCancel={restore}
      className={`absolute border-2 border-accent bg-accent-soft ${editable?'cursor-move touch-none':'pointer-events-none'}`}>
      {editable&&HANDLES.filter(h=>valid?.shape.kind!=='picture'||h.length===2).map(h=><span key={h} role="presentation" data-handle={h} aria-label={t('slides.resizeHandle')} onPointerDown={e=>begin(e,h)} className={`absolute size-2.5 -translate-x-1/2 -translate-y-1/2 border border-accent bg-panel ${HANDLE_POS[h]}`}/>)}
    </div>
  </div>;
}
