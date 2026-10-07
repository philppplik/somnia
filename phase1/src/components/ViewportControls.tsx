import {useEffect,useState} from 'react';
import {RotateCw} from '../lib/icons';
import {clampViewport,patchState,useAppStore} from '../store/appStore';
import {useT} from '../lib/useT';
export const VIEWPORT_PRESETS=[
 {label:'Desktop 1920 x 1080',w:1920,h:1080},{label:'Laptop 1440 x 900',w:1440,h:900},{label:'Desktop 1280 x 900',w:1280,h:900},
 {label:'iPad 820 x 1180',w:820,h:1180},{label:'iPhone 393 x 852',w:393,h:852},{label:'Small phone 360 x 640',w:360,h:640}];
function NumberField({label,value,max,onCommit}:{label:string;value:number;max:number;onCommit:(n:number)=>void}){
 const [draft,setDraft]=useState(String(value));useEffect(()=>setDraft(String(value)),[value]);
 const commit=()=>{const n=parseInt(draft,10);if(Number.isFinite(n))onCommit(clampViewport(n,max));else setDraft(String(value));};
 return <input aria-label={label} inputMode="numeric" className="viewport-field" value={draft} onChange={e=>setDraft(e.target.value.replace(/[^0-9]/g,''))} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){commit();(e.target as HTMLInputElement).blur();}}}/>;
}
/** Free viewport size: width and height fields, device presets and a rotate button. The canvas also has drag handles. */
export function ViewportControls(){const {t}=useT();
 const s=useAppStore();const match=VIEWPORT_PRESETS.find(p=>p.w===s.viewport&&p.h===s.viewportHeight);
 return <div className="viewport-controls flex items-center gap-1" role="group" aria-label={t('rest.viewportControls.customViewport')}>
  <NumberField label="Viewport width" value={s.viewport} max={3840} onCommit={n=>patchState({viewport:n})}/><span aria-hidden>×</span>
  <NumberField label="Viewport height" value={s.viewportHeight} max={4000} onCommit={n=>patchState({viewportHeight:n})}/>
  <select aria-label={t('rest.viewportControls.viewportPreset')} className="viewport-field !w-[92px]" value={match?match.label:''} onChange={e=>{const p=VIEWPORT_PRESETS.find(x=>x.label===e.target.value);if(p)patchState({viewport:p.w,viewportHeight:p.h});}}><option value="">{t('rest.viewportControls.custom')}</option>{VIEWPORT_PRESETS.map(p=><option key={p.label} value={p.label}>{p.label}</option>)}</select>
  <button type="button" aria-label={t('rest.viewportControls.rotateViewport')} title={t('rest.viewportControls.swapWidthAndHeight')} className="viewport-rotate" onClick={()=>patchState({viewport:clampViewport(s.viewportHeight,3840),viewportHeight:clampViewport(s.viewport,4000)})}><RotateCw size={12}/></button>
 </div>;
}
