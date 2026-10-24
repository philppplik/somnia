import {useEffect,useRef,useState} from 'react';
import {useT} from '../../lib/useT';
import {executeCommand} from '../../lib/commands';
import {useStudio3D} from '../../lib/studio3d/session';
import {KEY_PATHS,MAX_CLIP_SECONDS,snapKeyTime,type KeyPath} from '../../lib/studio3d/clips';
import {EASES,type Ease} from '../../lib/studio3d/ease';
import type {KeyRef} from '../../lib/studio3d/keyEdit';
import {clampView,fitView,panView,zoomView,timeInView,viewPercent,viewTicks,nudgeTime,type TimeView} from '../../lib/studio3d/timeline';
import {formatClock} from '../../lib/studio3d/animation';
import {Button} from '../ui/button';
import {NativeSelect} from '../ui/native-controls';
const EPS=0.0005;
const clampT=(x:number)=>snapKeyTime(Math.min(MAX_CLIP_SECONDS,Math.max(0,x)));
/**
 * Visual timeline of the selected object: a ruler, one lane per transform path with a diamond for every key, and a playhead.
 * The view zooms (wheel or buttons) and pans (Shift-wheel or horizontal scroll). Keys multi-select with Ctrl/Cmd/Shift-click;
 * dragging or the arrow keys moves the whole selection as one undo step, and the selection can be copied and pasted at the playhead.
 */
export function ClipTimeline(){
 const {t}=useT();const s=useStudio3D();const a=s.anim;const clip=s.clips[a.clip];
 const [sel,setSel]=useState<KeyRef[]>([]);
 const [drag,setDrag]=useState<{keys:KeyRef[];t0:number;delta:number}|null>(null);
 const [view,setView]=useState<TimeView>({start:0,span:2});
 const lane=useRef<Record<string,SVGSVGElement|null>>({});
 const root=useRef<HTMLDivElement|null>(null);
 const duration=clip?clip.duration:2;
 const v=clampView(view,duration);
 // Drop selected keys that no longer exist (after undo, a failed edit or a new selection target).
 useEffect(()=>{
  setSel(cur=>{
   const kept=cur.filter(r=>s.clipKeys.some(k=>k.path===r.path&&k.times.some(x=>Math.abs(x-r.time)<EPS)));
   return kept.length===cur.length?cur:kept;
  });
 },[s.clipKeys]);
 // Keep the window inside the clip when its length changes.
 useEffect(()=>{setView(cur=>{const c=clampView(cur,duration);return c.start===cur.start&&c.span===cur.span?cur:c;});},[duration]);
 // Wheel: zoom around the pointer; Shift or a horizontal gesture pans. Non-passive so the page does not scroll.
 useEffect(()=>{
  const el=root.current;if(!el)return;
  const onWheel=(e:WheelEvent)=>{
   e.preventDefault();
   const r=(KEY_PATHS.map(p=>lane.current[p]).find(Boolean) as SVGSVGElement|undefined)?.getBoundingClientRect();
   setView(cur=>{
    const c=clampView(cur,duration);
    if(e.shiftKey||Math.abs(e.deltaX)>Math.abs(e.deltaY))return panView(c,duration,(e.shiftKey?e.deltaY:e.deltaX)/100*(c.span*0.25));
    const anchor=r?timeInView(e.clientX,r.left,r.width,c):undefined;
    return zoomView(c,duration,e.deltaY<0?1.25:0.8,anchor);
   });
  };
  el.addEventListener('wheel',onWheel,{passive:false});
  return()=>el.removeEventListener('wheel',onWheel);
 },[duration]);
 if(!clip||!s.selectedInfo)return null;
 // Bones take rotation keys only; meshes get all three lanes.
 const paths:readonly KeyPath[]=s.selectedInfo.kind==='bone'?['rotation']:KEY_PATHS;
 const run=(id:string,p?:Record<string,unknown>)=>void executeCommand(id,p);
 const atX=(path:KeyPath,x:number)=>{const r=lane.current[path]?.getBoundingClientRect();return r?timeInView(x,r.left,r.width,v):v.start;};
 const isSel=(path:KeyPath,time:number)=>sel.some(r=>r.path===path&&Math.abs(r.time-time)<EPS);
 const movedTo=(path:KeyPath,time:number)=>drag&&drag.keys.some(r=>r.path===path&&Math.abs(r.time-time)<EPS)?clampT(time+drag.delta):time;
 const endDrag=(path:KeyPath,time:number)=>{
  if(!drag||!drag.keys.some(r=>r.path===path&&Math.abs(r.time-time)<EPS))return;
  const d=drag.delta;const keys=drag.keys;setDrag(null);
  if(Math.abs(d)<EPS)return;
  const moved=keys.map(r=>({path:r.path,time:clampT(r.time+d)}));
  setSel(moved);
  if(keys.length===1)run('studio3d.key.move',{path:keys[0].path,time:keys[0].time,to:moved[0].time});
  else run('studio3d.key.shift',{keys,delta:snapKeyTime(d)});
 };
 const range=a.range&&a.range.end<=duration?a.range:null;
 /** The loop-range band clamped to the viewed window, or null when it is outside. */
 const band=range?(()=>{const p0=Math.max(0,viewPercent(range.start,v)),p1=Math.min(100,viewPercent(range.end,v));return p1>p0?{x:p0,w:p1-p0}:null;})():null;
 const playPct=viewPercent(a.time,v);
 const one=sel.length===1?sel[0]:null;
 const oneKey=one?s.clipKeys.find(k=>k.path===one.path):undefined;
 const oneIdx=one&&oneKey?oneKey.times.findIndex(x=>Math.abs(x-one.time)<EPS):-1;
 return <div ref={root} className="grid gap-1" data-testid="studio3d-timeline">
  <div className="flex flex-wrap items-center gap-1">
   <Button variant="outline" aria-label={t('studio3d.timeline.zoomOut')} data-testid="studio3d-timeline-zoom-out" onClick={()=>setView(cur=>zoomView(clampView(cur,duration),duration,0.75))}>−</Button>
   <Button variant="outline" aria-label={t('studio3d.timeline.zoomIn')} data-testid="studio3d-timeline-zoom-in" onClick={()=>setView(cur=>zoomView(clampView(cur,duration),duration,1.4))}>+</Button>
   <Button variant="outline" data-testid="studio3d-timeline-zoom-fit" onClick={()=>setView(fitView(duration))}>{t('studio3d.timeline.zoomFit')}</Button>
   <span className="mx-1 h-4 w-px bg-subtle" aria-hidden="true"/>
   <Button variant="outline" data-testid="studio3d-range-from" onClick={()=>run('studio3d.anim.range',{start:a.time,end:range&&range.end>a.time?range.end:duration})}>{t('studio3d.range.from')}</Button>
   <Button variant="outline" data-testid="studio3d-range-to" onClick={()=>run('studio3d.anim.range',{start:range&&range.start<a.time?range.start:0,end:Math.max(a.time,0.01)})}>{t('studio3d.range.to')}</Button>
   {range&&<Button variant="outline" data-testid="studio3d-range-clear" onClick={()=>run('studio3d.anim.range',{clear:true})}>{t('studio3d.range.clear')}</Button>}
   {range&&<span className="text-xs text-ink-3" data-testid="studio3d-range-label">{t('studio3d.range.label',{start:formatClock(range.start),end:formatClock(range.end)})}</span>}
  </div>
  <div className="flex items-center gap-2" aria-hidden="true">
   <span className="w-14 shrink-0"/><span className="w-24 shrink-0"/>
   <svg className="h-4 min-w-0 flex-1 text-ink-3" data-testid="studio3d-timeline-ruler">
    {band&&<rect x={band.x+'%'} y="0" width={band.w+'%'} height="100%" className="fill-current text-accent opacity-20"/>}
    {viewTicks(v,6).map(x=><g key={x}>
     <line x1={viewPercent(x,v)+'%'} x2={viewPercent(x,v)+'%'} y1="0" y2="6" className="stroke-current" strokeWidth="1"/>
     <text x={viewPercent(x,v)+'%'} y="14" fontSize={9} className="fill-current">{formatClock(x)}</text></g>)}
   </svg>
  </div>
  {paths.map(path=>{const k=s.clipKeys.find(x=>x.path===path);const here=!!k&&k.times.some(x=>Math.abs(x-a.time)<EPS);
   return <div key={path} className="flex items-center gap-2 text-xs text-ink-2" data-testid={'studio3d-keyrow-'+path}>
    <span className="w-14 shrink-0">{t('studio3d.key.'+path)}</span>
    <Button variant="outline" className="w-24 shrink-0 justify-center truncate" onClick={()=>run('studio3d.key.set',{path})}>{here?t('studio3d.key.update'):t('studio3d.key.add')}</Button>
    <svg ref={n=>{lane.current[path]=n;}} className="h-8 min-w-0 flex-1 touch-none rounded-sm border border-subtle bg-surface" role="group" aria-label={t('studio3d.timeline.lane',{path:t('studio3d.key.'+path)})}
     onPointerDown={e=>{if(e.target!==e.currentTarget)return;run('studio3d.anim.seek',{time:atX(path,e.clientX)});}}
     onDoubleClick={e=>{if(e.target!==e.currentTarget)return;run('studio3d.key.set',{path,time:atX(path,e.clientX)});}}>
     {band&&<rect x={band.x+'%'} y="0" width={band.w+'%'} height="100%" className="fill-current text-accent opacity-20"/>}
     {playPct>=0&&playPct<=100&&<line x1={playPct+'%'} x2={playPct+'%'} y1="0" y2="100%" className="stroke-current text-accent" strokeWidth="1" aria-hidden="true"/>}
     {k?.times.filter(time=>time>=v.start-EPS&&time<=v.start+v.span+EPS).map((time)=>{const shown=movedTo(path,time);const on=isSel(path,time);
      return <svg key={time} x={viewPercent(shown,v)+'%'} y="50%" overflow="visible" role="slider" tabIndex={0} aria-label={t('studio3d.timeline.key',{path:t('studio3d.key.'+path),time:formatClock(shown)})}
       aria-valuemin={0} aria-valuemax={duration} aria-valuenow={shown} aria-valuetext={formatClock(shown)} aria-disabled={!k.editable} aria-selected={on} className={'cursor-grab outline-none focus-visible:text-primary '+(on?'text-primary':'text-ink-2')} data-testid="studio3d-key"
       onPointerDown={e=>{
        if(!k.editable)return;e.stopPropagation();(e.currentTarget as Element).setPointerCapture?.(e.pointerId);
        if(e.ctrlKey||e.metaKey||e.shiftKey){setSel(cur=>isSel(path,time)?cur.filter(r=>!(r.path===path&&Math.abs(r.time-time)<EPS)):[...cur,{path,time}]);return;}
        const keys=isSel(path,time)?sel:[{path,time}];
        setSel(keys);setDrag({keys,t0:atX(path,e.clientX),delta:0});run('studio3d.anim.seek',{time});
       }}
       onPointerMove={e=>{if(drag&&drag.keys.some(r=>r.path===path&&Math.abs(r.time-time)<EPS))setDrag({...drag,delta:snapKeyTime(atX(path,e.clientX)-drag.t0)});}}
       onPointerUp={()=>endDrag(path,time)}
       onLostPointerCapture={()=>setDrag(null)}
       onFocus={()=>{if(!isSel(path,time))setSel([{path,time}]);}}
       onKeyDown={e=>{
        if(e.key==='Escape'&&drag){setDrag(null);return;}
        if((e.ctrlKey||e.metaKey)&&(e.key==='c'||e.key==='C')){e.preventDefault();run('studio3d.key.copy',{keys:sel.length?sel:[{path,time}]});return;}
        if((e.ctrlKey||e.metaKey)&&(e.key==='v'||e.key==='V')){e.preventDefault();run('studio3d.key.paste',{});return;}
        if(!k.editable)return;
        if(e.key==='ArrowLeft'||e.key==='ArrowRight'){
         e.preventDefault();const dir=e.key==='ArrowLeft'?-1:1;const big=e.shiftKey;
         const targets=sel.length>1&&isSel(path,time)?sel:[{path,time}];
         if(targets.length>1){const delta=dir*(big?0.5:0.05);setSel(targets.map(r=>({path:r.path,time:clampT(r.time+delta)})));run('studio3d.key.shift',{keys:targets,delta});}
         else{const to=nudgeTime(time,dir,big,duration,true);if(Math.abs(to-time)>EPS&&!k.times.some(x=>Math.abs(x-to)<EPS)){setSel([{path,time:to}]);run('studio3d.key.move',{path,time,to});}}
        }
        else if(e.key==='Delete'||e.key==='Backspace'){
         e.preventDefault();const targets=sel.length>1&&isSel(path,time)?sel:[{path,time}];setSel([]);
         for(const r of targets)run('studio3d.key.remove',{path:r.path,time:r.time});
        }
        else if(e.key==='Enter'||e.key===' '){e.preventDefault();run('studio3d.anim.seek',{time});}
       }}>
       <path d="M0 -7 L6 0 L0 7 L-6 0 Z" className="fill-current stroke-current" strokeWidth="1"/></svg>;})}
    </svg><span className="sr-only">{k?.times.map(x=>formatClock(x)).join(', ')}</span></div>;})}
  {sel.length>1?<div className="flex flex-wrap items-center gap-2 text-xs text-ink-2" data-testid="studio3d-keys-editor">
    <span>{t('studio3d.key.selectedCount',{count:sel.length})}</span>
    <Button variant="outline" onClick={()=>run('studio3d.key.copy',{keys:sel})}>{t('studio3d.key.copy')}</Button>
    <Button variant="outline" onClick={()=>run('studio3d.key.paste',{})}>{t('studio3d.key.paste')}</Button>
    <Button variant="outline" onClick={()=>{const gone=sel;setSel([]);for(const r of gone)run('studio3d.key.remove',{path:r.path,time:r.time});}}>{t('studio3d.key.deleteSelected')}</Button>
    <span className="text-ink-3">{t('studio3d.key.multiHint')}</span></div>
   :one&&oneKey&&oneIdx>=0?<div className="flex flex-wrap items-center gap-2 text-xs text-ink-2" data-testid="studio3d-key-editor">
    <span>{t('studio3d.key.selected',{path:t('studio3d.key.'+one.path),time:formatClock(one.time)})}</span>
    <label className="flex items-center gap-2">{t('studio3d.key.ease')}
     <NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={oneKey.eases[oneIdx]} disabled={!oneKey.editable} onChange={e=>run('studio3d.key.ease',{path:one.path,time:one.time,ease:e.currentTarget.value as Ease})}>
      {EASES.map(x=><option key={x} value={x}>{t('studio3d.ease.'+x)}</option>)}</NativeSelect></label>
    <Button variant="outline" onClick={()=>run('studio3d.key.copy',{keys:[one]})}>{t('studio3d.key.copy')}</Button>
    <Button variant="outline" disabled={!oneKey.editable} onClick={()=>{const p=one;setSel([]);run('studio3d.key.remove',{path:p.path,time:p.time});}}>{t('studio3d.key.deleteSelected')}</Button></div>
   :<p className="m-0 text-xs text-ink-3">{t('studio3d.timeline.hint')}</p>}
 </div>;
}
