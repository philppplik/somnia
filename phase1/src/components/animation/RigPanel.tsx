import {useState} from 'react';
import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
import {NativeInput,NativeSelect} from '../ui/native-controls';
import {Menu,MenuTrigger,MenuContent,MenuItem,MenuSubmenu,MenuSubmenuTrigger} from '../ui/menu';
import {useAnimationState} from '../../lib/animation/session';
import {timingPlan,TIMING_MODES,FRAME_MODES,SIGNED_MODES,MAX_STAGGER_FRAMES,type TimingMode} from '../../lib/animation/layerTiming';
import {executeCommand} from '../../lib/commands';
import type {Composition} from '../../lib/animation/model';
const groups:{key:string;items:{testid:string;label:string;cmd:string;min:number;args?:object}[]}[]=[
 {key:'hierarchy',items:[
  {testid:'animation-rig-chain',label:'animation.rig.chain',cmd:'animation.rig.chain',min:2},
  {testid:'animation-rig-group',label:'animation.rig.group',cmd:'animation.rig.group',min:1},
  {testid:'animation-rig-release',label:'animation.rig.release',cmd:'animation.rig.release',min:1}]},
 {key:'layers',items:[
  {testid:'animation-rig-duplicate',label:'animation.rig.duplicate',cmd:'animation.layers.duplicate',min:1},
  {testid:'animation-rig-split',label:'animation.rig.split',cmd:'animation.layers.split',min:1},
  {testid:'animation-rig-workarea',label:'animation.rig.workarea',cmd:'animation.workarea.toLayers',min:1},
  {testid:'animation-rig-reseed',label:'animation.rig.reseed',cmd:'animation.modifiers.reseed',min:1},
  {testid:'animation-rig-number',label:'animation.rig.number',cmd:'animation.layers.number',min:1},
  {testid:'animation-rig-markers',label:'animation.rig.markers',cmd:'animation.marker.fromLayers',min:1}]},
 {key:'order',items:(['front','back','up','down','reverse'] as const).map(m=>({testid:`animation-rig-order-${m}`,label:`animation.rig.order.${m}`,cmd:'animation.layers.arrange',min:m==='reverse'?2:1,args:{mode:m}}))},
 {key:'align',items:(['left','centerX','right','top','centerY','bottom','distributeX','distributeY'] as const).map(m=>({testid:`animation-rig-align-${m}`,label:`animation.rig.align.${m}`,cmd:'animation.layers.align',min:m.startsWith('distribute')?3:2,args:{mode:m}}))},
 {key:'state',items:(['visible','solo','locked','shy'] as const).map(f=>({testid:`animation-rig-flag-${f}`,label:`animation.rig.flag.${f}`,cmd:'animation.layers.flag',min:1,args:{flag:f}}))}];
/** Left-panel section: tick layers, then chain them, group them under a control null, or release their parents. Tick order is the chain order. */
export function RigPanel({comp}:{comp:Composition}){
 const {t}=useT();const [ticked,setTicked]=useState<string[]>([]);
 const ids=ticked.filter(id=>comp.layers.some(l=>l.id===id));
 const toggle=(id:string)=>setTicked(ids.includes(id)?ids.filter(x=>x!==id):[...ids,id]);
 const run=(cmd:string,args?:object)=>void executeCommand(cmd,{layers:ids,...args});
 const playhead=useAnimationState().view.playhead;const [mode,setMode]=useState<TimingMode>('stagger');const [frames,setFrames]=useState('4');const [follow,setFollow]=useState('3');const followOk=follow.trim()!==''&&Number.isInteger(Number(follow))&&Number(follow)>=0&&Number(follow)<=60;
 const fn=Number(frames),usesFrames=FRAME_MODES.includes(mode),framesOk=!usesFrames||(frames.trim()!==''&&Number.isInteger(fn)&&fn>=(SIGNED_MODES.includes(mode)?-MAX_STAGGER_FRAMES:0)&&fn<=MAX_STAGGER_FRAMES);
 const plan=ids.length&&framesOk?timingPlan(comp,ids,mode,{playhead,frames:usesFrames?fn:undefined}):null;
 const fieldCls='h-8 w-full min-w-0 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink select-text';
 const real=comp.layers.filter(l=>l.kind!=='audio');
 return <fieldset className="m-0 grid min-w-0 gap-2 border border-subtle p-2" data-testid="animation-rig"><legend className="text-ink-3">{t('animation.rig.title')}</legend>
  <ul className="m-0 grid max-h-40 list-none gap-1 overflow-auto p-0">{real.map(l=>{const n=ids.indexOf(l.id);return <li key={l.id}><label className="flex min-w-0 items-center gap-1 text-ink-2"><NativeInput type="checkbox" className="animation-checkbox" checked={n>=0} onChange={()=>toggle(l.id)} data-testid={`animation-rig-pick-${l.id}`}/><span className="min-w-0 truncate">{l.name}</span>{n>=0&&<span className="text-ink-3">{n+1}</span>}</label></li>;})}</ul>
  <div className="grid min-w-0 gap-1">
   <Menu><MenuTrigger render={<Button size="compact" variant="outline" className="h-auto min-w-0 whitespace-normal" disabled={ids.length<1} data-testid="animation-rig-menu">{t('animation.rig.menu')}</Button>}/>
    <MenuContent>{groups.map(g=><MenuSubmenu key={g.key}><MenuSubmenuTrigger className="menu-item" data-testid={`animation-rig-group-${g.key}`}>{t(`animation.rig.group.${g.key}`)}<span aria-hidden="true">›</span></MenuSubmenuTrigger>
     <MenuContent>{g.items.map(it=><MenuItem key={it.testid} disabled={ids.length<it.min} onClick={()=>run(it.cmd,it.args)} data-testid={it.testid}>{t(it.label)}</MenuItem>)}</MenuContent></MenuSubmenu>)}</MenuContent></Menu>
   <div className="grid min-w-0 grid-cols-[1fr_4rem] gap-1"><Button size="compact" variant="outline" className="h-auto min-w-0 whitespace-normal text-left" disabled={ids.length<2||!followOk} onClick={()=>void executeCommand('animation.rig.follow',{layers:ids,frames:Number(follow)})} data-testid="animation-rig-follow">{t('animation.rig.follow')}</Button>
    <NativeInput className="h-8 w-full min-w-0 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink select-text" type="number" min={0} max={60} step={1} value={follow} aria-label={t('animation.rig.followFrames')} onChange={e=>setFollow(e.target.value)} data-testid="animation-rig-follow-frames"/></div>
  </div>
  <div className="text-ink-3">{t('animation.rig.hint')}</div>
  <div className="grid min-w-0 gap-1 border-t border-subtle pt-2" role="group" aria-label={t('animation.timing.title')} data-testid="animation-timing">
   <NativeSelect className={fieldCls} value={mode} aria-label={t('animation.timing.title')} onChange={e=>setMode(e.target.value as TimingMode)} data-testid="animation-timing-mode">{TIMING_MODES.map(m=><option key={m} value={m}>{t(`animation.timing.mode.${m}`)}</option>)}</NativeSelect>
   {usesFrames&&<NativeInput className={fieldCls} type="number" min={SIGNED_MODES.includes(mode)?-MAX_STAGGER_FRAMES:0} max={MAX_STAGGER_FRAMES} step={1} value={frames} aria-label={t('animation.timing.frames')} onChange={e=>setFrames(e.target.value)} data-testid="animation-timing-frames"/>}
   <Button size="compact" variant="outline" disabled={!plan||plan.changed===0} onClick={()=>void executeCommand('animation.timing.apply',{layers:ids,mode,...(usesFrames?{frames:fn}:{})})} data-testid="animation-timing-apply">{t('animation.timing.apply')}</Button>
   {plan&&<div className="text-ink-3" role="status" data-testid="animation-timing-count">{t(plan.skipped?'animation.timing.countSkipped':'animation.timing.count',{changed:plan.changed,skipped:plan.skipped})}</div>}
   <div className="text-ink-3">{t('animation.timing.hint')}</div>
  </div>
 </fieldset>;
}
