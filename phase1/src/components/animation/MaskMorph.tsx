import {panelField as field} from '../shell/panelStyles';
import {useState} from 'react';
import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
import {NativeInput,NativeSelect} from '../ui/native-controls';
import {InspectorNumberField} from '../studios/InspectorNumberField';
import {animationSession} from '../../lib/animation/session';
import {maskEdit,morphProblem,MorphError,type MorphOpts} from '../../lib/animation/masks';
import type {Layer,LayerMask} from '../../lib/animation/model';
import {executeCommand} from '../../lib/commands';

/** Path-to-path morph: key this mask's path at the playhead to another path mask's shape. Optional point matching (arc-length resampling), reverse and start point. Refusals are shown in the user's language. */
export function MaskMorph({layer,m,index}:{layer:Layer;m:LayerMask;index:number}){
 const {t}=useT();const others=(layer.masks??[]).filter(o=>o.id!==m.id&&o.shape==='path'&&o.path);const [pick,setPick]=useState('');const [err,setErr]=useState<{key:string;params?:Record<string,number>}|string|null>(null);
 const [match,setMatch]=useState(false);const [reverse,setReverse]=useState(false);const [shift,setShift]=useState(0);
 const other=others.find(o=>o.id===pick);const opts:MorphOpts={match:match?'resample':'index',reverse,shift};const why=other?morphProblem(m,other,opts):null;
 const edit=()=>{const s=animationSession();return maskEdit(s.document!,layer.id,{op:'morphTo',mask:m.id,other:other!.id,t:s.getState().view.playhead,...opts});};
 const peek=()=>{if(!other||why)return;try{animationSession().previewEdits([edit()]);}catch{/* not applicable here */}};
 const unpeek=()=>animationSession().cancelPreview();
 const show=(e:{key:string;params?:Record<string,number>}|string)=>typeof e==='string'?e:t(e.key,e.params);
 const shown=why??err;
 if(!others.length)return null;
 return <div className="grid gap-1" data-testid={`animation-mask-morph-${index}`}>
  <div className="flex gap-1"><NativeSelect className={field} value={pick} aria-label={t('animation.morph.target')} onChange={e=>{setPick(e.target.value);setErr(null);}} data-testid={`animation-morph-select-${index}`}>
   <option value="">{t('animation.morph.choose')}</option>{others.map(o=><option key={o.id} value={o.id}>{t('animation.morph.option',{n:(layer.masks??[]).indexOf(o)+1,count:o.path!.points.length})}</option>)}</NativeSelect>
   <Button size="tiny" variant="outline" disabled={!other||layer.locked} onPointerEnter={peek} onPointerLeave={unpeek} onFocus={peek} onBlur={unpeek}
    onClick={async()=>{unpeek();setErr(null);if(why){setErr(why);return;}try{await executeCommand('animation.layer.mask',{layer:layer.id,op:'morphTo',mask:m.id,other:other!.id,...opts});}catch(e){setErr(e instanceof MorphError?e.problem:(e as Error).message);}}} data-testid={`animation-morph-apply-${index}`}>{t('animation.morph.apply')}</Button></div>
  <div className="flex flex-wrap items-center gap-2 text-ink-3">
   <label className="flex items-center gap-1"><NativeInput type="checkbox" className="animation-checkbox" checked={match} onChange={e=>setMatch(e.target.checked)} data-testid={`animation-morph-match-${index}`}/>{t('animation.morph.match')}</label>
   <label className="flex items-center gap-1"><NativeInput type="checkbox" className="animation-checkbox" checked={reverse} onChange={e=>setReverse(e.target.checked)} data-testid={`animation-morph-reverse-${index}`}/>{t('animation.morph.reverse')}</label>
   <InspectorNumberField label={t('animation.morph.start')} className={field} value={shift} min={0} max={Math.max(0,m.path!.points.length-1)} step={1} disabled={!m.path!.closed} onCommit={v=>setShift(Math.max(0,Math.round(v)))}/></div>
  {shown&&<div role="alert" className="text-danger" data-testid={`animation-morph-error-${index}`}>{show(shown)}</div>}
 </div>;
}
