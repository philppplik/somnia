import {useLayoutEffect,useRef,useState,type KeyboardEvent as ReactKeyboardEvent,type PointerEvent} from 'react';
import {animationSession} from '../../lib/animation/session';
import {curveSamples,EASE_PRESETS} from '../../lib/animation/graph';
import {allTargetKeys,animatedTargets,easeTargetKeys,keyBounds,moveTargetKeys,normalizedValue,propertyOf,pruneTargetKeys,sameTargetKey,targetId,toggleTargetKey,type KeyTarget,type TargetKey} from '../../lib/animation/keyTargets';
import {frameToTick,timecode} from '../../lib/animation/time';
import type {Composition,Layer,Property} from '../../lib/animation/model';
import {setGraphMixed} from '../../lib/animation/maskSelection';
import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
import {EASE_LABEL,EASES,PROP_LABEL} from './format';
const PAD={l:12,r:12,t:10,b:16};
/**
 * One graph for every animated property of a layer, transform and mask alike, each curve on its own 0 to 100 percent scale.
 * Keys can be box-selected across properties and then moved in time or eased together, as one undo step.
 */
export function MixedGraph({comp,layer,playhead}:{comp:Composition;layer:Layer;playhead:number}){
 const {t}=useT();const sess=animationSession();const wrap=useRef<HTMLDivElement>(null);const svgRef=useRef<SVGSVGElement>(null);
 const [size,setSize]=useState({w:600,h:180});const [sel,setSelRaw]=useState<TargetKey[]>([]);const [box,setBox]=useState<{x0:number;y0:number;x1:number;y1:number}|null>(null);
 useLayoutEffect(()=>{const el=wrap.current;if(!el)return;const read=()=>{const r=el.getBoundingClientRect();if(r.width>0&&r.height>0)setSize({w:Math.round(r.width),h:Math.round(r.height)});};read();if(typeof ResizeObserver==='undefined')return;const ro=new ResizeObserver(read);ro.observe(el);return()=>ro.disconnect();},[]);
 const targets=animatedTargets(layer);const live=pruneTargetKeys(layer,sel);
 const name=(g:KeyTarget)=>g.kind==='transform'?t(PROP_LABEL[g.prop]):t('animation.masks.lane',{n:(layer.masks??[]).findIndex(m=>m.id===g.mask)+1,prop:t(`animation.masks.prop.${g.prop}`)});
 const w=size.w,h=size.h,t0=comp.start,t1=comp.start+comp.duration,pw=Math.max(10,w-PAD.l-PAD.r),ph=Math.max(10,h-PAD.t-PAD.b);
 const xOf=(tk:number)=>PAD.l+(tk-t0)/(t1-t0)*pw,tOf=(x:number)=>t0+(x-PAD.l)/pw*(t1-t0);
 const local=(cx:number,cy:number)=>{const r=svgRef.current!.getBoundingClientRect();return {x:cx-r.left,y:cy-r.top};};
 const lanes=targets.map(g=>{const p=propertyOf(layer,g)!;const b=keyBounds(p);const yOf=(v:Property['value'])=>PAD.t+ph*(0.08+0.84*(1-normalizedValue(v,b)));
  return {g,p,yOf,pts:curveSamples(p,0,t0,t1,Math.min(200,Math.max(40,Math.floor(pw/3)))).map(s=>`${xOf(s.t).toFixed(1)},${yOf(s.v).toFixed(1)}`).join(' ')};});
 const setSel=(s:TargetKey[])=>setSelRaw(s);
 const move=(group:readonly TargetKey[],delta:number)=>{try{sess.dispatch(moveTargetKeys(sess.document!,layer.id,group,delta));setSel(group.map(r=>({...r,t:r.t+delta})));}catch{/* collision or locked */}};
 const keyDown=(ref:TargetKey)=>(e:PointerEvent<SVGElement>)=>{
  if(e.button!==0)return;e.stopPropagation();const add=e.shiftKey||e.ctrlKey||e.metaKey,has=sel.some(x=>sameTargetKey(x,ref));
  const group=has?sel:toggleTargetKey(sel,ref,add);if(!has)setSel(group);if(add&&has){setSel(sel.filter(x=>!sameTargetKey(x,ref)));return;}
  const el=e.currentTarget;el.setPointerCapture(e.pointerId);const x0=e.clientX,y0=e.clientY,tStart=ref.t;let moved=false,applied=0;
  const mv=(ev:globalThis.PointerEvent)=>{if(!moved&&Math.hypot(ev.clientX-x0,ev.clientY-y0)<3)return;moved=true;
   const df=Math.round((tOf(local(ev.clientX,ev.clientY).x)-tStart)*comp.fps.num/(comp.fps.den*240000)),delta=frameToTick(df,comp.fps);
   try{sess.previewEdits(moveTargetKeys(sess.document!,layer.id,group,delta));applied=delta;}catch{/* keep last valid */}};
  const done=(commit:boolean)=>{el.removeEventListener('pointermove',mv);el.removeEventListener('pointerup',up);window.removeEventListener('keydown',esc,true);
   if(moved&&commit){sess.commitPreview();setSel(group.map(r=>({...r,t:r.t+applied})));sess.setView({playhead:tStart+applied});}else{sess.cancelPreview();if(!moved)sess.setView({playhead:tStart});}};
  const up=()=>done(true);const esc=(ev:KeyboardEvent)=>{if(ev.key==='Escape'){ev.stopPropagation();done(false);}};
  el.addEventListener('pointermove',mv);el.addEventListener('pointerup',up);window.addEventListener('keydown',esc,true);
 };
 const keyKey=(ref:TargetKey)=>(e:ReactKeyboardEvent<SVGElement>)=>{
  if(e.key==='Enter'||e.key===' '){e.preventDefault();setSel(toggleTargetKey(sel,ref,e.shiftKey));sess.setView({playhead:ref.t});return;}
  const dx=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;if(!dx)return;e.preventDefault();e.stopPropagation();
  move(sel.some(x=>sameTargetKey(x,ref))?sel:[ref],frameToTick(dx*(e.shiftKey?10:1),comp.fps));
 };
 const boxDown=(e:PointerEvent<SVGElement>)=>{
  const el=e.currentTarget;el.setPointerCapture(e.pointerId);const s0=local(e.clientX,e.clientY),add=e.shiftKey||e.ctrlKey||e.metaKey;let moved=false;
  const mv=(ev:globalThis.PointerEvent)=>{const q=local(ev.clientX,ev.clientY);if(!moved&&Math.hypot(q.x-s0.x,q.y-s0.y)<3)return;moved=true;setBox({x0:s0.x,y0:s0.y,x1:q.x,y1:q.y});};
  const up=(ev:globalThis.PointerEvent)=>{el.removeEventListener('pointermove',mv);el.removeEventListener('pointerup',up);setBox(null);const q=local(ev.clientX,ev.clientY);
   if(!moved){if(!add)setSel([]);sess.setView({playhead:Math.min(t1,Math.max(t0,tOf(q.x)))});return;}
   const [xa,xb]=[Math.min(s0.x,q.x),Math.max(s0.x,q.x)],[ya,yb]=[Math.min(s0.y,q.y),Math.max(s0.y,q.y)];
   const hit=lanes.flatMap(l=>l.p.keys.map(k=>({target:l.g,t:k.t,x:xOf(k.t),y:l.yOf(k.v)}))).filter(o=>o.x>=xa&&o.x<=xb&&o.y>=ya&&o.y<=yb).map(({target,t:tk})=>({target,t:tk}));
   setSel(add?[...sel,...hit.filter(r=>!sel.some(x=>sameTargetKey(x,r)))]:hit);};
  el.addEventListener('pointermove',mv);el.addEventListener('pointerup',up);
 };
 const ease=(preset:(typeof EASES)[number])=>{try{sess.dispatch(easeTargetKeys(sess.document!,layer.id,live,preset));}catch{/* locked */}};
 return <div className="grid min-h-0 flex-1 grid-cols-[180px_1fr]" data-testid="animation-graph-mixed">
  <div className="min-h-0 overflow-auto border-r border-subtle p-1" role="group" aria-label={t('animation.graph.props')}>
   <Button size="tiny" variant="ghost" onClick={()=>setGraphMixed(false)} data-testid="animation-graph-mixed-back">{t('animation.graph.transform')}</Button>
   {live.length>0&&<div className="my-1 flex flex-wrap gap-1" role="group" aria-label={t('animation.ease.group')}>
    {EASES.map(p=><Button key={p} size="tiny" variant="ghost" disabled={layer.locked} onClick={()=>ease(p)} data-testid={`animation-graph-mixed-ease-${p}`}>{t(EASE_LABEL[p])}</Button>)}</div>}
   {targets.map(g=>{const own=live.filter(r=>targetId(r.target)===targetId(g)).length;
    return <Button key={targetId(g)} size="tiny" aria-pressed={own>0} className={`w-full justify-start truncate ${own>0?'text-ink':'text-ink-3'}`} onClick={()=>setSel(allTargetKeys(layer).filter(r=>targetId(r.target)===targetId(g)))} data-testid="animation-graph-mixed-target">{name(g)}</Button>;})}
  </div>
  <div ref={wrap} className="relative min-h-0 overflow-hidden">
   <svg ref={svgRef} width={w} height={h} role="group" aria-label={t('animation.graph.mixedLabel')} className="block touch-none select-none" data-testid="animation-graph-mixed-svg">
    <rect x={0} y={0} width={w} height={h} fill="var(--bg-panel)" onPointerDown={boxDown} data-testid="animation-graph-mixed-plot"/>
    <g pointerEvents="none">{lanes.map(l=>{const on=live.some(r=>targetId(r.target)===targetId(l.g));return <polyline key={targetId(l.g)} points={l.pts} fill="none" stroke={on?'var(--accent)':'var(--text-tertiary)'} strokeWidth={on?2:1} data-testid="animation-graph-mixed-curve"/>;})}</g>
    <line x1={xOf(playhead)} x2={xOf(playhead)} y1={PAD.t} y2={PAD.t+ph} stroke="var(--text-primary)" strokeWidth={1} pointerEvents="none"/>
    <text x={PAD.l} y={h-3} fontSize={9} fill="var(--text-tertiary)">{timecode(t0,comp.fps)}</text>
    <text x={PAD.l+pw} y={h-3} textAnchor="end" fontSize={9} fill="var(--text-tertiary)">{timecode(t1,comp.fps)}</text>
    {lanes.flatMap(l=>l.p.keys.map((k,i)=>{const ref:TargetKey={target:l.g,t:k.t};const on=live.some(x=>sameTargetKey(x,ref));
     return <g key={`${targetId(l.g)}-${i}`} transform={`translate(${xOf(k.t)} ${l.yOf(k.v)})`} tabIndex={layer.locked?-1:0} role="button" aria-pressed={on} aria-label={t('animation.graph.mixedKey',{name:name(l.g),time:timecode(k.t,comp.fps)})}
      className={layer.locked?'touch-none cursor-default':'touch-none cursor-grab'} onPointerDown={layer.locked?undefined:keyDown(ref)} onKeyDown={layer.locked?undefined:keyKey(ref)} data-testid="animation-graph-mixed-key" data-selected={on||undefined}>
      <rect x={-8} y={-8} width={16} height={16} fill="transparent"/>
      <rect x={-4.5} y={-4.5} width={9} height={9} transform="rotate(45)" fill={on?'var(--text-primary)':'var(--accent-fill)'} stroke={on?'var(--accent)':'var(--border-default)'} strokeWidth={on?2:1}/></g>;}))}
    {box&&<rect x={Math.min(box.x0,box.x1)} y={Math.min(box.y0,box.y1)} width={Math.abs(box.x1-box.x0)} height={Math.abs(box.y1-box.y0)} fill="var(--accent-fill)" fillOpacity={0.25} stroke="var(--accent)" strokeWidth={1} pointerEvents="none" data-testid="animation-graph-mixed-box"/>}
   </svg>
  </div>
 </div>;
}
