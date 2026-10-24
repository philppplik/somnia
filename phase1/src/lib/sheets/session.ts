import {registerMediaCloseCleanup,registerMediaCloseGuard} from '../media';
import type {WorkbookInfo} from './protocol';
import {installBeforeUnload} from '../closeFlow';
import {writeCoreProperties,type CorePropsMeta} from '../office/coreProps';
import {SessionCheckpointer,defaultRecoveryStore,discardSession,fingerprintBytes,registerActiveSession,whenFlushed} from '../sessionSafety';
import {recoverableFor} from '../sessionSafety/recoveryIndex';
import {readSheetsView,sheetsSessionId} from './recovery';
/** Dirty state of open workbooks, kept outside React so the media close guard and beforeunload can read it. */
const dirty=new Set<string>();
const dirtyListeners=new Set<()=>void>();export const subscribeSheetsDirty=(f:()=>void)=>{dirtyListeners.add(f);return()=>{dirtyListeners.delete(f);};};
/**
 * Every edit path reports through here, so this is also where session safety hooks in: an edit is one checkpoint revision, and a saved copy
 * (dirty cleared while the session lives) releases the recovery snapshots if nothing changed since.
 */
export const setSheetsDirty=(name:string,value:boolean)=>{const was=dirty.has(name);const sess=sessions.get(name);
 if(value){dirty.add(name);if(sess?.cp){sess.editSeq++;sess.cp.noteEdit();}}
 else{dirty.delete(name);if(sess?.cp&&was)void sess.cp.releaseAfterSave(sess.editSeq).catch(()=>undefined);}
 dirtyListeners.forEach(f=>{try{f();}catch{/* Dirty state observers cannot affect native commits. */}});};
export const sheetsIsDirty=(name:string)=>dirty.has(name);
export const dirtySheetNames=()=>[...dirty];
export const hasDirtySheets=()=>dirty.size>0;
/** Minimal engine surface the session registry needs (SheetsEngine satisfies it; tests inject a fake). */
export interface SessionEngine{readonly isDisposed:boolean;dispose():void;open(bytes:Uint8Array):Promise<WorkbookInfo>;/** Present on the real engine: serializes the edited workbook (needed for recovery checkpoints). */save?():Promise<Uint8Array>;readonly hasPendingMutation?:boolean}
/** One open workbook. It outlives the React view: switching studio or tab unmounts the grid but keeps engine, history and dirty state. Only closing the file (or replacing it) ends it. */
export interface SheetsSession<E extends SessionEngine=SessionEngine>{readonly name:string;readonly url:string;readonly engine:E;original:Uint8Array|null;book:WorkbookInfo|null;ready:Promise<WorkbookInfo>;sheet:number;sel:{row:number;col:number};
 /** Session safety: what the open found in the recovery store (the view shows a notice once), the edit counter that is the checkpoint revision, the checkpointer. */
 recovery:null|'restored'|'source-changed';editSeq:number;saveRev:number;cp:SessionCheckpointer|null;unreg:(()=>void)|null}
const sessions=new Map<string,SheetsSession>();
export const getSheetsSession=(name:string)=>sessions.get(name);
/** Returns the live session for this file, or opens a new one. A session whose engine died, or that belongs to a different file object, is discarded (the engine's timeout message already tells the user unsaved edits are gone). */
export function acquireSheetsSession<E extends SessionEngine>(name:string,url:string,io:{create:()=>E;load:(url:string)=>Promise<Uint8Array>}):SheetsSession<E>{
 const cur=sessions.get(name);
 if(cur&&cur.url===url&&!cur.engine.isDisposed)return cur as unknown as SheetsSession<E>;
 if(cur)endSheetsSession(name); // a dead engine or a replaced file: the recovery copy stays in the store
 const engine=io.create();
 const s:SheetsSession<E>={name,url,engine,original:null,book:null,sheet:0,sel:{row:0,col:0},ready:undefined as unknown as Promise<WorkbookInfo>,recovery:null,editSeq:0,saveRev:-1,cp:null,unreg:null};
 s.ready=(async()=>{
  const bytes=await io.load(url);s.original=bytes;
  const save=engine.save?.bind(engine);
  if(!save){s.book=await engine.open(bytes);return s.book;} // engines without serialization (tests) have no recovery
  const fp=await fingerprintBytes(bytes),id=sheetsSessionId(name);
  const cp=new SessionCheckpointer({
   sessionId:id,studio:'sheets',store:defaultRecoveryStore(),sourceFingerprint:fp,
   getRevision:()=>s.editSeq,isDirty:()=>dirty.has(name),historyRestorable:()=>false,hasUndoHistory:()=>dirty.has(name),
   async quiesce(){for(let i=0;i<80;i++){if(!engine.hasPendingMutation)return true;await new Promise(r=>setTimeout(r,25));}return false;},
   async capture(){const revision=s.editSeq;const payload=await save();return{revision,payload,history:{kind:'none'},view:{sheet:s.sheet,row:s.sel.row,col:s.sel.col,draft:null},format:'xlsx',engineVersion:'sheets'};},
  });
  s.cp=cp;
  // Recovery: a verified snapshot of this same file replaces the opened bytes. A changed file keeps its snapshot and opens as is.
  await whenFlushed(id);const got:{info:WorkbookInfo|null;view:Record<string,unknown>}={info:null,view:{}};
  const r=await cp.resume(async snap=>{got.info=await engine.open(snap.payload);got.view=snap.meta.view;},async()=>fp).catch(()=>null);
  if(r&&!r.ok&&r.reason==='source-changed')s.recovery='source-changed';
  let opened:WorkbookInfo;
  if(!(r?.ok&&got.info)){opened=await engine.open(bytes);} // missing, changed or unreadable snapshot: the file as it is
  else{
   opened=got.info;const v=readSheetsView(got.view),book=opened;
   if(v&&v.sheet<book.sheets.length){s.sheet=v.sheet;s.sel={row:v.row,col:v.col};}
   s.recovery='restored';s.editSeq=1;dirty.add(name);dirtyListeners.forEach(f=>{try{f();}catch{/* Observers cannot affect the restore. */}});cp.noteEdit(); // the restored state gets its own verified checkpoint
  }
  s.unreg=registerActiveSession(id,cp,{studio:'sheets',isDirty:()=>dirty.has(name)});
  s.book=opened;return opened;
 })();
 s.ready.catch(()=>{if(sessions.get(name)===s)endSheetsSession(name);});
 sessions.set(name,s as unknown as SheetsSession);return s;}
/** Call right before serializing the workbook for a saved copy; `sheetsSaved` then only clears the dirty flag if no edit arrived in between. */
export const noteSheetsSaveStart=(name:string)=>{const s=sessions.get(name);if(s)s.saveRev=s.editSeq;};
/** The copy written after `noteSheetsSaveStart` is on disk: clear dirty (which releases the recovery copy) unless newer edits exist. Returns whether dirty was cleared. */
export function sheetsSaved(name:string):boolean{const s=sessions.get(name);if(s&&s.cp&&s.saveRev!==s.editSeq)return false;setSheetsDirty(name,false);return true;}
/** Ends a session but keeps its recovery copy: the engine died, the file was replaced, or opening failed. */
export function endSheetsSession(name:string){const s=sessions.get(name);sessions.delete(name);s?.cp?.close();s?.unreg?.();s?.engine.dispose();setSheetsDirty(name,false);}
/** The file was closed (the user's explicit discard): ends the session and deletes its recovery copy. */
export function releaseSheetsSession(name:string){
 const s=sessions.get(name);const known=!!s||recoverableFor('sheets').some(r=>r.id===sheetsSessionId(name));
 if(known)void discardSession(sheetsSessionId(name)).catch(()=>undefined);
 endSheetsSession(name);}
/** Writes a verified checkpoint of a workbook now (lifecycle, tests). False when nothing could be verified. */
export async function checkpointSheets(name:string):Promise<boolean>{const s=sessions.get(name);if(!s?.cp)return false;await s.ready.catch(()=>undefined);const r=await s.cp.checkpoint();return r.ok;}
export const hasSheetsSession=(name:string)=>sessions.has(name);
if(typeof window!=='undefined'){installBeforeUnload(hasDirtySheets);registerMediaCloseGuard(name=>!sheetsIsDirty(name)||window.confirm(`Discard unsaved spreadsheet edits to ${name}?`));registerMediaCloseCleanup(name=>releaseSheetsSession(name));}
export const copyFileName=(name:string)=>name.replace(/^.*[\\/]/,'').replace(/\.xlsx$/i,'')+'-edited.xlsx';
const MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
/** Saves bytes as a NEW file. Desktop: native save dialog + one-time grant (never overwrites). Web: download. Returns 'saved' when written natively, 'downloaded' for the browser, 'cancelled' when the dialog was dismissed. */
async function persistSheetsCopy(suggestedName:string,bytes:Uint8Array):Promise<'saved'|'downloaded'|'cancelled'>{
 const {isTauri,invoke}=await import('@tauri-apps/api/core');
 if(isTauri()){const grant=await invoke<{token:string}|null>('sheets_save_pick',{suggestedName});if(!grant)return 'cancelled';await invoke('sheets_save_write',bytes,{headers:{'x-somnia-token':grant.token}});return 'saved';}
 const url=URL.createObjectURL(new Blob([bytes as BlobPart],{type:MIME}));const a=document.createElement('a');a.href=url;a.download=suggestedName;a.click();setTimeout(()=>URL.revokeObjectURL(url),30_000);return 'downloaded';}
export async function saveSheetsCopy(name:string,bytes:Uint8Array):Promise<'saved'|'downloaded'|'cancelled'>{return persistSheetsCopy(copyFileName(name),bytes);}
/** Advanced export (AE1): name chosen in the dialog, Dublin Core metadata injected into the copy. */
export async function saveSheetsCopyAdvanced(base:string,bytes:Uint8Array,meta:CorePropsMeta):Promise<'saved'|'downloaded'|'cancelled'>{return persistSheetsCopy((base.trim()||'export')+'.xlsx',writeCoreProperties(bytes,meta));}
