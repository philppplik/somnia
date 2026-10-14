import {useState} from 'react';
import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
import {NativeSelect} from '../ui/native-controls';
import {animationSession} from '../../lib/animation/session';
import {maskBooleanEdit} from '../../lib/animation/pathLayer';
import {BOOL_OPS} from '../../lib/animation/pathBoolean';
import type {Layer,LayerMask} from '../../lib/animation/model';
import {executeCommand} from '../../lib/commands';
const field='h-8 w-full min-w-0 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink select-text';
/** Boolean of this mask with another mask of the layer. Hovering Apply shows the result as a preview transaction (no history step). */
export function MaskBoolean({layer,mask,index}:{layer:Layer;mask:LayerMask;index:number}){
 const {t}=useT();const [other,setOther]=useState('');const [op,setOp]=useState('unite');const [err,setErr]=useState<string|null>(null);
 const others=(layer.masks??[]).filter(m=>m.id!==mask.id);if(!others.length)return null;
 const ghost=()=>{if(!other)return;try{const s=animationSession();s.previewEdits([maskBooleanEdit(s.document!,layer.id,mask.id,other,op as never)]);}catch{/* refusal is shown on click */}};
 const unghost=()=>animationSession().cancelPreview();
 return <div className="grid gap-1" data-testid={`animation-mask-bool-${index}`}>
  <div className="flex gap-1"><NativeSelect className={field} value={other} aria-label={t('animation.masks.boolOther')} onChange={e=>{setOther(e.target.value);setErr(null);}} data-testid={`animation-mask-bool-other-${index}`}><option value="">{t('animation.masks.boolOther')}</option>{others.map((o,k)=><option key={o.id} value={o.id}>{t('animation.masks.maskN',{n:k+1})}</option>)}</NativeSelect>
   <NativeSelect className={field} value={op} aria-label={t('animation.pathLayer.boolOp')} onChange={e=>setOp(e.target.value)} data-testid={`animation-mask-bool-op-${index}`}>{BOOL_OPS.map(o=><option key={o} value={o}>{t(`animation.pathLayer.bool.${o}`)}</option>)}</NativeSelect>
   <Button size="tiny" variant="outline" disabled={!other||layer.locked} data-testid={`animation-mask-bool-apply-${index}`} onPointerEnter={ghost} onPointerLeave={unghost} onFocus={ghost} onBlur={unghost}
    onClick={async()=>{unghost();setErr(null);try{await executeCommand('animation.mask.boolean',{layer:layer.id,mask:mask.id,other,op});setOther('');}catch(e){setErr((e as Error).message);}}}>{t('animation.pathLayer.boolApply')}</Button></div>
  {err&&<div role="alert" className="text-danger">{err}</div>}
 </div>;
}
