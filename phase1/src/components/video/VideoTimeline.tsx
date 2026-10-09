import {useCallback,useRef,type ReactNode} from 'react';
import {clipRanges,fadeOf,timelineDuration,type TimelineClip} from '../../lib/video/timeline';
import {useT} from '../../lib/useT';
import {VolumeX} from '../../lib/icons';
/** Ticks adapt to the timeline length so the ruler never crowds. */
const tickStep=(duration:number)=>duration<=30?1:duration<=120?5:duration<=600?30:60;
const shortName=(n:string)=>n.replace(/^.*[\\/]/,'').replace(/\.[^.]+$/,'');
interface Props{
 clips:TimelineClip[];selectedId:string|null;position:number;missing:Set<string>;
 onSeek:(s:number)=>void;onSelect:(id:string|null)=>void;onTrim:(id:string,edge:'in'|'out',sourceTime:number)=>void;onMove:(id:string,by:number)=>void;
 label:string;
 /** Optional thumbnail layer painted behind each clip's label (see lib/video/INTEGRATION.md). `trackHeight` (px) lets the track grow for it. */
 renderStrip?:(clip:TimelineClip,index:number)=>ReactNode;trackHeight?:number;
}
/** Segmented timeline: one block per clip, drag to reorder, edge handles trim the selected clip, the playhead seeks. */
export function VideoTimeline({clips,selectedId,position,missing,onSeek,onSelect,onTrim,onMove,label,renderStrip,trackHeight}:Props){
 const {t}=useT();
 const track=useRef<HTMLDivElement>(null);
 const duration=timelineDuration(clips);
 const ranges=clipRanges(clips);
 const at=useCallback((clientX:number)=>{
  const box=track.current?.getBoundingClientRect();if(!box||box.width===0)return 0;
  return Math.min(duration,Math.max(0,(clientX-box.left)/box.width*duration));
 },[duration]);
 const pct=(s:number)=>duration>0?`${Math.min(100,Math.max(0,s/duration*100))}%`:'0%';
 const seek=(e:React.PointerEvent)=>{
  if((e.target as HTMLElement).closest('[data-clip],[data-handle]'))return;
  e.preventDefault();(e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  const move=(ev:PointerEvent)=>onSeek(at(ev.clientX));
  const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);};
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
  onSeek(at(e.clientX));
 };
 const trimDrag=(id:string,edge:'in'|'out',clip:TimelineClip)=>(e:React.PointerEvent)=>{
  e.preventDefault();e.stopPropagation();(e.target as HTMLElement).setPointerCapture(e.pointerId);
  const box=track.current?.getBoundingClientRect();
  const startX=e.clientX,base=edge==='in'?clip.in_s:clip.out_s;
  const move=(ev:PointerEvent)=>{
   if(!box||box.width===0||duration===0)return;
   onTrim(id,edge,base+(ev.clientX-startX)/box.width*duration);
  };
  const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);};
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
 };
 const reorderDrag=(id:string)=>(e:React.PointerEvent)=>{
  if((e.target as HTMLElement).dataset.handle)return;
  e.preventDefault();e.stopPropagation();
  onSelect(id);
  const startX=e.clientX;let last=0;
  const move=(ev:PointerEvent)=>{
   const box=track.current?.getBoundingClientRect();if(!box)return;
   const step=box.width/Math.max(1,ranges.length);
   const delta=Math.trunc((ev.clientX-startX)/step);
   if(delta!==last){onMove(id,delta-last);last=delta;}
  };
  const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);};
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
 };
 const ticks:number[]=[];const step=tickStep(duration);for(let s=0;s<=duration+1e-6;s+=step)ticks.push(s);
 return <div className={`relative w-full select-none ${trackHeight&&trackHeight>24?'':'h-12'}`} style={trackHeight&&trackHeight>24?{height:trackHeight+24}:undefined} aria-label={label} data-testid="video-timeline">
  <div ref={track} style={{height:trackHeight??24}} className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 cursor-pointer gap-px rounded-sm bg-hover" onPointerDown={seek}>
   {ranges.map((r,i)=>{
    const selected=r.clip.id===selectedId,gone=missing.has(r.clip.source);
    const left=((r.start)/duration*100),width=(Math.max(0.5,(r.end-r.start)/duration*100));
    return <div key={r.clip.id} role="button" tabIndex={0} aria-pressed={selected} aria-label={t('video.clipLabel',{index:i+1,name:shortName(r.clip.source)})}
     className={`group absolute top-0 bottom-0 overflow-hidden rounded-sm outline-1 ${selected?'bg-[var(--accent)]/30 outline-[var(--accent)]':'bg-[var(--accent)]/10 outline-transparent hover:bg-[var(--accent)]/20'} ${gone?'opacity-40 outline-dashed outline-[var(--danger)]':''}`}
     style={{left:`${left}%`,width:`${width}%`}}
     onPointerDown={reorderDrag(r.clip.id)}
     onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(selected?null:r.clip.id);}}}
     data-testid="video-clip" data-clip-id={r.clip.id} data-selected={selected||undefined}>
     {renderStrip?.(r.clip,i)}
     <span className={`pointer-events-none absolute inset-x-1 ${renderStrip?'bottom-0.5':'top-1/2 -translate-y-1/2'} truncate text-[10px] ${renderStrip?'text-white [text-shadow:0_0_3px_rgba(0,0,0,.9)]':'text-ink'}`}>
      {shortName(r.clip.source)}{ranges.filter(x=>x.clip.source===r.clip.source).length>1?` · ${ranges.filter(x=>x.clip.source===r.clip.source).findIndex(x=>x.clip.id===r.clip.id)+1}`:''}
      {r.clip.muted&&<VolumeX size={10} className="ml-1 inline-block align-[-1px]" aria-label={t('video.clipMuted')}/>}
      {gone&&<span className="ml-1 text-[var(--danger)]">{t('video.missingSource')}</span>}
     </span>
     {selected&&(['in','out'] as const).map(edge=>{
      const s=edge==='in'?r.start:r.end;
      return <div key={edge} data-handle="true" role="slider" aria-label={edge==='in'?t('video.trimStart'):t('video.trimEnd')} aria-valuemin={0} aria-valuemax={Math.round(r.clip.out_s*100)/100} aria-valuenow={Math.round((edge==='in'?r.clip.in_s:r.clip.out_s)*100)/100} aria-valuetext={`${(edge==='in'?r.clip.in_s:r.clip.out_s).toFixed(2)} s`} tabIndex={0}
       className="absolute top-[-3px] bottom-[-3px] w-2.5 -translate-x-1/2 cursor-ew-resize rounded-sm bg-[var(--accent)]"
       style={{left:edge==='in'?'0%':'100%'}}
       onPointerDown={trimDrag(r.clip.id,edge,r.clip)}
       onKeyDown={e=>{const d=e.shiftKey?1:0.1;if(e.key==='ArrowLeft'){e.preventDefault();onTrim(r.clip.id,edge,(edge==='in'?r.clip.in_s:r.clip.out_s)-d);}else if(e.key==='ArrowRight'){e.preventDefault();onTrim(r.clip.id,edge,(edge==='in'?r.clip.in_s:r.clip.out_s)+d);}}}
       data-testid={edge==='in'?'video-clip-in':'video-clip-out'}/>;
     })}
    </div>;
   })}
   {ranges.slice(1).map((r,j)=>{
    const d=fadeOf(clips[j]);if(d<=0||duration<=0)return null;
    return <div key={`fade-${r.clip.id}`} className="pointer-events-none absolute top-0 bottom-0" aria-label={t('video.transitionLabel',{seconds:d.toFixed(1)})}
     style={{left:`${r.start/duration*100}%`,width:`${d/duration*100}%`,background:'linear-gradient(to top right, transparent 44%, var(--accent) 44%, var(--accent) 56%, transparent 56%), linear-gradient(to bottom right, transparent 44%, var(--accent) 44%, var(--accent) 56%, transparent 56%)'}}
     data-testid="video-transition"/>;
   })}
   <div className="pointer-events-none absolute top-[-4px] bottom-[-4px] w-0.5 -translate-x-1/2 bg-ink" style={{left:pct(position)}} data-testid="video-playhead"/>
  </div>
  <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between text-[10px] text-ink-3">
   {ticks.map(s=><span key={s} style={s===0?undefined:s===ticks[ticks.length-1]?undefined:{position:'absolute',left:pct(s),transform:'translateX(-50%)'}}>{Math.round(s/60)}:{String(Math.round(s%60)).padStart(2,'0')}</span>)}
  </div>
 </div>;
}
