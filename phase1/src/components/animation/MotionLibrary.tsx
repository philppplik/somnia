import {useState} from 'react';
import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
import {NativeInput} from '../ui/native-controls';
import {animationSession,useAnimationState} from '../../lib/animation/session';
import {layerSetIds} from '../../lib/animation/layerSet';
import {motionEdits,useMotions,type MotionSet} from '../../lib/animation/motionLibrary';
import {pruneSelection} from '../../lib/animation/selection';
import {executeCommand} from '../../lib/commands';
const field='h-8 w-full min-w-0 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink select-text';
/** Motion presets: built-in and locally saved key sets. Hover or focus previews on the canvas, a click applies in one undo step. */
export function MotionLibrary({layerId,locked}:{layerId:string;locked:boolean}){
 const {t}=useT();const motions=useMotions();const s=useAnimationState();const [name,setName]=useState('');const [err,setErr]=useState('');
 const hasKeys=pruneSelection(animationSession().document,s.view.selectedKeys).length>0;
 const label=(m:MotionSet)=>m.builtin?t(`animation.motion.${m.id}`):m.name;
 const peek=(m:MotionSet)=>{const ses=animationSession();try{const doc=ses.document!;ses.previewEdits(layerSetIds(layerId).flatMap(id=>motionEdits(doc,id,m,ses.getState().view.playhead)));}catch{/* not applicable */}};
 const unpeek=()=>animationSession().cancelPreview();
 const call=async(id:string,params:unknown)=>{setErr('');unpeek();try{await executeCommand(id,params);return true;}catch(e){setErr((e as Error).message);return false;}};
 return <fieldset className="m-0 grid gap-2 border border-subtle p-2" disabled={locked} data-testid="animation-motion-library"><legend className="text-ink-3">{t('animation.motion.title')}</legend>
  <div className="flex flex-wrap gap-1">{motions.map(m=><span key={m.id} className="flex items-center">
   <Button size="tiny" variant="outline" onClick={()=>void call('animation.motion.apply',{preset:m.id})} onPointerEnter={()=>peek(m)} onPointerLeave={unpeek} onFocus={()=>peek(m)} onBlur={unpeek} data-testid={`animation-motion-${m.id}`}>{label(m)}</Button>
   {!m.builtin&&<Button size="tiny" variant="ghost" aria-label={t('animation.motion.delete')} onClick={()=>void call('animation.motion.delete',{preset:m.id})}>×</Button>}</span>)}</div>
  <div className="flex gap-1"><NativeInput className={field} value={name} maxLength={40} placeholder={t('animation.motion.name')} aria-label={t('animation.motion.name')} onChange={e=>setName(e.target.value)} data-testid="animation-motion-name"/>
   <Button size="tiny" variant="outline" disabled={!hasKeys||!name.trim()} title={hasKeys?undefined:t('animation.motion.needKeys')} onClick={async()=>{if(await call('animation.motion.save',{name}))setName('');}} data-testid="animation-motion-save">{t('animation.motion.save')}</Button></div>
  {err&&<div role="alert" className="text-danger">{err}</div>}
 </fieldset>;
}
