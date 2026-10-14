import {useEffect,useRef,useState,type KeyboardEvent as ReactKeyboardEvent,type PointerEvent} from 'react';
import {KeyStretch} from './KeyStretch';
import {styleKeyShiftEdits} from '../../lib/animation/edit';
import {styleKeyLanes,pruneStyleKeys,keysInRect,toggleStyleKey,type StyleLaneId} from '../../lib/animation/keyLanes';
import {Play,Pause,Undo2,Redo2,Eye,EyeOff,Lock,Unlock,ZoomIn,ZoomOut,ArrowUp,ArrowDown,ArrowUpDown,EyeOff as ShyIcon,ChevronDown,ChevronRight,ChevronsUpDown} from '../../lib/icons';
import {animationSession,useAnimationState} from '../../lib/animation/session';
import {NativeInput,NativeSelect} from '../ui/native-controls';
import {TRANSFORM_KEYS,wouldCycle,type Composition,type KeyRef,type TransformKey} from '../../lib/animation/model';
import {playbackAt} from '../../lib/animation/playback';
import {AudioPreview,browserAudioContext} from '../../lib/animation/audioPreview';
import {audioSignature,withPrecompAudio} from '../../lib/animation/audioTiming';
import {AudioWaveform} from './AudioWaveform';
import {clickSelect,marqueeSelect,pruneSelection,rectsOverlap,sameKey,shiftSelection} from '../../lib/animation/selection';
import {frameToTick,snapToFrame,tickToFrame,timecode} from '../../lib/animation/time';
import {executeCommand} from '../../lib/commands';
import {trackHeightOf,useTrackHeights,reorderIndex,setShyHidden,useShyHidden,edgeScroll,revealTick,snapTargets,snapTick,timeWindow,useTimelineSnap,setTimelineSnap} from '../../lib/animation/timelineView';
import {clearLayerSet,layerSetIds,toggleLayerInSet,useLayerSet} from '../../lib/animation/layerSet';
import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
import {EASE_LABEL,EASES,PROP_LABEL} from './format';
import {MaskLanes} from './MaskLanes';
import {GraphEditor} from './GraphEditor';
const run=(id:string,params?:unknown)=>void executeCommand(id,params);
interface Box{x0:number;y0:number;x1:number;y1:number}
/** Timeline of the Animation studio: transport, work area, layer bars, key lanes with marquee selection, or the graph editor. */
export function AnimationTimeline({comp,at,selected,canUndo,canRedo}:{comp:Composition;at:number;selected:string|null;canUndo:boolean;canRedo:boolean}){
 const {t}=useT();const state=useAnimationState();const view=state.view; const layerSet=useLayerSet();const [stagger,setStagger]=useState(2);const [staggerTiming,setStaggerTiming]=useState(true);
 const rulerRef=useRef<HTMLDivElement>(null);const lanesRef=useRef<HTMLDivElement>(null);
 const win=timeWindow(comp,view.zoom,view.scroll);const pc=(t:number)=>`${(t-win.t0)/win.span*100}%`;const snapOn=useTimelineSnap();const shyOff=useShyHidden();useTrackHeights();const [drop,setDrop]=useState<{over:string;after:boolean}|null>(null);const inWin=(t:number)=>t>=win.t0&&t<=win.t0+win.span;
 /** Left and width in percent of a tick range, clipped to the visible window. */
 const bar=(a:number,b:number)=>{const l=Math.max(0,(a-win.t0)/win.span*100),r=Math.min(100,(b-win.t0)/win.span*100);return {left:`${l}%`,width:`${Math.max(0,r-l)}%`};};const sectionRef=useRef<HTMLElement>(null);
 const frames=Math.max(1,tickToFrame(comp.duration,comp.fps));const frame=tickToFrame(at,comp.fps);
 const [playing,setPlaying]=useState(false);const [keepWorld,setKeepWorld]=useState(false);const raf=useRef<number|null>(null);
 const live=useRef({comp,loop:view.loop});live.current={comp,loop:view.loop};
 const sel=pruneSelection(state.doc,view.selectedKeys).filter(k=>k.layer===selected);
 const styleSel=pruneStyleKeys(comp.layers,view.styleKeys).filter(k=>k.layer===selected);const isStyleSel=(lane:StyleLaneId,tk:number)=>styleSel.some(k=>k.lane===lane&&k.t===tk);
 const audio=useRef<AudioPreview|null>(null);if(!audio.current)audio.current=new AudioPreview(browserAudioContext);
 const gen=useRef(0);const [audioNote,setAudioNote]=useState('');const sig=audioSignature(state.doc,comp);const sigAtStart=useRef('');
 const stop=()=>{gen.current++;audio.current?.stop();if(raf.current!==null){cancelAnimationFrame(raf.current);raf.current=null;}setPlaying(false);};
 useEffect(()=>()=>{gen.current++;audio.current?.dispose();if(raf.current!==null)cancelAnimationFrame(raf.current);},[]);
 /** Editing audio while it plays would leave scheduled sources stale. Pause instead of drifting out of sync. */
 useEffect(()=>{if(playing&&sigAtStart.current&&sig!==sigAtStart.current){stop();setAudioNote(t('animation.audio.paused'));}// eslint-disable-next-line react-hooks/exhaustive-deps
 },[sig]);
/** Ctrl or Cmd with the wheel zooms around the pointer; Shift with the wheel or a sideways wheel scrolls. Needs a non-passive listener to stop page zoom. */
 useEffect(()=>{
  const el=sectionRef.current;if(!el)return;
  const onWheel=(e:WheelEvent)=>{
   const r=rulerRef.current?.getBoundingClientRect();if(!r)return;const c=live.current.comp;const v=animationSession().getState().view;const w=timeWindow(c,v.zoom,v.scroll);
   if(e.ctrlKey||e.metaKey){e.preventDefault();const anchor=w.t0+Math.min(1,Math.max(0,(e.clientX-r.left)/Math.max(1,r.width)))*w.span;void executeCommand('animation.timeline.zoom',{mode:e.deltaY<0?'in':'out',anchor});return;}
   const d=e.shiftKey?e.deltaY:e.deltaX;if(d&&w.zoom>1){e.preventDefault();animationSession().setView({scroll:timeWindow(c,w.zoom,w.scroll+d/Math.max(1,r.width)*w.span).scroll});}
  };
  el.addEventListener('wheel',onWheel,{passive:false});return()=>el.removeEventListener('wheel',onWheel);
 },[]);
 /** While playing in a zoomed view the window follows the playhead. */
 useEffect(()=>{if(playing&&win.zoom>1){const sc=revealTick(comp,win,at);if(sc!==win.scroll)animationSession().setView({scroll:sc});}// eslint-disable-next-line react-hooks/exhaustive-deps
 },[at,playing]);
 const toggle=async()=>{
  if(raf.current!==null||playing){stop();return;}
  const token=++gen.current;const startAt=at;setAudioNote('');sigAtStart.current=sig;let useAudio=false;
  if(state.doc){try{useAudio=(await audio.current!.start(state.doc,withPrecompAudio(comp,state.doc.compositions),startAt,view.loop))!==null;}catch{setAudioNote(t('animation.audio.unavailable'));}}
  if(token!==gen.current){audio.current!.stop();return;}
  const t0=performance.now();setPlaying(true);
  const tick=(now:number)=>{
   const {comp:c,loop}=live.current;const r=playbackAt(startAt,useAudio?audio.current!.elapsedMs():now-t0,c.workArea,c.fps,loop);
   if(useAudio)audio.current!.poll();
   animationSession().setView({playhead:r.tick});
   if(r.ended){audio.current?.stop();raf.current=null;setPlaying(false);return;}
   raf.current=requestAnimationFrame(tick);
  };
  raf.current=requestAnimationFrame(tick);
 };
 const step=(d:number)=>{stop();animationSession().setView({playhead:frameToTick(frame+d,comp.fps)});};
 /** Tick under a pointer x. Snaps to markers, work-area edges and the playhead (Alt turns it off), then to a whole frame. */
 const tickAtX=(x:number,o:{free?:boolean;exclude?:readonly number[]}={})=>{
  const r=rulerRef.current!.getBoundingClientRect();const v=animationSession().getState().view;const lw=timeWindow(live.current.comp,v.zoom,v.scroll);const raw=lw.t0+Math.min(1,Math.max(0,(x-r.left)/Math.max(1,r.width)))*lw.span;
  const near=snapOn&&!o.free?snapTick(raw,snapTargets(comp,at,o.exclude),lw.span/Math.max(1,r.width)):raw;
  return snapToFrame(Math.min(comp.start+comp.duration,Math.max(comp.start,near)),comp.fps);
 };
 /** While a drag is held near the left or right edge of a zoomed track, the view scrolls with it. */
 const autoScroll=(x:number)=>{
  const r=rulerRef.current?.getBoundingClientRect();if(!r)return;const c=live.current.comp;const v=animationSession().getState().view;const w=timeWindow(c,v.zoom,v.scroll);
  const sc=edgeScroll(c,w,(x-r.left)/Math.max(1,r.width));if(sc!==w.scroll)animationSession().setView({scroll:sc});
 };
 /**
  * Keeps a drag scrolling while the pointer rests near an edge: the track scrolls sideways, the lane list up and down.
  * `again` re-evaluates the drag with the last pointer event after each scroll. Call `stop` when the drag ends.
  */
 const holdEdge=(again:(ev:globalThis.PointerEvent)=>void)=>{
  let last:globalThis.PointerEvent|null=null,raf=0,on=true;
  const frame=()=>{
   if(!on)return;raf=requestAnimationFrame(frame);if(!last)return;
   const before=animationSession().getState().view.scroll;autoScroll(last.clientX);
   let moved=animationSession().getState().view.scroll!==before;
   const lanes=lanesRef.current;if(lanes){const r=lanes.getBoundingClientRect();const band=24;const dy=last.clientY<r.top+band?-1:last.clientY>r.bottom-band?1:0;
    if(dy){const was=lanes.scrollTop;lanes.scrollTop+=dy*12;if(lanes.scrollTop!==was)moved=true;}}
   if(moved)again(last);
  };
  raf=requestAnimationFrame(frame);
  return {track:(ev:globalThis.PointerEvent)=>{last=ev;},stop:()=>{on=false;cancelAnimationFrame(raf);}};
 };
 const scrub=(e:PointerEvent<HTMLElement>)=>{
  stop();const el=e.currentTarget;el.setPointerCapture(e.pointerId);const go=(ev:globalThis.PointerEvent|PointerEvent<HTMLElement>)=>animationSession().setView({playhead:tickAtX(ev.clientX,{free:ev.altKey,exclude:[at]})});go(e);
  const hold=holdEdge(ev=>go(ev));const move=(ev:globalThis.PointerEvent)=>{hold.track(ev);autoScroll(ev.clientX);go(ev);};
  const up=()=>{hold.stop();el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);};
  el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);
 };
const marquee=(e:PointerEvent<SVGSVGElement>)=>{
  if(e.button!==0||!selected||e.target!==e.currentTarget)return;const layerId=selected,el=e.currentTarget,a={x:e.clientX,y:e.clientY},keep=e.shiftKey?styleSel:[];
  el.setPointerCapture(e.pointerId);
  const pick=(ev:globalThis.PointerEvent)=>{const cands=[...(sectionRef.current?.querySelectorAll<SVGElement>('[data-style-key-t]')??[])].map(n=>{const r=n.getBoundingClientRect();return {lane:n.dataset.styleLane as StyleLaneId,t:Number(n.dataset.styleKeyT),x:r.x+r.width/2,y:r.y+r.height/2};});
   const hit=keysInRect(cands,a,{x:ev.clientX,y:ev.clientY}).map(k=>({layer:layerId,...k}));
   animationSession().setView({styleKeys:[...keep,...hit.filter(h=>!keep.some(k=>k.lane===h.lane&&k.t===h.t))]});};
  const up=(ev:globalThis.PointerEvent)=>{el.removeEventListener('pointermove',pick);el.removeEventListener('pointerup',up);pick(ev);};
  if(!e.shiftKey)animationSession().setView({styleKeys:[]});
  el.addEventListener('pointermove',pick);el.addEventListener('pointerup',up);
 };
 const dragStyleKey=(lane:StyleLaneId,from:number)=>(e:PointerEvent<SVGElement>)=>{
  if(e.button!==0||!selected)return;e.stopPropagation();const el=e.currentTarget,layerId=selected;
  if(e.shiftKey){animationSession().setView({styleKeys:toggleStyleKey(styleSel,{layer:layerId,lane,t:from})});return;}
  el.setPointerCapture(e.pointerId);
  const group=styleSel.length>1&&isStyleSel(lane,from)?styleSel:[{layer:layerId,lane,t:from}];
  animationSession().setView({playhead:from,styleKeys:group});let moved=false,to=from;
  const mv=(ev:globalThis.PointerEvent)=>{const tk=tickAtX(ev.clientX,{free:ev.altKey});if(tk===to)return;
   try{animationSession().previewEdits(styleKeyShiftEdits(layerId,group,tk-from));moved=true;to=tk;}catch{/* collision: keep the last valid preview */}};
  const done=(commit:boolean)=>{el.removeEventListener('pointermove',mv);el.removeEventListener('pointerup',up);window.removeEventListener('keydown',esc,true);
   if(moved&&commit){animationSession().commitPreview();animationSession().setView({playhead:to,styleKeys:group.map(k=>({...k,t:k.t+to-from}))});}else animationSession().cancelPreview();};
  const up=()=>done(true);const esc=(ev:globalThis.KeyboardEvent)=>{if(ev.key==='Escape'){ev.stopPropagation();done(false);}};
  el.addEventListener('pointermove',mv);el.addEventListener('pointerup',up);window.addEventListener('keydown',esc,true);
 };
 const dragWorkEdge=(edge:'in'|'out')=>(e:PointerEvent<HTMLButtonElement>)=>{
  e.stopPropagation();const target=e.currentTarget;target.setPointerCapture(e.pointerId);let moved=false;
  const move=(ev:globalThis.PointerEvent)=>{
   const tk=tickAtX(ev.clientX,{free:ev.altKey,exclude:[comp.workArea.in,comp.workArea.out]});const w=comp.workArea;moved=true;
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
  const hold=holdEdge(ev=>move(ev,true));
  const move=(ev:globalThis.PointerEvent,fromHold=false)=>{
   if(!fromHold){hold.track(ev);autoScroll(ev.clientX);}const delta=tickAtX(ev.clientX,{free:ev.altKey,exclude:[...group.map(k=>k.t),at]})-from;if(delta===0&&!moved)return;
   try{animationSession().previewEdits([{type:'keys.move',keys:group,delta}]);moved=true;applied=frameToTick(Math.round(delta*comp.fps.num/(comp.fps.den*240000)),comp.fps);}catch{/* collision or range: keep last valid preview */}
  };
  const finish=(commit:boolean)=>{
   hold.stop();target.removeEventListener('pointermove',move);target.removeEventListener('pointerup',up);target.removeEventListener('keydown',key);
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
  const hold=holdEdge(ev=>move(ev,true));
  const move=(ev:globalThis.PointerEvent,fromHold=false)=>{
   if(!fromHold)hold.track(ev);
   if(!dragged&&Math.hypot(ev.clientX-x0,ev.clientY-y0)<4)return;dragged=true;
   const r=rectOf(ev);setBox({x0:r.l-origin.left+root.scrollLeft,y0:r.t-origin.top+root.scrollTop,x1:r.r-origin.left+root.scrollLeft,y1:r.b-origin.top+root.scrollTop});
   const hit:KeyRef[]=[];
   root.querySelectorAll<HTMLElement>('[data-key-t]').forEach(b=>{
    const bb=b.getBoundingClientRect();
    if(rectsOverlap(r,{l:bb.left,r:bb.right,t:bb.top,b:bb.bottom}))hit.push({layer:b.dataset.keyLayer!,prop:b.dataset.keyProp as TransformKey,t:Number(b.dataset.keyT)});
   });
   animationSession().selectKeys(marqueeSelect(base,hit,additive));
  };
  const up=()=>{hold.stop();el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);setBox(null);};
  el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);
 };
 /** Pointer drag of a layer row by its handle: a line shows where it lands, release is one reorder edit, Escape cancels. */
 const dragLayer=(id:string)=>(e:PointerEvent<HTMLElement>)=>{
  if(e.button!==0)return;e.stopPropagation();const el=e.currentTarget;el.setPointerCapture(e.pointerId);
  let target:{over:string;after:boolean}|null=null;
  const find=(ev:globalThis.PointerEvent)=>{
   const rows=[...(lanesRef.current?.querySelectorAll<HTMLElement>('[data-layer-row]')??[])];if(!rows.length)return null;
   let hit=rows[rows.length-1];for(const r of rows){const b=r.getBoundingClientRect();if(ev.clientY<b.bottom){hit=r;break;}}
   const b=hit.getBoundingClientRect();return {over:hit.dataset.layerRow!,after:ev.clientY>b.top+b.height/2};
  };
  const hold=holdEdge(ev=>move(ev,true));
  const move=(ev:globalThis.PointerEvent,fromHold=false)=>{if(!fromHold)hold.track(ev);target=find(ev);setDrop(target&&reorderIndex(live.current.comp.layers.map(l=>l.id),id,target.over,target.after)!==null?target:null);};
  const finish=(commit:boolean)=>{hold.stop();el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);window.removeEventListener('keydown',esc,true);setDrop(null);
   if(!commit||!target)return;const idx=reorderIndex(live.current.comp.layers.map(l=>l.id),id,target.over,target.after);if(idx!==null)run('animation.layer.reorder',{layer:id,index:idx});};
  const up=()=>finish(true);const esc=(ev:KeyboardEvent)=>{if(ev.key==='Escape'){ev.stopPropagation();finish(false);}};
  el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);window.addEventListener('keydown',esc,true);
 };
 const onKeyDown=(e:ReactKeyboardEvent<HTMLElement>)=>{
  if((e.target as HTMLElement).closest('input,select,textarea'))return;
  const mod=e.ctrlKey||e.metaKey;const k=e.key.toLowerCase();
  if(e.target===e.currentTarget&&!mod&&!e.altKey){
   const to=(tk:number)=>{stop();animationSession().setView({playhead:Math.min(comp.start+comp.duration,Math.max(comp.start,tk))});};
   if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();to(frameToTick(frame+(e.key==='ArrowLeft'?-1:1)*(e.shiftKey?10:1),comp.fps));return;}
   if(e.key==='Home'){e.preventDefault();to(comp.start);return;}
   if(e.key==='End'){e.preventDefault();to(comp.start+comp.duration-frameToTick(1,comp.fps));return;}
   if(e.key==='+'||e.key==='='){e.preventDefault();run('animation.timeline.zoom',{mode:'in'});return;}
   if(e.key==='-'){e.preventDefault();run('animation.timeline.zoom',{mode:'out'});return;}
   if(e.key==='0'){e.preventDefault();run('animation.timeline.zoom',{mode:'fit'});return;}
  }
  if(styleSel.length&&!mod&&!e.altKey&&(e.target as HTMLElement).closest('[data-lane]')&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){e.preventDefault();run('animation.styleKeys.nudge',{frames:(e.key==='ArrowLeft'?-1:1)*(e.shiftKey?10:1)});return;}
  if((e.key==='Delete'||e.key==='Backspace')&&!mod){if(styleSel.length&&!sel.length){e.preventDefault();run('animation.styleKeys.delete');}else if(sel.length){e.preventDefault();run('animation.keys.delete');}}
  else if(mod&&k==='c'){e.preventDefault();if(sel.length)run('animation.keys.copy');}
  else if(mod&&k==='x'){e.preventDefault();if(sel.length)run('animation.keys.cut');}
  else if(mod&&k==='v'){e.preventDefault();run('animation.keys.paste');}
  else if(mod&&k==='a'){e.preventDefault();run('animation.keys.selectAll');}
  else if(!mod&&!e.altKey&&k==='b'){run('animation.workarea.in');}
  else if(!mod&&!e.altKey&&k==='n'){run('animation.workarea.out');}
  else if(e.key==='Escape'&&(sel.length||styleSel.length)){animationSession().selectKeys([]);animationSession().setView({styleKeys:[]});}
 };
 const wa=comp.workArea;const layer=comp.layers.find(l=>l.id===selected);
 const animated=layer?TRANSFORM_KEYS.filter(k=>layer.transform[k].keys.length>0):[];
 return <section ref={sectionRef} tabIndex={0} onKeyDown={onKeyDown} className="flex max-h-[55%] min-h-[150px] shrink-0 flex-col border-t border-subtle text-xs outline-none focus-visible:ring-1 focus-visible:ring-accent" style={{height:view.graph?300:240}} aria-label={t('animation.timeline')} data-testid="animation-timeline">
  <div role="group" aria-label={t('animation.timeline')} className="flex flex-wrap items-center gap-1 border-b border-subtle px-2 py-1">
   <Button size="row" aria-label={t('animation.undo')} disabled={!canUndo} onClick={()=>run('animation.edit.undo')}><Undo2/></Button>
   <Button size="row" aria-label={t('animation.redo')} disabled={!canRedo} onClick={()=>run('animation.edit.redo')}><Redo2/></Button>
   <Button size="compact" aria-label={t('animation.step.back')} onClick={()=>step(-1)}>‹</Button>
   <Button size="row" aria-label={playing?t('animation.pause'):t('animation.play')} onClick={()=>void toggle()} data-testid="animation-play">{playing?<Pause/>:<Play/>}</Button>
   <Button size="compact" aria-label={t('animation.step.forward')} onClick={()=>step(1)}>›</Button>
   <Button size="tiny" variant={view.loop?'outline':'ghost'} aria-pressed={view.loop} onClick={()=>run('animation.playback.loop')} data-testid="animation-loop">{t('animation.timeline.loop')}</Button>
   <span className="flex items-center gap-1" role="group" aria-label={t('animation.timeline.zoom')}>
    <Button size="row" aria-label={t('animation.timeline.zoomOut')} disabled={win.zoom<=1} onClick={()=>run('animation.timeline.zoom',{mode:'out'})} data-testid="animation-zoom-out"><ZoomOut/></Button>
    <Button size="row" aria-label={t('animation.timeline.zoomIn')} disabled={win.zoom>=64} onClick={()=>run('animation.timeline.zoom',{mode:'in'})} data-testid="animation-zoom-in"><ZoomIn/></Button>
    <Button size="tiny" variant="ghost" disabled={win.zoom<=1} onClick={()=>run('animation.timeline.zoom',{mode:'fit'})} data-testid="animation-zoom-fit">{t('animation.timeline.fit')}</Button>
    <Button size="tiny" variant="ghost" onClick={()=>run('animation.timeline.zoom',{mode:'workarea'})} data-testid="animation-zoom-wa">{t('animation.timeline.zoomWorkArea')}</Button>
    <Button size="tiny" variant={snapOn?'outline':'ghost'} aria-pressed={snapOn} title={t('animation.timeline.snapHint')} onClick={()=>run('animation.timeline.snap',{on:!snapOn})} data-testid="animation-snap">{t('animation.timeline.snap')}</Button>
    <Button size="tiny" variant="ghost" onClick={()=>run('animation.timeline.tracks',{mode:'collapse'})} data-testid="animation-tracks-collapse"><ChevronsUpDown className="size-3"/>{t('animation.timeline.collapseAll')}</Button>
    <Button size="tiny" variant="ghost" onClick={()=>run('animation.timeline.tracks',{mode:'expand'})} data-testid="animation-tracks-expand">{t('animation.timeline.expandAll')}</Button>
    <Button size="tiny" variant={shyOff?'outline':'ghost'} aria-pressed={shyOff} title={t('animation.timeline.hideShyHint')} onClick={()=>run('animation.timeline.shy',{hide:!shyOff})} data-testid="animation-hide-shy">{t('animation.timeline.hideShy')}</Button>
    {win.zoom>1&&<NativeInput type="range" className="w-24" min={0} max={Math.max(1,comp.duration-win.span)} step={Math.max(1,Math.round(win.span/50))} value={win.scroll} aria-label={t('animation.timeline.scroll')} onChange={e=>animationSession().setView({scroll:Number(e.target.value)})} data-testid="animation-scroll"/>}
   </span>
   <output className="ml-1 font-mono text-ink" data-testid="animation-timecode">{timecode(at,comp.fps)}</output>
   <input type="range" className="ml-2 min-w-[80px] flex-1" min={0} max={frames} step={1} value={frame} aria-label={t('animation.timeline.scrub')} aria-valuetext={timecode(at,comp.fps)} onChange={e=>{stop();animationSession().setView({playhead:frameToTick(Number(e.target.value),comp.fps)});}}/>
   <span className="ml-2 flex items-center gap-1" role="group" aria-label={t('animation.workarea')}>
    <Button size="tiny" variant="outline" onClick={()=>run('animation.workarea.in')} title={`${t('animation.workarea.setIn')} (B)`} data-testid="animation-wa-in">{t('animation.workarea.in')}</Button>
    <Button size="tiny" variant="outline" onClick={()=>run('animation.workarea.out')} title={`${t('animation.workarea.setOut')} (N)`} data-testid="animation-wa-out">{t('animation.workarea.out')}</Button>
    <Button size="tiny" variant="ghost" onClick={()=>run('animation.workarea.reset')} data-testid="animation-wa-reset">{t('animation.workarea.reset')}</Button>
   </span>
   <label className="ml-2 flex items-center gap-1 text-ink-3"><NativeInput type="checkbox" className="animation-checkbox" checked={keepWorld} onChange={e=>setKeepWorld(e.target.checked)} data-testid="animation-parent-keepworld"/>{t('animation.parent.keepWorld')}</label>
   {layerSetIds(selected).length>0&&<Button size="tiny" variant="outline" onClick={()=>run('animation.precomp.make',{})} title={t('animation.precomp.make.hint')} data-testid="animation-precomp-make">{t('animation.precomp.make')}</Button>}
   {layerSetIds(selected).length>1&&<span className="flex items-center gap-1" role="group" aria-label={t('animation.stagger.frames')} title={t('animation.stagger.hint')}>
    <NativeInput type="number" min={-600} max={600} step={1} className="h-5 w-12 rounded-sm border border-subtle bg-transparent px-1 text-xs text-ink-2" aria-label={t('animation.stagger.frames')} value={stagger} onChange={e=>setStagger(Math.max(-600,Math.min(600,Math.round(Number(e.target.value)||0))))} data-testid="animation-stagger-frames"/>
    <label className="flex items-center gap-1 text-ink-3"><NativeInput type="checkbox" className="animation-checkbox" checked={staggerTiming} onChange={e=>setStaggerTiming(e.target.checked)} data-testid="animation-stagger-timing"/>{t('animation.stagger.timing')}</label>
    <Button size="tiny" variant="outline" onClick={()=>run('animation.layers.stagger',{frames:stagger,layers:layerSetIds(selected),timing:staggerTiming})} data-testid="animation-stagger-apply">{t('animation.stagger.apply')}</Button></span>}
   <span className="ml-auto flex items-center gap-1" role="group" aria-label={t('animation.ease.group')}>
    {sel.length>0&&<Button size="tiny" variant="ghost" onClick={()=>run('animation.keys.bounce')} data-testid="animation-bounce">{t('animation.bounce.apply')}</Button>}
    {sel.length>0&&<Button size="tiny" variant="ghost" onClick={()=>run('animation.keys.elastic')} data-testid="animation-elastic">{t('animation.elastic.apply')}</Button>}
    {sel.length>0&&EASES.map(p=><Button key={p} size="tiny" variant="ghost" onClick={()=>run('animation.keys.ease',{preset:p})} data-testid={`animation-ease-${p}`}>{t(EASE_LABEL[p])}</Button>)}
    <Button size="tiny" variant={view.graph?'outline':'ghost'} aria-pressed={view.graph} onClick={()=>run('animation.graph.toggle')} data-testid="animation-graph-toggle">{t('animation.graph')}</Button>
   </span>
  </div>
  <div className="grid grid-cols-[280px_1fr] items-center border-b border-subtle">
   <span className="px-2 py-1 text-ink-3" data-testid="animation-wa-label">{t('animation.workarea.range',{from:timecode(wa.in,comp.fps),to:timecode(wa.out,comp.fps)})}</span>
   <div ref={rulerRef} className="relative h-5 cursor-col-resize" onPointerDown={scrub} data-testid="animation-ruler">
    <div className="pointer-events-none absolute inset-y-0 rounded-sm bg-accent-soft" style={bar(wa.in,wa.out)} data-testid="animation-workarea"/>
    {(['in','out'] as const).filter(edge=>inWin(wa[edge])).map(edge=><button key={edge} type="button" className="absolute top-0 h-5 w-2 -translate-x-1/2 cursor-ew-resize rounded-sm border border-line bg-accent-fill" style={{left:pc(wa[edge])}}
     aria-label={t(edge==='in'?'animation.workarea.handleIn':'animation.workarea.handleOut')} aria-valuetext={timecode(wa[edge],comp.fps)} onPointerDown={dragWorkEdge(edge)} onKeyDown={nudgeEdge(edge)} data-testid={`animation-wa-handle-${edge}`}/>)}
    {inWin(at)&&<div className="pointer-events-none absolute inset-y-0 w-px bg-ink" style={{left:pc(at)}}/>}
   </div>
  </div>
  <div className="flex max-h-16 shrink-0 flex-wrap items-center gap-1 overflow-auto border-b border-subtle px-2 py-1" role="group" aria-label={t('animation.markers.title')}>
   <Button size="tiny" variant="ghost" onClick={()=>run('animation.marker.add',{label:timecode(at,comp.fps)})}>{t('animation.markers.add')}</Button>
   <KeyStretch count={sel.length}/>
   <Button size="tiny" variant="ghost" disabled={sel.length===0||!(comp.markers??[]).length} title={t('animation.keys.quantize.hint')} onClick={()=>run('animation.keys.quantize')} data-testid="animation-keys-quantize">{t('animation.keys.quantize')}</Button>
   <Button size="tiny" variant="ghost" disabled={!(comp.markers??[]).some(m=>m.t<at)} onClick={()=>animationSession().setView({playhead:Math.max(...(comp.markers??[]).filter(m=>m.t<at).map(m=>m.t))})}>{t('animation.markers.previous')}</Button>
   <Button size="tiny" variant="ghost" disabled={!(comp.markers??[]).some(m=>m.t>at)} onClick={()=>animationSession().setView({playhead:Math.min(...(comp.markers??[]).filter(m=>m.t>at).map(m=>m.t))})}>{t('animation.markers.next')}</Button>
   <span className="text-ink-3">{t('animation.markers.frame',{frame:Math.floor(at*comp.fps.num/(240000*comp.fps.den))})}</span>
   {(comp.markers??[]).map(m=><span key={m.id} className="flex items-center rounded-sm border border-subtle"><Button size="tiny" variant="ghost" onClick={()=>animationSession().setView({playhead:m.t})}>{m.label} · {timecode(m.t,comp.fps)}</Button><Button size="tiny" variant="ghost" aria-label={t('animation.markers.remove')} onClick={()=>run('animation.marker.remove',{id:m.id})}>×</Button></span>)}
  </div>
  {view.graph?<GraphEditor comp={comp} layerId={selected} sel={sel} playhead={at}/>:
  <div className="relative min-h-0 flex-1 overflow-auto" role="list" ref={lanesRef}>
   {comp.layers.map((l,li)=>shyOff&&l.shy&&l.id!==selected?null:<div key={l.id} role="listitem" data-layer-row={l.id} data-drop={drop?.over===l.id?(drop.after?'after':'before'):undefined} className={`border-b border-subtle ${drop?.over===l.id?(drop.after?'border-b-2 border-b-accent':'border-t-2 border-t-accent'):''}`}>
    <div className={`grid grid-cols-[280px_1fr] items-center ${l.id===selected||layerSet.includes(l.id)?'bg-hover':''}`} data-picked={layerSet.includes(l.id)||undefined}>
     <div className="flex items-center gap-1 px-2 py-1">
      <button type="button" aria-label={t('animation.layer.visible')} aria-pressed={l.visible} className="text-ink-2" onClick={()=>run('animation.layer.update',{layer:l.id,visible:!l.visible})}>{l.visible?<Eye className="size-3"/>:<EyeOff className="size-3"/>}</button>
      <button type="button" aria-label={t('animation.layer.locked')} aria-pressed={l.locked} className="text-ink-2" onClick={()=>run('animation.layer.update',{layer:l.id,locked:!l.locked})}>{l.locked?<Lock className="size-3"/>:<Unlock className="size-3"/>}</button>
      <Button size="tiny" variant="ghost" aria-label={t('animation.layer.track',{name:l.name,height:t(`animation.track.${trackHeightOf(l.id)}`)})} title={t(`animation.track.${trackHeightOf(l.id)}`)} onClick={()=>run('animation.timeline.tracks',{layer:l.id,mode:'cycle'})} data-testid={`animation-track-${l.id}`}>{trackHeightOf(l.id)==='compact'?<ChevronRight className="size-3"/>:<ChevronDown className="size-3"/>}</Button>
      <Button size="tiny" variant="ghost" className="cursor-grab touch-none" aria-label={t('animation.layer.drag',{name:l.name})} onPointerDown={dragLayer(l.id)} data-testid={`animation-layer-drag-${l.id}`}><ArrowUpDown className="size-3"/></Button>
      <Button size="tiny" variant={l.shy?'outline':'ghost'} aria-label={t('animation.layer.shy')} aria-pressed={!!l.shy} onClick={()=>run('animation.layer.update',{layer:l.id,shy:!l.shy})} data-testid={`animation-shy-${l.id}`}><ShyIcon className="size-3"/></Button>
      <Button size="tiny" variant={l.solo?'outline':'ghost'} aria-label={t('animation.layer.solo')} aria-pressed={l.solo} onClick={()=>run('animation.layer.update',{layer:l.id,solo:!l.solo})} data-testid={`animation-solo-${l.id}`}>S</Button>
      <Button size="tiny" variant="ghost" aria-label={t('animation.layer.moveUp',{name:l.name})} disabled={li===0} onClick={()=>run('animation.layer.reorder',{layer:l.id,index:li-1})} data-testid={`animation-layer-up-${l.id}`}><ArrowUp className="size-3"/></Button>
      <Button size="tiny" variant="ghost" aria-label={t('animation.layer.moveDown',{name:l.name})} disabled={li===comp.layers.length-1} onClick={()=>run('animation.layer.reorder',{layer:l.id,index:li+1})} data-testid={`animation-layer-down-${l.id}`}><ArrowDown className="size-3"/></Button>
      <button type="button" aria-current={l.id===selected} className="min-w-0 flex-1 truncate text-left text-ink" onClick={e=>{if((e.shiftKey||e.ctrlKey||e.metaKey)&&selected&&l.id!==selected){toggleLayerInSet(l.id);return;}clearLayerSet();animationSession().setView({selectedLayer:l.id});}}>{l.parent?'↳ ':''}{l.name}{l.kind==='null'?' · Null':''}</button>
      <NativeSelect className="h-5 w-[96px] min-w-0 shrink-0 rounded-sm border border-subtle bg-transparent px-1 text-xs text-ink-2 select-text" aria-label={t('animation.parent.timeline',{name:l.name})} disabled={l.locked} value={l.parent??''} data-testid={`animation-parent-${l.id}`} onChange={e=>run('animation.layer.parent',{layer:l.id,parent:e.target.value||null,keepWorld})}><option value="">{t('animation.parent.none')}</option>{comp.layers.filter(o=>o.id!==l.id&&!wouldCycle(comp,l.id,o.id)).map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</NativeSelect>
     </div>
     <div className={`relative ${trackHeightOf(l.id)==='compact'?'h-4':trackHeightOf(l.id)==='tall'?'h-10':'h-5'}`} data-track-height={trackHeightOf(l.id)}>
      {l.kind==='audio'&&l.audio?<div className="absolute inset-0 overflow-hidden" data-testid="animation-audio-clip"><div className="absolute inset-y-0.5 overflow-hidden rounded-sm bg-accent-soft" style={{left:`${(l.inT+l.offset-win.t0)/win.span*100}%`,width:`${Math.max(0,(l.outT-l.inT)/win.span*100)}%`}}>
       {(a=>a&&<AudioWaveform asset={a} trimIn={l.audio.trimIn} length={l.outT-l.inT} label={t('animation.audio.waveform',{name:a.sourceName})}/>)(state.doc?.audioAssets?.find(x=>x.id===l.audio!.assetId))}</div></div>
      :<div className={`absolute h-3 rounded-sm bg-accent-fill opacity-70 ${trackHeightOf(l.id)==='tall'?'top-3':trackHeightOf(l.id)==='compact'?'top-0.5':'top-1'}`} style={bar(l.inT,l.outT)}/>}
     </div>
    </div>
    {l.id===selected&&trackHeightOf(l.id)!=='compact'&&l.audio&&l.audio.volume.keys.length>0&&<div className="grid grid-cols-[280px_1fr] items-center" data-testid="animation-keyrow-volume">
     <span className="px-2 py-1 pl-6 text-ink-3">{t('animation.audio.volumeLane')}</span>
     <div className="relative h-5">{l.audio.volume.keys.filter(key=>inWin(key.t)).map(key=><Button key={key.t} size="tiny" variant="outline" className="absolute top-0.5 size-3 min-h-0 min-w-0 -translate-x-1/2 rotate-45 bg-accent-fill p-0" style={{left:pc(key.t)}} aria-label={t('animation.audio.volumeKey',{time:timecode(key.t,comp.fps)})} onClick={()=>animationSession().setView({playhead:key.t})} data-volume-key-t={key.t}/>)}</div></div>}
    {l.id===selected&&trackHeightOf(l.id)!=='compact'&&styleKeyLanes(l).map(lane=><div key={lane.id} className="grid grid-cols-[280px_1fr] items-center" data-testid={`animation-keyrow-style-${lane.id}`}>
     <span className="px-2 py-1 pl-6 text-ink-3">{t(lane.labelKey,lane.labelArgs)}</span>
     <svg className="h-5 w-full overflow-visible" data-lane onPointerDown={marquee}>{lane.ticks.map((tk,ki)=>!inWin(tk)?null:<rect key={ki} x={pc(tk)} y={4} width={12} height={12} role="button" tabIndex={0} className={`origin-center -translate-x-1/2 rotate-45 cursor-pointer [transform-box:fill-box] ${tk===at?'fill-ink stroke-accent':isStyleSel(lane.id,tk)?'fill-accent-fill stroke-ink':'fill-accent-fill stroke-line'}`} strokeWidth={tk===at||isStyleSel(lane.id,tk)?2:1} aria-pressed={isStyleSel(lane.id,tk)} aria-label={t('animation.keys.styleKey',{name:t(lane.labelKey),time:timecode(tk,comp.fps)})} onPointerDown={dragStyleKey(lane.id,tk)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();animationSession().setView({playhead:tk,styleKeys:e.shiftKey?toggleStyleKey(styleSel,{layer:l.id,lane:lane.id,t:tk}):[{layer:l.id,lane:lane.id,t:tk}]});}}} data-style-key-t={tk} data-style-lane={lane.id}/>)}</svg></div>)}
    {l.id===selected&&trackHeightOf(l.id)!=='compact'&&animated.map(k=><div key={k} className="grid grid-cols-[280px_1fr] items-center" data-testid={`animation-keyrow-${k}`}>
     <Button size="tiny" variant="ghost" className="justify-start pl-6 text-ink-3" disabled={l.locked} aria-label={t('animation.keys.selectRow',{name:t(PROP_LABEL[k])})} onClick={()=>animationSession().selectKeys(l.transform[k].keys.map(key=>({layer:l.id,prop:k,t:key.t})))} data-testid={`animation-keyrow-label-${k}`}>{t(PROP_LABEL[k])}</Button>
     <div className="relative h-5 touch-none" data-lane onPointerDown={startMarquee}>
      {l.transform[k].keys.map((key,ki)=>{if(!inWin(key.t))return null;const ref:KeyRef={layer:l.id,prop:k,t:key.t};const on=sel.some(x=>sameKey(x,ref));
       return <button key={ki} type="button" className={`absolute top-0.5 size-3 -translate-x-1/2 rotate-45 border ${on?'border-ink bg-ink ring-2 ring-accent':'border-line bg-accent-fill'}`} style={{left:pc(key.t)}} disabled={l.locked}
        data-key-layer={l.id} data-key-prop={k} data-key-t={key.t} aria-pressed={on} data-selected={on||undefined}
        aria-label={t('animation.key.at',{time:timecode(key.t,comp.fps)})} onPointerDown={dragKey(ref)} onKeyDown={keyDown(ref)}/>;})}
     </div></div>)}
    {l.id===selected&&trackHeightOf(l.id)!=='compact'&&l.masks?.length?<MaskLanes comp={comp} layer={l} tickAtX={x=>tickAtX(x)} pct={t=>pc(t)}/>:null}
   </div>)}
   <div className="pointer-events-none absolute inset-y-0 left-[280px] right-0" aria-hidden="true">
    <div className="absolute inset-y-0 bg-black/20" style={bar(win.t0,wa.in)}/>
    <div className="absolute inset-y-0 bg-black/20" style={bar(wa.out,win.t0+win.span)}/>
    {inWin(at)&&<div className="absolute inset-y-0 w-px bg-ink" style={{left:pc(at)}} data-testid="animation-playhead"/>}
   </div>
   {box&&<div className="pointer-events-none absolute border border-accent bg-accent-soft" style={{left:box.x0,top:box.y0,width:box.x1-box.x0,height:box.y1-box.y0}} data-testid="animation-marquee"/>}
  </div>}
  {audioNote&&<p role="status" className="m-0 border-t border-subtle px-2 py-1 text-ink-3" data-testid="animation-audio-note">{audioNote}</p>}
  <div className="sr-only" aria-live="polite">{timecode(at,comp.fps)}{sel.length>0?` ${t('animation.keys.selected',{count:sel.length})}`:''}</div>
 </section>;
}
