import {useState} from 'react';
import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
import {NativeInput,NativeSelect} from '../ui/native-controls';
import {Menu,MenuTrigger,MenuContent,MenuItem,MenuSubmenu,MenuSubmenuTrigger} from '../ui/menu';
import {useAnimationState} from '../../lib/animation/session';
import {timingPlan,TIMING_MODES,FRAME_MODES,SIGNED_MODES,MAX_STAGGER_FRAMES,type TimingMode} from '../../lib/animation/layerTiming';
import {executeCommand} from '../../lib/commands';
import {EASES,EASE_LABEL} from './format';
import type {EasePreset} from '../../lib/animation/graph';
import {poseId} from '../../lib/animation/poseModel';
import type {Composition} from '../../lib/animation/model';
/** The commands take at most 50 layers, so "all" stops there. */
const MAX_PICK=50;
type RigItem={testid:string;label:string;cmd:string;min:number;args?:object};
const groups:{key:string;items:RigItem[]}[]=[
 {key:'hierarchy',items:[
  {testid:'animation-rig-chain',label:'animation.rig.chain',cmd:'animation.rig.chain',min:2},
  {testid:'animation-rig-group',label:'animation.rig.group',cmd:'animation.rig.group',min:1},
  {testid:'animation-rig-release',label:'animation.rig.release',cmd:'animation.rig.release',min:1}]},
 {key:'layers',items:[
  {testid:'animation-rig-duplicate',label:'animation.rig.duplicate',cmd:'animation.layers.duplicate',min:1},
  {testid:'animation-rig-split',label:'animation.rig.split',cmd:'animation.layers.split',min:1},
  {testid:'animation-rig-workarea',label:'animation.rig.workarea',cmd:'animation.workarea.toLayers',min:1},
  {testid:'animation-rig-center',label:'animation.rig.center',cmd:'animation.layers.centerAnchor',min:1},
  {testid:'animation-rig-trim',label:'animation.rig.trim',cmd:'animation.layers.trimToWorkArea',min:1},
  {testid:'animation-rig-reseed',label:'animation.rig.reseed',cmd:'animation.modifiers.reseed',min:1},
  {testid:'animation-rig-number',label:'animation.rig.number',cmd:'animation.layers.number',min:1},
  {testid:'animation-rig-markers',label:'animation.rig.markers',cmd:'animation.marker.fromLayers',min:1}]},
 {key:'order',items:(['front','back','up','down','reverse'] as const).map(m=>({testid:`animation-rig-order-${m}`,label:`animation.rig.order.${m}`,cmd:'animation.layers.arrange',min:m==='reverse'?2:1,args:{mode:m}}))},
 {key:'align',items:(['left','centerX','right','top','centerY','bottom','distributeX','distributeY'] as const).map(m=>({testid:`animation-rig-align-${m}`,label:`animation.rig.align.${m}`,cmd:'animation.layers.align',min:m.startsWith('distribute')?3:2,args:{mode:m}}))},
 {key:'match',items:(['position','scale','rotation','opacity','all'] as const).map(m=>({testid:`animation-rig-match-${m}`,label:`animation.rig.match.${m}`,cmd:'animation.layers.match',min:2,args:{mode:m}}))},
 {key:'reset',items:(['rotation','scale','opacity','all'] as const).map(m=>({testid:`animation-rig-reset-${m}`,label:`animation.rig.reset.${m}`,cmd:'animation.layers.reset',min:1,args:{mode:m}}))},
 {key:'fit',items:(['contain','cover','width','height'] as const).map(m=>({testid:`animation-rig-fit-${m}`,label:`animation.rig.fit.${m}`,cmd:'animation.layers.fit',min:1,args:{mode:m}}))},
 {key:'fade',items:(['in','out','both'] as const).map(m=>({testid:`animation-rig-fade-${m}`,label:`animation.rig.fade.${m}`,cmd:'animation.layers.fade',min:1,args:{mode:m}}))},
 {key:'orient',items:([['right',0],['down',90],['left',180],['up',-90]] as const).map(([m,o])=>({testid:`animation-rig-orient-${m}`,label:`animation.rig.orient.${m}`,cmd:'animation.layers.orient',min:1,args:{offset:o}}))},
 {key:'state',items:(['visible','solo','locked','shy'] as const).map(f=>({testid:`animation-rig-flag-${f}`,label:`animation.rig.flag.${f}`,cmd:'animation.layers.flag',min:1,args:{flag:f}}))}];
/** Menu layout: the small groups are nested so the top level stays at five entries. */
const byKey=(k:string)=>groups.find(g=>g.key===k)!;
const tree:{key:string;items?:RigItem[];children?:{key:string;items:RigItem[]}[]}[]=[byKey('hierarchy'),byKey('layers'),{key:'arrange',children:['order','align','fit','match'].map(byKey)},{key:'appearance',children:['reset','fade','orient'].map(byKey)},byKey('state')];
/** Left-panel section: tick layers, then chain them, group them under a control null, or release their parents. Tick order is the chain order. */
export function RigPanel({comp}:{comp:Composition}){
 const {t}=useT();const [ticked,setTicked]=useState<string[]>([]);const poses=useAnimationState().doc?.poses?.items??[];const [pose,setPose]=useState('');const [naming,setNaming]=useState(false);const [pname,setPname]=useState('');const [pamount,setPamount]=useState('100');const [pkeys,setPkeys]=useState(false);const [trans,setTrans]=useState(false);const [pto,setPto]=useState('');const [pframes,setPframes]=useState('12');const [pease,setPease]=useState<EasePreset>('ease');const pframesOk=Number.isInteger(Number(pframes))&&Number(pframes)>=1&&Number(pframes)<=600&&pframes.trim()!=='';const amountOk=Number.isInteger(Number(pamount))&&Number(pamount)>=1&&Number(pamount)<=100&&pamount.trim()!=='';const applyPose=async(id:string)=>{try{await executeCommand('animation.pose.apply',{id,keys:pkeys,amount:Number(pamount)});}catch{/* the command reports expected problems */}};
 const ids=ticked.filter(id=>comp.layers.some(l=>l.id===id));
 const toggle=(id:string)=>setTicked(ids.includes(id)?ids.filter(x=>x!==id):[...ids,id]);
 const subGroup=(g:{key:string;items:RigItem[]})=><MenuSubmenu key={g.key}><MenuSubmenuTrigger className="menu-item" data-testid={`animation-rig-group-${g.key}`}>{t(`animation.rig.group.${g.key}`)}<span aria-hidden="true">›</span></MenuSubmenuTrigger>
     <MenuContent>{g.items.map(it=><MenuItem key={it.testid} disabled={ids.length<it.min} onClick={()=>run(it.cmd,it.args)} data-testid={it.testid}>{t(it.label)}</MenuItem>)}</MenuContent></MenuSubmenu>;
 const run=(cmd:string,args?:object)=>void executeCommand(cmd,{layers:ids,...args});
 const playhead=useAnimationState().view.playhead;const [mode,setMode]=useState<TimingMode>('stagger');const [frames,setFrames]=useState('4');const [follow,setFollow]=useState('3');const followOk=follow.trim()!==''&&Number.isInteger(Number(follow))&&Number(follow)>=0&&Number(follow)<=60;
 const fn=Number(frames),usesFrames=FRAME_MODES.includes(mode),framesOk=!usesFrames||(frames.trim()!==''&&Number.isInteger(fn)&&fn>=(SIGNED_MODES.includes(mode)?-MAX_STAGGER_FRAMES:0)&&fn<=MAX_STAGGER_FRAMES);
 const plan=ids.length&&framesOk?timingPlan(comp,ids,mode,{playhead,frames:usesFrames?fn:undefined}):null;
 const fieldCls='h-8 w-full min-w-0 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink select-text';
 const real=comp.layers.filter(l=>l.kind!=='audio');const pickable=real.slice(0,MAX_PICK),allOn=pickable.length>0&&ids.length===pickable.length;
 return <fieldset className="m-0 grid min-w-0 gap-2 border border-subtle p-2" data-testid="animation-rig"><legend className="text-ink-3">{t('animation.rig.title')}</legend>
  {real.length>1&&<label className="flex min-w-0 items-center gap-1 text-ink-3"><NativeInput type="checkbox" className="animation-checkbox" checked={allOn} ref={el=>{if(el)el.indeterminate=ids.length>0&&!allOn;}} onChange={()=>setTicked(allOn?[]:pickable.map(l=>l.id))} data-testid="animation-rig-pick-all"/><span className="min-w-0 truncate">{t('animation.rig.pickAll')}</span></label>}
  <ul className="m-0 grid max-h-40 list-none gap-1 overflow-auto p-0">{real.map(l=>{const n=ids.indexOf(l.id);return <li key={l.id}><label className="flex min-w-0 items-center gap-1 text-ink-2"><NativeInput type="checkbox" className="animation-checkbox" checked={n>=0} onChange={()=>toggle(l.id)} data-testid={`animation-rig-pick-${l.id}`}/><span className="min-w-0 truncate">{l.name}</span>{n>=0&&<span className="text-ink-3">{n+1}</span>}</label></li>;})}</ul>
  <div className="grid min-w-0 gap-1">
   <Menu><MenuTrigger render={<Button size="compact" variant="outline" className="h-auto min-w-0 whitespace-normal" disabled={ids.length<1} data-testid="animation-rig-menu">{t('animation.rig.menu')}</Button>}/>
    <MenuContent>{tree.map(g=>g.children?<MenuSubmenu key={g.key}><MenuSubmenuTrigger className="menu-item" data-testid={`animation-rig-group-${g.key}`}>{t(`animation.rig.group.${g.key}`)}<span aria-hidden="true">›</span></MenuSubmenuTrigger>
     <MenuContent>{g.children.map(c=>subGroup(c))}</MenuContent></MenuSubmenu>:subGroup(g as {key:string;items:RigItem[]}))}</MenuContent></Menu>
   <div className="grid min-w-0 grid-cols-[1fr_4rem] gap-1"><Button size="compact" variant="outline" className="h-auto min-w-0 whitespace-normal text-left" disabled={ids.length<2||!followOk} onClick={()=>void executeCommand('animation.rig.follow',{layers:ids,frames:Number(follow)})} data-testid="animation-rig-follow">{t('animation.rig.follow')}</Button>
    <NativeInput className="h-8 w-full min-w-0 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink select-text" type="number" min={0} max={60} step={1} value={follow} aria-label={t('animation.rig.followFrames')} onChange={e=>setFollow(e.target.value)} data-testid="animation-rig-follow-frames"/></div>
  </div>
  <div className="grid min-w-0 gap-1" role="group" aria-label={t('animation.pose.title')} data-testid="animation-pose">
   <NativeSelect className="h-8 w-full min-w-0 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink" value={pose} disabled={!poses.length} aria-label={t('animation.pose.title')} onChange={async e=>{const v=e.target.value;setPose(v);if(v&&amountOk)await applyPose(v);}} data-testid="animation-pose-pick">
    <option value="">{poses.length?t('animation.pose.pick'):t('animation.pose.none')}</option>{poses.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</NativeSelect>
   {poses.length>0&&<div className="flex min-w-0 flex-wrap items-center gap-2 text-ink-3"><label className="flex items-center gap-1">{t('animation.pose.amount')}<NativeInput className="h-8 w-16 min-w-0 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink select-text" type="number" min={1} max={100} step={1} value={pamount} onChange={e=>setPamount(e.target.value)} data-testid="animation-pose-amount"/></label>
    <label className="flex items-center gap-1"><NativeInput type="checkbox" className="animation-checkbox" checked={pkeys} onChange={e=>setPkeys(e.target.checked)} data-testid="animation-pose-keys"/>{t('animation.pose.keys')}</label></div>}
   {pose&&poses.length>1&&<Button size="tiny" variant="ghost" aria-expanded={trans} onClick={()=>setTrans(!trans)} data-testid="animation-pose-transition">{t('animation.pose.transition')}</Button>}
   {pose&&trans&&poses.length>1&&<div className="grid min-w-0 gap-1" data-testid="animation-pose-transition-panel">
    <NativeSelect className="h-8 w-full min-w-0 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink" value={pto} aria-label={t('animation.pose.to')} onChange={e=>setPto(e.target.value)} data-testid="animation-pose-to"><option value="">{t('animation.pose.to')}</option>{poses.filter(x=>x.id!==pose).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</NativeSelect>
    <div className="flex min-w-0 flex-wrap items-center gap-2 text-ink-3"><label className="flex items-center gap-1">{t('animation.pose.frames')}<NativeInput className="h-8 w-16 min-w-0 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink select-text" type="number" min={1} max={600} step={1} value={pframes} onChange={e=>setPframes(e.target.value)} data-testid="animation-pose-frames"/></label>
     <NativeSelect className="h-8 min-w-0 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink" value={pease} aria-label={t('animation.pose.ease')} onChange={e=>setPease(e.target.value as EasePreset)} data-testid="animation-pose-ease">{EASES.map(k=><option key={k} value={k}>{t(EASE_LABEL[k])}</option>)}</NativeSelect></div>
    <Button size="compact" variant="outline" disabled={!pto||!pframesOk} onClick={async()=>{try{await executeCommand('animation.pose.transition',{from:pose,to:pto,frames:Number(pframes),ease:pease});}catch{/* the command reports expected problems */}}} data-testid="animation-pose-transition-go">{t('animation.pose.transitionGo')}</Button></div>}
   <div className="flex min-w-0 flex-wrap items-center gap-1">
    {naming?<><NativeInput className="h-8 w-full min-w-0 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink select-text" type="text" maxLength={40} value={pname} placeholder={t('animation.pose.name')} aria-label={t('animation.pose.name')} onChange={e=>setPname(e.target.value)} data-testid="animation-pose-name"/>
     <Button size="tiny" variant="ghost" disabled={!pname.trim()||ids.length<1} onClick={async()=>{try{await executeCommand('animation.pose.save',{name:pname,layers:ids});setPose(poseId(pname));setNaming(false);setPname('');}catch{/* expected problems stay in the command result */}}} data-testid="animation-pose-save-go">{t('animation.pose.saveGo')}</Button></>
     :<Button size="tiny" variant="ghost" disabled={ids.length<1} onClick={()=>setNaming(true)} data-testid="animation-pose-save">{t('animation.pose.save')}</Button>}
    {pose&&!naming&&<Button size="tiny" variant="ghost" disabled={!amountOk} onClick={()=>void applyPose(pose)} data-testid="animation-pose-apply">{t('animation.pose.apply')}</Button>}
    {pose&&!naming&&<Button size="tiny" variant="ghost" onClick={async()=>{try{await executeCommand('animation.pose.delete',{id:pose});setPose('');}catch{/* gone already */}}} data-testid="animation-pose-delete">{t('animation.pose.delete')}</Button>}
   </div>
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
