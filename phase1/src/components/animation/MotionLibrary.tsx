import {panelField as field} from '../shell/panelStyles';
import {useEffect,useRef,useState} from 'react';
import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
import {NativeInput} from '../ui/native-controls';
import {animationSession,useAnimationState} from '../../lib/animation/session';
import {layerSetIds} from '../../lib/animation/layerSet';
import {exportMotionsJson,legacyMotions,motionEdits,parseMotionsJson,useMotions,userMotions,MOTION_FILE_LIMIT,type MotionSet} from '../../lib/animation/motionLibrary';
import {pruneSelection} from '../../lib/animation/selection';
import {executeCommand} from '../../lib/commands';

const migrated=new Set<string>();
/** Motion presets stored in the document. Hover or focus previews on the canvas, a click applies in one undo step. Files are previewed before they are added. */
export function MotionLibrary({layerId,locked}:{layerId:string;locked:boolean}){
 const {t}=useT();const motions=useMotions();const s=useAnimationState();const [name,setName]=useState('');const [err,setErr]=useState('');
 const [staged,setStaged]=useState<MotionSet[]|null>(null);const file=useRef<HTMLInputElement>(null);
 const doc=animationSession().document;const hasKeys=pruneSelection(doc,s.view.selectedKeys).length>0;const saved=userMotions(doc).length;
 /** One-time move of presets saved in the browser by an earlier version into this document. Skips documents that already hold a library. */
 useEffect(()=>{
  const d=animationSession().document;if(!d||d.motions||migrated.has(d.id))return;migrated.add(d.id);
  const old=legacyMotions();if(old.length)void executeCommand('animation.motion.import',{json:exportMotionsJson(old)}).catch(()=>{/* presets stay in the browser copy */});
 },[doc?.id,doc?.motions]);
 const label=(m:MotionSet)=>m.builtin?t(`animation.motion.${m.id}`):m.name;
 const peek=(m:MotionSet)=>{const ses=animationSession();try{const d=ses.document!;ses.previewEdits(layerSetIds(layerId).flatMap(id=>motionEdits(d,id,m,ses.getState().view.playhead)));}catch{/* not applicable */}};
 const unpeek=()=>animationSession().cancelPreview();
 const call=async(id:string,params?:unknown)=>{setErr('');unpeek();try{await executeCommand(id,params);return true;}catch(e){setErr((e as Error).message);return false;}};
 const read=async(f:File|undefined)=>{setErr('');setStaged(null);if(!f)return;if(f.size>MOTION_FILE_LIMIT){setErr(t('animation.motion.tooLarge'));return;}try{setStaged(parseMotionsJson(await f.text()));}catch(e){setErr((e as Error).message);}};
 const sum=(m:MotionSet)=>t('animation.motion.summary',{tracks:m.tracks.length,keys:m.tracks.reduce((n,x)=>n+x.keys.length,0)});
 return <fieldset className="m-0 grid gap-2 border border-subtle p-2" disabled={locked} data-testid="animation-motion-library"><legend className="text-ink-3">{t('animation.motion.title')}</legend>
  <div className="flex flex-wrap gap-1">{motions.map(m=><span key={m.id} className="flex items-center">
   <Button size="tiny" variant="outline" onClick={()=>void call('animation.motion.apply',{preset:m.id})} onPointerEnter={()=>peek(m)} onPointerLeave={unpeek} onFocus={()=>peek(m)} onBlur={unpeek} data-testid={`animation-motion-${m.id}`}>{label(m)}</Button>
   {!m.builtin&&<Button size="tiny" variant="ghost" aria-label={t('animation.motion.delete')} onClick={()=>void call('animation.motion.delete',{preset:m.id})}>×</Button>}</span>)}</div>
  <div className="flex gap-1"><NativeInput className={field} value={name} maxLength={40} placeholder={t('animation.motion.name')} aria-label={t('animation.motion.name')} onChange={e=>setName(e.target.value)} data-testid="animation-motion-name"/>
   <Button size="tiny" variant="outline" disabled={!hasKeys||!name.trim()} title={hasKeys?undefined:t('animation.motion.needKeys')} onClick={async()=>{if(await call('animation.motion.save',{name}))setName('');}} data-testid="animation-motion-save">{t('animation.motion.save')}</Button></div>
  <div className="flex gap-1">
   <Button size="tiny" variant="ghost" disabled={!saved} onClick={()=>void call('animation.motion.export')} data-testid="animation-motion-export">{t('animation.motion.export')}</Button>
   <Button size="tiny" variant="ghost" onClick={()=>file.current?.click()} data-testid="animation-motion-import">{t('animation.motion.import')}</Button>
   <NativeInput ref={file} type="file" accept=".json,application/json" className="hidden" aria-label={t('animation.motion.import')} data-testid="animation-motion-file" onChange={e=>{const f=e.target.files?.[0];e.target.value='';void read(f);}}/></div>
  {staged&&<div className="grid gap-1 border-t border-subtle pt-2" data-testid="animation-motion-staged"><div className="text-ink-3">{t('animation.motion.staged',{count:staged.length})}</div>
   {staged.map((m,i)=><Button key={i} size="tiny" variant="ghost" className="justify-between" onPointerEnter={()=>peek(m)} onPointerLeave={unpeek} onFocus={()=>peek(m)} onBlur={unpeek}><span>{m.name}</span><span className="text-ink-3">{sum(m)}</span></Button>)}
   <div className="flex gap-1"><Button size="tiny" variant="outline" onClick={async()=>{if(await call('animation.motion.import',{json:exportMotionsJson(staged)}))setStaged(null);}} data-testid="animation-motion-add">{t('animation.motion.add',{count:staged.length})}</Button>
    <Button size="tiny" variant="ghost" onClick={()=>{unpeek();setStaged(null);}}>{t('animation.motion.cancel')}</Button></div></div>}
  {err&&<div role="alert" className="text-danger">{err}</div>}
 </fieldset>;
}
