import {useT} from '../../lib/useT';
import {NativeInput} from '../ui/native-controls';
import {executeCommand} from '../../lib/commands';
import {useAnimationState} from '../../lib/animation/session';
import {normalizeOnion,MAX_GHOSTS,MAX_STEP,MIN_OPACITY,MAX_OPACITY} from '../../lib/animation/onion';
const num='h-8 w-full min-w-0 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink select-text';
/** Left-panel section: onion skin switch and counts (view only, not saved, not exported). */
export function OnionPanel(){
 const {t}=useT();const o=normalizeOnion(useAnimationState().view.onion);
 const set=(p:object)=>void executeCommand('animation.onion.set',p);
 const field=(key:'before'|'after'|'step',max:number,min:number)=><label className="grid min-w-0 gap-1 text-ink-2">{t(`animation.onion.${key}`)}<NativeInput className={num} type="number" min={min} max={max} step={1} value={o[key]} disabled={!o.on} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))set({[key]:n});}} data-testid={`animation-onion-${key}`}/></label>;
 return <fieldset className="m-0 grid min-w-0 gap-2 border border-subtle p-2" data-testid="animation-onion"><legend className="text-ink-3">{t('animation.onion.title')}</legend>
  <label className="flex items-center gap-1 text-ink-2"><NativeInput type="checkbox" className="animation-checkbox" checked={o.on} onChange={e=>set({on:e.target.checked})} data-testid="animation-onion-on"/>{t('animation.onion.on')}</label>
  <div className="grid min-w-0 grid-cols-3 gap-1">{field('before',MAX_GHOSTS,0)}{field('after',MAX_GHOSTS,0)}{field('step',MAX_STEP,1)}</div>
  <div className="grid min-w-0 grid-cols-2 gap-1"><label className="grid min-w-0 gap-1 text-ink-2">{t('animation.onion.opacity')}<NativeInput className={num} type="number" min={MIN_OPACITY} max={MAX_OPACITY} step={5} value={o.opacity} disabled={!o.on} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))set({opacity:n});}} data-testid="animation-onion-opacity"/></label></div>
  <label className="flex items-center gap-1 text-ink-2"><NativeInput type="checkbox" className="animation-checkbox" checked={o.selectedOnly} disabled={!o.on} onChange={e=>set({selectedOnly:e.target.checked})} data-testid="animation-onion-selected"/>{t('animation.onion.selectedOnly')}</label>
  <label className="flex items-center gap-1 text-ink-2"><NativeInput type="checkbox" className="animation-checkbox" checked={o.tint} disabled={!o.on} onChange={e=>set({tint:e.target.checked})} data-testid="animation-onion-tint"/>{t('animation.onion.tint')}</label>
  <div className="text-ink-3">{t('animation.onion.hint')}</div>
 </fieldset>;
}
