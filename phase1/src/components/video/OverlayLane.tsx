import {useRef} from 'react';
import type {OverlayClip} from '../../lib/video/overlayTrack';
import {snapThresholdSeconds,snapTime} from '../../lib/video/zoom';
import {useT} from '../../lib/useT';
const shortName=(n:string)=>n.replace(/^.*[\\/]/,'').replace(/\.[^.]+$/,'');
interface Props{
 clips:OverlayClip[];selectedId:string|null;
 /** Timeline span the lane maps onto (same domain as the video track above). */
 duration:number;
 onSelect:(id:string|null)=>void;onMoveAt:(id:string,at:number)=>void;
 /** Right-edge drag or key resize: the timeline time the clip should end at. */
 onResize:(id:string,end:number)=>void;
 /** Times a dragged block or edge snaps to (both other tracks' edges, bounds, playhead); ~8 px threshold. */
 snapPoints?:number[];
 label:string;
}
/** The overlay track between the video timeline and the audio lane: blocks drag horizontally to move, the right edge resizes the duration. */
export function OverlayLane({clips,selectedId,duration,onSelect,onMoveAt,onResize,snapPoints,label}:Props){
 const {t}=useT();
 const track=useRef<HTMLDivElement>(null);
 const pct=(s:number)=>duration>0?`${Math.min(100,Math.max(0,s/duration*100))}%`:'0%';
 const snapAt=(raw:number)=>{
  const box=track.current?.getBoundingClientRect();
  return snapPoints&&box&&box.width>0?snapTime(raw,snapPoints,snapThresholdSeconds(8,box.width,duration)):raw;
 };
 const moveDrag=(c:OverlayClip)=>(e:React.PointerEvent)=>{
  if((e.target as HTMLElement).dataset.handle)return;
  e.preventDefault();e.stopPropagation();
  onSelect(c.id);
  const base=c.at,startX=e.clientX;
  const move=(ev:PointerEvent)=>{
   const box=track.current?.getBoundingClientRect();if(!box||box.width===0||duration<=0)return;
   onMoveAt(c.id,snapAt(Math.max(0,base+(ev.clientX-startX)/box.width*duration)));
  };
  const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);};
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
 };
 const edgeDrag=(c:OverlayClip)=>(e:React.PointerEvent)=>{
  e.preventDefault();e.stopPropagation();
  const base=c.at+c.duration,startX=e.clientX;
  const move=(ev:PointerEvent)=>{
   const box=track.current?.getBoundingClientRect();if(!box||box.width===0||duration<=0)return;
   onResize(c.id,snapAt(Math.max(c.at,base+(ev.clientX-startX)/box.width*duration)));
  };
  const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);};
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
 };
 return <div ref={track} className="relative h-7 w-full rounded-sm bg-hover" aria-label={label} data-testid="overlay-lane"
  onPointerDown={e=>{if((e.target as HTMLElement).closest('[data-clip]'))return;onSelect(null);}}>
  {clips.map((c,i)=>{
   const selected=c.id===selectedId;
   return <div key={c.id} role="button" tabIndex={0} aria-pressed={selected}
    aria-label={t('video.overlayClipLabel',{index:i+1,name:c.title?.text||shortName(c.source)})}
    className={`group absolute top-0.5 bottom-0.5 overflow-hidden rounded-sm outline-1 ${selected?'bg-amber-500/40 outline-amber-500':'bg-amber-500/15 outline-transparent hover:bg-amber-500/25'}`}
    style={{left:pct(c.at),width:`${Math.max(0.5,duration>0?c.duration/duration*100:0)}%`}}
    onPointerDown={moveDrag(c)}
    onKeyDown={e=>{
     const d=e.shiftKey?1:0.1;
     if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(selected?null:c.id);}
     else if(e.key==='ArrowLeft'){e.preventDefault();onMoveAt(c.id,Math.max(0,c.at-d));}
     else if(e.key==='ArrowRight'){e.preventDefault();onMoveAt(c.id,c.at+d);}
    }}
    data-testid="overlay-clip" data-clip="true" data-clip-id={c.id} data-selected={selected||undefined}>
    <span className="pointer-events-none absolute inset-x-1 top-1/2 -translate-y-1/2 truncate text-[10px] text-ink">
     {c.kind==='title'?(c.title?.text||t('video.overlayAddTitle')):shortName(c.source)}
    </span>
    {[...new Set([...(c.rectKeys??[]),...(c.opacityKeys??[])].map(k=>k.t))].map(kt=><span key={kt} className="pointer-events-none absolute bottom-0 text-[8px] leading-none text-amber-200" style={{left:`${Math.min(100,Math.max(0,kt/c.duration*100))}%`}} data-testid="overlay-key-marker">◆</span>)}
    {selected&&<div data-handle="true" role="slider"
     aria-label={t('video.trimEnd')}
     aria-valuemin={0} aria-valuenow={Math.round((c.at+c.duration)*100)/100} aria-valuetext={`${(c.at+c.duration).toFixed(2)} s`} tabIndex={0}
     className="absolute top-[-3px] bottom-[-3px] w-2.5 -translate-x-1/2 cursor-ew-resize rounded-sm bg-amber-500"
     style={{left:'100%'}}
     onPointerDown={edgeDrag(c)}
     onKeyDown={e=>{const d=e.shiftKey?1:0.1;
      if(e.key==='ArrowLeft'){e.preventDefault();onResize(c.id,c.at+c.duration-d);}
      else if(e.key==='ArrowRight'){e.preventDefault();onResize(c.id,c.at+c.duration+d);}}}
     data-testid="overlay-clip-out"/>}
   </div>;
  })}
 </div>;
}
