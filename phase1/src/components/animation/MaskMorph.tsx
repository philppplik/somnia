import {useState} from 'react';
import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
import {NativeSelect} from '../ui/native-controls';
import {animationSession} from '../../lib/animation/session';
import {maskEdit,morphRefusal} from '../../lib/animation/masks';
import type {Layer,LayerMask} from '../../lib/animation/model';
import {executeCommand} from '../../lib/commands';
const field='h-8 w-full min-w-0 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink select-text';
/** Path-to-path morph: key this mask's path at the playhead to another path mask's shape. Refuses when the point counts differ, with the reason shown. */
export function MaskMorph({layer,m,index}:{layer:Layer;m:LayerMask;index:number}){
 const {t}=useT();const others=(layer.masks??[]).filter(o=>o.id!==m.id&&o.shape==='path'&&o.path);const [pick,setPick]=useState('');const [err,setErr]=useState('');
 const other=others.find(o=>o.id===pick);const why=other?morphRefusal(m,other):null;
 const peek=()=>{if(!other||why)return;const s=animationSession();try{s.previewEdits([maskEdit(s.document!,layer.id,{op:'morphTo',mask:m.id,other:other.id,t:s.getState().view.playhead})]);}catch{/* not applicable here */}};
 const unpeek=()=>animationSession().cancelPreview();
 if(!others.length)return null;
 return <div className="grid gap-1" data-testid={`animation-mask-morph-${index}`}>
  <div className="flex gap-1"><NativeSelect className={field} value={pick} aria-label={t('animation.morph.target')} onChange={e=>{setPick(e.target.value);setErr('');}} data-testid={`animation-morph-select-${index}`}>
   <option value="">{t('animation.morph.choose')}</option>{others.map(o=><option key={o.id} value={o.id}>{t('animation.morph.option',{n:(layer.masks??[]).indexOf(o)+1,count:o.path!.points.length})}</option>)}</NativeSelect>
   <Button size="tiny" variant="outline" disabled={!other||layer.locked} onPointerEnter={peek} onPointerLeave={unpeek} onFocus={peek} onBlur={unpeek}
    onClick={async()=>{unpeek();setErr('');if(why){setErr(why);return;}try{await executeCommand('animation.layer.mask',{layer:layer.id,op:'morphTo',mask:m.id,other:other!.id});}catch(e){setErr((e as Error).message);}}} data-testid={`animation-morph-apply-${index}`}>{t('animation.morph.apply')}</Button></div>
  {(why||err)&&<div role="alert" className="text-danger" data-testid={`animation-morph-error-${index}`}>{why??err}</div>}
 </div>;
}
