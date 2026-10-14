import {useState} from 'react';
import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import {setActiveMedia} from '../../lib/media';
import {useSyncExternalStore} from 'react';
import {handoffOrigin,setPendingReturn,subscribeHandoff,handoffVersion} from '../../lib/handoff/registry';
/** CA2: one quiet line when this image came from a Slides picture; the deck side applies the edit explicitly. */
export function PhotosHandoffBar({file,disabled,getImage}:{file:string;disabled:boolean;getImage():Promise<Uint8Array>}){
 const {t}=useT();
 const [error,setError]=useState('');
 useSyncExternalStore(subscribeHandoff,handoffVersion,handoffVersion);
 const origin=handoffOrigin(file);
 if(!origin)return null;
 const back=async()=>{
  try{setPendingReturn(file,origin,{image:await getImage()});setActiveMedia(origin.file);}
  catch(e){setError(t('handoff.returnFailed',{message:e instanceof Error?e.message:String(e)}));}
 };
 return <div className="flex items-center gap-2 border-b border-subtle px-3 py-1 text-xs" data-testid="photos-handoff-bar">
  <span className="truncate text-ink-3">{t('handoff.fromSlidesPicture',{label:origin.label})}</span>
  <Button size="compact" variant="outline" disabled={disabled} onClick={()=>void back()} data-testid="photos-return-slides">{t('handoff.returnToSlides')}</Button>
  {error&&<span role="alert" className="text-xs text-danger">{error}</span>}
 </div>;
}
