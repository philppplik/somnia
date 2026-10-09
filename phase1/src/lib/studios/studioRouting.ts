import {getMedia,subscribeMedia,type MediaKind} from '../media';
import {getState,requestStudio} from '../../store/appStore';
import {handlerForStudio,readyHandlersFor,type OpenKind} from './openHandlers';
/**
 * Navigation routing: when the ACTIVE media tab changes, the shell follows the document's own Studio (replaces the DOCX/PPTX
 * redirects in media.ts, documentsRouting.ts and the mount-driven Sound/Video effects). This is tab navigation / "return", not Open:
 * a Studio the user visited by hand (studioChoice 'manual') is respected here. Explicit Open goes through openCoordinator and is
 * never blocked by it.
 */
const mediaKindToOpen=(k:MediaKind):OpenKind=>k==='video-project'?'video':k;
export function studioForMedia(kind:MediaKind,current:string):string|null{
 const ready=readyHandlersFor(mediaKindToOpen(kind));if(!ready.length)return null;
 return(handlerForStudio(mediaKindToOpen(kind),current)??[...ready].sort((a,b)=>b.priority-a.priority)[0]).studioId;
}
let last='';let previousStudio:string|null=null;
export function startStudioRouting(){
 last='';previousStudio=null;
 return subscribeMedia(()=>{
  const m=getMedia();const item=m.items.find(i=>i.name===m.active);const key=item?`${item.kind}:${item.name}`:'';if(key===last)return;last=key;
  const target=item?studioForMedia(item.kind,getState().activeStudio):null;
  // Only media that has its own editor moves the shell. Image/PDF previews stay where they are (they use the Code canvas).
  if(item&&target&&target!=='code'){previousStudio=target;requestStudio(target,'automatic',false,'media:'+item.name);return;}
  // Leaving a document-routed Studio: fall back to Code, unless the user visited the Studio by hand.
  if(previousStudio&&getState().activeStudio===previousStudio&&getState().studioChoice==='automatic')requestStudio('code','automatic');
  previousStudio=null;
 });
}
