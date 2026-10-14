import {useState} from 'react';
import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
import {NativeSelect} from '../ui/native-controls';
import {InspectorNumberField} from '../studios/InspectorNumberField';
import {animationSession} from '../../lib/animation/session';
import {textPathEdit} from '../../lib/animation/textAnimators';
import type {Composition,Layer} from '../../lib/animation/model';
import {executeCommand} from '../../lib/commands';
const field='h-8 w-full min-w-0 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink select-text';
/** Text on a path: pick a path shape layer to copy the baseline from, move the start along it, or take the text off the path. Hovering Use path previews it without a history step. */
export function TextOnPath({layer,comp}:{layer:Layer;comp:Composition}){
 const {t}=useT();const [from,setFrom]=useState('');const [err,setErr]=useState<string|null>(null);
 const paths=comp.layers.filter(o=>o.id!==layer.id&&o.kind==='shape'&&o.source.shape==='path'&&!!o.source.path&&!o.source.pathKeys?.length&&!o.source.subpaths?.length);
 const run=async(p:Record<string,unknown>)=>{setErr(null);try{await executeCommand('animation.text.path',{layer:layer.id,...p});}catch(e){setErr((e as Error).message);}};
 const ghost=()=>{if(!from)return;try{const s=animationSession();s.previewEdits([textPathEdit(s.document!,layer.id,{op:'set',from})]);}catch{/* refusal shows on click */}};
 const unghost=()=>animationSession().cancelPreview();
 return <fieldset className="m-0 grid gap-2 border border-subtle p-2" disabled={layer.locked} data-testid="animation-text-path"><legend className="text-ink-3">{t('animation.textPath.title')}</legend>
  <div className="flex gap-1"><NativeSelect className={field} value={from} aria-label={t('animation.textPath.source')} onChange={e=>{setFrom(e.target.value);setErr(null);}} data-testid="animation-text-path-select"><option value="">{t('animation.textPath.source')}</option>{paths.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</NativeSelect>
   <Button size="tiny" variant="outline" disabled={!from} data-testid="animation-text-path-set" onPointerEnter={ghost} onPointerLeave={unghost} onFocus={ghost} onBlur={unghost} onClick={()=>{unghost();void run({op:'set',from});}}>{t('animation.textPath.use')}</Button></div>
  {layer.source.textPath&&<div className="flex items-end gap-1">
   <InspectorNumberField label={t('animation.textPath.start')} className={field} value={layer.source.textPathStart??0} min={0} max={100} step={1} onCommit={value=>void run({op:'start',value})}/>
   <Button size="tiny" variant="outline" data-testid="animation-text-path-clear" onClick={()=>void run({op:'clear'})}>{t('animation.textPath.clear')}</Button></div>}
  {err&&<div role="alert" className="text-danger">{err}</div>}
 </fieldset>;
}
