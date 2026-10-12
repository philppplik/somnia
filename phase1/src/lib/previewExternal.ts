import {invoke,isTauri} from '@tauri-apps/api/core';
import {resolvePreviewLink} from './previewNavigation';
/** Separate from the GitHub-only help opener. No file/custom protocol or credentials. */
export async function openPreviewExternal(value:string){
 const link=resolvePreviewLink({},'',value);if(link.kind!=='external')throw new Error('Only HTTP(S) preview links can open externally.');
 if(isTauri())await invoke('open_preview_external',{url:link.url});
 else window.open(link.url,'_blank','noopener,noreferrer');
}
