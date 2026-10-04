import {invoke,isTauri} from '@tauri-apps/api/core';
/** Opens a project GitHub URL in the system browser. The desktop shell only allows https://github.com/philppplik/somnia pages. */
export async function openExternal(url:string){
 if(isTauri()){await invoke('open_external',{url});return;}
 window.open(url,'_blank','noopener,noreferrer');}
export const REPO_URL='https://github.com/philppplik/somnia';
