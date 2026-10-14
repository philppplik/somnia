import {caretAfterEdit,diffEdit,inverseOf,UndoStack,type TextEdit,type UndoEntry} from './edit';
import {stepBoundary,utf16ToUtf8Offset,utf8ToUtf16Offset} from './text';
import {getDocumentsState,patchDocuments,resetDocuments,INITIAL_VIEW,type DocumentsState} from './store';
import {DocumentsEngine} from './engine';
import {inspectDocx} from './inspect';
/** The one open document: engine, undo history and the refresh after each edit. UI components only call these functions. */
let engine:DocumentsEngine|null=null;let undo=new UndoStack();let chain:Promise<unknown>=Promise.resolve();let pending=0;
export const getEngine=()=>engine;
const flags=()=>({canUndo:undo.canUndo,canRedo:undo.canRedo});
/* ---- Per-file sessions: a file keeps its engine, undo history and dirty flag while the studio or tab is switched away. ---- */
const STASH=['blocks','pages','pageSizes','words','rev','canUndo','canRedo','edited','caret','risks','engineMs','editError','notice'] as const;
interface Entry{key:string;url:string;engine:DocumentsEngine|null;undo:UndoStack;stash:Partial<DocumentsState>;working:Uint8Array|null;dirty:boolean;used:number;undoReleased:boolean}
const entries=new Map<string,Entry>();let cur:Entry|null=null;let gen=0;let tick=0;
export const MAX_LIVE_SESSIONS=4;
export interface SessionDeps{createEngine:()=>DocumentsEngine;loadBytes:(url:string)=>Promise<Uint8Array>}
const defaultDeps:SessionDeps={createEngine:()=>new DocumentsEngine(),loadBytes:async url=>new Uint8Array(await(await fetch(url)).arrayBuffer())};
let deps=defaultDeps;
export const setSessionDeps=(d:Partial<SessionDeps>|null)=>{deps=d?{...defaultDeps,...d}:defaultDeps;};
/** Test hook: forget every session without touching engines. */
export function resetSessionsForTest(){for(const e of entries.values())e.engine?.dispose();entries.clear();cur=null;engine=null;undo=new UndoStack();chain=Promise.resolve();pending=0;gen=0;goalX=null;}
const live=(e:Entry)=>!!e.engine&&!e.engine.isDisposed;
const msg=(err:unknown)=>err instanceof Error?err.message:String(err);
/** Queue a task behind every pending edit, so a switch never overtakes an edit that was already accepted. */
function queue<T>(fn:()=>Promise<T>|T):Promise<T>{const p=chain.then(fn);chain=p.catch(()=>undefined);return p;}
/** Resolves once every edit accepted so far has reached the engine. Export calls this first. Never rejects. */
export const settleDocument=():Promise<void>=>chain.then(()=>undefined,()=>undefined);
export const hasPendingEdits=()=>pending>0;
export const isDocumentDirty=(key:string)=>{if(cur&&cur.key===key&&pending>0)return true;if(cur&&cur.key===key)return getDocumentsState().edited;return !!entries.get(key)?.dirty;};
export const hasUnsavedDocuments=()=>pending>0||(cur?getDocumentsState().edited:false)||[...entries.values()].some(e=>e.dirty);
export const dirtyDocumentNames=()=>[...entries.keys()].filter(isDocumentDirty);
function stashCurrent(){
 if(!cur)return;const s=getDocumentsState();const stash:Record<string,unknown>={};for(const k of STASH)stash[k]=s[k];
 cur.stash=stash as Partial<DocumentsState>;cur.dirty=s.edited;
}
/** Drops a file's session (the file was closed or replaced). Synchronous, so close cleanups can call it. */
export function discardDocument(key:string){
 const e=entries.get(key);if(!e)return;entries.delete(key);e.engine?.dispose();e.engine=null;
 if(cur===e){cur=null;engine=null;undo=new UndoStack();}
}
async function evictExtra(){
 const liveEntries=()=>[...entries.values()].filter(e=>live(e));
 while(liveEntries().length>MAX_LIVE_SESSIONS){
  const victim=liveEntries().filter(e=>e!==cur).sort((a,b)=>a.used-b.used)[0];if(!victim)return;
  if(victim.dirty){
   try{const bytes=await victim.engine!.save();if(!inspectDocx(bytes).ok){victim.used=++tick;continue;}victim.working=bytes;}
   catch{victim.used=++tick;if(liveEntries().length>MAX_LIVE_SESSIONS+4)return;continue;}
   victim.undoReleased=true;
  }
  victim.engine!.dispose();victim.engine=null;victim.undo=new UndoStack();
 }
}
/**
 * Makes `target` the open document (or none). Everything queued before it, including edits, finishes first.
 * A file that was open before keeps its engine, undo history and edits; a reopened one starts from its checked working bytes.
 * Resolves to the engine, or null when closed, superseded by a newer switch, or failed (the store then shows the error).
 */
export function switchDocument(target:{key:string;url:string;retry?:boolean}|null):Promise<DocumentsEngine|null>{
 const my=++gen;
 return queue(async()=>{
  if(my!==gen)return null;
  stashCurrent();cur=null;engine=null;undo=new UndoStack();goalX=null;
  if(!target){resetDocuments();return null;}
  let entry=entries.get(target.key);
  if(entry&&entry.url!==target.url){discardDocument(target.key);entry=undefined;}
  patchDocuments({...INITIAL_VIEW,status:'loading',name:target.key,error:''});
  try{
   if(entry&&live(entry)&&!target.retry){
    cur=entry;engine=entry.engine;undo=entry.undo;entry.used=++tick;
    patchDocuments({...entry.stash,status:'ready',name:target.key,error:'',rev:getDocumentsState().rev+1,...flags()});return entry.engine;
   }
   let lost=false;
   if(entry&&!live(entry)&&entry.dirty&&!entry.working)lost=true;
   const raw=entry?.working??await deps.loadBytes(target.url);
   const check=inspectDocx(raw);if(!check.ok)throw new Error(check.error);
   const e=deps.createEngine();
   try{
    await e.init();const d=await e.open(raw.slice().buffer);
    if(my!==gen){e.dispose();return null;}
    const fresh:Entry={key:target.key,url:target.url,engine:e,undo:new UndoStack(),stash:{},working:null,dirty:false,used:++tick,undoReleased:false};
    const restored=!!entry?.working;if(entry&&!live(entry))entries.delete(target.key);else if(entry)discardDocument(target.key);
    entries.set(target.key,fresh);cur=fresh;engine=e;undo=fresh.undo;
    const notice=lost?'lost':restored&&entry!.undoReleased?'undoReleased':'';
    patchDocuments({...INITIAL_VIEW,status:'loading',name:target.key,error:'',risks:check.risks,engineMs:Math.round(d.openMs+d.layoutMs),edited:restored,notice,...flags()});
    await refresh(d);
    if(my!==gen)return null;
    patchDocuments({status:'ready'});await evictExtra();return e;
   }catch(err){e.dispose();throw err;}
  }catch(err){
   if(my===gen)patchDocuments({status:'error',error:msg(err)},err);
   return null;
  }
 });
}
/** Hands over an already open engine as the current document, synchronously (tests and callers that open the engine themselves). Null closes the current document. */
export function attachEngine(e:DocumentsEngine|null,key='document'){
 if(!e){void switchDocument(null);return;}
 ++gen;stashCurrent();if(entries.get(key)?.engine!==e)discardDocument(key);
 const en:Entry={key,url:key,engine:e,undo:new UndoStack(),stash:{},working:null,dirty:false,used:++tick,undoReleased:false};
 entries.set(key,en);cur=en;engine=e;undo=en.undo;chain=Promise.resolve();goalX=null;
 patchDocuments({...INITIAL_VIEW,name:key,...flags(),editError:'',edited:false,notice:''});
}
async function refresh(d:{pages:number;pageSizes:readonly {width:number;height:number}[];text:string}){
 const blocks=await engine!.blocks();
 patchDocuments({blocks,pages:d.pages,pageSizes:d.pageSizes,words:d.text.split(/\s+/).filter(Boolean).length,rev:getDocumentsState().rev+1,...flags()});
}
export async function loadBlocks(d:{pages:number;pageSizes:readonly {width:number;height:number}[];text:string}){await refresh(d);}
async function apply(edit:TextEdit,record:'new'|'undo'|'redo',o:{merge?:boolean;caret?:number|null}={}){
 const e=engine;if(!e)return;
 const block=getDocumentsState().blocks.find(b=>b.index===edit.block);
 if(!block||!block.editable||block.text===undefined)throw new Error('This paragraph cannot be edited as text.');
 const inv=inverseOf(block.text,edit);
 const d=await e.replace(edit);
 if(record==='new')undo.push(inv,o.merge);else if(record==='undo')undo.pushRedo(inv);else undo.pushUndo(inv);
 const at=record==='new'?o.caret:caretAfterEdit(edit);
 patchDocuments({edited:true,notice:'',editError:'',caretLocked:false,caret:at==null?null:{block:edit.block,anchor:at,head:at}});await refresh(d);
}
const run=(fn:()=>Promise<void>)=>{
 const en=cur;pending++;
 const p=chain.then(fn).catch(err=>{if(cur===en)patchDocuments({editError:msg(err)},err);}).finally(()=>{pending--;});
 chain=p;return p;
};
/** Applies the difference between the paragraph's current text and `next` as one replacement. */
export const editParagraph=(index:number,next:string)=>run(async()=>{
 const block=getDocumentsState().blocks.find(b=>b.index===index);if(!block||!block.editable||block.text===undefined)throw new Error('This paragraph cannot be edited as text.');
 if(/[\r\n\uFFFC]/.test(next))throw new Error('Line breaks are not supported in this version. Edit one paragraph at a time.');
 const edit=diffEdit(index,block.text,next);if(!edit)return;await apply(edit,'new');
});
async function restoreSnap(x:UndoEntry,to:'before'|'after'){
 const e=engine!;const sn=x.snap!;const d=await e.restore(to==='before'?sn.before:sn.after);const c=to==='before'?sn.caretBefore:sn.caretAfter;
 patchDocuments({edited:true,notice:'',editError:'',caretLocked:false,caret:{block:c.block,anchor:c.off,head:c.off}});await refresh(d);
}
export const undoEdit=()=>run(async()=>{const x=undo.popUndo();if(!x)return;if(x.snap){await restoreSnap(x,'before');undo.pushRedoEntry(x);}else await apply(x.inverse,'undo');});
export const redoEdit=()=>run(async()=>{const x=undo.popRedo();if(!x)return;if(x.snap){await restoreSnap(x,'after');undo.pushUndoEntry(x);}else await apply(x.inverse,'redo');});

type Spot={block:number;off:number};
/** Paragraph split/join. One undo step restores the engine's pre-edit block list from a cheap snapshot; a failure part-way restores it at once. */
async function structural(op:(e:DocumentsEngine)=>Promise<import('./protocol').OpenedDocument>,before:Spot,after:Spot){
 const e=engine;if(!e)return;const b=await e.snapshot();let d;
 try{d=await op(e);}catch(err){await e.restore(b).catch(()=>undefined);throw err;}
 const a=await e.snapshot();undo.pushSnap({before:b,after:a,caretBefore:before,caretAfter:after});
 patchDocuments({edited:true,notice:'',editError:'',caretLocked:false,caret:{block:after.block,anchor:after.off,head:after.off}});await refresh(d);
}
/* ---- On-page caret (package 4): all offsets are UTF-8 bytes of the paragraph's current text ---- */
const enc=new TextEncoder();const u8=(s:string)=>enc.encode(s).length;
const blockText=(i:number)=>{const b=getDocumentsState().blocks.find(x=>x.index===i);return b&&b.editable?b.text??'':null;};
const range=(c:{anchor:number;head:number})=>[Math.min(c.anchor,c.head),Math.max(c.anchor,c.head)] as const;
let goalX:number|null=null;
export const selectedText=()=>{const c=getDocumentsState().caret;if(!c)return '';const t=blockText(c.block);if(t===null)return '';const [a,b]=range(c);return t.slice(utf8ToUtf16Offset(t,a),utf8ToUtf16Offset(t,b));};
async function pointTo(page:number,x:number,y:number,extend:boolean){
 const e=engine;if(!e)return;const hit=await e.hit(page,x,y);const c=getDocumentsState().caret;
 if(!hit||hit.block===null||!hit.editable||hit.off===undefined){if(!extend)patchDocuments({caret:null,caretLocked:!!hit});return;}
 if(extend&&c&&c.block===hit.block)patchDocuments({caret:{...c,head:hit.off}});
 else if(!extend)patchDocuments({caret:{block:hit.block,anchor:hit.off,head:hit.off},caretLocked:false,editError:''});
}
/** Places the caret (or extends the selection) at a page-space point. */
export const pointerAt=(page:number,x:number,y:number,extend=false)=>{goalX=null;return run(()=>pointTo(page,x,y,extend));};
let pend:{page:number;x:number;y:number}|null=null,busy=false;
/** Drag selection: only the latest pointer position is sent, so a fast drag never floods the worker. */
export function dragTo(page:number,x:number,y:number){pend={page,x,y};if(busy)return;busy=true;void(async()=>{while(pend){const p=pend;pend=null;await run(()=>pointTo(p.page,p.x,p.y,true));}busy=false;})();}
async function applyAtCaret(hunk:{start:number;end:number;text:string},merge=false){
 const c=getDocumentsState().caret;if(!c)return;const edit:TextEdit={block:c.block,hunks:[hunk]};await apply(edit,'new',{merge,caret:caretAfterEdit(edit)});
}
/** Types text at the caret or over the selection. Line breaks are not supported yet and become spaces. */
export const typeText=(text:string)=>run(async()=>{
 const c=getDocumentsState().caret;if(!c)return;const t=text.replace(/[\r\n\uFFFC]+/g,' ');if(!t)return;const [a,b]=range(c);goalX=null;
 await applyAtCaret({start:a,end:b,text:t},a===b);
});
/** Backspace/Delete by one user-perceived character. At a paragraph edge nothing happens (merge is not supported yet). */
export const deleteAtCaret=(dir:-1|1)=>run(async()=>{
 const c=getDocumentsState().caret;if(!c)return;const t=blockText(c.block);if(t===null)return;let [a,b]=range(c);goalX=null;
 if(a===b){const i=utf8ToUtf16Offset(t,a);const j=stepBoundary(t,i,dir);if(j===i){await joinAtEdge(c.block,t,dir);return;}const k=utf16ToUtf8Offset(t,j);[a,b]=dir<0?[k,a]:[a,k];}
 await applyAtCaret({start:a,end:b,text:''});
});
export const selectAllInParagraph=()=>{const c=getDocumentsState().caret;if(!c)return;const t=blockText(c.block);if(t!==null)patchDocuments({caret:{...c,anchor:0,head:u8(t)}});};
export const clearCaret=()=>patchDocuments({caret:null,caretBox:null,selRects:[],caretLocked:false});
export type CaretMove='left'|'right'|'up'|'down'|'home'|'end';
const nearbyBlock=(from:number,dir:-1|1)=>{const bs=getDocumentsState().blocks;const b=bs.find(x=>x.index===from+dir);return b&&b.editable&&b.text!==undefined?b:null;};
/** Keyboard caret movement. Up/Down/Home/End use the engine's line geometry; Left/Right cross into neighbouring editable paragraphs. */
export const moveCaret=(kind:CaretMove,extend:boolean)=>run(async()=>{
 const c=getDocumentsState().caret;const e=engine;if(!c||!e)return;const t=blockText(c.block);if(t===null)return;
 const set=(block:number,head:number)=>patchDocuments({caret:{block,anchor:extend&&block===c.block?c.anchor:head,head}});
 if(kind==='left'||kind==='right'){
  goalX=null;const dir=kind==='left'?-1:1;const [a,b]=range(c);
  if(!extend&&a!==b){const p=dir<0?a:b;set(c.block,p);return;}
  const i=utf8ToUtf16Offset(t,c.head);const j=stepBoundary(t,i,dir);
  if(j!==i){set(c.block,utf16ToUtf8Offset(t,j));return;}
  if(extend)return;const nb=nearbyBlock(c.block,dir);if(nb)set(nb.index,dir<0?u8(nb.text!):0);return;
 }
 const box=getDocumentsState().caretBox;if(!box)return;const mid=box.top+box.height/2;
 if(kind==='home'||kind==='end'){goalX=null;const h=await e.hit(box.page,kind==='home'?-1e4:1e5,mid);if(h&&h.block===c.block&&h.off!==undefined)set(c.block,h.off);return;}
 goalX??=box.x;const h=await e.hit(box.page,goalX,kind==='up'?box.top-box.height*0.6:box.top+box.height*1.6);
 if(h&&h.block!==null&&h.editable&&h.off!==undefined)set(h.block,h.off);
});
/** Refreshes caret and selection geometry from the engine. A failure drops the caret instead of drawing a guess. */
export async function syncGeometry(){
 const e=engine,c=getDocumentsState().caret;if(!e)return;
 if(!c){patchDocuments({caretBox:null,selRects:[]});return;}
 try{
  const [box,rects]=await Promise.all([e.caret(c.block,c.head),c.anchor!==c.head?e.rects(c.block,...range(c)):Promise.resolve([])]);
  if(getDocumentsState().caret===c)patchDocuments({caretBox:box,selRects:rects});
 }catch{if(getDocumentsState().caret===c)patchDocuments({caret:null,caretBox:null,selRects:[]});}
}
/** Enter: replaces the selection (if any) and splits the paragraph there. The new paragraph copies the paragraph properties. */
export const splitAtCaret=()=>run(async()=>{
 const c=getDocumentsState().caret;if(!c)return;const t=blockText(c.block);if(t===null)return;const [a,b]=range(c);goalX=null;
 await structural(async e=>{if(a!==b)await e.replace({block:c.block,hunks:[{start:a,end:b,text:''}]});return e.split(c.block,a);},{block:c.block,off:c.head},{block:c.block+1,off:0});
});
async function joinAtEdge(block:number,t:string,dir:-1|1){
 const nb=nearbyBlock(block,dir);if(!nb){if(getDocumentsState().blocks.some(x=>x.index===block+dir))patchDocuments({caretLocked:true});return;}
 if(dir<0)await structural(e=>e.merge(block),{block,off:0},{block:block-1,off:u8(nb.text!)});
 else await structural(e=>e.merge(block+1),{block,off:u8(t)},{block,off:u8(t)});
}
