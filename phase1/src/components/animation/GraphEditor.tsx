import {useEffect,useId,useLayoutEffect,useRef,useState,type KeyboardEvent as ReactKeyboardEvent,type PointerEvent} from 'react';
import {animationSession} from '../../lib/animation/session';
import type {Edit} from '../../lib/animation/edit';
import {PROP_META,TRANSFORM_KEYS,type Composition,type KeyRef,type TransformKey} from '../../lib/animation/model';
import {channelOf,curveSamples,handleToEase,handlesOf,niceStep,valueRange,type Handle} from '../../lib/animation/graph';
import {clickSelect,sameKey,shiftSelection} from '../../lib/animation/selection';
import {frameToTick,timecode} from '../../lib/animation/time';
import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
import {fmt,PROP_LABEL} from './format';
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
 const {t}=useT();const clip=useId();
 const layer=comp.layers.find(l=>l.id===layerId);
 const animated=layer?TRANSFORM_KEYS.filter(k=>layer.transform[k].keys.length>0):[];
 const view=animationSession().getState().view;
 const active=animated.find(k=>k===view.openProps[0])??animated[0];
 const wrap=useRef<HTMLDivElement>(null);const svgRef=useRef<SVGSVGElement>(null);const size=useSize(wrap);
 const frozen=useRef<{min:number;max:number}|null>(null);
 useEffect(()=>{frozen.current=null;},[active,layerId]);
 if(!layer||!active)return <div className="grid min-h-0 flex-1 place-items-center p-3 text-ink-3" data-testid="animation-graph-empty">{t(layer?'animation.graph.empty':'animation.graph.noLayer')}</div>;
 const prop=layer.transform[active];const keys=prop.keys;
 const ch:0|1=prop.type==='vec2'&&view.graphChannel===1?1:0;
 const w=size.w,h=size.h;const t0=comp.start,t1=comp.start+comp.duration;
 const range=frozen.current??valueRange(keys,ch);
 const pw=Math.max(10,w-PAD.l-PAD.r),ph=Math.max(10,h-PAD.t-PAD.b);
 const xOf=(tk:number)=>PAD.l+(tk-t0)/(t1-t0)*pw;
 const yOf=(v:number)=>PAD.t+(1-(v-range.min)/(range.max-range.min))*ph;
 const local=(cx:number,cy:number)=>{const r=svgRef.current!.getBoundingClientRect();return {x:cx-r.left,y:cy-r.top};};
 const tOf=(x:number)=>t0+(x-PAD.l)/pw*(t1-t0);
 const vOf=(y:number)=>range.min+(1-(y-PAD.t)/ph)*(range.max-range.min);
 const step=niceStep(range.max-range.min,Math.max(2,Math.floor(ph/34)));
 const grid:number[]=[];for(let v=Math.ceil(range.min/step)*step;v<=range.max+1e-9;v+=step)grid.push(Math.round(v/step)*step);
 const samples=curveSamples(prop,ch,t0,t1,Math.min(300,Math.max(40,Math.floor(pw/3))));
 const other=prop.type==='vec2'?curveSamples(prop,ch===0?1:0,t0,t1,Math.min(300,Math.max(40,Math.floor(pw/3)))):null;
 const pts=(s:{t:number;v:number}[])=>s.map(p=>`${xOf(p.t).toFixed(1)},${yOf(p.v).toFixed(1)}`).join(' ');
 const selHere=sel.filter(k=>k.layer===layer.id&&k.prop===active);
 const sess=animationSession();
 /** Pointer drag with Escape to cancel. `commit=false` on cancel. */
 const startDrag=(e:PointerEvent<SVGElement>,move:(ev:globalThis.PointerEvent)=>void,end:(commit:boolean,moved:boolean)=>void)=>{
  e.stopPropagation();const el=e.currentTarget;el.setPointerCapture(e.pointerId);frozen.current=valueRange(keys,ch);
  const x0=e.clientX,y0=e.clientY;let moved=false;
  const mv=(ev:globalThis.PointerEvent)=>{if(!moved&&Math.hypot(ev.clientX-x0,ev.clientY-y0)<3)return;moved=true;move(ev);};
  const done=(commit:boolean)=>{el.removeEventListener('pointermove',mv);el.removeEventListener('pointerup',up);window.removeEventListener('keydown',esc,true);frozen.current=null;end(commit,moved);};
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
 const handleDown=(i:number,hd:Handle)=>(e:PointerEvent<SVGElement>)=>{
  if(e.button!==0)return;const k=keys[i];
  startDrag(e,ev=>{
   const p=local(ev.clientX,ev.clientY);const ease=handleToEase(keys,i,hd.kind,tOf(p.x),vOf(p.y),ch);
   try{sess.previewEdits([{type:'key.interp',layer:layer.id,prop:active,t:k.t,interp:k.interp,...(hd.kind==='out'?{out:ease}:{in:ease})}]);}catch{/* keep last valid */}
  },(commit,moved)=>{if(moved&&commit)sess.commitPreview();else sess.cancelPreview();});
 };
 const handleKey=(i:number,hd:Handle)=>(e:ReactKeyboardEvent<SVGElement>)=>{
  const dx=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0,dy=e.key==='ArrowUp'?1:e.key==='ArrowDown'?-1:0;if(!dx&&!dy)return;
  e.preventDefault();e.stopPropagation();const k=keys[i];const cur=hd.kind==='out'?k.out:k.in;const s=e.shiftKey?0.1:0.01;
  const next:readonly [number,number]=[Math.min(1,Math.max(0,cur[0]+dx*s)),Math.min(3,Math.max(-2,cur[1]+dy*s))];
  try{sess.dispatch({type:'key.interp',layer:layer.id,prop:active,t:k.t,interp:k.interp,...(hd.kind==='out'?{out:next}:{in:next})});}catch{/* locked layer */}
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
   {animated.map(k=><button key={k} type="button" aria-pressed={k===active} className={`block w-full truncate rounded-sm px-2 py-1 text-left ${k===active?'bg-hover text-ink':'text-ink-3'}`} onClick={()=>sess.setView({openProps:[k]})} data-testid={`animation-graph-prop-${k}`}>{t(PROP_LABEL[k])}</button>)}
   {prop.type==='vec2'&&<div className="mt-1 flex gap-1 px-1" role="group" aria-label={t('animation.graph.channel')}>
    {([0,1] as const).map(c=><Button key={c} size="tiny" variant={ch===c?'outline':'ghost'} aria-pressed={ch===c} onClick={()=>sess.setView({graphChannel:c})} data-testid={`animation-graph-channel-${c}`}>{t(c===0?'animation.prop.x':'animation.prop.y')}</Button>)}
   </div>}
  </div>
  <div ref={wrap} className="relative min-h-0 overflow-hidden">
   <svg ref={svgRef} width={w} height={h} role="group" aria-label={t('animation.graph.label',{name:t(PROP_LABEL[active])})} className="block touch-none select-none" data-testid="animation-graph-svg">
    <defs><clipPath id={clip}><rect x={PAD.l} y={PAD.t} width={pw} height={ph}/></clipPath></defs>
    <rect x={PAD.l} y={PAD.t} width={pw} height={ph} fill="var(--bg-panel)" onPointerDown={scrubDown} data-testid="animation-graph-plot"/>
    {grid.map(v=><g key={v}><line x1={PAD.l} x2={PAD.l+pw} y1={yOf(v)} y2={yOf(v)} stroke="var(--border-subtle)" strokeWidth={1}/><text x={PAD.l-6} y={yOf(v)+3} textAnchor="end" fontSize={9} fill="var(--text-tertiary)">{fmt(v)}</text></g>)}
    <rect x={PAD.l} y={PAD.t} width={Math.max(0,xOf(comp.workArea.in)-PAD.l)} height={ph} fill="rgba(0,0,0,.18)" pointerEvents="none"/>
    <rect x={xOf(comp.workArea.out)} y={PAD.t} width={Math.max(0,PAD.l+pw-xOf(comp.workArea.out))} height={ph} fill="rgba(0,0,0,.18)" pointerEvents="none"/>
    <g clipPath={`url(#${clip})`} pointerEvents="none">
     {other&&<polyline points={pts(other)} fill="none" stroke="var(--text-tertiary)" strokeWidth={1} strokeDasharray="4 3" data-testid="animation-graph-other"/>}
     <polyline points={pts(samples)} fill="none" stroke="var(--accent)" strokeWidth={2} data-testid="animation-graph-curve"/>
    </g>
    <line x1={xOf(playhead)} x2={xOf(playhead)} y1={PAD.t} y2={PAD.t+ph} stroke="var(--text-primary)" strokeWidth={1} pointerEvents="none" data-testid="animation-graph-playhead"/>
    <text x={PAD.l} y={h-3} fontSize={9} fill="var(--text-tertiary)">{timecode(t0,comp.fps)}</text>
    <text x={PAD.l+pw} y={h-3} textAnchor="end" fontSize={9} fill="var(--text-tertiary)">{timecode(t1,comp.fps)}</text>
    {selHere.flatMap(r=>{const i=keys.findIndex(k=>k.t===r.t);if(i<0)return [];const k=keys[i];
     return handlesOf(keys,i,ch).map(hd=><g key={`${hd.kind}-${r.t}`}>
      <line x1={xOf(k.t)} y1={yOf(channelOf(k.v,ch))} x2={xOf(hd.t)} y2={yOf(hd.v)} stroke="var(--text-secondary)" strokeWidth={1}/>
      <circle cx={xOf(hd.t)} cy={yOf(hd.v)} r={5} fill="var(--bg-elevated)" stroke="var(--accent)" strokeWidth={2} tabIndex={layer.locked?-1:0} role="slider" aria-label={t(hd.kind==='out'?'animation.graph.handleOut':'animation.graph.handleIn',{time:timecode(k.t,comp.fps)})}
       aria-valuetext={`${fmt(hd.x)}, ${fmt(hd.y)}`} aria-valuenow={hd.x} aria-valuemin={0} aria-valuemax={1} style={{cursor:layer.locked?'default':'grab',touchAction:'none'}}
       onPointerDown={layer.locked?undefined:handleDown(i,hd)} onKeyDown={layer.locked?undefined:handleKey(i,hd)} data-testid={`animation-graph-handle-${hd.kind}`}/></g>);})}
    {keys.map((k,i)=>{const ref:KeyRef={layer:layer.id,prop:active,t:k.t};const on=sel.some(x=>sameKey(x,ref));const cx=xOf(k.t),cy=yOf(channelOf(k.v,ch));
     return <g key={i} transform={`translate(${cx} ${cy})`} tabIndex={layer.locked?-1:0} role="button" aria-pressed={on} aria-label={t('animation.graph.key',{time:timecode(k.t,comp.fps),value:fmt(channelOf(k.v,ch))})}
      style={{cursor:layer.locked?'default':'grab',touchAction:'none'}} onPointerDown={layer.locked?undefined:keyDown(k,ref)} onKeyDown={layer.locked?undefined:pointKey(ref,k)} data-testid="animation-graph-key" data-selected={on||undefined} data-key-index={i}>
      <rect x={-8} y={-8} width={16} height={16} fill="transparent"/>
      <rect x={-4.5} y={-4.5} width={9} height={9} transform="rotate(45)" fill={on?'var(--text-primary)':'var(--accent-fill)'} stroke={on?'var(--accent)':'var(--border-default)'} strokeWidth={on?2:1}/></g>;})}
   </svg>
  </div>
 </div>;
}
type Keyframe2=import('../../lib/animation/model').Keyframe;
