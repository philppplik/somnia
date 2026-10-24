import {useEffect,useRef} from 'react';
import {studioContextStore} from '../../../lib/shell/studioContext';
import {dirtyPhoto,usePhotoSession} from '../../../lib/photos/studioSession';
import {isNeutralPhoto} from '../../../lib/photos/studioSettings';
import {photosContextPatch} from '../../../lib/photos/contextPatch';
/** Photos canvas publisher: claims the shell StudioContext for the open photo and reports session facts for `when` and the AI. */
export function usePublishPhotosContext(name:string){
 const session=usePhotoSession(name);const claim=useRef<ReturnType<typeof studioContextStore.claim>|null>(null);
 useEffect(()=>{const c=studioContextStore.claim('photos',{id:name,kind:'photo',dirty:false,readOnly:false});claim.current=c;return()=>{c.release();claim.current=null;};},[name]);
 useEffect(()=>{
  if(!session)return;
  claim.current?.report(photosContextPatch({name,status:session.status,dirty:dirtyPhoto(session),neutral:isNeutralPhoto(session.now),cropping:session.cropping,
   canUndo:session.past.length>0,canRedo:session.future.length>0,cropped:!!session.now.crop,orientation:session.now.orientation,hasFrame:!!session.frame}));
 });
}
