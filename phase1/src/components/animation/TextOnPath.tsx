import {panelField as field} from '../shell/panelStyles';
import {useState} from 'react';
import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
import {NativeInput,NativeSelect} from '../ui/native-controls';
import {InspectorNumberField} from '../studios/InspectorNumberField';
import {animationSession,useAnimationState} from '../../lib/animation/session';
import {textPathEdit,textPathStartAt} from '../../lib/animation/textAnimators';
import type {Edit} from '../../lib/animation/edit';
import type {Composition,Layer} from '../../lib/animation/model';
import {executeCommand} from '../../lib/commands';

/** Text on a path: pick a path shape layer to copy the baseline from, move the start along it, or take the text off the path. Hovering Use path previews it without a history step. */
export function TextOnPath({layer,comp}:{layer:Layer;comp:Composition}){
 const {t}=useT();const at=useAnimationState().view.playhead;const keyed=!!layer.source.textPathStartAnim?.keys.length;const edit=(e:Edit)=>{setErr(null);try{animationSession().dispatch(e);}catch(x){setErr((x as Error).message);}};const [from,setFrom]=useState('');const [err,setErr]=useState<string|null>(null);
 const paths=comp.layers.filter(o=>o.id!==layer.id&&o.kind==='shape'&&o.source.shape==='path'&&!!o.source.path&&!o.source.pathKeys?.length&&!o.source.subpaths?.length);
 const run=async(p:Record<string,unknown>)=>{setErr(null);try{await executeCommand('animation.text.path',{layer:layer.id,...p});}catch(e){setErr((e as Error).message);}};
 const ghost=()=>{if(!from)return;try{const s=animationSession();s.previewEdits([textPathEdit(s.document!,layer.id,{op:'set',from})]);}catch{/* refusal shows on click */}};
 const unghost=()=>animationSession().cancelPreview();
 return <fieldset className="m-0 grid gap-2 border border-subtle p-2" disabled={layer.locked} data-testid="animation-text-path"><legend className="text-ink-3">{t('animation.textPath.title')}</legend>
  <div className="flex gap-1"><NativeSelect className={field} value={from} aria-label={t('animation.textPath.source')} onChange={e=>{setFrom(e.target.value);setErr(null);}} data-testid="animation-text-path-select"><option value="">{t('animation.textPath.source')}</option>{paths.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</NativeSelect>
   <Button size="tiny" variant="outline" disabled={!from} data-testid="animation-text-path-set" onPointerEnter={ghost} onPointerLeave={unghost} onFocus={ghost} onBlur={unghost} onClick={()=>{unghost();void run({op:'set',from});}}>{t('animation.textPath.use')}</Button></div>
  {layer.source.textPath&&<div className="flex items-end gap-1">
   <InspectorNumberField label={t('animation.textPath.start')} className={field} value={keyed?Math.round(textPathStartAt(layer,at)*100)/100:layer.source.textPathStart??0} min={keyed?-100:0} max={keyed?200:100} step={1} onCommit={value=>keyed?edit({type:'textpath.start',layer:layer.id,op:'set',value,t:at}):void run({op:'start',value})}/>
   <label className="flex items-center gap-1 text-ink-3"><NativeInput type="checkbox" className="animation-checkbox" checked={keyed} aria-label={t('animation.repeater.animate',{name:t('animation.textPath.start')})} data-testid="animation-text-path-animate" onChange={e=>edit({type:'textpath.start',layer:layer.id,op:'animate',on:e.target.checked,t:at})}/>{t('animation.repeater.animateShort')}</label>
   <Button size="tiny" variant="outline" data-testid="animation-text-path-clear" onClick={()=>void run({op:'clear'})}>{t('animation.textPath.clear')}</Button></div>}
  {err&&<div role="alert" className="text-danger">{err}</div>}
 </fieldset>;
}
