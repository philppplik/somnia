import {registerMediaCloseGuard} from '../media';
import {installBeforeUnload} from '../closeFlow';
/** Dirty state of open workbooks, kept outside React so the media close guard and beforeunload can read it. */
const dirty=new Set<string>();
export const setSheetsDirty=(name:string,value:boolean)=>{if(value)dirty.add(name);else dirty.delete(name);};
export const sheetsIsDirty=(name:string)=>dirty.has(name);
export const hasDirtySheets=()=>dirty.size>0;
if(typeof window!=='undefined'){installBeforeUnload(hasDirtySheets);registerMediaCloseGuard(name=>!sheetsIsDirty(name)||window.confirm(`Discard unsaved spreadsheet edits to ${name}?`));}
export const copyFileName=(name:string)=>name.replace(/^.*[\\/]/,'').replace(/\.xlsx$/i,'')+'-edited.xlsx';
const MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
/** Saves bytes as a NEW file. Desktop: native save dialog + one-time grant (never overwrites). Web: download. Returns 'saved' when written natively, 'downloaded' for the browser, 'cancelled' when the dialog was dismissed. */
export async function saveSheetsCopy(name:string,bytes:Uint8Array):Promise<'saved'|'downloaded'|'cancelled'>{
 const suggestedName=copyFileName(name);const {isTauri,invoke}=await import('@tauri-apps/api/core');
 if(isTauri()){const grant=await invoke<{token:string}|null>('sheets_save_pick',{suggestedName});if(!grant)return 'cancelled';await invoke('sheets_save_write',bytes,{headers:{'x-somnia-token':grant.token}});return 'saved';}
 const url=URL.createObjectURL(new Blob([bytes as BlobPart],{type:MIME}));const a=document.createElement('a');a.href=url;a.download=suggestedName;a.click();setTimeout(()=>URL.revokeObjectURL(url),30_000);return 'downloaded';}
