import {useRef} from 'react';
import {audioClipDuration,type AudioClip} from '../../lib/video/audioTrack';
import type {FilmstripController} from '../../lib/video/filmstrip-controller';
import {snapThresholdSeconds,snapTime} from '../../lib/video/zoom';
import {WaveformStrip} from './WaveformStrip';
import {useT} from '../../lib/useT';
import {VolumeX} from '../../lib/icons';
const shortName=(n:string)=>n.replace(/^.*[\\/]/,'').replace(/\.[^.]+$/,'');
interface Props{
 clips:AudioClip[];selectedId:string|null;/** Timeline span the lane maps onto (same domain as the video track above). */
 duration:number;
 onSelect:(id:string|null)=>void;onMoveAt:(id:string,at:number)=>void;onResize:(id:string,edge:'in'|'out',timelineTime:number)=>void;
 label:string;
 /** Filmstrip controller for the waveform layer; null where workers are unavailable (tests, SSR). */
 controller?:FilmstripController|null;
 /** Times a dragged block or edge snaps to (both tracks' edges, bounds, playhead); ~8 px threshold like the video track. */
 snapPoints?:number[];
}
/** The free-placed audio track under the video timeline: blocks drag horizontally, edge handles resize, fades show as shaded wedges. */
export function AudioLane({clips,selectedId,duration,onSelect,onMoveAt,onResize,label,controller,snapPoints}:Props){
 const {t}=useT();
 const track=useRef<HTMLDivElement>(null);
 const atTime=(clientX:number)=>{
  const box=track.current?.getBoundingClientRect();
  return box&&box.width>0?Math.max(0,(clientX-box.left)/box.width*duration):0;
 };
 const pct=(s:number)=>duration>0?`${Math.min(100,Math.max(0,s/duration*100))}%`:'0%';
 const moveDrag=(c:AudioClip)=>(e:React.PointerEvent)=>{
  if((e.target as HTMLElement).dataset.handle)return;
  e.preventDefault();e.stopPropagation();
  onSelect(c.id);
  const base=c.at,startX=e.clientX;
  const move=(ev:PointerEvent)=>{
   const box=track.current?.getBoundingClientRect();if(!box||box.width===0||duration<=0)return;
   const raw=Math.max(0,base+(ev.clientX-startX)/box.width*duration);
   onMoveAt(c.id,snapPoints?snapTime(raw,snapPoints,snapThresholdSeconds(8,box.width,duration)):raw);
  };
  const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);};
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
 };
 const edgeDrag=(c:AudioClip,edge:'in'|'out')=>(e:React.PointerEvent)=>{
  e.preventDefault();e.stopPropagation();
  const base=edge==='in'?c.at:c.at+audioClipDuration(c),startX=e.clientX;
  const move=(ev:PointerEvent)=>{
   const box=track.current?.getBoundingClientRect();if(!box||box.width===0||duration<=0)return;
   const raw=Math.max(0,base+(ev.clientX-startX)/box.width*duration);
   onResize(c.id,edge,snapPoints?snapTime(raw,snapPoints,snapThresholdSeconds(8,box.width,duration)):raw);
  };
  const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);};
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
 };
 return <div ref={track} className="relative h-7 w-full cursor-pointer rounded-sm bg-hover" aria-label={label} data-testid="audio-lane"
  onPointerDown={e=>{if((e.target as HTMLElement).closest('[data-clip]'))return;onSelect(null);}}>
  {clips.map((c,i)=>{
   const dur=audioClipDuration(c),selected=c.id===selectedId;
   const fadeInPct=dur>0?Math.min(100,c.fadeIn/dur*100):0,fadeOutPct=dur>0?Math.min(100,c.fadeOut/dur*100):0;
   return <div key={c.id} role="button" tabIndex={0} aria-pressed={selected} aria-label={t('video.audioClipLabel',{index:i+1,name:shortName(c.source)})}
    className={`group absolute top-0.5 bottom-0.5 overflow-hidden rounded-sm outline-1 ${selected?'bg-[var(--accent)]/40 outline-[var(--accent)]':'bg-[var(--accent)]/15 outline-transparent hover:bg-[var(--accent)]/25'} ${c.muted?'opacity-45':''}`}
    style={{left:pct(c.at),width:`${Math.max(0.5,dur/duration*100)}%`}}
    onPointerDown={moveDrag(c)}
    onKeyDown={e=>{
     const d=e.shiftKey?1:0.1;
     if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(selected?null:c.id);}
     else if(e.key==='ArrowLeft'){e.preventDefault();onMoveAt(c.id,Math.max(0,c.at-d));}
     else if(e.key==='ArrowRight'){e.preventDefault();onMoveAt(c.id,c.at+d);}
    }}
    data-testid="audio-clip" data-clip="true" data-clip-id={c.id} data-selected={selected||undefined}>
    {controller&&<WaveformStrip controller={controller} source={c.source} in_s={c.in_s} out_s={c.out_s} gain={c.muted?0:c.gain}/>}
    {(fadeInPct>0||fadeOutPct>0)&&<div className="pointer-events-none absolute inset-0" aria-hidden="true"
     style={{background:`linear-gradient(to right, rgba(0,0,0,.55) 0%, transparent ${fadeInPct}%, transparent ${100-fadeOutPct}%, rgba(0,0,0,.55) 100%)`}}/>}
    <span className="pointer-events-none absolute inset-x-1 top-1/2 -translate-y-1/2 truncate text-[10px] text-ink">
     {shortName(c.source)}{c.gain!==1?` · ${Math.round(c.gain*100)}%`:''}{c.muted&&<VolumeX size={10} className="ml-1 inline-block align-[-1px]" aria-label={t('video.clipMuted')}/>}
    </span>
    {selected&&(['in','out'] as const).map(edge=><div key={edge} data-handle="true" role="slider"
     aria-label={edge==='in'?t('video.trimStart'):t('video.trimEnd')}
     aria-valuemin={0} aria-valuenow={Math.round((edge==='in'?c.at:c.at+dur)*100)/100} aria-valuetext={`${(edge==='in'?c.at:c.at+dur).toFixed(2)} s`} tabIndex={0}
     className="absolute top-[-3px] bottom-[-3px] w-2.5 -translate-x-1/2 cursor-ew-resize rounded-sm bg-[var(--accent)]"
     style={{left:edge==='in'?'0%':'100%'}}
     onPointerDown={edgeDrag(c,edge)}
     onKeyDown={e=>{const d=e.shiftKey?1:0.1;
      if(e.key==='ArrowLeft'){e.preventDefault();onResize(c.id,edge,(edge==='in'?c.at:c.at+dur)-d);}
      else if(e.key==='ArrowRight'){e.preventDefault();onResize(c.id,edge,(edge==='in'?c.at:c.at+dur)+d);}}}
     data-testid={edge==='in'?'audio-clip-in':'audio-clip-out'}/>)}
   </div>;
  })}
 </div>;
}
