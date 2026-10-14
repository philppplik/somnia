import {useState} from 'react';
import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
import {NativeInput,NativeSelect} from '../ui/native-controls';
import {useAnimationState} from '../../lib/animation/session';
import {timingPlan,TIMING_MODES,MAX_STAGGER_FRAMES,type TimingMode} from '../../lib/animation/layerTiming';
import {executeCommand} from '../../lib/commands';
import type {Composition} from '../../lib/animation/model';
/** Left-panel section: tick layers, then chain them, group them under a control null, or release their parents. Tick order is the chain order. */
export function RigPanel({comp}:{comp:Composition}){
 const {t}=useT();const [ticked,setTicked]=useState<string[]>([]);
 const ids=ticked.filter(id=>comp.layers.some(l=>l.id===id));
 const toggle=(id:string)=>setTicked(ids.includes(id)?ids.filter(x=>x!==id):[...ids,id]);
 const run=(cmd:string)=>void executeCommand(cmd,{layers:ids});
 const playhead=useAnimationState().view.playhead;const [mode,setMode]=useState<TimingMode>('stagger');const [frames,setFrames]=useState('4');
 const fn=Number(frames),framesOk=mode!=='stagger'||(frames.trim()!==''&&Number.isInteger(fn)&&fn>=0&&fn<=MAX_STAGGER_FRAMES);
 const plan=ids.length&&framesOk?timingPlan(comp,ids,mode,{playhead,frames:mode==='stagger'?fn:undefined}):null;
 const fieldCls='h-8 w-full min-w-0 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink select-text';
 const real=comp.layers.filter(l=>l.kind!=='audio');
 return <fieldset className="m-0 grid min-w-0 gap-2 border border-subtle p-2" data-testid="animation-rig"><legend className="text-ink-3">{t('animation.rig.title')}</legend>
  <ul className="m-0 grid max-h-40 list-none gap-1 overflow-auto p-0">{real.map(l=>{const n=ids.indexOf(l.id);return <li key={l.id}><label className="flex min-w-0 items-center gap-1 text-ink-2"><NativeInput type="checkbox" className="animation-checkbox" checked={n>=0} onChange={()=>toggle(l.id)} data-testid={`animation-rig-pick-${l.id}`}/><span className="min-w-0 truncate">{l.name}</span>{n>=0&&<span className="text-ink-3">{n+1}</span>}</label></li>;})}</ul>
  <div className="grid min-w-0 gap-1">
   <Button size="compact" variant="outline" disabled={ids.length<2} onClick={()=>run('animation.rig.chain')} data-testid="animation-rig-chain">{t('animation.rig.chain')}</Button>
   <Button size="compact" variant="outline" disabled={ids.length<1} onClick={()=>run('animation.rig.group')} data-testid="animation-rig-group">{t('animation.rig.group')}</Button>
   <Button size="compact" variant="outline" disabled={ids.length<1} onClick={()=>run('animation.rig.release')} data-testid="animation-rig-release">{t('animation.rig.release')}</Button></div>
  <div className="text-ink-3">{t('animation.rig.hint')}</div>
  <div className="grid min-w-0 gap-1 border-t border-subtle pt-2" role="group" aria-label={t('animation.timing.title')} data-testid="animation-timing">
   <NativeSelect className={fieldCls} value={mode} aria-label={t('animation.timing.title')} onChange={e=>setMode(e.target.value as TimingMode)} data-testid="animation-timing-mode">{TIMING_MODES.map(m=><option key={m} value={m}>{t(`animation.timing.mode.${m}`)}</option>)}</NativeSelect>
   {mode==='stagger'&&<NativeInput className={fieldCls} type="number" min={0} max={MAX_STAGGER_FRAMES} step={1} value={frames} aria-label={t('animation.timing.frames')} onChange={e=>setFrames(e.target.value)} data-testid="animation-timing-frames"/>}
   <Button size="compact" variant="outline" disabled={!plan||plan.changed===0} onClick={()=>void executeCommand('animation.timing.apply',{layers:ids,mode,...(mode==='stagger'?{frames:fn}:{})})} data-testid="animation-timing-apply">{t('animation.timing.apply')}</Button>
   {plan&&<div className="text-ink-3" role="status" data-testid="animation-timing-count">{t(plan.skipped?'animation.timing.countSkipped':'animation.timing.count',{changed:plan.changed,skipped:plan.skipped})}</div>}
   <div className="text-ink-3">{t('animation.timing.hint')}</div>
  </div>
 </fieldset>;
}
