import {useState,useSyncExternalStore} from 'react';
import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import {pendingReturnsFor,clearPendingReturn,subscribeHandoff,handoffVersion} from '../../lib/handoff/registry';
import {openSlidesPictureInPhotos} from '../../lib/handoff/open';
/** CA2: quiet cross-studio row for a selected picture — "Edit in Photos studio", plus explicit replace on return. */
export function SlidesPictureHandoff({source,slideIndex,slideId,shapeId,working,busy,replaceImage}:{
 source:string;slideIndex:number;slideId:number;shapeId:number;working:Uint8Array|null;busy:boolean;
 replaceImage(data:Uint8Array):Promise<{ok:boolean;message?:string}>;
}){
 const {t}=useT();
 const [note,setNote]=useState(''),[applying,setApplying]=useState(false),[tick,setTick]=useState(0);
 useSyncExternalStore(subscribeHandoff,handoffVersion,handoffVersion);
 const pending=tick>=0?pendingReturnsFor(`slides:picture:${slideId}:${shapeId}`).find(p=>p.origin.file===source):undefined;
 const open=async()=>{
  if(!working)return;
  const r=await openSlidesPictureInPhotos({source,slideIndex,slideId,shapeId,working});
  if(!r.ok)setNote(r.message);
 };
 const apply=async()=>{
  if(!pending?.image)return;
  setApplying(true);setNote('');
  const r=await replaceImage(pending.image);
  setApplying(false);setTick(x=>x+1);
  if(!r.ok){setNote(r.message??'replace failed');return;}
  clearPendingReturn(pending.file);setNote(t('handoff.pictureApplied'));
 };
 return <div className="flex flex-wrap items-center gap-2 px-4 py-2" data-testid="slides-picture-handoff">
  <Button size="compact" variant="ghost" disabled={busy||applying||!working} onClick={()=>void open()}>{t('handoff.editInPhotos')}</Button>
  {pending&&<>
   <span className="text-xs text-ink-3">{t('handoff.pendingPicture')}</span>
   <Button size="compact" variant="ghost" disabled={applying||busy} onClick={()=>void apply()}>{t('handoff.applyPicture')}</Button>
   <Button size="compact" variant="ghost" disabled={applying} onClick={()=>{clearPendingReturn(pending.file);setNote('');setTick(x=>x+1);}}>{t('handoff.discard')}</Button>
  </>}
  {note&&<span role="status" className="text-xs text-ink-3">{note}</span>}
 </div>;
}
/** Host: reads the live session and selection, renders only for a single selected picture. */
import {useSlidesSession} from '../../lib/slides/session';
import {useValidShape} from './SlidesShapeOverlay';
import {commandDispatcher} from '../../lib/commandDispatcher';
import {encodeBase64} from '../../lib/slides/imageSniff';
/** Commands carry JSON: the pending handback bytes travel to slides.replaceImage as base64, exactly like the toolbar file pick. */
export const handoffReplaceImageParams=(source:string,slideId:number,shapeId:number,data:Uint8Array)=>({source,slideId,shapeId,data:encodeBase64(data)});
export function SlidesPictureHandoffHost(){
 const s=useSlidesSession(),valid=useValidShape();
 const slideId=s.slideIds[s.index];
 const shape=valid&&valid.more.length===0&&valid.shape.kind==='picture'?valid.shape:null;
 if(!shape||slideId===undefined||!s.source)return null;
 return <SlidesPictureHandoff source={s.name} slideIndex={s.index} slideId={slideId} shapeId={shape.id} working={s.working} busy={s.busy}
  replaceImage={data=>commandDispatcher.tryRunCommand('slides.replaceImage',handoffReplaceImageParams(s.source,slideId,shape.id,data),{origin:'ui'}).then(r=>r.ok?{ok:true}:{ok:false,message:r.error.message})}/>;
}
