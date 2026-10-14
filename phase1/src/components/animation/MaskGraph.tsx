import {useLayoutEffect,useRef,useState,type PointerEvent} from 'react';
import {animationSession} from '../../lib/animation/session';
import {maskEdit} from '../../lib/animation/masks';
import {setGraphTarget,type GraphTarget} from '../../lib/animation/maskSelection';
import {channelOf,curveSamples,handleToEase,handlesOf,niceStep,valueRange,EASE_PRESETS,type EasePreset} from '../../lib/animation/graph';
import {frameToTick,timecode} from '../../lib/animation/time';
import type {Composition,Layer,MaskProp,Property} from '../../lib/animation/model';
import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
import {NativeSelect} from '../ui/native-controls';
import {EASE_LABEL,EASES,fmt} from './format';
const PAD={l:46,r:12,t:10,b:16};
const easeOf=(k:{interp:string;out:readonly [number,number];in:readonly [number,number]}):EasePreset|'custom'=>EASES.find(p=>{const e=EASE_PRESETS[p];return e.interp===k.interp&&(!('out' in e)||(e.out[0]===k.out[0]&&e.out[1]===k.out[1]&&e.in[0]===k.in[0]&&e.in[1]===k.in[1]));})??'custom';
const BOUNDS:Record<MaskProp,[number,number]>={position:[-16384,16384],size:[1,16384],feather:[0,64],opacity:[0,100]};
/** Animated mask properties (and morphing paths) of a layer, in mask order. */
export function maskTargets(layer:Layer):(GraphTarget&{n:number})[]{
 return (layer.masks??[]).flatMap((m,i)=>[...(['position','size','feather','opacity'] as const).filter(p=>m.anim?.[p]?.keys.length).map(prop=>({mask:m.id,prop,n:i+1})),...(m.shapeKeys?.length?[{mask:m.id,prop:'path' as const,n:i+1}]:[])]);
}
/** Left-hand list entry buttons for mask curves; shared by the transform graph and the mask graph. */
export function MaskTargetButtons({layer,active}:{layer:Layer;active:GraphTarget|null}){
 const {t}=useT();
 return <>{maskTargets(layer).map(g=><Button key={`${g.mask}-${g.prop}`} size="tiny" aria-pressed={active?.mask===g.mask&&active.prop===g.prop} className={`w-full justify-start truncate ${active?.mask===g.mask&&active.prop===g.prop?'text-ink':'text-ink-3'}`} onClick={()=>setGraphTarget({mask:g.mask,prop:g.prop})} data-testid={`animation-graph-mask-${g.n-1}-${g.prop}`}>{t('animation.masks.lane',{n:g.n,prop:t(`animation.masks.prop.${g.prop}`)})}</Button>)}</>;
}
/** Value graph of one animated mask property: draggable keys (time and value) and ease handles. Path morphs list their keys with an ease each. */
export function MaskGraph({comp,layer,target,playhead}:{comp:Composition;layer:Layer;target:GraphTarget;playhead:number}){
 const {t}=useT();const sess=animationSession();const wrap=useRef<HTMLDivElement>(null);const svgRef=useRef<SVGSVGElement>(null);
 const [size,setSize]=useState({w:600,h:180});const [pick,setPick]=useState<number|null>(null);const [ch,setCh]=useState<0|1>(0);const frozen=useRef<{min:number;max:number}|null>(null);
 useLayoutEffect(()=>{const el=wrap.current;if(!el)return;const read=()=>{const r=el.getBoundingClientRect();if(r.width>0&&r.height>0)setSize({w:Math.round(r.width),h:Math.round(r.height)});};read();if(typeof ResizeObserver==='undefined')return;const ro=new ResizeObserver(read);ro.observe(el);return()=>ro.disconnect();},[]);
 const mask=layer.masks?.find(m=>m.id===target.mask);const run=(o:Parameters<typeof maskEdit>[2])=>{try{sess.dispatch(maskEdit(sess.document!,layer.id,o));}catch{/* stale or locked */}};
 const list=<div className="min-h-0 overflow-auto border-r border-subtle p-1" role="group" aria-label={t('animation.graph.props')}>
  <Button size="tiny" variant="ghost" onClick={()=>setGraphTarget(null)} data-testid="animation-graph-mask-back">{t('animation.graph.transform')}</Button>
  <MaskTargetButtons layer={layer} active={target}/>
  {target.prop!=='path'&&pick!==null&&mask?.anim?.[target.prop]?.keys[pick]&&<NativeSelect className="mx-1 mt-1 h-5 w-[110px] rounded-sm border border-subtle bg-transparent px-1 text-xs text-ink-2" aria-label={t('animation.masks.ease')} disabled={layer.locked} value={easeOf(mask.anim[target.prop]!.keys[pick])} onChange={e=>run({op:'keyEase',mask:mask.id,prop:target.prop as MaskProp,t:mask.anim![target.prop as MaskProp]!.keys[pick].t,preset:e.target.value as EasePreset})} data-testid="animation-graph-maskease">
   {easeOf(mask.anim[target.prop]!.keys[pick])==='custom'&&<option value="custom" disabled>{t('animation.ease.custom')}</option>}{EASES.map(p=><option key={p} value={p}>{t(EASE_LABEL[p])}</option>)}</NativeSelect>}
  {target.prop!=='path'&&mask?.anim?.[target.prop]?.type==='vec2'&&<div className="mt-1 flex gap-1 px-1" role="group" aria-label={t('animation.graph.channel')}>
   {([0,1] as const).map(c=><Button key={c} size="tiny" variant={ch===c?'outline':'ghost'} aria-pressed={ch===c} onClick={()=>setCh(c)}>{t(c===0?'animation.prop.x':'animation.prop.y')}</Button>)}</div>}
 </div>;
 if(!mask)return <div className="grid min-h-0 flex-1 place-items-center p-3 text-ink-3">{t('animation.graph.empty')}</div>;
 if(target.prop==='path'){
  return <div className="grid min-h-0 flex-1 grid-cols-[180px_1fr]" data-testid="animation-graph-maskpath">{list}
   <div className="min-h-0 overflow-auto p-2">{(mask.shapeKeys??[]).map(k=><label key={k.t} className="flex items-center gap-2 py-0.5 text-ink-3">{timecode(k.t,comp.fps)}
    <NativeSelect className="h-5 w-[110px] rounded-sm border border-subtle bg-transparent px-1 text-xs text-ink-2" aria-label={t('animation.masks.ease')} value={k.ease??'linear'} disabled={layer.locked} onChange={e=>run({op:'keyEase',mask:mask.id,prop:'path',t:k.t,preset:e.target.value as EasePreset})} data-testid="animation-graph-pathease">
     {EASES.map(p=><option key={p} value={p}>{t(EASE_LABEL[p])}</option>)}</NativeSelect></label>)}</div></div>;
 }
 const prop=target.prop as MaskProp,P=mask.anim![prop] as Property,keys=P.keys,[lo,hi]=BOUNDS[prop],c:0|1=P.type==='vec2'?ch:0;
 const w=size.w,h=size.h,t0=comp.start,t1=comp.start+comp.duration;
 const range=frozen.current??valueRange(keys,c);const pw=Math.max(10,w-PAD.l-PAD.r),ph=Math.max(10,h-PAD.t-PAD.b);
 const xOf=(tk:number)=>PAD.l+(tk-t0)/(t1-t0)*pw,yOf=(v:number)=>PAD.t+(1-(v-range.min)/(range.max-range.min))*ph;
 const local=(cx:number,cy:number)=>{const r=svgRef.current!.getBoundingClientRect();return {x:cx-r.left,y:cy-r.top};};
 const tOf=(x:number)=>t0+(x-PAD.l)/pw*(t1-t0),vOf=(y:number)=>range.min+(1-(y-PAD.t)/ph)*(range.max-range.min);
 const step=niceStep(range.max-range.min,Math.max(2,Math.floor(ph/34)));const grid:number[]=[];for(let v=Math.ceil(range.min/step)*step;v<=range.max+1e-9;v+=step)grid.push(Math.round(v/step)*step);
 const pts=curveSamples(P,c,t0,t1,Math.min(300,Math.max(40,Math.floor(pw/3)))).map(p=>`${xOf(p.t).toFixed(1)},${yOf(p.v).toFixed(1)}`).join(' ');
 const drag=(e:PointerEvent<SVGElement>,move:(ev:globalThis.PointerEvent)=>void)=>{
  e.stopPropagation();const el=e.currentTarget;el.setPointerCapture(e.pointerId);frozen.current=valueRange(keys,c);const x0=e.clientX,y0=e.clientY;let moved=false;
  const mv=(ev:globalThis.PointerEvent)=>{if(!moved&&Math.hypot(ev.clientX-x0,ev.clientY-y0)<3)return;moved=true;try{move(ev);}catch{/* keep last valid */}};
  const done=(commit:boolean)=>{el.removeEventListener('pointermove',mv);el.removeEventListener('pointerup',up);window.removeEventListener('keydown',esc,true);frozen.current=null;if(moved&&commit)sess.commitPreview();else sess.cancelPreview();};
  const up=()=>done(true);const esc=(ev:KeyboardEvent)=>{if(ev.key==='Escape'){ev.stopPropagation();done(false);}};
  el.addEventListener('pointermove',mv);el.addEventListener('pointerup',up);window.addEventListener('keydown',esc,true);
 };
 const keyDown=(i:number)=>(e:PointerEvent<SVGElement>)=>{
  if(e.button!==0)return;const k=keys[i];setPick(i);sess.setView({playhead:k.t});
  drag(e,ev=>{const p=local(ev.clientX,ev.clientY);const df=Math.round((tOf(p.x)-k.t)*comp.fps.num/(comp.fps.den*240000));const nv=Math.min(hi,Math.max(lo,Math.round(vOf(p.y)*100)/100));
   const v=P.type==='vec2'?(c===0?[nv,(k.v as readonly [number,number])[1]]:[(k.v as readonly [number,number])[0],nv]) as [number,number]:nv;
   sess.previewEdits([maskEdit(sess.document!,layer.id,{op:'keyEdit',mask:mask.id,prop,t:k.t,to:k.t+frameToTick(df,comp.fps),v})]);});
 };
 const handleDown=(i:number,kind:'in'|'out')=>(e:PointerEvent<SVGElement>)=>{
  if(e.button!==0)return;
  drag(e,ev=>{const p=local(ev.clientX,ev.clientY);const hd=handleToEase(keys,i,kind,tOf(p.x),vOf(p.y),c);sess.previewEdits([maskEdit(sess.document!,layer.id,{op:'keyHandle',mask:mask.id,prop,t:keys[i].t,kind,x:hd[0],y:hd[1]})]);});
 };
 return <div className="grid min-h-0 flex-1 grid-cols-[180px_1fr]" data-testid="animation-graph-maskvalue">{list}
  <div ref={wrap} className="relative min-h-0 overflow-hidden">
   <svg ref={svgRef} width={w} height={h} role="group" aria-label={t('animation.graph.label',{name:t('animation.masks.lane',{n:(layer.masks??[]).indexOf(mask)+1,prop:t(`animation.masks.prop.${prop}`)})})} className="block touch-none select-none">
    <rect x={PAD.l} y={PAD.t} width={pw} height={ph} fill="var(--bg-panel)"/>
    {grid.map(v=><g key={v}><line x1={PAD.l} x2={PAD.l+pw} y1={yOf(v)} y2={yOf(v)} stroke="var(--border-subtle)" strokeWidth={1}/><text x={PAD.l-6} y={yOf(v)+3} textAnchor="end" fontSize={9} fill="var(--text-tertiary)">{fmt(v)}</text></g>)}
    <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth={2} pointerEvents="none" data-testid="animation-graph-maskcurve"/>
    <line x1={xOf(playhead)} x2={xOf(playhead)} y1={PAD.t} y2={PAD.t+ph} stroke="var(--text-primary)" strokeWidth={1} pointerEvents="none"/>
    {pick!==null&&keys[pick]&&handlesOf(keys,pick,c).map(hd=><g key={hd.kind}><line x1={xOf(keys[pick].t)} y1={yOf(channelOf(keys[pick].v,c))} x2={xOf(hd.t)} y2={yOf(hd.v)} stroke="var(--text-secondary)" strokeWidth={1}/>
     <circle cx={xOf(hd.t)} cy={yOf(hd.v)} r={5} fill="var(--bg-elevated)" stroke="var(--accent)" strokeWidth={2} role="slider" tabIndex={0} aria-valuenow={hd.x} aria-label={t(hd.kind==='out'?'animation.graph.handleOut':'animation.graph.handleIn',{time:timecode(keys[pick].t,comp.fps)})} className={layer.locked?'cursor-default':'cursor-grab'} onPointerDown={layer.locked?undefined:handleDown(pick,hd.kind)} data-testid={`animation-graph-maskhandle-${hd.kind}`}/></g>)}
    {keys.map((k,i)=><g key={i} transform={`translate(${xOf(k.t)} ${yOf(channelOf(k.v,c))})`} role="button" tabIndex={0} aria-pressed={pick===i} aria-label={t('animation.graph.key',{time:timecode(k.t,comp.fps),value:fmt(channelOf(k.v,c))})} className={layer.locked?'cursor-default':'cursor-grab'} onPointerDown={layer.locked?undefined:keyDown(i)} data-testid="animation-graph-maskkey">
     <rect x={-8} y={-8} width={16} height={16} fill="transparent"/><rect x={-4.5} y={-4.5} width={9} height={9} transform="rotate(45)" fill={pick===i?'var(--text-primary)':'var(--accent-fill)'} stroke="var(--border-default)" strokeWidth={1}/></g>)}
   </svg>
  </div></div>;
}
