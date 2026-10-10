import {trackNativeDrop,nativeDropIsInApp} from '../lib/collab/nativeChatDrop';
import {useEffect,useState} from 'react';
import {isTauri} from '@tauri-apps/api/core';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {getState,patchState} from '../store/appStore';
import {openIncoming,readFiles} from '../lib/projectActions';
/** Browser file import stays on the File API. Desktop OS drops use native grants in fileAdapter. */
export function DropOverlay(){
 const [active,setActive]=useState(false);
 useEffect(()=>{
  if(isTauri()){let disposed=false;let unlisten:(()=>void)|undefined;
   void getCurrentWindow().onDragDropEvent(e=>{trackNativeDrop(e.payload.type,'position' in e.payload?e.payload.position:undefined);setActive(!nativeDropIsInApp()&&(e.payload.type==='enter'||e.payload.type==='over'));}).then(fn=>{if(disposed)fn();else unlisten=fn;}).catch(error=>patchState({notice:`Drop listener failed: ${String(error)}`}));
   return()=>{disposed=true;unlisten?.();};
  }
  let depth=0;const hasFiles=(e:DragEvent)=>!!e.dataTransfer&&[...e.dataTransfer.types].includes('Files');
  const inChat=(e:DragEvent)=>e.target instanceof Element&&Boolean(e.target.closest('.sc-panel, .cv-drop'));
  const enter=(e:DragEvent)=>{if(inChat(e)){depth=0;setActive(false);return;}if(!hasFiles(e))return;e.preventDefault();depth+=1;setActive(true);};
  const over=(e:DragEvent)=>{if(hasFiles(e))e.preventDefault();};
  const leave=(e:DragEvent)=>{if(!hasFiles(e))return;depth=Math.max(0,depth-1);if(!depth)setActive(false);};
  const drop=(e:DragEvent)=>{if(inChat(e)){depth=0;setActive(false);return;}if(!hasFiles(e))return;e.preventDefault();depth=0;setActive(false);const list=e.dataTransfer?.files;if(list?.length)void readFiles(list).then(files=>openIncoming(files,{source:'drop',suggestedStudio:getState().activeStudio})).catch(error=>patchState({notice:`File import failed: ${String(error)}`}));};
  window.addEventListener('dragenter',enter);window.addEventListener('dragover',over);window.addEventListener('dragleave',leave);window.addEventListener('drop',drop);
  return()=>{window.removeEventListener('dragenter',enter);window.removeEventListener('dragover',over);window.removeEventListener('dragleave',leave);window.removeEventListener('drop',drop);};},[]);
 if(!active)return null;
 return <div aria-hidden="true" data-testid="drop-overlay" className="pointer-events-none fixed inset-3 z-[200] flex items-center justify-center rounded-[25px] border-2 border-dashed border-[var(--accent)] bg-[color-mix(in_srgb,var(--bg-base)_80%,transparent)] text-[15px] font-medium text-ink">{isTauri()?'Drop one folder or file to open it. Multiple files import as copies.':'Drop files to open them in Somnia'}</div>;}
