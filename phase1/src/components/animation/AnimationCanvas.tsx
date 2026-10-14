import {useEffect,useMemo,useRef,type PointerEvent} from 'react';
import {Sparkles,Play,Pause,Undo2,Redo2,Eye,EyeOff,Lock,Unlock} from '../../lib/icons';
import {studioContextStore} from '../../lib/shell/studioContext';
import {registerAnimationCommands} from '../../lib/animation/commands';
import {animationSession,useAnimationState} from '../../lib/animation/session';
import {findComp,TRANSFORM_KEYS,type Composition,type Layer} from '../../lib/animation/model';
import {sceneAt} from '../../lib/animation/scene';
import {frameToTick,snapToFrame,tickToFrame,timecode} from '../../lib/animation/time';
import {executeCommand} from '../../lib/commands';
import {useT} from '../../lib/useT';
import {FileTabs} from '../FileTabs';
import {StudioEmptyState} from '../studios/StudioEmptyState';
import {Button} from '../ui/button';
import {PROP_LABEL} from './format';
const run=(id:string,params?:unknown)=>void executeCommand(id,params);
const pct=(t:number,c:Composition)=>`${Math.min(100,Math.max(0,(t-c.start)/c.duration*100))}%`;
/** Canvas of the Animation studio: viewer above a timeline, or a starter when no composition is open. */
export function AnimationCanvas(){
 const {t}=useT();const s=useAnimationState();const doc=s.preview??s.doc;
 const claim=useRef<ReturnType<typeof studioContextStore.claim>|null>(null);
 useEffect(()=>registerAnimationCommands(),[]);
 useEffect(()=>{const owner=studioContextStore.claim('animation',undefined);claim.current=owner;return()=>{animationSession().suspend();owner.release();claim.current=null;};},[]);
 useEffect(()=>{
  const d=s.doc;
  claim.current?.report({document:d?{id:d.id,kind:'animation',dirty:s.dirty,readOnly:false}:undefined,
   selection:s.view.selectedLayer?{kind:'one',count:1,type:'layer',ids:[s.view.selectedLayer]}:{kind:'none',count:0,ids:[]},
   data:{playhead:s.view.playhead,layers:d?findComp(d)?.layers.length??0:0},busy:false,services:{ready:!!d,renderSetup:s.renderSetup}});
 },[s.doc,s.dirty,s.view.selectedLayer,s.view.playhead,s.renderSetup]);
 return <main className="center" aria-label={t('animation.title')}><div className="workspace"><section className="code-pane flex min-h-0 flex-col" aria-label={t('animation.title')}>
  <FileTabs/>
  {doc?<Workspace doc={doc}/>:<StudioEmptyState studio="animation" icon={<Sparkles/>}
   onOpen={()=>{if(!animationSession().recover())throw new Error(t('animation.start.restoreEmpty'));}}
   onCreate={()=>executeCommand('animation.project.new')}/>}
 </section></div></main>;
}
function Workspace({doc}:{doc:NonNullable<ReturnType<typeof animationSession>['document']>}){
 const {t}=useT();const s=useAnimationState();const comp=findComp(doc)!;const at=s.view.playhead;
 return <div className="flex min-h-0 flex-1 flex-col" data-testid="animation-workspace">
  <Viewer comp={comp} at={at} selected={s.view.selectedLayer}/>
  {s.recoveryFailed&&<p role="alert" className="m-0 px-3 py-1 text-[11px] text-ink">{t('animation.recoveryFailed')}</p>}
  <Timeline comp={comp} at={at} selected={s.view.selectedLayer} canUndo={s.canUndo} canRedo={s.canRedo}/>
 </div>;
}
function layerNode(l:Layer){
 const src=l.source;
 if(l.kind==='solid')return <rect x={0} y={0} width={src.width} height={src.height} fill={src.color}/>;
 if(l.kind==='shape')return src.shape==='ellipse'?<ellipse cx={(src.width??0)/2} cy={(src.height??0)/2} rx={(src.width??0)/2} ry={(src.height??0)/2} fill={src.color}/>:<rect x={0} y={0} width={src.width} height={src.height} fill={src.color}/>;
 return <text x={0} y={src.size??48} fontSize={src.size} fill={src.color} fontFamily="system-ui, sans-serif" style={{userSelect:'none'}}>{src.text}</text>;
}
function Viewer({comp,at,selected}:{comp:Composition;at:number;selected:string|null}){
 const {t}=useT();const scene=useMemo(()=>sceneAt(comp,at),[comp,at]);
 return <div className="grid min-h-[160px] flex-1 place-items-center overflow-hidden bg-hover p-3" data-testid="animation-viewer">
  <svg role="img" aria-label={t('animation.viewer')} viewBox={`0 0 ${comp.width} ${comp.height}`} className="max-h-full max-w-full" style={{aspectRatio:`${comp.width}/${comp.height}`,height:'100%'}}>
   <rect width={comp.width} height={comp.height} fill={comp.background}/>
   {scene.map(({layer,matrix,opacity})=><g key={layer.id} transform={`matrix(${matrix.join(' ')})`} opacity={opacity} data-layer={layer.id} data-selected={layer.id===selected||undefined}
    onPointerDown={()=>animationSession().setView({selectedLayer:layer.id})}>{layerNode(layer)}</g>)}
  </svg></div>;
}
function Timeline({comp,at,selected,canUndo,canRedo}:{comp:Composition;at:number;selected:string|null;canUndo:boolean;canRedo:boolean}){
 const {t}=useT();const play=useRef<number|null>(null);const barRef=useRef<HTMLDivElement>(null);
 const frames=Math.max(1,tickToFrame(comp.duration,comp.fps));const frame=tickToFrame(at,comp.fps);
 const stop=()=>{if(play.current!==null){cancelAnimationFrame(play.current);play.current=null;}};
 useEffect(()=>stop,[]);
 const toggle=()=>{
  if(play.current!==null){stop();return;}
  const startAt=at>=comp.start+comp.duration?comp.start:at;const t0=performance.now();
  const tick=(now:number)=>{
   const f=Math.floor((now-t0)/1000*comp.fps.num/comp.fps.den);const next=frameToTick(tickToFrame(startAt,comp.fps)+f,comp.fps);
   if(next>=comp.start+comp.duration){animationSession().setView({playhead:comp.start+comp.duration});stop();return;}
   animationSession().setView({playhead:next});play.current=requestAnimationFrame(tick);
  };play.current=requestAnimationFrame(tick);
 };
 const step=(d:number)=>{stop();animationSession().setView({playhead:frameToTick(frame+d,comp.fps)});};
 const tickAtX=(x:number)=>{const r=barRef.current!.getBoundingClientRect();return snapToFrame(comp.start+Math.min(1,Math.max(0,(x-r.left)/Math.max(1,r.width)))*comp.duration,comp.fps);};
 const dragKey=(layer:string,prop:string,from:number)=>(e:PointerEvent<HTMLButtonElement>)=>{
  const target=e.currentTarget;target.setPointerCapture(e.pointerId);let moved=false;let to=from;
  const move=(ev:globalThis.PointerEvent)=>{to=tickAtX(ev.clientX);if(to===from&&!moved)return;moved=true;try{animationSession().previewEdits([{type:'key.move',layer,prop:prop as never,from,to}]);}catch{/* collision: keep last valid preview */}};
  const finish=(commit:boolean)=>{target.removeEventListener('pointermove',move);target.removeEventListener('pointerup',up);target.removeEventListener('keydown',key);
   if(moved&&commit)animationSession().commitPreview();else animationSession().cancelPreview();
   animationSession().setView({playhead:commit&&moved?to:from,selectedKey:{prop,t:commit&&moved?to:from}});};
  const up=()=>finish(true);const key=(ev:KeyboardEvent)=>{if(ev.key==='Escape')finish(false);};
  target.addEventListener('pointermove',move);target.addEventListener('pointerup',up);target.addEventListener('keydown',key);
 };
 return <section className="flex max-h-[45%] min-h-[150px] shrink-0 flex-col border-t border-subtle text-xs" style={{height:240}} aria-label={t('animation.timeline')} data-testid="animation-timeline">
  <div className="flex items-center gap-1 border-b border-subtle px-2 py-1">
   <Button size="row" aria-label={t('animation.undo')} disabled={!canUndo} onClick={()=>run('animation.edit.undo')}><Undo2/></Button>
   <Button size="row" aria-label={t('animation.redo')} disabled={!canRedo} onClick={()=>run('animation.edit.redo')}><Redo2/></Button>
   <Button size="compact" aria-label={t('animation.step.back')} onClick={()=>step(-1)}>‹</Button>
   <Button size="row" aria-label={play.current!==null?t('animation.pause'):t('animation.play')} onClick={toggle} data-testid="animation-play">{play.current!==null?<Pause/>:<Play/>}</Button>
   <Button size="compact" aria-label={t('animation.step.forward')} onClick={()=>step(1)}>›</Button>
   <output className="ml-2 font-mono text-ink" data-testid="animation-timecode">{timecode(at,comp.fps)}</output>
   <input type="range" className="ml-3 min-w-0 flex-1" min={0} max={frames} step={1} value={frame} aria-label={t('animation.timeline.scrub')} aria-valuetext={timecode(at,comp.fps)} onChange={e=>{stop();animationSession().setView({playhead:frameToTick(Number(e.target.value),comp.fps)});}}/>
  </div>
  <div className="min-h-0 flex-1 overflow-auto" role="list">
   {comp.layers.map(l=><div key={l.id} role="listitem" className="border-b border-subtle">
    <div className={`grid grid-cols-[180px_1fr] items-center ${l.id===selected?'bg-hover':''}`}>
     <div className="flex items-center gap-1 px-2 py-1">
      <button type="button" aria-label={t('animation.layer.visible')} aria-pressed={l.visible} className="text-ink-2" onClick={()=>run('animation.layer.update',{layer:l.id,visible:!l.visible})}>{l.visible?<Eye className="size-3"/>:<EyeOff className="size-3"/>}</button>
      <button type="button" aria-label={t('animation.layer.locked')} aria-pressed={l.locked} className="text-ink-2" onClick={()=>run('animation.layer.update',{layer:l.id,locked:!l.locked})}>{l.locked?<Lock className="size-3"/>:<Unlock className="size-3"/>}</button>
      <button type="button" aria-current={l.id===selected} className="min-w-0 flex-1 truncate text-left text-ink" onClick={()=>animationSession().setView({selectedLayer:l.id})}>{l.name}</button>
     </div>
     <div className="relative h-5" ref={l.id===selected?barRef:undefined}>
      <div className="absolute top-1 h-3 rounded-sm bg-accent-fill opacity-70" style={{left:pct(l.inT,comp),width:`${Math.max(0,(l.outT-l.inT)/comp.duration*100)}%`}}/>
     </div>
    </div>
    {l.id===selected&&TRANSFORM_KEYS.filter(k=>l.transform[k].keys.length>0).map(k=><div key={k} className="grid grid-cols-[180px_1fr] items-center" data-testid={`animation-keyrow-${k}`}>
     <span className="px-2 py-1 pl-6 text-ink-3">{t(PROP_LABEL[k])}</span>
     <div className="relative h-5" ref={barRef}>
      {l.transform[k].keys.map(key=><button key={key.t} type="button" className="absolute top-0.5 size-3 -translate-x-1/2 rotate-45 border border-line bg-accent-fill" style={{left:pct(key.t,comp)}} disabled={l.locked}
       aria-label={t('animation.key.at',{time:timecode(key.t,comp.fps)})} onClick={()=>animationSession().setView({playhead:key.t,selectedKey:{prop:k,t:key.t}})} onPointerDown={dragKey(l.id,k,key.t)}/>)}
     </div></div>)}
   </div>)}
  </div>
  <div className="sr-only" aria-live="polite">{timecode(at,comp.fps)}</div>
 </section>;
}
