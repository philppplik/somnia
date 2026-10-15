import {registerMediaCloseCleanup,registerMediaCloseGuard} from '../media';
import type {WorkbookInfo} from './protocol';
import {installBeforeUnload} from '../closeFlow';
/** Dirty state of open workbooks, kept outside React so the media close guard and beforeunload can read it. */
const dirty=new Set<string>();
const dirtyListeners=new Set<()=>void>();export const subscribeSheetsDirty=(f:()=>void)=>{dirtyListeners.add(f);return()=>{dirtyListeners.delete(f);};};
export const setSheetsDirty=(name:string,value:boolean)=>{if(value)dirty.add(name);else dirty.delete(name);dirtyListeners.forEach(f=>{try{f();}catch{/* Dirty state observers cannot affect native commits. */}});};
export const sheetsIsDirty=(name:string)=>dirty.has(name);
export const dirtySheetNames=()=>[...dirty];
export const hasDirtySheets=()=>dirty.size>0;
/** Minimal engine surface the session registry needs (SheetsEngine satisfies it; tests inject a fake). */
export interface SessionEngine{readonly isDisposed:boolean;dispose():void;open(bytes:Uint8Array):Promise<WorkbookInfo>}
/** One open workbook. It outlives the React view: switching studio or tab unmounts the grid but keeps engine, history and dirty state. Only closing the file (or replacing it) ends it. */
export interface SheetsSession<E extends SessionEngine=SessionEngine>{readonly name:string;readonly url:string;readonly engine:E;original:Uint8Array|null;book:WorkbookInfo|null;ready:Promise<WorkbookInfo>;sheet:number;sel:{row:number;col:number}}
const sessions=new Map<string,SheetsSession>();
export const getSheetsSession=(name:string)=>sessions.get(name);
/** Returns the live session for this file, or opens a new one. A session whose engine died, or that belongs to a different file object, is discarded (the engine's timeout message already tells the user unsaved edits are gone). */
export function acquireSheetsSession<E extends SessionEngine>(name:string,url:string,io:{create:()=>E;load:(url:string)=>Promise<Uint8Array>}):SheetsSession<E>{
 const cur=sessions.get(name);
 if(cur&&cur.url===url&&!cur.engine.isDisposed)return cur as unknown as SheetsSession<E>;
 if(cur)releaseSheetsSession(name);
 const engine=io.create();
 const s:SheetsSession<E>={name,url,engine,original:null,book:null,sheet:0,sel:{row:0,col:0},ready:undefined as unknown as Promise<WorkbookInfo>};
 s.ready=(async()=>{const bytes=await io.load(url);s.original=bytes;const b=await engine.open(bytes);s.book=b;return b;})();
 s.ready.catch(()=>{if(sessions.get(name)===s)releaseSheetsSession(name);});
 sessions.set(name,s as unknown as SheetsSession);return s;}
/** Ends a session: terminates the engine and forgets its dirty flag. Called only when the file is closed or replaced. */
export function releaseSheetsSession(name:string){const s=sessions.get(name);sessions.delete(name);s?.engine.dispose();setSheetsDirty(name,false);}
export const hasSheetsSession=(name:string)=>sessions.has(name);
if(typeof window!=='undefined'){installBeforeUnload(hasDirtySheets);registerMediaCloseGuard(name=>!sheetsIsDirty(name)||window.confirm(`Discard unsaved spreadsheet edits to ${name}?`));registerMediaCloseCleanup(releaseSheetsSession);}
export const copyFileName=(name:string)=>name.replace(/^.*[\\/]/,'').replace(/\.xlsx$/i,'')+'-edited.xlsx';
const MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
/** Saves bytes as a NEW file. Desktop: native save dialog + one-time grant (never overwrites). Web: download. Returns 'saved' when written natively, 'downloaded' for the browser, 'cancelled' when the dialog was dismissed. */
export async function saveSheetsCopy(name:string,bytes:Uint8Array):Promise<'saved'|'downloaded'|'cancelled'>{
 const suggestedName=copyFileName(name);const {isTauri,invoke}=await import('@tauri-apps/api/core');
 if(isTauri()){const grant=await invoke<{token:string}|null>('sheets_save_pick',{suggestedName});if(!grant)return 'cancelled';await invoke('sheets_save_write',bytes,{headers:{'x-somnia-token':grant.token}});return 'saved';}
 const url=URL.createObjectURL(new Blob([bytes as BlobPart],{type:MIME}));const a=document.createElement('a');a.href=url;a.download=suggestedName;a.click();setTimeout(()=>URL.revokeObjectURL(url),30_000);return 'downloaded';}
