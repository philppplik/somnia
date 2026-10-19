import {panelField as field} from '../shell/panelStyles';
import {useState} from 'react';
import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
import {NativeInput,NativeSelect} from '../ui/native-controls';
import {InspectorNumberField} from '../studios/InspectorNumberField';
import {animationSession} from '../../lib/animation/session';
import {pathLayerEdit,booleanEdits} from '../../lib/animation/pathLayer';
import {MorphError,type MorphOpts} from '../../lib/animation/masks';
import type {Layer} from '../../lib/animation/model';
import {executeCommand} from '../../lib/commands';

type Shown={key:string;params?:Record<string,number>}|string;
/** Animate path and morph into another path shape layer at the playhead. Hover previews the result without a history step; refusals are shown in the user's language. */
export function PathLayerMorph({layer,others}:{layer:Layer;others:readonly Layer[]}){
 const {t}=useT();const [pick,setPick]=useState('');const [comb,setComb]=useState('');const [bop,setBop]=useState('unite');const [err,setErr]=useState<Shown|null>(null);
 const [match,setMatch]=useState(false);const [reverse,setReverse]=useState(false);const [shift,setShift]=useState(0);
 const opts:MorphOpts={match:match?'resample':'index',reverse,shift};const animated=!!layer.source.pathKeys?.length;
 const build=()=>{const s=animationSession();return pathLayerEdit(s.document!,layer.id,{op:'morphTo',other:pick,t:s.getState().view.playhead,opts});};
 const peek=()=>{if(!pick||!animated)return;try{animationSession().previewEdits([build()]);}catch{/* not applicable here */}};
 const unpeek=()=>animationSession().cancelPreview();
 /** Hover ghost of the boolean result: a preview transaction, no history step, dropped on leave. */
 const ghost=()=>{if(!comb||animated)return;try{const sn=animationSession();sn.previewEdits(booleanEdits(sn.document!,layer.id,comb,bop as never));}catch{/* refusal is shown on click */}};
 const show=(e:Shown)=>typeof e==='string'?e:t(e.key,e.params);
 const many=layer.source.path!.points.length<=32;
 return <div className="grid gap-1" data-testid="animation-pathlayer">
  <label className="flex items-center gap-1 text-ink-3"><NativeInput type="checkbox" className="animation-checkbox" checked={animated} disabled={layer.locked||!many} onChange={e=>{setErr(null);executeCommand('animation.layer.path',{layer:layer.id,op:'animate',on:e.target.checked}).catch(x=>setErr((x as Error).message));}} data-testid="animation-pathlayer-animate"/>{t('animation.pathLayer.animate')}</label>
  {animated&&others.length>0&&<>
   <div className="flex gap-1"><NativeSelect className={field} value={pick} aria-label={t('animation.pathLayer.target')} onChange={e=>{setPick(e.target.value);setErr(null);}} data-testid="animation-pathlayer-select"><option value="">{t('animation.morph.choose')}</option>{others.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</NativeSelect>
    <Button size="tiny" variant="outline" disabled={!pick||layer.locked} onPointerEnter={peek} onPointerLeave={unpeek} onFocus={peek} onBlur={unpeek} data-testid="animation-pathlayer-apply"
     onClick={async()=>{unpeek();setErr(null);try{await executeCommand('animation.layer.path',{layer:layer.id,op:'morphTo',other:pick,opts});}catch(e){setErr(e instanceof MorphError?e.problem:(e as Error).message);}}}>{t('animation.morph.apply')}</Button></div>
   <div className="flex flex-wrap items-center gap-2 text-ink-3">
    <label className="flex items-center gap-1"><NativeInput type="checkbox" className="animation-checkbox" checked={match} onChange={e=>setMatch(e.target.checked)}/>{t('animation.morph.match')}</label>
    <label className="flex items-center gap-1"><NativeInput type="checkbox" className="animation-checkbox" checked={reverse} onChange={e=>setReverse(e.target.checked)}/>{t('animation.morph.reverse')}</label>
    <InspectorNumberField label={t('animation.morph.start')} className={field} value={shift} min={0} max={Math.max(0,layer.source.path!.points.length-1)} step={1} disabled={!layer.source.path!.closed} onCommit={v=>setShift(Math.max(0,Math.round(v)))}/></div></>}
  {others.length>0&&!animated&&<div className="flex gap-1"><NativeSelect className={field} value={comb} aria-label={t('animation.pathLayer.combineTarget')} onChange={e=>{setComb(e.target.value);setErr(null);}} data-testid="animation-pathlayer-combine-select"><option value="">{t('animation.pathLayer.combineTarget')}</option>{others.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</NativeSelect>
   <Button size="tiny" variant="outline" disabled={!comb||layer.locked} data-testid="animation-pathlayer-combine" onClick={async()=>{setErr(null);try{await executeCommand('animation.layer.pathCombine',{layer:layer.id,other:comb});setComb('');}catch(e){setErr((e as Error).message);}}}>{t('animation.pathLayer.combine')}</Button></div>}
 {others.length>0&&!animated&&<div className="flex gap-1"><NativeSelect className={field} value={bop} aria-label={t('animation.pathLayer.boolOp')} onChange={e=>setBop(e.target.value)} data-testid="animation-pathlayer-bool-op">{['unite','subtract','intersect','exclude'].map(o=><option key={o} value={o}>{t(`animation.pathLayer.bool.${o}`)}</option>)}</NativeSelect>
   <Button size="tiny" variant="outline" disabled={!comb||layer.locked} data-testid="animation-pathlayer-bool" onPointerEnter={ghost} onPointerLeave={unpeek} onFocus={ghost} onBlur={unpeek} onClick={async()=>{unpeek();setErr(null);try{await executeCommand('animation.layer.pathBoolean',{layer:layer.id,other:comb,op:bop});setComb('');}catch(e){setErr((e as Error).message);}}}>{t('animation.pathLayer.boolApply')}</Button></div>}
 {!!layer.stroke&&!animated&&<Button size="tiny" variant="outline" disabled={layer.locked||layer.stroke.width<=0} data-testid="animation-pathlayer-expand-stroke" onClick={async()=>{setErr(null);try{await executeCommand('animation.layer.expandStroke',{layer:layer.id});}catch(e){setErr((e as Error).message);}}}>{t('animation.pathLayer.expandStroke')}</Button>}
 {!!layer.source.subpaths?.length&&<div className="flex items-center gap-2 text-ink-3" data-testid="animation-pathlayer-subpaths">{t('animation.pathLayer.subpaths',{n:1+layer.source.subpaths.length})}
   <Button size="tiny" variant="outline" disabled={layer.locked} onClick={()=>void executeCommand('animation.layer.path',{layer:layer.id,op:'removeSubpath',index:layer.source.subpaths!.length}).catch(e=>setErr((e as Error).message))}>{t('animation.pathLayer.removeSubpath')}</Button></div>}
 {err&&<div role="alert" className="text-danger" data-testid="animation-pathlayer-error">{show(err)}</div>}
 </div>;
}
