import {useState} from 'react';
import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
import {NativeInput,NativeSelect} from '../ui/native-controls';
import {executeCommand} from '../../lib/commands';
import {useAnimationState} from '../../lib/animation/session';
import {normalizeOverlays,OVERLAY_KEYS,type OverlayKey} from '../../lib/animation/guides';
import type {Composition} from '../../lib/animation/model';
const field='h-8 w-full min-w-0 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink select-text';
/** Left-panel section: overlay switches (view only) and ruler guides (saved with the composition, undoable). */
export function GuidesPanel({comp}:{comp:Composition}){
 const {t}=useT();const o=normalizeOverlays(useAnimationState().view.overlays);const [axis,setAxis]=useState<'x'|'y'>('x');const [at,setAt]=useState('');const [err,setErr]=useState('');
 const run=async(id:string,p:unknown)=>{setErr('');try{await executeCommand(id,p);}catch(e){setErr((e as Error).message);}};
 const g=comp.guides??[];const n=Number(at);
 return <fieldset className="m-0 grid min-w-0 gap-2 border border-subtle p-2" data-testid="animation-guides"><legend className="text-ink-3">{t('animation.guides.title')}</legend>
  <div className="grid grid-cols-2 gap-1">{OVERLAY_KEYS.map((k:OverlayKey)=><label key={k} className="flex items-center gap-1 text-ink-2"><NativeInput type="checkbox" className="animation-checkbox" checked={o[k]} onChange={e=>void run('animation.guides.overlay',{overlay:k,on:e.target.checked})} data-testid={`animation-guides-${k}`}/>{t(`animation.guides.${k}`)}</label>)}</div>
  <div className="grid min-w-0 grid-cols-2 gap-1">
   <NativeSelect className={field} value={axis} aria-label={t('animation.guides.axis')} onChange={e=>setAxis(e.target.value as 'x'|'y')}><option value="x">{t('animation.guides.vertical')}</option><option value="y">{t('animation.guides.horizontal')}</option></NativeSelect>
   <NativeInput className={field} inputMode="decimal" placeholder="px" aria-label={t('animation.guides.position')} value={at} onChange={e=>setAt(e.target.value)} data-testid="animation-guides-at"/></div>
  <Button size="compact" variant="outline" disabled={at.trim()===''||!Number.isFinite(n)} onClick={async()=>{await run('animation.guides.add',{axis,at:n});setAt('');}} data-testid="animation-guides-add">{t('animation.guides.add')}</Button>
  {g.length>0&&<ul className="m-0 grid list-none gap-1 p-0 text-ink-2" data-testid="animation-guides-list">{g.map((x,i)=><li key={`${x.axis}${x.at}`} className="flex items-center justify-between gap-1"><span className="min-w-0 truncate">{t(x.axis==='x'?'animation.guides.itemX':'animation.guides.itemY',{at:x.at})}</span><Button size="tiny" variant="ghost" onClick={()=>void run('animation.guides.remove',{index:i})} aria-label={t('animation.guides.remove',{at:x.at})}>{t('animation.guides.removeShort')}</Button></li>)}</ul>}
  {err&&<div role="alert" className="text-danger">{err}</div>}
 </fieldset>;
}
