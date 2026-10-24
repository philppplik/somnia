import {useEffect} from 'react';
import {consumeVectorExportRequest,useVectorExportRequest} from '../../lib/vectorstudio/exportSetup';
import {vectorShell} from '../../lib/studios/vector';
import {editPanelStack,shellLayoutStore} from '../../store/shellLayoutStore';
import {patchState} from '../../store/appStore';
/** UI adapter owns focus and layout; engine commands never import the app store. */
export function VectorExportSetup(){
 const request=useVectorExportRequest();
 useEffect(()=>{if(!consumeVectorExportRequest(request))return;const defaults=vectorShell.defaultLayout!,panels=vectorShell.panels!;
  const layout=shellLayoutStore.get('vector',defaults,panels);
  shellLayoutStore.update('vector',{...editPanelStack(layout,'right','export','focus',0),collapsedPanels:layout.collapsedPanels?.filter(id=>id!=='export')},defaults,panels);
  patchState({inspectorOpen:true});
  const frame=requestAnimationFrame(()=>{const el=document.querySelector<HTMLElement>('[data-testid="vector-shell-export"]');el?.scrollIntoView({block:'nearest'});el?.querySelector<HTMLElement>('select,button')?.focus();});return()=>cancelAnimationFrame(frame);
 },[request]);
 return null;
}
