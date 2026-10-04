import {invoke,isTauri} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {setCloseHandlers,requestClose} from './closeFlow';
import {clearDraft} from './draftSession';
import {getState} from '../store/appStore';
import {restoreWindowState} from './windowState';
import {installFileAdapter} from './fileAdapter';
/** Desktop shell: Tauri commands as the storage port. All save, recovery and conflict logic lives in fileAdapter.ts so the web build can share it. */
export async function installDesktopAdapter(){
 if(!isTauri())return ()=>{};
 void restoreWindowState().catch(e=>console.error(e));
 // Memory-only and ZIP projects have no backend project, so the Rust close guard cannot see their edits. Guard them here.
 setCloseHandlers('memory',{discardAndClose:async()=>{clearDraft();await getCurrentWindow().destroy();},saveAndClose:async()=>{await getCurrentWindow().destroy();}});
 await getCurrentWindow().onCloseRequested(e=>{const st=getState();if(st.storage!=='disk'&&st.isDirty){e.preventDefault();requestClose('memory');}});
 return installFileAdapter({
  invoke:(command,args)=>invoke(command,args),
  listen:(event,handler)=>listen(event,handler as never),
  shell:{closeWindow:()=>getCurrentWindow().close(),destroyWindow:()=>getCurrentWindow().destroy()}
 });
}
