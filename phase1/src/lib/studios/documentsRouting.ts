import {getMedia,subscribeMedia} from '../media';
import {getState,requestStudio} from '../../store/appStore';
/** Opening a DOCX moves to the Documents Studio; leaving it returns to Code. A manual choice always wins. */
let last='';
export function startDocumentsRouting(){
 return subscribeMedia(()=>{
  const m=getMedia();const item=m.items.find(i=>i.name===m.active);const key=item?`${item.kind}:${item.name}`:'';if(key===last)return;last=key;
  if(item?.kind==='docx'){requestStudio('documents','automatic');return;}
  if(getState().activeStudio==='documents'&&getState().studioChoice==='automatic')requestStudio('code','automatic');
 });
}
