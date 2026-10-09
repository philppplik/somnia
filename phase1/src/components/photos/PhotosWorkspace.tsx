import {useCallback,useEffect,useRef,useState} from 'react';
import {Check,Download,Eye,Frame,RotateCcw,Undo2,Redo2,X,ZoomIn,ZoomOut,Maximize2,Minimize2} from '../../lib/icons';
import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import {applyPhotoCrop,cancelPhotoCrop,dirtyPhoto,exportPhotoCopy,historyPhoto,openPhoto,resetPhoto,rotatePhoto,setPhotoCropping,setPhotoCropDraft,usePhotoSession,type PhotoFrame} from '../../lib/photos/studioSession';
import type {PhotoCrop} from '../../lib/photos/studioSettings';
import {getState,patchState,requestStudio,useAppStore} from '../../store/appStore';
import type {MediaItem} from '../../lib/media';
const bar='media-bar flex items-center gap-2 border-b border-subtle px-3 py-1.5 text-[12px]';
const MIN_CROP=0.05;
const MAX_ZOOM=16;
function draw(canvas:HTMLCanvasElement|null,frame:PhotoFrame|null){
 if(!canvas)return;
 if(!frame){canvas.width=1;canvas.height=1;return;}
 canvas.width=frame.width;canvas.height=frame.height;
 canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(frame.bytes),frame.width,frame.height),0,0);
}
const clampCrop=(r:PhotoCrop):PhotoCrop=>{
 const w=Math.max(MIN_CROP,r.x1-r.x0),h=Math.max(MIN_CROP,r.y1-r.y0);
 const x0=Math.min(Math.max(0,r.x0),1-w),y0=Math.min(Math.max(0,r.y0),1-h);
 return{x0,y0,x1:Math.min(1,x0+w),y1:Math.min(1,y0+h)};
};
type DragMode={kind:'move';dx:number;dy:number}|{kind:'nw'|'ne'|'sw'|'se'};
/** The developed photo with zoom/pan, crop overlay, compare, undo and bounded copy export. */
export function PhotosWorkspace({item}:{item:MediaItem}){
 const {t}=useT();const studio=useAppStore().activeStudio;const session=usePhotoSession(item.name);
 const stage=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null),imgBox=useRef<HTMLDivElement>(null);
 const [stageSize,setStageSize]=useState<[number,number]>([0,0]);
 const [zoom,setZoom]=useState<number|null>(null); // null = fit
 const [pan,setPan]=useState<[number,number]>([0,0]);
 const [compare,setCompare]=useState(false);
 const [note,setNote]=useState('');
 const drag=useRef<{pan?:{x:number;y:number;px:number;py:number};crop?:DragMode}|null>(null);
 useEffect(()=>{void openPhoto(item);},[item]);
 // Opening a photo takes you to the Photos Studio unless you picked a studio yourself.
 useEffect(()=>{if(studio!=='photos')requestStudio('photos','automatic');},[studio]);
 // The Photos rail offers Files only, so do not leave the HTML Layers tree open beside a photo.
 useEffect(()=>{if(studio==='photos'&&!['files','search'].includes(getState().leftTab))patchState({leftTab:'files'});},[studio]);
 useEffect(()=>{const el=stage.current;if(!el)return;const ro=new ResizeObserver(()=>setStageSize([el.clientWidth,el.clientHeight]));ro.observe(el);setStageSize([el.clientWidth,el.clientHeight]);return()=>ro.disconnect();},[]);
 const shown=compare&&session?.original?session.original:session?.frame??null;
 useEffect(()=>{draw(canvas.current,shown);},[shown]);
 const fw=shown?.width??1,fh=shown?.height??1;
 const fit=stageSize[0]>0&&stageSize[1]>0?Math.min(stageSize[0]/fw,stageSize[1]/fh):1;
 const scale=zoom??fit;
 const dispW=fw*scale,dispH=fh*scale;
 const clampPan=useCallback((x:number,y:number,s:number):[number,number]=>{
  const mx=Math.max(0,(fw*s-stageSize[0])/2)+80,my=Math.max(0,(fh*s-stageSize[1])/2)+80;
  return[Math.min(mx,Math.max(-mx,x)),Math.min(my,Math.max(-my,y))];
 },[fw,fh,stageSize]);
 const zoomTo=useCallback((next:number,px=0,py=0)=>{
  setZoom(prev=>{
   const cur=prev??fit;const s=Math.min(MAX_ZOOM,Math.max(0.02,next));
   const k=s/cur;setPan(([x,y])=>clampPan(px-(px-x)*k,py-(py-y)*k,s));
   return s;
  });
 },[fit,clampPan]);
 const onWheel=useCallback((e:React.WheelEvent)=>{
  e.preventDefault();const rect=stage.current!.getBoundingClientRect();
  zoomTo((zoom??fit)*(e.deltaY<0?1.2:1/1.2),e.clientX-rect.left-rect.width/2,e.clientY-rect.top-rect.height/2);
 },[zoom,fit,zoomTo]);
 const pointerPos=(e:React.PointerEvent)=>{const r=imgBox.current!.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};};
 const onStageDown=(e:React.PointerEvent)=>{
  if(session?.cropping)return; // in crop mode only the overlay handles drag
  (e.target as HTMLElement).setPointerCapture(e.pointerId);
  drag.current={pan:{x:pan[0],y:pan[1],px:e.clientX,py:e.clientY}};
 };
 const onStageMove=(e:React.PointerEvent)=>{
  const d=drag.current;if(!d?.pan)return;
  setPan(clampPan(d.pan.x+(e.clientX-d.pan.px),d.pan.y+(e.clientY-d.pan.py),scale));
 };
 const onStageUp=()=>{if(drag.current?.pan)drag.current=null;};
 const startCropDrag=(mode:DragMode)=>(e:React.PointerEvent)=>{
  e.stopPropagation();(e.target as HTMLElement).setPointerCapture(e.pointerId);
  if(mode.kind==='move'){const p=pointerPos(e);const d=session!.cropDraft!;drag.current={crop:{kind:'move',dx:p.x-d.x0,dy:p.y-d.y0}};}
  else drag.current={crop:mode};
 };
 const onCropMove=(e:React.PointerEvent)=>{
  const d=drag.current?.crop,s=session;if(!d||!s?.cropDraft)return;
  const p=pointerPos(e),r=s.cropDraft;
  let next:PhotoCrop;
  if(d.kind==='move')next=clampCrop({x0:p.x-d.dx,y0:p.y-d.dy,x1:p.x-d.dx+(r.x1-r.x0),y1:p.y-d.dy+(r.y1-r.y0)});
  else{
   const x0=d.kind==='nw'||d.kind==='sw'?Math.min(p.x,r.x1-MIN_CROP):r.x0;
   const x1=d.kind==='ne'||d.kind==='se'?Math.max(p.x,r.x0+MIN_CROP):r.x1;
   const y0=d.kind==='nw'||d.kind==='ne'?Math.min(p.y,r.y1-MIN_CROP):r.y0;
   const y1=d.kind==='sw'||d.kind==='se'?Math.max(p.y,r.y0+MIN_CROP):r.y1;
   next=clampCrop({x0:Math.max(0,x0),y0:Math.max(0,y0),x1:Math.min(1,x1),y1:Math.min(1,y1)});
  }
  setPhotoCropDraft(item.name,next);
 };
 const onCropUp=()=>{if(drag.current?.crop)drag.current=null;};
 const doExport=async(format:'png'|'jpeg')=>{setNote('');try{const r=await exportPhotoCopy(item.name,format);if(r==='saved')setNote(t('photos.saved'));}catch(e){setNote(t('photos.saveFailed',{message:e instanceof Error?e.message:String(e)}));}};
 const status=!session||session.status==='loading'?t('photos.loading'):session.status==='processing'?t('photos.processing'):session.status==='error'?t('photos.error',{message:session.error}):'';
 const ready=session?.status==='ready'||session?.status==='processing';
 const dirty=session?dirtyPhoto(session):false;
 const crop=session?.cropDraft;
 return <section className="canvas-stage flex min-h-0 w-full flex-1 flex-col" aria-label={t('photos.title')} data-testid="photos-workspace">
  <div className={bar}>
   <span className="truncate font-medium text-ink" data-testid="photos-name">{item.name}</span>
   <span className="text-ink-3" data-testid="photos-info">{session?.sourceWidth?t('photos.info',{width:session.sourceWidth,height:session.sourceHeight}):''}</span>
   <span className="flex-1"/>
   <Button size="icon" variant="outline" aria-label={t('photos.compare')} title={t('photos.compare')} disabled={!session?.original} onPointerDown={()=>setCompare(true)} onPointerUp={()=>setCompare(false)} onPointerLeave={()=>setCompare(false)} data-testid="photos-compare"><Eye size={14}/></Button>
   <Button size="icon" variant="outline" aria-label={t('photos.undo')} disabled={!session?.past.length} onClick={()=>historyPhoto(item.name,false)} data-testid="photos-undo"><Undo2 size={14}/></Button>
   <Button size="icon" variant="outline" aria-label={t('photos.redo')} disabled={!session?.future.length} onClick={()=>historyPhoto(item.name,true)} data-testid="photos-redo"><Redo2 size={14}/></Button>
   <Button size="icon" variant="outline" aria-label={t('photos.reset')} disabled={!ready} onClick={()=>resetPhoto(item.name)} data-testid="photos-reset"><RotateCcw size={14}/></Button>
   <Button size="compact" variant="outline" aria-pressed={!!session?.cropping} disabled={!ready} onClick={()=>setPhotoCropping(item.name,!session?.cropping)} data-testid="photos-crop"><Frame size={13}/>{t('photos.crop')}</Button>
   {session?.cropping&&<>
    <Button size="compact" variant="primary" onClick={()=>applyPhotoCrop(item.name)} data-testid="photos-crop-apply"><Check size={13}/>{t('photos.crop.apply')}</Button>
    <Button size="compact" variant="outline" onClick={()=>cancelPhotoCrop(item.name)} data-testid="photos-crop-cancel"><X size={13}/>{t('photos.crop.cancel')}</Button>
   </>}
   <Button size="compact" disabled={!ready||session?.cropping} onClick={()=>void doExport('png')} data-testid="photos-export-png" title={t('photos.export.hint')}><Download size={13}/>{t('photos.export.png')}</Button>
   <Button size="compact" disabled={!ready||session?.cropping} onClick={()=>void doExport('jpeg')} data-testid="photos-export-jpeg" title={t('photos.export.hint')}><Download size={13}/>{t('photos.export.jpeg')}</Button>
  </div>
  <div ref={stage} className="media-checker relative min-h-0 w-full flex-1 overflow-hidden" onWheel={onWheel} onPointerDown={onStageDown} onPointerMove={onStageMove} onPointerUp={onStageUp} onPointerCancel={onStageUp} data-testid="photos-stage" style={{touchAction:'none',cursor:session?.cropping?'default':'grab'}}>
   <div ref={imgBox} className="absolute left-1/2 top-1/2" style={{width:dispW,height:dispH,transform:`translate(-50%,-50%) translate(${pan[0]}px,${pan[1]}px)`}}>
    <canvas ref={canvas} className="block size-full rounded-[2px] shadow-sm" style={{imageRendering:scale>4?'pixelated':'auto'}} data-testid="photos-canvas"/>
    {session?.cropping&&crop&&<div className="absolute inset-0" style={{cursor:'default'}} onPointerMove={onCropMove} onPointerUp={onCropUp} onPointerCancel={onCropUp} data-testid="photos-crop-overlay">
     <svg className="absolute inset-0 size-full" aria-hidden="true">
      <path d={`M0 0H${dispW}V${dispH}H0Z M${crop.x0*dispW} ${crop.y0*dispH}H${crop.x1*dispW}V${crop.y1*dispH}H${crop.x0*dispW}Z`} fill="rgba(0,0,0,0.45)" fillRule="evenodd"/>
      <rect x={crop.x0*dispW} y={crop.y0*dispH} width={(crop.x1-crop.x0)*dispW} height={(crop.y1-crop.y0)*dispH} fill="none" stroke="var(--accent)" strokeWidth="1.5"/>
     </svg>
     <div className="absolute" style={{left:`${crop.x0*100}%`,top:`${crop.y0*100}%`,width:`${(crop.x1-crop.x0)*100}%`,height:`${(crop.y1-crop.y0)*100}%`,cursor:'move'}} onPointerDown={startCropDrag({kind:'move',dx:0,dy:0})} data-testid="photos-crop-frame"/>
     {(['nw','ne','sw','se'] as const).map(k=><div key={k} className="absolute size-3 rounded-[3px] border border-white bg-[var(--accent)]" style={{left:`calc(${(k==='nw'||k==='sw'?crop.x0:crop.x1)*100}% - 6px)`,top:`calc(${(k==='nw'||k==='ne'?crop.y0:crop.y1)*100}% - 6px)`,cursor:k==='nw'||k==='se'?'nwse-resize':'nesw-resize'}} onPointerDown={startCropDrag({kind:k})} data-testid={`photos-crop-${k}`}/>)}
    </div>}
   </div>
  </div>
  <div className="flex items-center gap-2 border-t border-subtle px-3 py-1.5 text-[12px] text-ink-2">
   <Button size="icon" variant="outline" aria-label={t('photos.zoom.out')} onClick={()=>zoomTo(scale/1.25)} data-testid="photos-zoom-out"><ZoomOut size={13}/></Button>
   <span className="w-12 text-center tabular-nums" data-testid="photos-zoom-level">{Math.round(scale*100)}%</span>
   <Button size="icon" variant="outline" aria-label={t('photos.zoom.in')} onClick={()=>zoomTo(scale*1.25)} data-testid="photos-zoom-in"><ZoomIn size={13}/></Button>
   <Button size="compact" variant="outline" aria-pressed={zoom===null} onClick={()=>{setZoom(null);setPan([0,0]);}} data-testid="photos-zoom-fit"><Maximize2 size={13}/>{t('photos.zoom.fit')}</Button>
   <Button size="compact" variant="outline" onClick={()=>{setZoom(1);setPan([0,0]);}} data-testid="photos-zoom-actual"><Minimize2 size={13}/>{t('photos.zoom.actual')}</Button>
   <span className="flex-1"/>
   {session?.cropping&&<span className="text-ink-3" data-testid="photos-crop-hint">{t('photos.crop.hint')}</span>}
   <span className="text-ink-3" role="status" aria-live="polite" data-testid="photos-note">{note||(ready&&!session?.cropping?t('photos.note'):'')}</span>
   <span className="text-ink-3" role="status" aria-live="polite" style={session?.status==='error'?{color:'var(--danger)'}:undefined} data-testid="photos-status">{status||(dirty?t('photos.status.dirty'):ready?t('photos.status.clean'):'')}</span>
  </div>
 </section>;
}
