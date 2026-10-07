import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {
 createPageCache,goToPage,initialViewState,loadPdf,nextPage,panBy,parsePageInput,prevPage,relayout,rotate,rotatedSize,
 stepZoom,wheelFactor,zoomAt,PdfLoadError,
 type FitMode,type PageCache,type PdfBackend,type PdfDocumentHandle,type PdfPageHandle,type PdfViewState,type Size,
} from '../../lib/pdfview/index.ts';
import {pdfjsBackend} from '../../lib/pdfview/pdfjsBrowser.ts';
export interface PdfViewerProps{
 /** Raw PDF bytes. A new array instance reloads the document. */
 data:Uint8Array;name:string;
 backend?:PdfBackend;
 /** Selectable text over the page. Off by default (extra cost per page). */
 textLayer?:boolean;
 onError?:(e:PdfLoadError)=>void;
 onPageChange?:(page:number)=>void;
}
const btn='whitespace-nowrap grid h-7 min-w-7 cursor-pointer place-items-center rounded-sm border-0 bg-transparent px-2 text-[12px] text-ink-2 hover:bg-hover disabled:cursor-default disabled:opacity-40';
const MAX_CANVAS_PX=16_777_216;
/** Single-page PDF viewer: canvas render, zoom (wheel+Ctrl, buttons, keys), drag-pan, page navigation. */
export function PdfViewer({data,name,backend=pdfjsBackend,textLayer=false,onError,onPageChange}:PdfViewerProps){
 const stageRef=useRef<HTMLDivElement>(null);
 const canvasRef=useRef<HTMLCanvasElement>(null);
 const textRef=useRef<HTMLDivElement>(null);
 const [doc,setDoc]=useState<PdfDocumentHandle|null>(null);
 const [error,setError]=useState<PdfLoadError|null>(null);
 const [needPassword,setNeedPassword]=useState(false);
 const [password,setPassword]=useState<string|undefined>();
 const [page,setPage]=useState<PdfPageHandle|null>(null);
 const [view,setView]=useState<PdfViewState>(initialViewState());
 const [viewport,setViewport]=useState<Size>({width:0,height:0});
 const [pageInput,setPageInput]=useState('1');
 const cache=useRef<PageCache|null>(null);
 const drag=useRef<{x:number;y:number;id:number}|null>(null);
 const pageSize=page?.size??{width:612,height:792};
 // load document
 useEffect(()=>{
  const ac=new AbortController();let opened:PdfDocumentHandle|null=null;
  setError(null);setDoc(null);setPage(null);
  loadPdf(backend,data,{password,signal:ac.signal}).then(d=>{
   if(ac.signal.aborted){void d.destroy();return;}
   opened=d;cache.current=createPageCache(d);setNeedPassword(false);setDoc(d);setView(initialViewState(d.pageCount));
  }).catch((e:PdfLoadError)=>{
   if(e.code==='aborted')return;
   if(e.code==='password'){setNeedPassword(true);return;}
   setError(e);onError?.(e);});
  return()=>{ac.abort();cache.current?.clear();cache.current=null;if(opened)void opened.destroy();};
 },[data,backend,password]);// eslint-disable-line react-hooks/exhaustive-deps
 // current page handle
 useEffect(()=>{
  if(!doc||view.page<1||!cache.current)return;let live=true;
  cache.current.get(view.page).then(p=>{if(live)setPage(p);}).catch(e=>{if(live)setError(new PdfLoadError('invalid',String(e?.message??e)));});
  return()=>{live=false;};
 },[doc,view.page]);
 useEffect(()=>{setPageInput(String(view.page));if(view.page>0)onPageChange?.(view.page);},[view.page]);// eslint-disable-line react-hooks/exhaustive-deps
 // viewport size
 useEffect(()=>{
  const el=stageRef.current;if(!el)return;
  const ro=new ResizeObserver(()=>setViewport({width:el.clientWidth,height:el.clientHeight}));
  ro.observe(el);setViewport({width:el.clientWidth,height:el.clientHeight});return()=>ro.disconnect();
 },[doc]);
 // keep layout consistent when page, rotation or viewport change
 useEffect(()=>{if(page&&viewport.width>0)setView(v=>relayout(v,page.size,viewport));},[page,viewport,view.rotation,view.fit,view.page]);
 // draw
 useEffect(()=>{
  const canvas=canvasRef.current;if(!page||!canvas||viewport.width===0)return;
  const dpr=Math.min(window.devicePixelRatio||1,3);
  const sz=rotatedSize(page.size,view.rotation);
  let scale=view.zoom*dpr;
  const px=sz.width*scale*sz.height*scale;
  if(px>MAX_CANVAS_PX)scale*=Math.sqrt(MAX_CANVAS_PX/px);
  canvas.width=Math.max(1,Math.floor(sz.width*scale));canvas.height=Math.max(1,Math.floor(sz.height*scale));
  canvas.style.width=`${sz.width*view.zoom}px`;canvas.style.height=`${sz.height*view.zoom}px`;
  const task=page.render(canvas,scale,view.rotation);
  let cancelText:(()=>void)|undefined;let dead=false;
  task.promise.catch(()=>{/* cancelled renders reject */});
  const tl=textRef.current;
  if(textLayer&&tl&&page.renderTextLayer){
   tl.replaceChildren();tl.style.setProperty('--total-scale-factor',String(view.zoom));
   void page.renderTextLayer(tl,view.zoom,view.rotation).then(c=>{if(dead)c();else cancelText=c;}).catch(()=>{});
  }
  return()=>{dead=true;task.cancel();cancelText?.();};
 },[page,view.zoom,view.rotation,viewport.width,viewport.height,textLayer]);
 const apply=useCallback((f:(v:PdfViewState)=>PdfViewState)=>setView(f),[]);
 const center=useMemo(()=>({x:viewport.width/2,y:viewport.height/2}),[viewport]);
 const zoomTo=(z:number,at=center)=>apply(v=>zoomAt(v,z,at,pageSize,viewport));
 // wheel must be non-passive to preventDefault
 useEffect(()=>{
  const el=stageRef.current;if(!el)return;
  const h=(e:WheelEvent)=>{
   e.preventDefault();
   const r=el.getBoundingClientRect();
   if(e.ctrlKey||e.metaKey)apply(v=>zoomAt(v,v.zoom*wheelFactor(e.deltaY),{x:e.clientX-r.left,y:e.clientY-r.top},pageSize,viewport));
   else apply(v=>panBy(v,-e.deltaX,-e.deltaY,pageSize,viewport));
  };
  el.addEventListener('wheel',h,{passive:false});return()=>el.removeEventListener('wheel',h);
 },[apply,pageSize,viewport,doc]);
 const onKey=(e:React.KeyboardEvent)=>{
  if((e.target as HTMLElement).tagName==='INPUT')return;
  const k=e.key;let used=true;
  if(k==='+'||k==='=')zoomTo(stepZoom(view.zoom,1));
  else if(k==='-')zoomTo(stepZoom(view.zoom,-1));
  else if(k==='0')zoomTo(1);
  else if(k==='PageDown'||(k==='ArrowRight'&&e.altKey))apply(nextPage);
  else if(k==='PageUp'||(k==='ArrowLeft'&&e.altKey))apply(prevPage);
  else if(k==='Home')apply(v=>goToPage(v,1));
  else if(k==='End')apply(v=>goToPage(v,v.pageCount));
  else if(k==='ArrowLeft')apply(v=>panBy(v,40,0,pageSize,viewport));
  else if(k==='ArrowRight')apply(v=>panBy(v,-40,0,pageSize,viewport));
  else if(k==='ArrowUp')apply(v=>panBy(v,0,40,pageSize,viewport));
  else if(k==='ArrowDown')apply(v=>panBy(v,0,-40,pageSize,viewport));
  else used=false;
  if(used)e.preventDefault();
 };
 const fit=(m:FitMode)=>apply(v=>({...v,fit:m}));
 if(needPassword)return <form className="grid flex-1 place-content-center gap-2 p-6 text-[13px]" onSubmit={e=>{e.preventDefault();setPassword(new FormData(e.currentTarget).get('pw') as string);}}>
  <label>{name} is password protected.<input name="pw" type="password" autoFocus className="mt-1 block w-64 rounded-sm border border-subtle px-2 py-1" aria-label="PDF password"/></label><button className={btn} type="submit">Open</button></form>;
 if(error)return <div role="alert" className="grid flex-1 place-items-center p-6 text-[13px] text-ink-2" data-testid="pdf-error">{error.message}</div>;
 if(!doc)return <div role="status" className="grid flex-1 place-items-center text-[12px] text-ink-3">Loading {name}…</div>;
 return <section className="canvas-stage flex min-h-0 min-w-0 flex-1 flex-col outline-none" style={{width:"100%"}} aria-label={`PDF viewer: ${name}`} tabIndex={0} onKeyDown={onKey}>
  <div className="media-bar flex flex-wrap items-center gap-1 border-b border-subtle px-3 py-1.5 text-[12px]">
   <span className="truncate" data-testid="media-name">{name}</span><span className="flex-1"/>
   <button className={btn} aria-label="Previous page" disabled={view.page<=1} onClick={()=>apply(prevPage)}>‹</button>
   <input aria-label="Page number" inputMode="numeric" className="h-7 rounded-sm border border-subtle text-center" style={{width:44,flex:"none"}} value={pageInput} onChange={e=>setPageInput(e.target.value)}
    onKeyDown={e=>{if(e.key==='Enter'){const n=parsePageInput(pageInput,view.pageCount);if(n)apply(v=>goToPage(v,n));else setPageInput(String(view.page));}}} onBlur={()=>setPageInput(String(view.page))}/>
   <span className="whitespace-nowrap text-ink-3" data-testid="pdf-page-count">/ {view.pageCount}</span>
   <button className={btn} aria-label="Next page" disabled={view.page>=view.pageCount} onClick={()=>apply(nextPage)}>›</button>
   <span className="mx-1 h-4 w-px bg-[var(--border-subtle,#0001)]"/>
   <button className={btn} aria-label="Zoom out" onClick={()=>zoomTo(stepZoom(view.zoom,-1))}>−</button>
   <span className="w-12 text-center tabular-nums" data-testid="pdf-zoom">{Math.round(view.zoom*100)}%</span>
   <button className={btn} aria-label="Zoom in" onClick={()=>zoomTo(stepZoom(view.zoom,1))}>+</button>
   <button className={btn} aria-pressed={view.fit==='width'} onClick={()=>fit('width')}>Fit width</button>
   <button className={btn} aria-pressed={view.fit==='page'} onClick={()=>fit('page')}>Fit page</button>
   <button className={btn} aria-label="Rotate clockwise" onClick={()=>apply(v=>rotate(v,1))}>⟳</button>
  </div>
  <div ref={stageRef} className="relative min-h-0 flex-1 touch-none select-none overflow-hidden bg-[var(--surface-2,#eef0f3)]" data-testid="pdf-stage"
   style={{width:"100%",cursor:drag.current?'grabbing':'grab'}}
   onPointerDown={e=>{if(e.button!==0&&e.button!==1)return;e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX,y:e.clientY,id:e.pointerId};}}
   onPointerMove={e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;d.x=e.clientX;d.y=e.clientY;apply(v=>panBy(v,dx,dy,pageSize,viewport));}}
   onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}
   onDoubleClick={e=>{const r=e.currentTarget.getBoundingClientRect();zoomTo(view.zoom<1.5?2:1,{x:e.clientX-r.left,y:e.clientY-r.top});}}>
   <div className="absolute left-0 top-0 bg-white shadow-md" style={{transform:`translate(${view.pan.x}px,${view.pan.y}px)`,width:rotatedSize(pageSize,view.rotation).width*view.zoom,height:rotatedSize(pageSize,view.rotation).height*view.zoom}}>
    <canvas ref={canvasRef} aria-label={`Page ${view.page} of ${view.pageCount}`} role="img"/>
    {textLayer&&<div ref={textRef} className="textLayer absolute inset-0 overflow-hidden leading-none" style={{color:'transparent'}}/>}
   </div>
  </div>
 </section>;
}
