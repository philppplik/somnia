import {useCallback,useRef} from 'react';
import type {VideoTrim} from '../../lib/video/recipe';
/** Ticks adapt to the clip length so the ruler never crowds. */
const tickStep=(duration:number)=>duration<=30?1:duration<=120?5:duration<=600?30:60;
interface Props{duration:number;position:number;trim:VideoTrim|null;onSeek:(s:number)=>void;onTrim:(edge:'start'|'end',at:number)=>void;label:string}
/** Timeline ruler with playhead and draggable trim handles. Keyboard editing lives in the workspace (I/O keys). */
export function VideoTimeline({duration,position,trim,onSeek,onTrim,label}:Props){
 const track=useRef<HTMLDivElement>(null);
 const at=useCallback((clientX:number)=>{
  const box=track.current?.getBoundingClientRect();if(!box||box.width===0)return 0;
  return Math.min(duration,Math.max(0,(clientX-box.left)/box.width*duration));
 },[duration]);
 const drag=(edge:'start'|'end')=>(e:React.PointerEvent)=>{
  e.preventDefault();e.stopPropagation();(e.target as HTMLElement).setPointerCapture(e.pointerId);
  const move=(ev:PointerEvent)=>onTrim(edge,at(ev.clientX));
  const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);};
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
  onTrim(edge,at(e.clientX));
 };
 const seek=(e:React.PointerEvent)=>{
  if((e.target as HTMLElement).dataset.handle)return;
  e.preventDefault();(e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  const move=(ev:PointerEvent)=>onSeek(at(ev.clientX));
  const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);};
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
  onSeek(at(e.clientX));
 };
 const pct=(s:number)=>duration>0?`${Math.min(100,Math.max(0,s/duration*100))}%`:'0%';
 const ticks:number[]=[];const step=tickStep(duration);for(let s=0;s<=duration+1e-6;s+=step)ticks.push(s);
 return <div className="relative h-12 w-full select-none" aria-label={label} data-testid="video-timeline">
  <div ref={track} className="absolute inset-x-0 top-1/2 h-6 -translate-y-1/2 cursor-pointer rounded-sm bg-hover" onPointerDown={seek}>
   {trim&&<div className="absolute top-0 bottom-0 rounded-sm bg-[var(--accent)]/25 outline-1 outline-[var(--accent)]" style={{left:pct(trim.start_s),width:`${Math.max(0,(trim.end_s-trim.start_s)/duration*100)}%`}} data-testid="video-trim-range"/>}
   {trim&&(['start','end'] as const).map(edge=>{
    const s=edge==='start'?trim.start_s:trim.end_s;
    return <div key={edge} data-handle="true" role="slider" aria-label={edge==='start'?'Trim start':'Trim end'} aria-valuemin={0} aria-valuemax={Math.round(duration*100)/100} aria-valuenow={Math.round(s*100)/100} aria-valuetext={`${s.toFixed(2)} s`} tabIndex={0}
     className="absolute top-[-3px] bottom-[-3px] w-2.5 -translate-x-1/2 cursor-ew-resize rounded-sm bg-[var(--accent)]"
     style={{left:pct(s)}} onPointerDown={drag(edge)}
     onKeyDown={e=>{const d=e.shiftKey?1:0.1;if(e.key==='ArrowLeft'){e.preventDefault();onTrim(edge,Math.max(0,s-d));}else if(e.key==='ArrowRight'){e.preventDefault();onTrim(edge,Math.min(duration,s+d));}}}
     data-testid={edge==='start'?'video-trim-start':'video-trim-end'}/>;
   })}
   <div className="pointer-events-none absolute top-[-4px] bottom-[-4px] w-0.5 -translate-x-1/2 bg-ink" style={{left:pct(position)}} data-testid="video-playhead"/>
  </div>
  <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between text-[10px] text-ink-3">
   {ticks.map(s=><span key={s} style={s===0?undefined:s===ticks[ticks.length-1]?undefined:{position:'absolute',left:pct(s),transform:'translateX(-50%)'}}>{Math.round(s/60)}:{String(Math.round(s%60)).padStart(2,'0')}</span>)}
  </div>
 </div>;
}
