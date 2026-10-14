import {useRef,useState} from 'react';
import {useT} from '../../lib/useT';
import {executeCommand} from '../../lib/commands';
import {useStudio3D} from '../../lib/studio3d/session';
import {KEY_PATHS,type KeyPath} from '../../lib/studio3d/clips';
import {EASES,type Ease} from '../../lib/studio3d/ease';
import {timeFromX,percentOf,nudgeTime} from '../../lib/studio3d/timeline';
import {formatClock} from '../../lib/studio3d/animation';
import {Button} from '../ui/button';
import {NativeSelect} from '../ui/native-controls';
/**
 * Visual timeline of the selected object: one lane per transform path with a diamond for every key and a playhead.
 * Drag a key to move it (Escape cancels), or focus it and use the arrow keys (Shift for bigger steps) and Delete.
 * Click a lane to move the playhead, double-click to add a key there. Each change is one undo step.
 */
export function ClipTimeline(){
 const {t}=useT();const s=useStudio3D();const a=s.anim;const clip=s.clips[a.clip];
 const [sel,setSel]=useState<{path:KeyPath;time:number}|null>(null);
 const [drag,setDrag]=useState<{path:KeyPath;from:number;to:number}|null>(null);
 const lane=useRef<Record<string,SVGSVGElement|null>>({});
 if(!clip||!s.selectedInfo)return null;const duration=clip.duration;
 const run=(id:string,p?:Record<string,unknown>)=>void executeCommand(id,p);
 const atX=(path:KeyPath,x:number)=>{const r=lane.current[path]?.getBoundingClientRect();return r?timeFromX(x,r.left,r.width,duration):0;};
 const selKey=sel?s.clipKeys.find(k=>k.path===sel.path):undefined;const selIdx=sel&&selKey?selKey.times.findIndex(x=>Math.abs(x-sel.time)<0.0005):-1;
 return <div className="grid gap-1" data-testid="studio3d-timeline">
  {KEY_PATHS.map(path=>{const k=s.clipKeys.find(x=>x.path===path);const here=!!k&&k.times.some(x=>Math.abs(x-a.time)<0.0005);
   return <div key={path} className="flex items-center gap-2 text-xs text-ink-2" data-testid={'studio3d-keyrow-'+path}>
    <span className="w-14 shrink-0">{t('studio3d.key.'+path)}</span>
    <Button variant="outline" onClick={()=>run('studio3d.key.set',{path})}>{here?t('studio3d.key.update'):t('studio3d.key.add')}</Button>
    <svg ref={n=>{lane.current[path]=n;}} className="h-8 min-w-0 flex-1 touch-none rounded-sm border border-subtle bg-surface" role="group" aria-label={t('studio3d.timeline.lane',{path:t('studio3d.key.'+path)})}
     onPointerDown={e=>{if(e.target!==e.currentTarget)return;run('studio3d.anim.seek',{time:atX(path,e.clientX)});}}
     onDoubleClick={e=>{if(e.target!==e.currentTarget)return;run('studio3d.key.set',{path,time:atX(path,e.clientX)});}}>
     <line x1={percentOf(a.time,duration)+'%'} x2={percentOf(a.time,duration)+'%'} y1="0" y2="100%" className="stroke-current text-accent" strokeWidth="1" aria-hidden="true"/>
     {k?.times.map((time)=>{const shown=drag&&drag.path===path&&Math.abs(drag.from-time)<0.0005?drag.to:time;const on=!!sel&&sel.path===path&&Math.abs(sel.time-time)<0.0005;
      return <svg key={time} x={percentOf(shown,duration)+'%'} y="50%" overflow="visible" role="slider" tabIndex={0} aria-label={t('studio3d.timeline.key',{path:t('studio3d.key.'+path),time:formatClock(shown)})}
       aria-valuemin={0} aria-valuemax={duration} aria-valuenow={shown} aria-valuetext={formatClock(shown)} aria-disabled={!k.editable} className={'cursor-grab outline-none focus-visible:text-primary '+(on?'text-primary':'text-ink-2')} data-testid="studio3d-key"
       onPointerDown={e=>{if(!k.editable)return;e.stopPropagation();(e.currentTarget as Element).setPointerCapture?.(e.pointerId);setSel({path,time});setDrag({path,from:time,to:time});run('studio3d.anim.seek',{time});}}
       onPointerMove={e=>{if(drag&&drag.path===path&&drag.from===time)setDrag({...drag,to:atX(path,e.clientX)});}}
       onPointerUp={()=>{if(drag&&drag.path===path&&drag.from===time){const to=drag.to;setDrag(null);if(Math.abs(to-time)>0.0005){setSel({path,time:to});run('studio3d.key.move',{path,time,to});}}}}
       onLostPointerCapture={()=>setDrag(null)}
       onFocus={()=>setSel({path,time})}
       onKeyDown={e=>{
        if(e.key==='Escape'&&drag){setDrag(null);return;}
        if(!k.editable)return;
        if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const to=nudgeTime(time,e.key==='ArrowLeft'?-1:1,e.shiftKey,duration,true);if(Math.abs(to-time)>0.0005&&!k.times.some(x=>Math.abs(x-to)<0.0005)){setSel({path,time:to});run('studio3d.key.move',{path,time,to});}}
        else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();setSel(null);run('studio3d.key.remove',{path,time});}
        else if(e.key==='Enter'||e.key===' '){e.preventDefault();run('studio3d.anim.seek',{time});}
       }}>
       <path d="M0 -7 L6 0 L0 7 L-6 0 Z" className="fill-current stroke-current" strokeWidth="1"/></svg>;})}
    </svg><span className="sr-only">{k?.times.map(x=>formatClock(x)).join(', ')}</span></div>;})}
  {sel&&selKey&&selIdx>=0?<div className="flex flex-wrap items-center gap-2 text-xs text-ink-2" data-testid="studio3d-key-editor">
   <span>{t('studio3d.key.selected',{path:t('studio3d.key.'+sel.path),time:formatClock(sel.time)})}</span>
   <label className="flex items-center gap-2">{t('studio3d.key.ease')}
    <NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={selKey.eases[selIdx]} disabled={!selKey.editable} onChange={e=>run('studio3d.key.ease',{path:sel.path,time:sel.time,ease:e.currentTarget.value as Ease})}>
     {EASES.map(x=><option key={x} value={x}>{t('studio3d.ease.'+x)}</option>)}</NativeSelect></label>
   <Button variant="outline" disabled={!selKey.editable} onClick={()=>{const p=sel;setSel(null);run('studio3d.key.remove',{path:p.path,time:p.time});}}>{t('studio3d.key.deleteSelected')}</Button></div>
   :<p className="m-0 text-xs text-ink-3">{t('studio3d.timeline.hint')}</p>}
 </div>;
}
