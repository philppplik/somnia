import {useEffect,useId,useLayoutEffect,useRef,useState,type KeyboardEvent as ReactKeyboardEvent,type MouseEvent as ReactMouseEvent,type PointerEvent} from 'react';
import {animationSession} from '../../lib/animation/session';
import type {Edit} from '../../lib/animation/edit';
import {PROP_META,TRANSFORM_KEYS,type Composition,type KeyRef,type TransformKey} from '../../lib/animation/model';
import {ZOOM_STEP,fitTargets,graphWindow,panWindow,zoomRange,zoomWindow,timeTicks,windowValueRange} from '../../lib/animation/graphWindow';
import {channelOf,playheadReading,curveSamples,handleToEase,handlesOf,niceStep,valueRange,speedSamples,speedRange,EASE_PRESETS,type Handle} from '../../lib/animation/graph';
import {clickSelect,sameKey,shiftSelection} from '../../lib/animation/selection';
import {evaluate} from '../../lib/animation/interpolate';
import {frameToTick,tickToFrame,timecode} from '../../lib/animation/time';
import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
import {MixedGraph} from './MixedGraph';
import {animatedTargets} from '../../lib/animation/keyTargets';
import {MaskGraph,MaskTargetButtons,maskTargets} from './MaskGraph';
import {setGraphMixed,setGraphTarget,setMaskClip,useMaskSelection} from '../../lib/animation/maskSelection';
import {copyTransformKeys,pasteTransformEdits} from '../../lib/animation/keysClipboard';
import {EaseEditor} from './EaseEditor';
import {mirrorEase,setGraphFit,setGraphMirror,setGraphSnap,snapEase,useGraphTools} from '../../lib/animation/graphTools';
import {EASE_LABEL,EASES,fmt,PROP_LABEL} from './format';
const PAD={l:46,r:12,t:10,b:16};
function useSize(ref:React.RefObject<HTMLElement|null>){
 const [size,setSize]=useState({w:600,h:180});
 useLayoutEffect(()=>{
  const el=ref.current;if(!el)return;
  const read=()=>{const r=el.getBoundingClientRect();if(r.width>0&&r.height>0)setSize({w:Math.round(r.width),h:Math.round(r.height)});};
  read();if(typeof ResizeObserver==='undefined')return;
  const ro=new ResizeObserver(read);ro.observe(el);return()=>ro.disconnect();
 },[ref]);
 return size;
}
const clampTo=(prop:TransformKey,n:number)=>{const m=PROP_META[prop];return Math.min(m.max??Infinity,Math.max(m.min??-Infinity,n));};
/**
 * Value graph of one animated property of the selected layer: evaluated curve per channel, draggable keys (time and value)
 * and draggable ease handles. Units are the property's own, nothing is normalised or relabelled as speed.
 */
export function GraphEditor({comp,layerId,sel,playhead}:{comp:Composition;layerId:string|null;sel:readonly KeyRef[];playhead:number}){
 const {t}=useT();const clip=useId();const gtools=useGraphTools();
 const layer=comp.layers.find(l=>l.id===layerId);
 const msel=useMaskSelection();const gt=layer&&msel.graph&&maskTargets(layer).some(g=>g.mask===msel.graph!.mask&&g.prop===msel.graph!.prop)?msel.graph:null;
 const animated=layer?TRANSFORM_KEYS.filter(k=>layer.transform[k].keys.length>0):[];
 const view=animationSession().getState().view;
 const active=animated.find(k=>k===view.openProps[0])??animated[0];
 const wrap=useRef<HTMLDivElement>(null);const svgRef=useRef<SVGSVGElement>(null);const size=useSize(wrap);
 const frozen=useRef<{min:number;max:number}|null>(null);const frozenWin=useRef<{t0:number;t1:number}|null>(null);
 const [zoom,setZoom]=useState<{t0:number;t1:number}|null>(null);const [vzoom,setVZoom]=useState<{min:number;max:number}|null>(null);const geo=useRef<{t0:number;t1:number;pw:number;start:number;end:number;fps:Composition['fps'];range:{min:number;max:number};ph:number}|null>(null);
 useEffect(()=>{frozen.current=null;frozenWin.current=null;setZoom(null);setVZoom(null);},[active,layerId]);
 useEffect(()=>{setZoom(null);setVZoom(null);},[gtools.fit]);
 /** Ctrl/Cmd+wheel zooms the time axis around the pointer, Shift+wheel pans. A plain wheel is left alone so the page still scrolls. */
 useEffect(()=>{const el=svgRef.current;if(!el)return;
  const on=(e:WheelEvent)=>{const g=geo.current;if(!g||frozenWin.current||(!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey))return;
   e.preventDefault();const r=el.getBoundingClientRect(),win={t0:g.t0,t1:g.t1};
   if(e.altKey){const anchor=g.range.max-(e.clientY-r.top-PAD.t)/g.ph*(g.range.max-g.range.min);setVZoom(zoomRange(g.range,anchor,e.deltaY<0?ZOOM_STEP:1/ZOOM_STEP));return;}
   if(e.ctrlKey||e.metaKey){const anchor=g.t0+(e.clientX-r.left-PAD.l)/g.pw*(g.t1-g.t0);setZoom(zoomWindow(win,anchor,e.deltaY<0?ZOOM_STEP:1/ZOOM_STEP,g.start,g.end,g.fps));}
   else{const d=(e.deltaX||e.deltaY)/g.pw*(g.t1-g.t0);setZoom(panWindow(win,d,g.start,g.end));}};
  el.addEventListener('wheel',on,{passive:false});return()=>el.removeEventListener('wheel',on);},[active,layerId,layer?.id]);
 if(layer&&msel.mixed&&animatedTargets(layer).length)return <MixedGraph comp={comp} layer={layer} playhead={playhead}/>;
 if(layer&&gt)return <MaskGraph comp={comp} layer={layer} target={gt} playhead={playhead}/>;
 if(layer&&!active&&maskTargets(layer).length)return <div className="grid min-h-0 flex-1 grid-cols-[180px_1fr]"><div className="p-1"><MaskTargetButtons layer={layer} active={null}/></div><div className="grid place-items-center p-3 text-ink-3">{t('animation.graph.pickMask')}</div></div>;
 if(!layer||!active)return <div className="grid min-h-0 flex-1 place-items-center p-3 text-ink-3" data-testid="animation-graph-empty">{t(layer?'animation.graph.empty':'animation.graph.noLayer')}</div>;
 const prop=layer.transform[active];const keys=prop.keys;
 const ch:0|1=prop.type==='vec2'&&view.graphChannel===1?1:0;
 const w=size.w,h=size.h;const fitKeys=fitTargets(keys,sel.filter(k=>k.layer===layer.id&&k.prop===active));const win=frozenWin.current??zoom??graphWindow(comp.start,comp.duration,comp.fps,fitKeys,gtools.fit);const {t0,t1}=win;
 const speed=view.graphMode==='speed';
 const range=frozen.current??(vzoom&&!frozenWin.current?vzoom:speed?speedRange(prop,ch,t0,t1):gtools.fit||zoom&&!frozenWin.current?windowValueRange(prop,ch,t0,t1):valueRange(keys,ch));
 const pw=Math.max(10,w-PAD.l-PAD.r),ph=Math.max(10,h-PAD.t-PAD.b);
 geo.current={t0,t1,pw,start:comp.start,end:comp.start+comp.duration,fps:comp.fps,range,ph};
 const xOf=(tk:number)=>PAD.l+(tk-t0)/(t1-t0)*pw;
 const yOf=(v:number)=>PAD.t+(1-(v-range.min)/(range.max-range.min))*ph;
 const local=(cx:number,cy:number)=>{const r=svgRef.current!.getBoundingClientRect();return {x:cx-r.left,y:cy-r.top};};
 const tOf=(x:number)=>t0+(x-PAD.l)/pw*(t1-t0);
 const vOf=(y:number)=>range.min+(1-(y-PAD.t)/ph)*(range.max-range.min);
 const step=niceStep(range.max-range.min,Math.max(2,Math.floor(ph/34)));
 const grid:number[]=[];for(let v=Math.ceil(range.min/step)*step;v<=range.max+1e-9;v+=step)grid.push(Math.round(v/step)*step);
 const samples=(speed?speedSamples:curveSamples)(prop,ch,t0,t1,Math.min(300,Math.max(40,Math.floor(pw/3))));
 const other=prop.type==='vec2'?(speed?speedSamples:curveSamples)(prop,ch===0?1:0,t0,t1,Math.min(300,Math.max(40,Math.floor(pw/3)))):null;
 const pts=(s:{t:number;v:number}[])=>s.map(p=>`${xOf(p.t).toFixed(1)},${yOf(p.v).toFixed(1)}`).join(' ');
 const selHere=sel.filter(k=>k.layer===layer.id&&k.prop===active);
 const sess=animationSession();
 /** Double-click on the curve adds a key there (frame-snapped, value from the curve, so the shape is unchanged); elsewhere it resets the zoom. */
 const addKeyAt=(e:ReactMouseEvent<SVGRectElement>)=>{
  const {x,y}=local(e.clientX,e.clientY),tk=frameToTick(Math.round(tickToFrame(tOf(x),comp.fps)),comp.fps);
  if(!speed&&!layer.locked&&tk>=comp.start&&tk<=comp.start+comp.duration&&!keys.some(k=>k.t===tk)&&Math.abs(yOf(channelOf(evaluate(prop,tk),ch))-y)<=9){try{sess.dispatch({type:'key.add',layer:layer.id,prop:active,t:tk});}catch{/* refused edits keep the graph as it was */}return;}
  setZoom(null);setVZoom(null);
 };
 /** Pointer drag with Escape to cancel. `commit=false` on cancel. */
 const startDrag=(e:PointerEvent<SVGElement>,move:(ev:globalThis.PointerEvent)=>void,end:(commit:boolean,moved:boolean)=>void)=>{
  e.stopPropagation();const el=e.currentTarget;el.setPointerCapture(e.pointerId);frozen.current=gtools.fit?windowValueRange(prop,ch,t0,t1):valueRange(keys,ch);frozenWin.current=win;
  const x0=e.clientX,y0=e.clientY;let moved=false;
  const mv=(ev:globalThis.PointerEvent)=>{if(!moved&&Math.hypot(ev.clientX-x0,ev.clientY-y0)<3)return;moved=true;move(ev);};
  const done=(commit:boolean)=>{el.removeEventListener('pointermove',mv);el.removeEventListener('pointerup',up);window.removeEventListener('keydown',esc,true);frozen.current=null;frozenWin.current=null;end(commit,moved);};
  const up=()=>done(true);const esc=(ev:KeyboardEvent)=>{if(ev.key==='Escape'){ev.stopPropagation();done(false);}};
  el.addEventListener('pointermove',mv);el.addEventListener('pointerup',up);window.addEventListener('keydown',esc,true);
 };
 const scrubDown=(e:PointerEvent<SVGRectElement>)=>{
  const el=e.currentTarget;el.setPointerCapture(e.pointerId);
  const set=(cx:number)=>sess.setView({playhead:Math.min(t1,Math.max(t0,tOf(local(cx,0).x)))});set(e.clientX);
  const mv=(ev:globalThis.PointerEvent)=>set(ev.clientX);const up=()=>{el.removeEventListener('pointermove',mv);el.removeEventListener('pointerup',up);};
  el.addEventListener('pointermove',mv);el.addEventListener('pointerup',up);
 };
 const keyDown=(k:Keyframe2,ref:KeyRef)=>(e:PointerEvent<SVGGElement>)=>{
  if(e.button!==0)return;
  const additive=e.shiftKey||e.ctrlKey||e.metaKey;const was=sel.some(x=>sameKey(x,ref));
  let group=was?[...sel]:clickSelect(sel,ref,additive);if(!was)sess.selectKeys(group);
  const startT=k.t,startV=channelOf(k.v,ch);let applied=0;let moved=false;
  startDrag(e,ev=>{
   const p=local(ev.clientX,ev.clientY);let dt=tOf(p.x)-startT,dv=vOf(p.y)-startV;
   if(ev.shiftKey){if(Math.abs(p.x-local(e.clientX,e.clientY).x)>=Math.abs(p.y-local(e.clientX,e.clientY).y))dv=0;else dt=0;}
   const df=Math.round(dt*comp.fps.num/(comp.fps.den*240000));const delta=frameToTick(df,comp.fps);
   const edits:Edit[]=[];
   if(df!==0)edits.push({type:'keys.move',keys:group,delta});
   if(dv!==0)for(const r of group){
    if(r.layer!==layer.id||r.prop!==active)continue;const key=keys.find(x=>x.t===r.t);if(!key)continue;
    const cur=channelOf(key.v,ch);const nv=clampTo(active,Math.round((cur+dv)*100)/100);
    edits.push({type:'prop.set',layer:layer.id,prop:active,t:r.t+(df!==0?delta:0),value:prop.type==='vec2'?(ch===0?[nv,(key.v as readonly [number,number])[1]]:[(key.v as readonly [number,number])[0],nv]):nv});
   }
   try{sess.previewEdits(edits);applied=df!==0?delta:0;moved=true;}catch{/* range or collision: keep last valid */}
  },(commit,didMove)=>{
   if(didMove&&moved&&commit){sess.commitPreview();sess.selectKeys(shiftSelection(group,applied));sess.setView({playhead:startT+applied});return;}
   sess.cancelPreview();if(!commit)return;
   if(was){group=additive?sel.filter(x=>!sameKey(x,ref)):[ref];sess.selectKeys(group);}
   if(!additive)sess.setView({playhead:startT});
  });
 };
 /** Interp edit for a dragged handle; with mirroring on, the opposite handle of the same key follows in one edit. */
 const handleEdit=(i:number,kind:'in'|'out',ease:readonly [number,number]):Edit=>{
  const k=keys[i];const opp=gtools.mirror?mirrorEase(keys,i,kind,ease,ch,kind==='out'?(k.channelIn?.[ch]??k.in):(k.channelOut?.[ch]??k.out)):null;
  return {type:'key.interp',layer:layer.id,prop:active,t:k.t,interp:k.interp,...(prop.type==='vec2'&&!keys.some(q=>q.sIn||q.sOut)?{channel:ch}:{}),...(kind==='out'?{out:ease,...(opp?{in:opp}:{})}:{in:ease,...(opp?{out:opp}:{})})};
 };
 const handleDown=(i:number,hd:Handle)=>(e:PointerEvent<SVGElement>)=>{
  if(e.button!==0)return;
  startDrag(e,ev=>{
   const p=local(ev.clientX,ev.clientY);let ease=handleToEase(keys,i,hd.kind,tOf(p.x),vOf(p.y),ch);
   if(gtools.snap!==ev.altKey)ease=snapEase(ease);
   try{sess.previewEdits([handleEdit(i,hd.kind,ease)]);}catch{/* keep last valid */}
  },(commit,moved)=>{if(moved&&commit)sess.commitPreview();else sess.cancelPreview();});
 };
 const handleKey=(i:number,hd:Handle)=>(e:ReactKeyboardEvent<SVGElement>)=>{
  const dx=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0,dy=e.key==='ArrowUp'?1:e.key==='ArrowDown'?-1:0;if(!dx&&!dy)return;
  e.preventDefault();e.stopPropagation();const k=keys[i];const cur=hd.kind==='out'?(k.channelOut?.[ch]??k.out):(k.channelIn?.[ch]??k.in);const s=e.shiftKey?0.1:0.01;
  const next:readonly [number,number]=[Math.min(1,Math.max(0,cur[0]+dx*s)),Math.min(3,Math.max(-2,cur[1]+dy*s))];
  try{sess.dispatch(handleEdit(i,hd.kind,next));}catch{/* locked layer */}
 };
 const pointKey=(ref:KeyRef,k:Keyframe2)=>(e:ReactKeyboardEvent<SVGElement>)=>{
  const dx=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0,dy=e.key==='ArrowUp'?1:e.key==='ArrowDown'?-1:0;
  if(e.key==='Enter'||e.key===' '){e.preventDefault();sess.selectKeys(clickSelect(sel,ref,e.shiftKey));sess.setView({playhead:k.t});return;}
  if(!dx&&!dy)return;e.preventDefault();e.stopPropagation();
  if(!sel.some(x=>sameKey(x,ref)))sess.selectKeys([ref]);
  try{
   if(dx){const group=sel.some(x=>sameKey(x,ref))?sel:[ref];const d=frameToTick(dx*(e.shiftKey?10:1),comp.fps);sess.dispatch({type:'keys.move',keys:group,delta:d});sess.selectKeys(shiftSelection(group,d));}
   else{const cur=channelOf(k.v,ch);const nv=clampTo(active,Math.round((cur+dy*step/(e.shiftKey?1:10))*100)/100);
    sess.dispatch({type:'prop.set',layer:layer.id,prop:active,t:k.t,value:prop.type==='vec2'?(ch===0?[nv,(k.v as readonly [number,number])[1]]:[(k.v as readonly [number,number])[0],nv]):nv});}
  }catch{/* locked or out of range */}
 };
 return <div className="grid min-h-0 flex-1 grid-cols-[180px_1fr]" data-testid="animation-graph">
  <div className="min-h-0 overflow-auto border-r border-subtle p-1" role="group" aria-label={t('animation.graph.props')}>
   <div className="mb-1 flex gap-1" role="group" aria-label={t('animation.graph.handleTools')}>
    <Button size="tiny" variant={gtools.snap?'outline':'ghost'} aria-pressed={gtools.snap} onClick={()=>setGraphSnap(!gtools.snap)} data-testid="animation-graph-snap">{t('animation.graph.snap')}</Button>
    <Button size="tiny" variant={gtools.mirror?'outline':'ghost'} aria-pressed={gtools.mirror} onClick={()=>setGraphMirror(!gtools.mirror)} data-testid="animation-graph-mirror">{t('animation.graph.mirror')}</Button>
    <Button size="tiny" variant={gtools.fit?'outline':'ghost'} aria-pressed={gtools.fit} onClick={()=>setGraphFit(!gtools.fit)} title={t('animation.graph.fit.hint')} data-testid="animation-graph-fit">{t('animation.graph.fit')}</Button></div>
   <div className="mb-2 flex gap-1">{(['value','speed'] as const).map(mode=><Button key={mode} size="tiny" variant={view.graphMode===mode?'outline':'ghost'} onClick={()=>sess.setView({graphMode:mode})} data-testid={`animation-graph-mode-${mode}`}>{t(`animation.graph.${mode}`)}</Button>)}</div>
   {sel.length>0&&<div className="mb-2 flex flex-wrap gap-1" role="group" aria-label={t('animation.ease.group')}>
    {EASES.map(p=><Button key={p} size="tiny" variant="ghost" disabled={layer.locked} onPointerEnter={()=>{const e=EASE_PRESETS[p];try{sess.previewEdits([{type:'keys.interp',keys:[...sel],interp:e.interp,...('out'in e?{out:e.out,in:e.in}:{})}]);}catch{/* stale */}}} onPointerLeave={()=>sess.cancelPreview()} onClick={()=>{const e=EASE_PRESETS[p];try{sess.dispatch({type:'keys.interp',keys:[...sel],interp:e.interp,...('out'in e?{out:e.out,in:e.in}:{})});}catch{/* locked layer */}}} data-testid={`animation-graph-ease-${p}`}>{t(EASE_LABEL[p])}</Button>)}
   </div>}
   {sel.length>0&&<EaseEditor layer={layer} sel={sel}/>}
   {prop.type==='vec2'&&<p className="px-2 text-ink-3">{t(keys.some(k=>k.sIn||k.sOut)?'animation.graph.pathEase':'animation.graph.channelEase')}</p>}
   {speed&&<p className="px-2 text-ink-3">{t('animation.graph.unitsSecond')}</p>}
   {animated.map(k=><button key={k} type="button" aria-pressed={k===active} className={`block w-full truncate rounded-sm px-2 py-1 text-left ${k===active?'bg-hover text-ink':'text-ink-3'}`} onClick={()=>{setGraphTarget(null);setGraphMixed(false);sess.setView({openProps:[k]});}} data-testid={`animation-graph-prop-${k}`}>{t(PROP_LABEL[k])}</button>)}
   <MaskTargetButtons layer={layer} active={null}/>
   <div className="mt-1 flex gap-1 px-1"><Button size="tiny" disabled={!selHere.length} onClick={()=>{try{setMaskClip({kind:'keys',keys:copyTransformKeys(layer,active,selHere.map(r=>r.t))});}catch{/* stale */}}} data-testid="animation-graph-keys-copy">{t('animation.masks.copy')}</Button>
    <Button size="tiny" disabled={msel.clip?.kind!=='keys'||layer.locked} onClick={()=>{if(msel.clip?.kind==='keys'){try{sess.dispatch(pasteTransformEdits(layer,active,playhead,msel.clip.keys));}catch{/* other type or range */}}}} data-testid="animation-graph-keys-paste">{t('animation.masks.paste')}</Button></div>
   {prop.type==='vec2'&&<div className="mt-1 flex gap-1 px-1" role="group" aria-label={t('animation.graph.channel')}>
    {([0,1] as const).map(c=><Button key={c} size="tiny" variant={ch===c?'outline':'ghost'} aria-pressed={ch===c} onClick={()=>sess.setView({graphChannel:c})} data-testid={`animation-graph-channel-${c}`}>{t(c===0?'animation.prop.x':'animation.prop.y')}</Button>)}
   </div>}
  </div>
  <div ref={wrap} className="relative min-h-0 overflow-hidden">
   <svg ref={svgRef} width={w} height={h} role="group" aria-label={t('animation.graph.label',{name:t(PROP_LABEL[active])})} className="block touch-none select-none" data-testid="animation-graph-svg">
    <defs><clipPath id={clip}><rect x={PAD.l} y={PAD.t} width={pw} height={ph}/></clipPath></defs>
    <rect x={PAD.l} y={PAD.t} width={pw} height={ph} fill="var(--bg-panel)" onPointerDown={scrubDown} onDoubleClick={addKeyAt} data-testid="animation-graph-plot"/>
    {grid.map(v=><g key={v}><line x1={PAD.l} x2={PAD.l+pw} y1={yOf(v)} y2={yOf(v)} stroke="var(--border-subtle)" strokeWidth={1}/><text x={PAD.l-6} y={yOf(v)+3} textAnchor="end" fontSize={9} fill="var(--text-tertiary)">{fmt(v)}</text></g>)}
    <rect x={PAD.l} y={PAD.t} width={Math.max(0,xOf(comp.workArea.in)-PAD.l)} height={ph} fill="rgba(0,0,0,.18)" pointerEvents="none"/>
    <rect x={xOf(comp.workArea.out)} y={PAD.t} width={Math.max(0,PAD.l+pw-xOf(comp.workArea.out))} height={ph} fill="rgba(0,0,0,.18)" pointerEvents="none"/>
    <g clipPath={`url(#${clip})`} pointerEvents="none">
     {other&&<polyline points={pts(other)} fill="none" stroke="var(--text-tertiary)" strokeWidth={1} strokeDasharray="4 3" data-testid="animation-graph-other"/>}
     <polyline points={pts(samples)} fill="none" stroke="var(--accent)" strokeWidth={2} data-testid="animation-graph-curve"/>
    </g>
    <line x1={xOf(playhead)} x2={xOf(playhead)} y1={PAD.t} y2={PAD.t+ph} stroke="var(--text-primary)" strokeWidth={1} pointerEvents="none" data-testid="animation-graph-playhead"/>
    {(()=>{const rv=playheadReading(prop,ch,playhead,t0,t1,speed);if(rv===null)return null;const px=xOf(playhead),py=Math.min(PAD.t+ph,Math.max(PAD.t,yOf(rv))),left=px>PAD.l+pw-60;
     return <g pointerEvents="none" data-testid="animation-graph-readout"><circle cx={px} cy={py} r={3.5} fill="var(--accent)" stroke="var(--text-primary)" strokeWidth={1}/><text x={left?px-7:px+7} y={Math.max(PAD.t+10,py-6)} textAnchor={left?'end':'start'} fontSize={10} fontWeight={600} fill="var(--text-primary)" data-testid="animation-graph-readout-value">{fmt(rv)}</text></g>;})()}
    {timeTicks(t0,t1,comp.fps,Math.floor(pw/80)).map(tk=><g key={tk} pointerEvents="none" data-testid="animation-graph-timetick"><line x1={xOf(tk)} x2={xOf(tk)} y1={PAD.t} y2={PAD.t+ph} stroke="var(--border-subtle)" strokeWidth={1}/><text x={xOf(tk)} y={h-3} textAnchor={xOf(tk)>PAD.l+pw-30?"end":"middle"} fontSize={9} fill="var(--text-tertiary)">{timecode(tk,comp.fps)}</text></g>)}
    {(comp.markers??[]).filter(m=>m.t>=t0&&m.t<=t1).map(m=><line key={m.id} x1={xOf(m.t)} x2={xOf(m.t)} y1={PAD.t} y2={PAD.t+ph} stroke="var(--warning)" strokeWidth={1.5} strokeDasharray="3 3" pointerEvents="none" data-testid="animation-graph-marker"><title>{m.label}</title></line>)}
    {!speed&&selHere.flatMap(r=>{const i=keys.findIndex(k=>k.t===r.t);if(i<0)return [];const k=keys[i];
     return handlesOf(keys,i,ch).map(hd=><g key={`${hd.kind}-${r.t}`}>
      <line x1={xOf(k.t)} y1={yOf(channelOf(k.v,ch))} x2={xOf(hd.t)} y2={yOf(hd.v)} stroke="var(--text-secondary)" strokeWidth={1}/>
      <circle cx={xOf(hd.t)} cy={yOf(hd.v)} r={5} fill="var(--bg-elevated)" stroke="var(--accent)" strokeWidth={2} tabIndex={layer.locked?-1:0} role="slider" aria-label={t(hd.kind==='out'?'animation.graph.handleOut':'animation.graph.handleIn',{time:timecode(k.t,comp.fps)})}
       aria-valuetext={`${fmt(hd.x)}, ${fmt(hd.y)}`} aria-valuenow={hd.x} aria-valuemin={0} aria-valuemax={1} className={layer.locked?'touch-none cursor-default':'touch-none cursor-grab'}
       onPointerDown={layer.locked?undefined:handleDown(i,hd)} onKeyDown={layer.locked?undefined:handleKey(i,hd)} data-testid={`animation-graph-handle-${hd.kind}`}/></g>);})}
    {!speed&&keys.map((k,i)=>{const ref:KeyRef={layer:layer.id,prop:active,t:k.t};const on=sel.some(x=>sameKey(x,ref));const cx=xOf(k.t),cy=yOf(channelOf(k.v,ch));
     return <g key={i} transform={`translate(${cx} ${cy})`} tabIndex={layer.locked?-1:0} role="button" aria-pressed={on} aria-label={t('animation.graph.key',{time:timecode(k.t,comp.fps),value:fmt(channelOf(k.v,ch))})}
      className={layer.locked?'touch-none cursor-default':'touch-none cursor-grab'} onPointerDown={layer.locked?undefined:keyDown(k,ref)} onKeyDown={layer.locked?undefined:pointKey(ref,k)} data-testid="animation-graph-key" data-selected={on||undefined} data-key-index={i}>
      <rect x={-8} y={-8} width={16} height={16} fill="transparent"/>
      <rect x={-4.5} y={-4.5} width={9} height={9} transform="rotate(45)" fill={on?'var(--text-primary)':'var(--accent-fill)'} stroke={on?'var(--accent)':'var(--border-default)'} strokeWidth={on?2:1}/></g>;})}
   </svg>
  </div>
 </div>;
}
type Keyframe2=import('../../lib/animation/model').Keyframe;
