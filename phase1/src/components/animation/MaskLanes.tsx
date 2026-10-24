import {useState,type KeyboardEvent,type PointerEvent} from 'react';
import {animationSession} from '../../lib/animation/session';
import {copyMaskKey,maskEdit} from '../../lib/animation/masks';
import {selectMask,setMaskClip,useMaskSelection} from '../../lib/animation/maskSelection';
import {EASE_PRESETS,type EasePreset} from '../../lib/animation/graph';
import {frameToTick,tickToFrame,timecode} from '../../lib/animation/time';
import type {Composition,Layer,MaskProp} from '../../lib/animation/model';
import {NativeSelect} from '../ui/native-controls';
import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import {EASES,EASE_LABEL} from './format';
const PROPS:(MaskProp|'path')[]=['position','size','feather','opacity','path'];
type LaneProp=MaskProp|'path';
interface KeySel{mask:string;prop:LaneProp;t:number}
/** Key lanes of the animated mask properties of one layer: select, drag to move, Delete to remove, ease per key. */
export function MaskLanes({comp,layer,tickAtX,pct}:{comp:Composition;layer:Layer;tickAtX:(x:number)=>number;pct:(t:number,c:Composition)=>string}){
 const {t}=useT();const sel=useMaskSelection();const [key,setKey]=useState<KeySel|null>(null);const sess=animationSession();const kc=sel.clip?.kind==='key'?sel.clip.key:null;
 const run=(o:Parameters<typeof maskEdit>[2])=>{try{sess.dispatch(maskEdit(sess.document!,layer.id,o));}catch{/* stale key */}};
 const drag=(mask:string,prop:LaneProp,from:number)=>(e:PointerEvent<SVGElement>)=>{
  if(e.button!==0)return;e.stopPropagation();const el=e.currentTarget;el.setPointerCapture(e.pointerId);
  selectMask(layer.id,mask);setKey({mask,prop,t:from});sess.setView({playhead:from});
  const x0=tickAtX(e.clientX);let moved=false,to=from;
  const mv=(ev:globalThis.PointerEvent)=>{const d=tickAtX(ev.clientX)-x0;if(d===0&&!moved)return;
   try{sess.previewEdits([maskEdit(sess.document!,layer.id,{op:'keyMove',mask,prop,from,to:from+d})]);moved=true;to=from+d;}catch{/* collision or range: keep last valid preview */}};
  const done=(commit:boolean)=>{el.removeEventListener('pointermove',mv);el.removeEventListener('pointerup',up);window.removeEventListener('keydown',esc,true);
   if(moved&&commit){sess.commitPreview();const snapped=frameToTick(tickToFrame(to,comp.fps),comp.fps);setKey({mask,prop,t:snapped});sess.setView({playhead:snapped});}else sess.cancelPreview();};
  const up=()=>done(true);const esc=(ev:globalThis.KeyboardEvent)=>{if(ev.key==='Escape'){ev.stopPropagation();done(false);}};
  el.addEventListener('pointermove',mv);el.addEventListener('pointerup',up);window.addEventListener('keydown',esc,true);
 };
 const onKey=(mask:string,prop:LaneProp,at:number)=>(e:KeyboardEvent<SVGElement>)=>{
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();run({op:'keyRemove',mask,prop,t:at});setKey(null);}
  else if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const to=frameToTick(tickToFrame(at,comp.fps)+(e.key==='ArrowRight'?1:-1),comp.fps);run({op:'keyMove',mask,prop,from:at,to});setKey({mask,prop,t:to});}
 };
 const ease=(k:{interp:string;out:readonly [number,number];in:readonly [number,number]}):EasePreset|'custom'=>{
  const hit=EASES.find(p=>{const e=EASE_PRESETS[p];return e.interp===k.interp&&(!('out' in e)||(e.out[0]===k.out[0]&&e.out[1]===k.out[1]&&e.in[0]===k.in[0]&&e.in[1]===k.in[1]));});return hit??'custom';};
 return <>{(layer.masks??[]).flatMap((m,mi)=>PROPS.filter(p=>p==='path'?!!m.shapeKeys?.length:m.anim?.[p]?.keys.length).map(prop=>{
  const keys:readonly {t:number;interp?:string;out?:readonly [number,number];in?:readonly [number,number]}[]=prop==='path'?m.shapeKeys!:m.anim![prop]!.keys,picked=key&&key.mask===m.id&&key.prop===prop?keys.find(k=>k.t===key.t):undefined;
  return <div key={`${m.id}-${prop}`} className="grid grid-cols-[280px_1fr] items-center" data-testid={`animation-maskrow-${mi}-${prop}`}>
   <span className="flex items-center gap-1 px-2 py-1 pl-6 text-ink-3"><Button size="tiny" className={`min-w-0 flex-1 justify-start truncate ${sel.mask===m.id||(!sel.mask&&mi===0)?'text-ink':''}`} onClick={()=>selectMask(layer.id,m.id)}>{t('animation.masks.lane',{n:mi+1,prop:t(`animation.masks.prop.${prop}`)})}</Button>
    {picked&&<NativeSelect className="h-5 w-[84px] shrink-0 rounded-sm border border-subtle bg-transparent px-1 text-xs text-ink-2" aria-label={t('animation.masks.ease')} data-testid="animation-mask-ease" value={prop==='path'?((picked as {ease?:EasePreset}).ease??'linear'):ease(picked as never)} onChange={e=>run({op:'keyEase',mask:m.id,prop,t:picked.t,preset:e.target.value as EasePreset})}>
     {prop!=='path'&&ease(picked as never)==='custom'&&<option value="custom" disabled>{t('animation.ease.custom')}</option>}{EASES.map(p=><option key={p} value={p}>{t(EASE_LABEL[p])}</option>)}</NativeSelect>}
    {picked&&<Button size="tiny" onClick={()=>{try{setMaskClip({kind:'key',key:copyMaskKey(m,prop,picked.t)});}catch{/* stale key */}}} data-testid="animation-mask-key-copy">{t('animation.masks.copy')}</Button>}
    {kc&&kc.prop===prop&&<Button size="tiny" disabled={layer.locked} onClick={()=>run({op:'keyPaste',mask:m.id,prop,t:sess.getState().view.playhead,clip:kc!})} data-testid="animation-mask-key-paste">{t('animation.masks.paste')}</Button>}</span>
   <svg className="h-5 w-full touch-none overflow-visible" data-lane aria-hidden={false}>
    {keys.map((k,ki)=>{const on=!!picked&&picked.t===k.t;
     return <rect key={ki} x={pct(k.t,comp)} y={4} width={12} height={12} role="button" tabIndex={layer.locked?-1:0} className={`origin-center -translate-x-1/2 rotate-45 [transform-box:fill-box] ${layer.locked?'pointer-events-none opacity-35':'cursor-pointer'} ${on?'fill-ink stroke-accent':'fill-accent-fill stroke-line'}`} strokeWidth={on?2:1}
      data-mask-key={m.id} data-key-prop={prop} data-key-t={k.t} aria-pressed={on} aria-label={t('animation.masks.keyAt',{time:timecode(k.t,comp.fps)})}
      onPointerDown={drag(m.id,prop,k.t)} onKeyDown={onKey(m.id,prop,k.t)}/>;})}
   </svg></div>;}))}</>;
}
