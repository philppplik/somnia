import {invoke,isTauri} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {installFileAdapter} from './fileAdapter';
/** Desktop shell: Tauri commands as the storage port. All save, recovery and conflict logic lives in fileAdapter.ts so the web build can share it. */
export async function installDesktopAdapter(){
 if(!isTauri())return ()=>{};
 return installFileAdapter({
  invoke:(command,args)=>invoke(command,args),
  listen:(event,handler)=>listen(event,handler as never),
  shell:{closeWindow:()=>getCurrentWindow().close()}
 });
}
