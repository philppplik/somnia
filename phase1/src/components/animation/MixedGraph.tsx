import {useLayoutEffect,useRef,useState,type KeyboardEvent as ReactKeyboardEvent,type PointerEvent} from 'react';
import {animationSession} from '../../lib/animation/session';
import {curveSamples,handlesOf,handleToEase} from '../../lib/animation/graph';
import {maskEdit} from '../../lib/animation/masks';
import type {Edit} from '../../lib/animation/edit';
import {allTargetKeys,animatedTargets,copyTargetKeys,deleteTargetKeys,easeTargetKeys,editTargetKeys,pasteTargetKeys,pasteClipOnTargets,keyBounds,moveTargetKeys,normalizedValue,propertyOf,pruneTargetKeys,sameTargetKey,targetId,toggleTargetKey,type KeyTarget,type TargetKey} from '../../lib/animation/keyTargets';
import {frameToTick,timecode} from '../../lib/animation/time';
import type {Composition,Layer,Property} from '../../lib/animation/model';
import {setGraphMixed,setMaskClip,useMaskSelection} from '../../lib/animation/maskSelection';
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
 const msel=useMaskSelection();const [ch,setCh]=useState<0|1>(0);const frozen=useRef<Map<string,{min:number;max:number}>|null>(null);const [size,setSize]=useState({w:600,h:180});const [sel,setSelRaw]=useState<TargetKey[]>([]);const [box,setBox]=useState<{x0:number;y0:number;x1:number;y1:number}|null>(null);
 useLayoutEffect(()=>{const el=wrap.current;if(!el)return;const read=()=>{const r=el.getBoundingClientRect();if(r.width>0&&r.height>0)setSize({w:Math.round(r.width),h:Math.round(r.height)});};read();if(typeof ResizeObserver==='undefined')return;const ro=new ResizeObserver(read);ro.observe(el);return()=>ro.disconnect();},[]);
 const targets=animatedTargets(layer);const live=pruneTargetKeys(layer,sel);
 const name=(g:KeyTarget)=>g.kind==='transform'?t(PROP_LABEL[g.prop]):t('animation.masks.lane',{n:(layer.masks??[]).findIndex(m=>m.id===g.mask)+1,prop:t(`animation.masks.prop.${g.prop}`)});
 const w=size.w,h=size.h,t0=comp.start,t1=comp.start+comp.duration,pw=Math.max(10,w-PAD.l-PAD.r),ph=Math.max(10,h-PAD.t-PAD.b);
 const xOf=(tk:number)=>PAD.l+(tk-t0)/(t1-t0)*pw,tOf=(x:number)=>t0+(x-PAD.l)/pw*(t1-t0);
 const local=(cx:number,cy:number)=>{const r=svgRef.current!.getBoundingClientRect();return {x:cx-r.left,y:cy-r.top};};
 const lanes=targets.map(g=>{const p=propertyOf(layer,g)!;const b=frozen.current?.get(targetId(g))??keyBounds(p,ch);const yOf=(v:Property['value'])=>PAD.t+ph*(0.08+0.84*(1-normalizedValue(v,b,ch)));
  const vOf=(y:number)=>b.min+(1-((y-PAD.t)/ph-0.08)/0.84)*(b.max-b.min);
  return {g,p,yOf,vOf,b,pts:curveSamples(p,p.type==='vec2'?ch:0,t0,t1,Math.min(200,Math.max(40,Math.floor(pw/3)))).map(s=>`${xOf(s.t).toFixed(1)},${yOf(s.v).toFixed(1)}`).join(' ')};});
 const setSel=(s:TargetKey[])=>setSelRaw(s);
 const move=(group:readonly TargetKey[],delta:number)=>{try{sess.dispatch(moveTargetKeys(sess.document!,layer.id,group,delta));setSel(group.map(r=>({...r,t:r.t+delta})));}catch{/* collision or locked */}};
 const dvFor=(frac:number)=>(g:KeyTarget)=>{const l=lanes.find(x=>targetId(x.g)===targetId(g));return l?frac*(l.b.max-l.b.min):0;};
 const freeze=()=>{frozen.current=new Map(lanes.map(l=>[targetId(l.g),l.b]));};
 const keyDown=(ref:TargetKey)=>(e:PointerEvent<SVGElement>)=>{
  if(e.button!==0)return;e.stopPropagation();const add=e.shiftKey||e.ctrlKey||e.metaKey,has=live.some(x=>sameTargetKey(x,ref));
  const group=has?live:toggleTargetKey(live,ref,add);if(!has)setSel(group);if(add&&has){setSel(live.filter(x=>!sameTargetKey(x,ref)));return;}
  const el=e.currentTarget;el.setPointerCapture(e.pointerId);const x0=e.clientX,y0=e.clientY,tStart=ref.t;let moved=false,applied=0;freeze();
  const mv=(ev:globalThis.PointerEvent)=>{if(!moved&&Math.hypot(ev.clientX-x0,ev.clientY-y0)<3)return;moved=true;
   let dx=ev.clientX-x0,dy=ev.clientY-y0;if(ev.shiftKey){if(Math.abs(dx)>=Math.abs(dy))dy=0;else dx=0;}
   const df=Math.round((tOf(local(x0,0).x+dx)-tStart)*comp.fps.num/(comp.fps.den*240000)),delta=frameToTick(df,comp.fps);
   try{sess.previewEdits(editTargetKeys(sess.document!,layer.id,group,delta,dvFor(-dy/(0.84*ph)),ch));applied=delta;}catch{/* keep last valid */}};
  const done=(commit:boolean)=>{el.removeEventListener('pointermove',mv);el.removeEventListener('pointerup',up);window.removeEventListener('keydown',esc,true);frozen.current=null;
   if(moved&&commit){sess.commitPreview();setSel(group.map(r=>({...r,t:r.t+applied})));sess.setView({playhead:tStart+applied});}else{sess.cancelPreview();if(!moved)sess.setView({playhead:tStart});}};
  const up=()=>done(true);const esc=(ev:KeyboardEvent)=>{if(ev.key==='Escape'){ev.stopPropagation();done(false);}};
  el.addEventListener('pointermove',mv);el.addEventListener('pointerup',up);window.addEventListener('keydown',esc,true);
 };
 /** Keyboard: Enter selects only this key, Space adds or removes it, left/right move by frame (shift: 10), up/down change the value by 1% of its range (shift: 10%). */
 const keyKey=(ref:TargetKey)=>(e:ReactKeyboardEvent<SVGElement>)=>{
  if(e.key==='Enter'){e.preventDefault();setSel([ref]);sess.setView({playhead:ref.t});return;}
  if(e.key===' '){e.preventDefault();setSel(toggleTargetKey(live,ref,true));sess.setView({playhead:ref.t});return;}
  const dx=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0,dy=e.key==='ArrowUp'?1:e.key==='ArrowDown'?-1:0;if(!dx&&!dy)return;e.preventDefault();e.stopPropagation();
  const group=live.some(x=>sameTargetKey(x,ref))?live:[ref];const delta=dx?frameToTick(dx*(e.shiftKey?10:1),comp.fps):0;
  try{sess.dispatch(editTargetKeys(sess.document!,layer.id,group,delta,dvFor(dy*(e.shiftKey?0.1:0.01)),ch));setSel(group.map(r=>({...r,t:r.t+delta})));}catch{/* collision, limit or locked */}
 };
 const run=(f:()=>Edit[])=>{try{sess.dispatch(f());}catch{/* stale, locked or no room */}};
 const copy=()=>{try{setMaskClip({kind:'multi',multi:copyTargetKeys(layer,live)});}catch{/* stale */}};
 const canPaste=msel.clip?.kind==='multi'||(msel.clip?.kind==='keys'&&live.length>0);
 const paste=()=>{const c=msel.clip,at=sess.getState().view.playhead;
  if(c?.kind==='multi')run(()=>pasteTargetKeys(sess.document!,layer.id,at,c.multi));
  else if(c?.kind==='keys'){const gs=[...new Map(live.map(r=>[targetId(r.target),r.target])).values()];run(()=>pasteClipOnTargets(sess.document!,layer.id,gs,at,c.keys));}};
 const del=()=>{if(!live.length)return;run(()=>deleteTargetKeys(sess.document!,layer.id,live));setSel([]);};
 /** Select all, clear, delete, copy and paste without a pointer; the keys themselves handle arrows, Enter and Space. */
 const plotKey=(e:ReactKeyboardEvent<SVGElement>)=>{
  const mod=e.ctrlKey||e.metaKey;
  if(mod&&e.key.toLowerCase()==='a'){e.preventDefault();setSel(allTargetKeys(layer));}
  else if(mod&&e.key.toLowerCase()==='c'&&live.length){e.preventDefault();copy();}
  else if(mod&&e.key.toLowerCase()==='v'&&!layer.locked){e.preventDefault();paste();}
  else if((e.key==='Delete'||e.key==='Backspace')&&live.length&&!layer.locked){e.preventDefault();del();}
  else if(e.key==='F9'&&live.length&&!layer.locked){e.preventDefault();ease('ease');}
  else if(e.key==='Escape')setSel([]);
 };
 const handleDown=(l:(typeof lanes)[number],i:number,kind:'in'|'out')=>(e:PointerEvent<SVGElement>)=>{
  if(e.button!==0)return;e.stopPropagation();const el=e.currentTarget;el.setPointerCapture(e.pointerId);freeze();let moved=false;const keys=l.p.keys,k=keys[i];
  const mv=(ev:globalThis.PointerEvent)=>{moved=true;const q=local(ev.clientX,ev.clientY);const ease=handleToEase(keys,i,kind,tOf(q.x),l.vOf(q.y),l.p.type==='vec2'?ch:0);
   try{sess.previewEdits([l.g.kind==='mask'?maskEdit(sess.document!,layer.id,{op:'keyHandle',mask:l.g.mask,prop:l.g.prop,t:k.t,kind,x:ease[0],y:ease[1]}):{type:'key.interp',layer:layer.id,prop:l.g.prop,t:k.t,interp:k.interp,...(l.p.type==='vec2'&&!keys.some(x=>x.sIn||x.sOut)?{channel:ch}:{}),...(kind==='out'?{out:ease}:{in:ease})}]);}catch{/* keep last valid */}};
  const done=(commit:boolean)=>{el.removeEventListener('pointermove',mv);el.removeEventListener('pointerup',up);window.removeEventListener('keydown',esc,true);frozen.current=null;if(moved&&commit)sess.commitPreview();else sess.cancelPreview();};
  const up=()=>done(true);const esc=(ev:KeyboardEvent)=>{if(ev.key==='Escape'){ev.stopPropagation();done(false);}};
  el.addEventListener('pointermove',mv);el.addEventListener('pointerup',up);window.addEventListener('keydown',esc,true);
 };
 const one=live.length===1?live[0]:null;const oneLane=one?lanes.find(l=>targetId(l.g)===targetId(one.target)):undefined;const oneIdx=oneLane?oneLane.p.keys.findIndex(k=>k.t===one!.t):-1;
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
 const ease=(preset:(typeof EASES)[number])=>run(()=>easeTargetKeys(sess.document!,layer.id,live,preset));
 /** Hovering or focusing a preset previews it on the real curves; leaving restores. Nothing is committed. */
 const peek=(preset:(typeof EASES)[number])=>{try{sess.previewEdits(easeTargetKeys(sess.document!,layer.id,live,preset));}catch{/* stale or locked */}};
 const unpeek=()=>sess.cancelPreview();
 return <div className="grid min-h-0 flex-1 grid-cols-[180px_1fr]" data-testid="animation-graph-mixed">
  <div className="min-h-0 overflow-auto border-r border-subtle p-1" role="group" aria-label={t('animation.graph.props')}>
   <Button size="tiny" variant="ghost" onClick={()=>setGraphMixed(false)} data-testid="animation-graph-mixed-back">{t('animation.graph.transform')}</Button>
   {lanes.some(l=>l.p.type==='vec2')&&<div className="my-1 flex gap-1 px-1" role="group" aria-label={t('animation.graph.channel')}>
    {([0,1] as const).map(c=><Button key={c} size="tiny" variant={ch===c?'outline':'ghost'} aria-pressed={ch===c} onClick={()=>setCh(c)} data-testid={`animation-graph-mixed-channel-${c}`}>{t(c===0?'animation.prop.x':'animation.prop.y')}</Button>)}</div>}
   {live.length>0&&<div className="my-1 flex flex-wrap gap-1" role="group" aria-label={t('animation.ease.group')}>
    {EASES.map(p=><Button key={p} size="tiny" variant="ghost" disabled={layer.locked} onClick={()=>ease(p)} onPointerEnter={()=>peek(p)} onPointerLeave={unpeek} onFocus={()=>peek(p)} onBlur={unpeek} data-testid={`animation-graph-mixed-ease-${p}`}>{t(EASE_LABEL[p])}</Button>)}</div>}
   <div className="my-1 flex gap-1 px-1">
    <Button size="tiny" disabled={!live.length} onClick={copy} data-testid="animation-graph-mixed-copy">{t('animation.masks.copy')}</Button>
    <Button size="tiny" disabled={!canPaste||layer.locked} onClick={paste} data-testid="animation-graph-mixed-paste">{t('animation.masks.paste')}</Button>
    <Button size="tiny" disabled={!live.length||layer.locked} onClick={del} data-testid="animation-graph-mixed-delete">{t('animation.graph.delete')}</Button></div>
   {targets.map(g=>{const own=live.filter(r=>targetId(r.target)===targetId(g)).length;
    return <Button key={targetId(g)} size="tiny" aria-pressed={own>0} className={`w-full justify-start truncate ${own>0?'text-ink':'text-ink-3'}`} onClick={()=>setSel(allTargetKeys(layer).filter(r=>targetId(r.target)===targetId(g)))} data-testid="animation-graph-mixed-target">{name(g)}</Button>;})}
  </div>
  <div ref={wrap} className="relative min-h-0 overflow-hidden">
   <svg ref={svgRef} width={w} height={h} role="group" aria-label={t('animation.graph.mixedLabel')} className="block touch-none select-none" onKeyDown={plotKey} data-testid="animation-graph-mixed-svg">
    <rect x={0} y={0} width={w} height={h} fill="var(--bg-panel)" onPointerDown={boxDown} data-testid="animation-graph-mixed-plot"/>
    <g pointerEvents="none">{lanes.map(l=>{const on=live.some(r=>targetId(r.target)===targetId(l.g));return <polyline key={targetId(l.g)} points={l.pts} fill="none" stroke={on?'var(--accent)':'var(--text-tertiary)'} strokeWidth={on?2:1} data-testid="animation-graph-mixed-curve"/>;})}</g>
    <line x1={xOf(playhead)} x2={xOf(playhead)} y1={PAD.t} y2={PAD.t+ph} stroke="var(--text-primary)" strokeWidth={1} pointerEvents="none"/>
    <text x={PAD.l} y={h-3} fontSize={9} fill="var(--text-tertiary)">{timecode(t0,comp.fps)}</text>
    <text x={PAD.l+pw} y={h-3} textAnchor="end" fontSize={9} fill="var(--text-tertiary)">{timecode(t1,comp.fps)}</text>
    {oneLane&&oneIdx>=0&&handlesOf(oneLane.p.keys,oneIdx,oneLane.p.type==='vec2'?ch:0).map(hd=>{const k=oneLane.p.keys[oneIdx];return <g key={hd.kind}>
     <line x1={xOf(k.t)} y1={oneLane.yOf(k.v)} x2={xOf(hd.t)} y2={oneLane.yOf(hd.v)} stroke="var(--text-secondary)" strokeWidth={1} pointerEvents="none"/>
     <circle cx={xOf(hd.t)} cy={oneLane.yOf(hd.v)} r={5} fill="var(--bg-elevated)" stroke="var(--accent)" strokeWidth={2} role="slider" tabIndex={layer.locked?-1:0} aria-valuenow={hd.x} aria-valuemin={0} aria-valuemax={1}
      aria-label={t(hd.kind==='out'?'animation.graph.handleOut':'animation.graph.handleIn',{time:timecode(k.t,comp.fps)})} className={layer.locked?'touch-none cursor-default':'touch-none cursor-grab'} onPointerDown={layer.locked?undefined:handleDown(oneLane,oneIdx,hd.kind)} data-testid={`animation-graph-mixed-handle-${hd.kind}`}/></g>;})}
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
