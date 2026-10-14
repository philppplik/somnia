import {useEffect,useRef,useState,type KeyboardEvent as ReactKeyboardEvent,type PointerEvent} from 'react';
import {Play,Pause,Undo2,Redo2,Eye,EyeOff,Lock,Unlock} from '../../lib/icons';
import {animationSession,useAnimationState} from '../../lib/animation/session';
import {TRANSFORM_KEYS,type Composition,type KeyRef,type TransformKey} from '../../lib/animation/model';
import {playbackAt} from '../../lib/animation/playback';
import {clickSelect,marqueeSelect,pruneSelection,rectsOverlap,sameKey,shiftSelection} from '../../lib/animation/selection';
import {EASE_PRESETS,type EasePreset} from '../../lib/animation/graph';
import {frameToTick,snapToFrame,tickToFrame,timecode} from '../../lib/animation/time';
import {executeCommand} from '../../lib/commands';
import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
import {PROP_LABEL} from './format';
import {GraphEditor} from './GraphEditor';
const run=(id:string,params?:unknown)=>void executeCommand(id,params);
const pct=(t:number,c:Composition)=>`${Math.min(100,Math.max(0,(t-c.start)/c.duration*100))}%`;
const EASES:EasePreset[]=['linear','ease','easeIn','easeOut','hold'];
const EASE_LABEL:Record<EasePreset,string>={linear:'animation.key.linear',ease:'animation.ease.ease',easeIn:'animation.ease.in',easeOut:'animation.ease.out',hold:'animation.key.hold'};
interface Box{x0:number;y0:number;x1:number;y1:number}
/** Timeline of the Animation studio: transport, work area, layer bars, key lanes with marquee selection, or the graph editor. */
export function AnimationTimeline({comp,at,selected,canUndo,canRedo}:{comp:Composition;at:number;selected:string|null;canUndo:boolean;canRedo:boolean}){
 const {t}=useT();const state=useAnimationState();const view=state.view;
 const rulerRef=useRef<HTMLDivElement>(null);const lanesRef=useRef<HTMLDivElement>(null);
 const frames=Math.max(1,tickToFrame(comp.duration,comp.fps));const frame=tickToFrame(at,comp.fps);
 const [playing,setPlaying]=useState(false);const raf=useRef<number|null>(null);
 const live=useRef({comp,loop:view.loop});live.current={comp,loop:view.loop};
 const sel=pruneSelection(state.doc,view.selectedKeys).filter(k=>k.layer===selected);
 const stop=()=>{if(raf.current!==null){cancelAnimationFrame(raf.current);raf.current=null;}setPlaying(false);};
 useEffect(()=>()=>{if(raf.current!==null)cancelAnimationFrame(raf.current);},[]);
 const toggle=()=>{
  if(raf.current!==null){stop();return;}
  const startAt=at;const t0=performance.now();setPlaying(true);
  const tick=(now:number)=>{
   const {comp:c,loop}=live.current;const r=playbackAt(startAt,now-t0,c.workArea,c.fps,loop);
   animationSession().setView({playhead:r.tick});
   if(r.ended){raf.current=null;setPlaying(false);return;}
   raf.current=requestAnimationFrame(tick);
  };
  raf.current=requestAnimationFrame(tick);
 };
 const step=(d:number)=>{stop();animationSession().setView({playhead:frameToTick(frame+d,comp.fps)});};
 const tickAtX=(x:number)=>{const r=rulerRef.current!.getBoundingClientRect();return snapToFrame(comp.start+Math.min(1,Math.max(0,(x-r.left)/Math.max(1,r.width)))*comp.duration,comp.fps);};
 const scrub=(e:PointerEvent<HTMLElement>)=>{
  stop();const el=e.currentTarget;el.setPointerCapture(e.pointerId);animationSession().setView({playhead:tickAtX(e.clientX)});
  const move=(ev:globalThis.PointerEvent)=>animationSession().setView({playhead:tickAtX(ev.clientX)});
  const up=()=>{el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);};
  el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);
 };
 const dragWorkEdge=(edge:'in'|'out')=>(e:PointerEvent<HTMLButtonElement>)=>{
  e.stopPropagation();const target=e.currentTarget;target.setPointerCapture(e.pointerId);let moved=false;
  const move=(ev:globalThis.PointerEvent)=>{
   const tk=tickAtX(ev.clientX);const w=comp.workArea;moved=true;
   try{animationSession().previewEdits([{type:'workarea.set',in:edge==='in'?tk:w.in,out:edge==='out'?tk:w.out}]);}catch{/* keep last valid */}
  };
  const finish=(commit:boolean)=>{target.removeEventListener('pointermove',move);target.removeEventListener('pointerup',up);target.removeEventListener('keydown',key);
   if(moved&&commit)animationSession().commitPreview();else animationSession().cancelPreview();};
  const up=()=>finish(true);const key=(ev:KeyboardEvent)=>{if(ev.key==='Escape')finish(false);};
  target.addEventListener('pointermove',move);target.addEventListener('pointerup',up);target.addEventListener('keydown',key);
 };
 const nudgeEdge=(edge:'in'|'out')=>(e:ReactKeyboardEvent<HTMLButtonElement>)=>{
  const d=e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:0;if(!d)return;e.preventDefault();
  const w=comp.workArea;const tk=frameToTick(tickToFrame(edge==='in'?w.in:w.out,comp.fps)+d*(e.shiftKey?10:1),comp.fps);
  run('animation.workarea.set',{inT:edge==='in'?tk:w.in,outT:edge==='out'?tk:w.out});
 };
 const dragKey=(ref:KeyRef)=>(e:PointerEvent<HTMLButtonElement>)=>{
  if(e.button!==0)return;e.stopPropagation();
  const target=e.currentTarget;target.setPointerCapture(e.pointerId);
  const additive=e.shiftKey||e.ctrlKey||e.metaKey;const was=sel.some(k=>sameKey(k,ref));
  let group=was?sel:clickSelect(sel,ref,additive);
  if(!was)animationSession().selectKeys(group);
  const from=ref.t;let moved=false;let applied=0;
  const move=(ev:globalThis.PointerEvent)=>{
   const delta=tickAtX(ev.clientX)-from;if(delta===0&&!moved)return;
   try{animationSession().previewEdits([{type:'keys.move',keys:group,delta}]);moved=true;applied=frameToTick(Math.round(delta*comp.fps.num/(comp.fps.den*240000)),comp.fps);}catch{/* collision or range: keep last valid preview */}
  };
  const finish=(commit:boolean)=>{
   target.removeEventListener('pointermove',move);target.removeEventListener('pointerup',up);target.removeEventListener('keydown',key);
   if(moved&&commit){animationSession().commitPreview();animationSession().selectKeys(shiftSelection(group,applied));animationSession().setView({playhead:from+applied});return;}
   animationSession().cancelPreview();
   if(!commit)return;
   if(was){group=additive?sel.filter(k=>!sameKey(k,ref)):[ref];animationSession().selectKeys(group);}
   if(!additive)animationSession().setView({playhead:from});
  };
  const up=()=>finish(true);const key=(ev:KeyboardEvent)=>{if(ev.key==='Escape')finish(false);};
  target.addEventListener('pointermove',move);target.addEventListener('pointerup',up);target.addEventListener('keydown',key);
 };
 const keyDown=(ref:KeyRef)=>(e:ReactKeyboardEvent<HTMLButtonElement>)=>{
  const d=e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:0;
  if(d){e.preventDefault();e.stopPropagation();if(!sel.some(k=>sameKey(k,ref)))animationSession().selectKeys([ref]);run('animation.keys.nudge',{ticks:frameToTick(d*(e.shiftKey?10:1),comp.fps)});}
  else if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();animationSession().selectKeys(clickSelect(sel,ref,e.shiftKey||e.ctrlKey||e.metaKey));animationSession().setView({playhead:ref.t});}
 };
 /** Marquee on empty lane space. Hit testing uses the rendered key buttons, so it matches what the user sees. */
 const [box,setBox]=useState<Box|null>(null);
 const startMarquee=(e:PointerEvent<HTMLDivElement>)=>{
  if(e.button!==0||(e.target as HTMLElement).closest('button'))return;
  const root=lanesRef.current;if(!root)return;const origin=root.getBoundingClientRect();
  const el=e.currentTarget;el.setPointerCapture(e.pointerId);
  const additive=e.shiftKey||e.ctrlKey||e.metaKey;const base=sel;
  const x0=e.clientX,y0=e.clientY;let dragged=false;
  if(!additive)animationSession().selectKeys([]);
  const rectOf=(ev:globalThis.PointerEvent)=>({l:Math.min(x0,ev.clientX),r:Math.max(x0,ev.clientX),t:Math.min(y0,ev.clientY),b:Math.max(y0,ev.clientY)});
  const move=(ev:globalThis.PointerEvent)=>{
   if(!dragged&&Math.hypot(ev.clientX-x0,ev.clientY-y0)<4)return;dragged=true;
   const r=rectOf(ev);setBox({x0:r.l-origin.left+root.scrollLeft,y0:r.t-origin.top+root.scrollTop,x1:r.r-origin.left+root.scrollLeft,y1:r.b-origin.top+root.scrollTop});
   const hit:KeyRef[]=[];
   root.querySelectorAll<HTMLElement>('[data-key-t]').forEach(b=>{
    const bb=b.getBoundingClientRect();
    if(rectsOverlap(r,{l:bb.left,r:bb.right,t:bb.top,b:bb.bottom}))hit.push({layer:b.dataset.keyLayer!,prop:b.dataset.keyProp as TransformKey,t:Number(b.dataset.keyT)});
   });
   animationSession().selectKeys(marqueeSelect(base,hit,additive));
  };
  const up=()=>{el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);setBox(null);};
  el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);
 };
 const onKeyDown=(e:ReactKeyboardEvent<HTMLElement>)=>{
  if((e.target as HTMLElement).closest('input,select,textarea'))return;
  const mod=e.ctrlKey||e.metaKey;const k=e.key.toLowerCase();
  if((e.key==='Delete'||e.key==='Backspace')&&!mod){if(sel.length){e.preventDefault();run('animation.keys.delete');}}
  else if(mod&&k==='c'){e.preventDefault();if(sel.length)run('animation.keys.copy');}
  else if(mod&&k==='x'){e.preventDefault();if(sel.length)run('animation.keys.cut');}
  else if(mod&&k==='v'){e.preventDefault();run('animation.keys.paste');}
  else if(mod&&k==='a'){e.preventDefault();run('animation.keys.selectAll');}
  else if(!mod&&!e.altKey&&k==='b'){run('animation.workarea.in');}
  else if(!mod&&!e.altKey&&k==='n'){run('animation.workarea.out');}
  else if(e.key==='Escape'&&sel.length){animationSession().selectKeys([]);}
 };
 const wa=comp.workArea;const layer=comp.layers.find(l=>l.id===selected);
 const animated=layer?TRANSFORM_KEYS.filter(k=>layer.transform[k].keys.length>0):[];
 return <section tabIndex={0} onKeyDown={onKeyDown} className="flex max-h-[55%] min-h-[150px] shrink-0 flex-col border-t border-subtle text-xs outline-none focus-visible:ring-1 focus-visible:ring-accent" style={{height:view.graph?300:240}} aria-label={t('animation.timeline')} data-testid="animation-timeline">
  <div className="flex flex-wrap items-center gap-1 border-b border-subtle px-2 py-1">
   <Button size="row" aria-label={t('animation.undo')} disabled={!canUndo} onClick={()=>run('animation.edit.undo')}><Undo2/></Button>
   <Button size="row" aria-label={t('animation.redo')} disabled={!canRedo} onClick={()=>run('animation.edit.redo')}><Redo2/></Button>
   <Button size="compact" aria-label={t('animation.step.back')} onClick={()=>step(-1)}>‹</Button>
   <Button size="row" aria-label={playing?t('animation.pause'):t('animation.play')} onClick={toggle} data-testid="animation-play">{playing?<Pause/>:<Play/>}</Button>
   <Button size="compact" aria-label={t('animation.step.forward')} onClick={()=>step(1)}>›</Button>
   <Button size="tiny" variant={view.loop?'outline':'ghost'} aria-pressed={view.loop} onClick={()=>run('animation.playback.loop')} data-testid="animation-loop">{t('animation.timeline.loop')}</Button>
   <output className="ml-1 font-mono text-ink" data-testid="animation-timecode">{timecode(at,comp.fps)}</output>
   <input type="range" className="ml-2 min-w-[80px] flex-1" min={0} max={frames} step={1} value={frame} aria-label={t('animation.timeline.scrub')} aria-valuetext={timecode(at,comp.fps)} onChange={e=>{stop();animationSession().setView({playhead:frameToTick(Number(e.target.value),comp.fps)});}}/>
   <span className="ml-2 flex items-center gap-1" role="group" aria-label={t('animation.workarea')}>
    <Button size="tiny" variant="outline" onClick={()=>run('animation.workarea.in')} title={`${t('animation.workarea.setIn')} (B)`} data-testid="animation-wa-in">{t('animation.workarea.in')}</Button>
    <Button size="tiny" variant="outline" onClick={()=>run('animation.workarea.out')} title={`${t('animation.workarea.setOut')} (N)`} data-testid="animation-wa-out">{t('animation.workarea.out')}</Button>
    <Button size="tiny" variant="ghost" onClick={()=>run('animation.workarea.reset')} data-testid="animation-wa-reset">{t('animation.workarea.reset')}</Button>
   </span>
   <span className="ml-auto flex items-center gap-1" role="group" aria-label={t('animation.ease.group')}>
    {sel.length>0&&EASES.map(p=><Button key={p} size="tiny" variant="ghost" onClick={()=>run('animation.keys.ease',{preset:p})} data-testid={`animation-ease-${p}`}>{t(EASE_LABEL[p])}</Button>)}
    <Button size="tiny" variant={view.graph?'outline':'ghost'} aria-pressed={view.graph} onClick={()=>run('animation.graph.toggle')} data-testid="animation-graph-toggle">{t('animation.graph')}</Button>
   </span>
  </div>
  <div className="grid grid-cols-[180px_1fr] items-center border-b border-subtle">
   <span className="px-2 py-1 text-ink-3" data-testid="animation-wa-label">{t('animation.workarea.range',{from:timecode(wa.in,comp.fps),to:timecode(wa.out,comp.fps)})}</span>
   <div ref={rulerRef} className="relative h-5 cursor-col-resize" onPointerDown={scrub} data-testid="animation-ruler">
    <div className="pointer-events-none absolute inset-y-0 rounded-sm bg-accent-soft" style={{left:pct(wa.in,comp),width:`${(wa.out-wa.in)/comp.duration*100}%`}} data-testid="animation-workarea"/>
    {(['in','out'] as const).map(edge=><button key={edge} type="button" className="absolute top-0 h-5 w-2 -translate-x-1/2 cursor-ew-resize rounded-sm border border-line bg-accent-fill" style={{left:pct(wa[edge],comp)}}
     aria-label={t(edge==='in'?'animation.workarea.handleIn':'animation.workarea.handleOut')} aria-valuetext={timecode(wa[edge],comp.fps)} onPointerDown={dragWorkEdge(edge)} onKeyDown={nudgeEdge(edge)} data-testid={`animation-wa-handle-${edge}`}/>)}
    <div className="pointer-events-none absolute inset-y-0 w-px bg-ink" style={{left:pct(at,comp)}}/>
   </div>
  </div>
  {view.graph?<GraphEditor comp={comp} layerId={selected} sel={sel} playhead={at}/>:
  <div className="relative min-h-0 flex-1 overflow-auto" role="list" ref={lanesRef}>
   {comp.layers.map(l=><div key={l.id} role="listitem" className="border-b border-subtle">
    <div className={`grid grid-cols-[180px_1fr] items-center ${l.id===selected?'bg-hover':''}`}>
     <div className="flex items-center gap-1 px-2 py-1">
      <button type="button" aria-label={t('animation.layer.visible')} aria-pressed={l.visible} className="text-ink-2" onClick={()=>run('animation.layer.update',{layer:l.id,visible:!l.visible})}>{l.visible?<Eye className="size-3"/>:<EyeOff className="size-3"/>}</button>
      <button type="button" aria-label={t('animation.layer.locked')} aria-pressed={l.locked} className="text-ink-2" onClick={()=>run('animation.layer.update',{layer:l.id,locked:!l.locked})}>{l.locked?<Lock className="size-3"/>:<Unlock className="size-3"/>}</button>
      <button type="button" aria-current={l.id===selected} className="min-w-0 flex-1 truncate text-left text-ink" onClick={()=>animationSession().setView({selectedLayer:l.id})}>{l.name}</button>
     </div>
     <div className="relative h-5">
      <div className="absolute top-1 h-3 rounded-sm bg-accent-fill opacity-70" style={{left:pct(l.inT,comp),width:`${Math.max(0,(l.outT-l.inT)/comp.duration*100)}%`}}/>
     </div>
    </div>
    {l.id===selected&&animated.map(k=><div key={k} className="grid grid-cols-[180px_1fr] items-center" data-testid={`animation-keyrow-${k}`}>
     <span className="px-2 py-1 pl-6 text-ink-3">{t(PROP_LABEL[k])}</span>
     <div className="relative h-5 touch-none" data-lane onPointerDown={startMarquee}>
      {l.transform[k].keys.map((key,ki)=>{const ref:KeyRef={layer:l.id,prop:k,t:key.t};const on=sel.some(x=>sameKey(x,ref));
       return <button key={ki} type="button" className={`absolute top-0.5 size-3 -translate-x-1/2 rotate-45 border ${on?'border-ink bg-ink ring-2 ring-accent':'border-line bg-accent-fill'}`} style={{left:pct(key.t,comp)}} disabled={l.locked}
        data-key-layer={l.id} data-key-prop={k} data-key-t={key.t} aria-pressed={on} data-selected={on||undefined}
        aria-label={t('animation.key.at',{time:timecode(key.t,comp.fps)})} onPointerDown={dragKey(ref)} onKeyDown={keyDown(ref)}/>;})}
     </div></div>)}
   </div>)}
   <div className="pointer-events-none absolute inset-y-0 left-[180px] right-0" aria-hidden="true">
    <div className="absolute inset-y-0 bg-black/20" style={{left:0,width:pct(wa.in,comp)}}/>
    <div className="absolute inset-y-0 bg-black/20" style={{left:pct(wa.out,comp),right:0}}/>
    <div className="absolute inset-y-0 w-px bg-ink" style={{left:pct(at,comp)}} data-testid="animation-playhead"/>
   </div>
   {box&&<div className="pointer-events-none absolute border border-accent bg-accent-soft" style={{left:box.x0,top:box.y0,width:box.x1-box.x0,height:box.y1-box.y0}} data-testid="animation-marquee"/>}
  </div>}
  <div className="sr-only" aria-live="polite">{timecode(at,comp.fps)}{sel.length>0?` ${t('animation.keys.selected',{count:sel.length})}`:''}</div>
 </section>;
}
