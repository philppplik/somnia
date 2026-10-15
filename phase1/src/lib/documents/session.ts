import {scrollToPage} from './scrollPage';
import {commentAuthor} from './author';
import {setStyleList} from './styles';
import {stylePatchProblem,STYLE_ID_RE,tocProblem,isListKind,listOptionsProblem,type ListStyleId} from './protocol';
import {hfVariantsProblem,HF_ALIGNS,propertiesProblem,linkProblem,commentProblem,type CommentItem,validHfText,type HeaderFooterState,checkFormatPatch,checkParaPatch,MAX_HF_CHARS,MAX_NEW_TABLE_COLS,MAX_NEW_TABLE_ROWS,TABLE_OPS,type TableOp,DOC_STYLES,type DocStyleId,type ListKindId,type ParaPatch,type ImageOp,type PageSetupPatch,type PageSetupState,pageSetupProblem,type TableStyle,type TableStyleScope,tableStyleProblem,MIN_COL_PT,MAX_COL_PT,imageProblem,IMAGE_WIDTH_PERCENTS,MAX_IMAGES} from './protocol';
import {captureDocumentSelection} from './selectionCapture';
import {CELL_BASE,caretAfterEdit,applyEdit,diffEdit,inverseOf,UndoStack,type TextEdit,type UndoEntry} from './edit';
import {findMatches,nextMatchIndex,textStats,validFindQuery,validReplaceText,MAX_FIND_HIGHLIGHTS,MAX_REPLACE_BLOCKS,type FindMatch} from './find';
import {listMarkerKind,stepBoundary,utf16ToUtf8Offset,utf8ToUtf16Offset,wordBoundary} from './text';
import {getDocumentsState,patchDocuments,resetDocuments,subscribeDocuments,INITIAL_VIEW,type Caret,type DocumentsState} from './store';
import {getCollab,onSessionChange} from '../collab/session';
import {buildMismatches} from '../collab/buildSync';
import {shareDocsFile,adoptDocsFile} from '../collab/office/officeSession';
import {openDocsModel,docsModelMeta,type DocsOpKind} from '../collab/office/docsModel';
import {DocsCollabBinding} from '../collab/office/docsBinding';
import {announceCaret} from '../collab/office/docsPresence';
import {DocumentsEngine} from './engine';
import {blockAfterTableEdit,cellOf} from './tableOps';
import {inspectDocx} from './inspect';
/** The one open document: engine, undo history and the refresh after each edit. UI components only call these functions. */
let engine:DocumentsEngine|null=null;let undo=new UndoStack();let chain:Promise<unknown>=Promise.resolve();let pending=0;
export const getEngine=()=>engine;
const ownerGuard=()=>{const e=engine,g=gen,en=cur;return ()=>{if(!e||engine!==e||gen!==g||cur!==en||e.isDisposed)throw Error('Document owner changed');};};
const flags=()=>({canUndo:undo.canUndo,canRedo:undo.canRedo});
/* ---- Per-file sessions: a file keeps its engine, undo history and dirty flag while the studio or tab is switched away. ---- */
const STASH=['blocks','pages','pageSizes','words','rev','canUndo','canRedo','edited','caret','risks','engineMs','editError','notice'] as const;
interface Entry{key:string;url:string;engine:DocumentsEngine|null;undo:UndoStack;stash:Partial<DocumentsState>;working:Uint8Array|null;dirty:boolean;used:number;undoReleased:boolean;collab:DocsCollabBinding|null}
const entries=new Map<string,Entry>();let cur:Entry|null=null;let gen=0;let tick=0;let identity:string|null=null;
export const MAX_LIVE_SESSIONS=4;
export interface SessionDeps{createEngine:()=>DocumentsEngine;loadBytes:(url:string)=>Promise<Uint8Array>}
const defaultDeps:SessionDeps={createEngine:()=>new DocumentsEngine(),loadBytes:async url=>new Uint8Array(await(await fetch(url)).arrayBuffer())};
let deps=defaultDeps;
export const setSessionDeps=(d:Partial<SessionDeps>|null)=>{deps=d?{...defaultDeps,...d}:defaultDeps;};
/** Test hook: forget every session without touching engines. */
export function resetSessionsForTest(){for(const e of entries.values())e.engine?.dispose?.();entries.clear();cur=null;engine=null;undo=new UndoStack();chain=Promise.resolve();pending=0;gen=0;goalX=null;}
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
 const e=entries.get(key);if(!e)return;entries.delete(key);if(e.collab){e.collab.destroy();e.collab=null;}e.engine?.dispose?.();e.engine=null;
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
  if(victim.collab){victim.collab.destroy();victim.collab=null;}
  victim.engine!.dispose?.();victim.engine=null;victim.undo=new UndoStack();
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
  stashCurrent();cur=null;engine=null;undo=new UndoStack();goalX=null;identity=null;
  if(!target){resetDocuments();return null;}
  let entry=entries.get(target.key);
  if(entry&&entry.url!==target.url){discardDocument(target.key);entry=undefined;}
  patchDocuments({...INITIAL_VIEW,status:'loading',name:target.key,error:''});
  try{
   if(entry&&live(entry)&&!target.retry){
    cur=entry;engine=entry.engine;undo=entry.undo;entry.used=++tick;identity=target.key;
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
    const fresh:Entry={key:target.key,url:target.url,engine:e,undo:new UndoStack(),stash:{},working:null,dirty:false,used:++tick,undoReleased:false,collab:null};
    const restored=!!entry?.working;if(entry&&!live(entry))entries.delete(target.key);else if(entry)discardDocument(target.key);
    entries.set(target.key,fresh);cur=fresh;engine=e;undo=fresh.undo;identity=target.key;
    const notice=lost?'lost':restored&&entry!.undoReleased?'undoReleased':'';
    patchDocuments({...INITIAL_VIEW,status:'loading',name:target.key,error:'',risks:check.risks,engineMs:Math.round(d.openMs+d.layoutMs),edited:restored,notice,...flags()});
    await refresh(d);
    if(my!==gen)return null;
    if(!restored)void attachDocsCollab(fresh,raw);
    else if(getCollab())patchDocuments({notice:'collabDirty'});   // edits exist only locally; sharing starts from the file on disk
    patchDocuments({status:'ready'});await evictExtra();return e;
   }catch(err){e.dispose();throw err;}
  }catch(err){
   if(my===gen)patchDocuments({status:'error',error:msg(err)},err);
   return null;
  }
 });
}
/** Collab (CO4): a freshly opened clean document joins the session's shared model; a dirty/restored one stays local with a notice. */
async function attachDocsCollab(entry:Entry,raw:Uint8Array){
 if(entry.collab||!live(entry))return;
 const c=getCollab();if(!c)return;
 if(buildMismatches(c.doc.awareness).length){if(cur===entry)patchDocuments({notice:'collabBuild'});return;}
 const e=entry.engine!;
 if(docsModelMeta(openDocsModel(c.doc,entry.key))){
  const ad=await adoptDocsFile(c.doc,entry.key,raw);if(!ad.ok||!live(entry)||entry.collab)return;
 }else{
  await shareDocsFile(c.doc,entry.key,raw);if(!live(entry)||entry.collab)return;
 }
 const binding=new DocsCollabBinding(c.doc,entry.key,{
  engine:{apply:(kind,params)=>e.applyJournalOp(kind,params)},
  onApplied:(_idx,_en,result)=>{const d=(result as {document?:{pages:number;pageSizes:readonly {width:number;height:number}[];text:string}}|null)?.document;
   if(d&&cur===entry&&engine===e)void refresh(d);},
 });
 e.setJournaler(req=>binding.applyLocalOp(req.kind as DocsOpKind,{...req,id:undefined} as Record<string,unknown>) as Promise<never>);
 entry.collab=binding;
 await binding.replay();
 if(cur===entry)patchDocuments({edited:getDocumentsState().edited||binding.journalLength>0,rev:getDocumentsState().rev+1});
}
function detachDocsCollab(entry:Entry){
 if(!entry.collab)return;
 entry.engine?.setJournaler(null);entry.collab.destroy();entry.collab=null;
 const c=getCollab();if(c)announceCaret(c.doc.awareness,null,0,0);
}
if(typeof window!=='undefined')onSessionChange(()=>{const live_=getCollab();for(const e of entries.values()){if(!live_)detachDocsCollab(e);}});
if(typeof window!=='undefined')subscribeDocuments(()=>{const c=getCollab();const st=getDocumentsState();if(!c||!cur?.collab)return;const caret=st.caret;if(caret)announceCaret(c.doc.awareness,cur.key,caret.block,caret.head);else announceCaret(c.doc.awareness,null,0,0);});
/** Hands over an already open engine as the current document, synchronously (tests and callers that open the engine themselves). Null closes the current document. */
export function attachEngine(e:DocumentsEngine|null,key?:string){
 if(!e){identity=null;void switchDocument(null);return;}
 ++gen;stashCurrent();const k=key??'document';if(entries.get(k)?.engine!==e)discardDocument(k);
 const en:Entry={key:k,url:k,engine:e,undo:new UndoStack(),stash:{},working:null,dirty:false,used:++tick,undoReleased:false,collab:null};
 entries.set(k,en);cur=en;engine=e;undo=en.undo;chain=Promise.resolve();goalX=null;identity=key??null;
 patchDocuments({...INITIAL_VIEW,name:k,...flags(),editError:'',edited:false,notice:''});
}
async function refresh(d:{pages:number;pageSizes:readonly {width:number;height:number}[];text:string}){
 const owner=gen,e=engine!;const blocks=await e.blocks();if(owner!==gen||e!==engine)throw Error('Document owner changed during refresh');
 patchDocuments({blocks,pages:d.pages,pageSizes:d.pageSizes,words:d.text.split(/\s+/).filter(Boolean).length,rev:getDocumentsState().rev+1,...flags()});
 if(getDocumentsState().find.open)void updateFind();
}
export async function loadBlocks(d:{pages:number;pageSizes:readonly {width:number;height:number}[];text:string}){await refresh(d);}
async function apply(edit:TextEdit,record:'new'|'undo'|'redo',o:{merge?:boolean;caret?:number|null;expect?:string}={}):Promise<string|undefined>{
 const e=engine,owner=gen;if(!e)return;
 const block=getDocumentsState().blocks.find(b=>b.index===edit.block);
 if(!block||!block.editable||block.text===undefined)throw new Error('This paragraph cannot be edited as text.');
 const inv=inverseOf(block.text,edit);
 let d:import('./protocol').OpenedDocument,readback:string|undefined;
 if(o.expect!==undefined){const r=await e.replaceChecked(edit,o.expect);d=r.document;readback=r.text;}else d=await e.replace(edit);
 if(owner!==gen||engine!==e)throw Error('Document owner changed during replacement');
 if(record==='new')undo.push(inv,o.merge);else if(record==='undo')undo.pushRedo(inv);else undo.pushUndo(inv);
 const at=record==='new'?o.caret:caretAfterEdit(edit);
 patchDocuments({edited:true,notice:'',editError:'',caretLocked:false,caret:at==null?null:{block:edit.block,anchor:at,head:at}});await refresh(d);
 return readback;
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
export type ReceiptFailure='stale-revision'|'stale-text'|'not-editable'|'closed'|'readback-mismatch'|'failed'|'stale-history'|'invalid';
/** `mutated` is false for every proven pre-commit refusal (nothing changed), true for a post-commit failure (the edit stands), and null when it could not be proven. */
export class EditReceiptError extends Error{constructor(readonly code:ReceiptFailure,message:string,readonly mutated:boolean|null=false){super(message);this.name='EditReceiptError';}}
export interface EditReceipt{block:number;/** The document revision after the edit. */rev:number;/** The paragraph text read back from the engine after the edit. */text:string;/** True once the edit is on the undo stack. */undoable:boolean;
 /** Who asked for the edit (caller supplied, bounded). */origin:string;kind:'apply'|'undo';beforeRev:number;afterRev:number;beforeText:string;afterText:string;
 /** Undo entries added (apply) or consumed (undo): 1 changed, 0 no-op, null when the history could not prove it. */applied:0|1|null;
 /** Listener errors after the commit; the edit still stands. */postCommitErrors:number}
export type ReceiptListener=(r:EditReceipt)=>void;
const receiptListeners=new Set<ReceiptListener>();
/** Observes reviewed edits. A throwing listener never affects the edit or other listeners; it only counts in `postCommitErrors`. */
export function onReviewedEdit(fn:ReceiptListener):()=>void{receiptListeners.add(fn);return()=>{receiptListeners.delete(fn);};}
interface UndoToken{e:DocumentsEngine;g:number;en:Entry|null;rev:number;depth:number;block:number;before:string;after:string;origin:string;used:boolean}
const tokens=new WeakMap<EditReceipt,UndoToken>();
const MAX_ORIGIN=80;
const checkOrigin=(o:unknown)=>{if(o===undefined)return '';if(typeof o!=='string'||o.length>MAX_ORIGIN)throw new EditReceiptError('invalid','The origin is not valid.');return o;};
function finish(r:EditReceipt,tok:UndoToken|null):EditReceipt{
 let errs=0;for(const fn of [...receiptListeners]){try{fn(r);}catch{errs++;}}
 const out=Object.freeze({...r,postCommitErrors:errs});if(tok)tokens.set(out,tok);return out;
}
/**
 * Applies one reviewed paragraph edit atomically. It refuses (changing nothing) when the document revision is not `expectedRev` or the
 * paragraph no longer reads `expectedText`; the worker checks the text again inside the same call as the replacement. The edit is on the
 * undo stack before this resolves, and the receipt carries the text read back from the engine, which must equal the expected result.
 * Serialised with every other edit. Errors are EditReceiptError (`mutated` tells a pre-commit refusal from a post-commit mismatch) and are
 * not shown as an editing error in the document. The receipt can be passed to undoReviewedEdit.
 */
export function applyReviewedEdit(req:{block:number;expectedRev:number;expectedText:string;hunks:import('./edit').Hunk[];origin?:string}):Promise<EditReceipt>{
 let origin:string;try{origin=checkOrigin(req.origin);}catch(err){return Promise.reject(err);}
 const en=cur;pending++;
 const p=chain.then(async():Promise<EditReceipt>=>{
  if(!engine||cur!==en)throw new EditReceiptError('closed','The document is not open.');
  const st=getDocumentsState();
  if(st.rev!==req.expectedRev)throw new EditReceiptError('stale-revision','The document changed since the edit was prepared.');
  const block=st.blocks.find(b=>b.index===req.block);
  if(!block||!block.editable||block.text===undefined)throw new EditReceiptError('not-editable','This paragraph cannot be edited as text.');
  if(block.text!==req.expectedText)throw new EditReceiptError('stale-text','The paragraph changed since the edit was prepared.');
  const edit:TextEdit={block:req.block,hunks:req.hunks};const want=applyEdit(req.expectedText,edit);
  const e=engine,g=gen,d0=undo.depth,r0=st.rev;let got:string|undefined;
  try{got=await apply(edit,'new',{expect:req.expectedText});}
  catch(err){const m=msg(err);const moved=getDocumentsState().rev!==r0||undo.depth!==d0;throw new EditReceiptError(m.startsWith('stale:')?'stale-text':'failed',m,m.startsWith('stale:')?false:moved?null:false);}
  if(got!==want)throw new EditReceiptError('readback-mismatch','The paragraph does not read back as the edit intended; undo it.',true);
  const after=getDocumentsState().rev,delta=undo.depth-d0;
  const r:EditReceipt={block:req.block,rev:after,text:got,undoable:getDocumentsState().canUndo,origin,kind:'apply',beforeRev:r0,afterRev:after,beforeText:req.expectedText,afterText:got,applied:delta===1?1:delta===0?0:null,postCommitErrors:0};
  return finish(r,delta===1?{e,g,en:cur,rev:after,depth:undo.depth,block:req.block,before:req.expectedText,after:got,origin,used:false}:null);
 }).finally(()=>{pending--;});
 chain=p.then(()=>undefined,()=>undefined);return p;
}
/**
 * Undoes exactly the edit a receipt describes, once. Refuses (nothing changed, code stale-history) when the receipt is not from
 * applyReviewedEdit, was already used, the document was reopened or switched, or any newer edit, undo or redo happened since.
 */
export function undoReviewedEdit(receipt:EditReceipt,origin?:string):Promise<EditReceipt>{
let o:string;try{o=checkOrigin(origin);}catch(err){return Promise.reject(err);}
 const tok=tokens.get(receipt);const en=cur;pending++;
 const p=chain.then(async():Promise<EditReceipt>=>{
  const stale=()=>new EditReceiptError('stale-history','The document changed since this edit; it cannot be undone from here.');
  if(!tok||tok.used)throw stale();
  if(!engine||cur!==en||engine!==tok.e||gen!==tok.g||cur!==tok.en||tok.e.isDisposed)throw stale();
  const st=getDocumentsState();if(st.rev!==tok.rev||undo.depth!==tok.depth)throw stale();
  const block=st.blocks.find(b=>b.index===tok.block);if(!block||block.text!==tok.after)throw stale();
  const x=undo.popUndo();if(!x||x.snap){if(x)undo.pushUndoEntry(x);throw stale();}
  tok.used=true;const r0=st.rev;
  try{await apply(x.inverse,'undo');}
  catch(err){const moved=getDocumentsState().rev!==r0;if(!moved){undo.pushUndoEntry(x);tok.used=false;}throw new EditReceiptError('failed',msg(err),moved?null:false);}
  const now=getDocumentsState(),text=now.blocks.find(b=>b.index===tok.block)?.text;
  if(text!==tok.before)throw new EditReceiptError('readback-mismatch','The paragraph does not read back as it did before the edit.',true);
  return finish({block:tok.block,rev:now.rev,text,undoable:now.canUndo,origin:o||tok.origin,kind:'undo',beforeRev:r0,afterRev:now.rev,beforeText:tok.after,afterText:text,applied:1,postCommitErrors:0},null);
 }).finally(()=>{pending--;});
 chain=p.then(()=>undefined,()=>undefined);return p;
}
async function restoreSnap(x:UndoEntry,to:'before'|'after'){
 const check=ownerGuard(),e=engine!;const sn=x.snap!;const d=await e.restore(to==='before'?sn.before:sn.after);check();const c=to==='before'?sn.caretBefore:sn.caretAfter;
 patchDocuments({edited:true,editError:'',caretLocked:false,caret:{block:c.block,anchor:c.off,head:c.off}});await refresh(d);
}
export const undoEdit=()=>run(async()=>{const check=ownerGuard(),x=undo.popUndo();if(!x)return;if(x.snap&&cur?.collab){patchDocuments({editError:'This structural edit cannot be undone while the document is shared.'});return;}if(x.snap){await restoreSnap(x,'before');check();undo.pushRedoEntry(x);}else await apply(x.inverse,'undo');}).then(()=>refreshStyles());
export const redoEdit=()=>run(async()=>{const check=ownerGuard(),x=undo.popRedo();if(!x)return;if(x.snap){await restoreSnap(x,'after');check();undo.pushUndoEntry(x);}else await apply(x.inverse,'redo');});

type Spot={block:number;off:number};
/** Paragraph split/join. One undo step restores the engine's pre-edit block list from a cheap snapshot; a failure part-way restores it at once. */
async function structural(op:(e:DocumentsEngine)=>Promise<import('./protocol').OpenedDocument>,before:Spot,afterSpec:Spot|((e:DocumentsEngine)=>Promise<Spot>)){
 const e=engine;if(!e)return;const check=ownerGuard(),b=await e.snapshot();check();let d;
 try{d=await op(e);check();}catch(err){if(engine===e)await e.restore(b).catch(()=>undefined);throw err;}
 let after:Spot;try{after=typeof afterSpec==='function'?await afterSpec(e):afterSpec;}catch(err){await e.restore(b).catch(()=>undefined);throw err;}
 check();
 const a=await e.snapshot();check();undo.pushSnap({before:b,after:a,caretBefore:before,caretAfter:after});
 patchDocuments({edited:true,editError:'',caretLocked:false,imageBlock:null,imageRects:[],caret:{block:after.block,anchor:after.off,head:after.off}});await refresh(d);
}
/* ---- On-page caret: all offsets are UTF-8 bytes of the paragraph's current text. A selection may span paragraphs (anchorBlock differs from block). ---- */
const enc=new TextEncoder();const u8=(s:string)=>enc.encode(s).length;
const blockText=(i:number)=>{const b=getDocumentsState().blocks.find(x=>x.index===i);return b&&b.editable?b.text??null:null;};
interface Pos{block:number;off:number}
const cmp=(a:Pos,b:Pos)=>a.block-b.block||a.off-b.off;
/** Anchor `a`, moving head `h`, and the same two in document order (`s` first). */
const norm=(c:Caret)=>{const a:Pos={block:c.anchorBlock??c.block,off:c.anchor},h:Pos={block:c.block,off:c.head};return cmp(a,h)<=0?{s:a,e:h,a,h}:{s:h,e:a,a,h};};
const setSel=(a:Pos,h:Pos)=>patchDocuments({caret:a.block===h.block?{block:h.block,anchor:a.off,head:h.off}:{block:h.block,anchor:a.off,head:h.off,anchorBlock:a.block}});
export const MAX_SPAN_BLOCKS=2000,MAX_INSERT_CHARS=1_000_000,MAX_INSERT_LINES=5000;
/** Texts of the editable paragraphs `from..to`, or null when one is a table/object, missing, or the span is above the cap. */
function spanTexts(from:number,to:number):string[]|null{
 if(to<from||to-from+1>MAX_SPAN_BLOCKS)return null;
 // A range inside table cells must stay in one cell: it never crosses a cell border.
 if(to>from&&to>=CELL_BASE&&!sameCellRange(from,to))return null;
 const out:string[]=[];
 for(let i=from;i<=to;i++){const t=blockText(i);if(t===null)return null;out.push(t);}return out;
}
/** True when every block `from..to` is a paragraph of one and the same table cell. */
function sameCellRange(from:number,to:number):boolean{
 const bs=getDocumentsState().blocks;const a=bs.find(x=>x.index===from);if(!a||a.kind!=='cell')return false;
 for(let i=from+1;i<=to;i++){const b=bs.find(x=>x.index===i);if(!b||b.kind!=='cell'||b.table!==a.table||b.row!==a.row||b.cell!==a.cell)return false;}
 return true;
}
const reachable=(a:number,b:number)=>spanTexts(Math.min(a,b),Math.max(a,b))!==null;
let goalX:number|null=null;
export const selectedText=()=>{
 const c=getDocumentsState().caret;if(!c)return '';const {s,e}=norm(c);const ts=spanTexts(s.block,e.block);if(!ts)return '';
 return ts.map((t,k)=>t.slice(k===0?utf8ToUtf16Offset(t,s.off):0,k===ts.length-1?utf8ToUtf16Offset(t,e.off):t.length)).join('\n');
};
async function pointTo(page:number,x:number,y:number,extend:boolean){
 const e=engine;if(!e)return;const check=ownerGuard(),hit=await e.hit(page,x,y);check();const c=getDocumentsState().caret;
 if(!hit||hit.block===null||!hit.editable||hit.off===undefined){if(!extend){const img=hit&&hit.block!==null&&hit.block<CELL_BASE&&getDocumentsState().blocks.some(b=>b.index===hit.block&&!!b.image);patchDocuments({caret:null,caretLocked:!!hit&&!img,imageBlock:img?hit!.block:null,imageRects:[]});if(img)await syncGeometry();}return;}
 if(extend){if(!c)return;const a=norm(c).a;if(a.block!==hit.block&&!reachable(a.block,hit.block))return;setSel(a,{block:hit.block,off:hit.off});}
 else{patchDocuments({caretLocked:false,editError:'',imageBlock:null});setSel({block:hit.block,off:hit.off},{block:hit.block,off:hit.off});}
}
/** Places the caret (or extends the selection) at a page-space point. */
export const pointerAt=(page:number,x:number,y:number,extend=false)=>{goalX=null;return run(()=>pointTo(page,x,y,extend));};
let pend:{page:number;x:number;y:number;owner:number}|null=null,busy=false;
/** Drag selection: only the latest pointer position is sent, so a fast drag never floods the worker. */
export function dragTo(page:number,x:number,y:number){pend={page,x,y,owner:gen};if(busy)return;busy=true;void(async()=>{while(pend){const p=pend;pend=null;if(p.owner===gen)await run(()=>pointTo(p.page,p.x,p.y,true));}busy=false;})();}
async function applyAtCaret(hunk:{start:number;end:number;text:string},merge=false){
 const c=getDocumentsState().caret;if(!c)return;const edit:TextEdit={block:c.block,hunks:[hunk]};await apply(edit,'new',{merge,caret:caretAfterEdit(edit)});
}
/**
 * Replaces the document range s..e (possibly across paragraphs) with `text`, whose newlines become paragraph breaks.
 * One engine snapshot pair = one undo step, and any failure part-way restores the pre-edit body.
 */
async function replaceRange(s:Pos,e:Pos,text:string,before:Pos){
 const ts=spanTexts(s.block,e.block);if(!ts)throw new Error(e.block-s.block+1>MAX_SPAN_BLOCKS?`Selection is too large for one edit (limit ${MAX_SPAN_BLOCKS} paragraphs).`:'This selection includes a part that cannot be edited as text.');
 const lines=text.split('\n');if(lines.length>MAX_INSERT_LINES||text.length>MAX_INSERT_CHARS)throw new Error('The text is too large to insert at once.');
 const noop=(h:{start:number;end:number;text:string})=>h.start===h.end&&h.text==='';
 const tailOff=s.off+u8(lines[0]);const endBlock=s.block+lines.length-1;const endOff=lines.length===1?tailOff:u8(lines[lines.length-1]);
 if(cmp(s,e)===0&&text==='')return;
 await structural(async eng=>{
  let d:import('./protocol').OpenedDocument|null=null;
  const rep=async(block:number,h:{start:number;end:number;text:string})=>{if(!noop(h))d=await eng.replace({block,hunks:[h]});};
  if(e.block>s.block){
   if(e.off>0)await rep(e.block,{start:0,end:e.off,text:''});
   for(let i=s.block+1;i<e.block;i++)await rep(i,{start:0,end:u8(ts[i-s.block]),text:''});
   await rep(s.block,{start:s.off,end:u8(ts[0]),text:lines[0]});
   for(let i=e.block;i>s.block;i--)d=await eng.merge(i);
  }else await rep(s.block,{start:s.off,end:e.off,text:lines[0]});
  let b=s.block,off=tailOff;
  for(let k=1;k<lines.length;k++){d=await eng.split(b,off);b++;if(lines[k])d=await eng.replace({block:b,hunks:[{start:0,end:0,text:lines[k]}]});off=u8(lines[k]);}
  if(!d)throw new Error('Nothing to change.');return d;
 },before,{block:endBlock,off:endOff});
}
const clean=(text:string)=>text.replace(/\r\n?/g,'\n').replace(/\uFFFC/g,'');
/** Types text at the caret or over the selection. Line breaks become spaces (typed input); use pasteText for multi-line text. */
const inList=()=>{const l=getDocumentsState().para?.list;return l==='bullet'||l==='numbered';};
export const typeText=(text:string)=>run(async()=>{
 const c=getDocumentsState().caret;if(!c)return;const t=clean(text).replace(/\n+/g,' ');if(!t)return;if(t.length>MAX_INSERT_CHARS)throw new Error('The text is too large to insert at once.');const n=norm(c);goalX=null;
 // "- ", "* " or "1. " typed into an otherwise empty plain paragraph starts a list (the marker is removed; one undo step).
 if(t===' '&&cmp(n.s,n.e)===0&&!inList()&&getDocumentsState().pendingFormat===null){
  const cur=blockText(n.s.block),kind=cur===null?null:listMarkerKind(cur);
  if(kind&&n.s.off===u8(cur!)){
   await structural(async eng=>{await eng.replace({block:n.s.block,hunks:[{start:0,end:u8(cur!),text:''}]});return eng.setList(n.s.block,n.s.block,kind);},n.s,{block:n.s.block,off:0});
   return;
  }
 }
 const pf=getDocumentsState().pendingFormat;
 if(pf&&cmp(n.s,n.e)===0&&pf.block===n.s.block&&pf.off===n.s.off){
  const at=n.s.off,end=at+u8(t);
  await structural(async eng=>{await eng.replace({block:n.s.block,hunks:[{start:at,end:at,text:t}]});return eng.format({block:n.s.block,off:at},{block:n.s.block,off:end},pf.patch);},n.s,{block:n.s.block,off:end});
  patchDocuments({pendingFormat:{block:n.s.block,off:end,patch:pf.patch}});return;
 }
 if(n.s.block===n.e.block)await applyAtCaret({start:n.s.off,end:n.e.off,text:t},n.s.off===n.e.off);
 else await replaceRange(n.s,n.e,t,n.h);
});
const FORMAT_PROPS=['bold','italic','underline','strike','smallCaps','allCaps','doubleStrike'] as const;
export type FormatProp=typeof FORMAT_PROPS[number];
/**
 * Bold/italic/underline on the selection with Word semantics: when every character already has it, it is removed, otherwise it is applied to all.
 * With a collapsed caret the choice is held and applies to the next typed text. One engine snapshot pair = one undo step.
 */
export const toggleFormat=(prop:FormatProp)=>run(async()=>{
 if(!FORMAT_PROPS.includes(prop))throw new Error('Unknown format.');
 const st=getDocumentsState();const pf=heldFormat();
 const now=pf?.[prop]??(st.format?.[prop]==='on');
 await applyFormat({[prop]:!now});
});
/** The held (pending) format at the current caret, or null. */
function heldFormat():import('./protocol').FormatPatch|null{
 const {caret:c,pendingFormat:p}=getDocumentsState();if(!c||!p)return null;const n=norm(c);
 return cmp(n.s,n.e)===0&&p.block===n.s.block&&p.off===n.s.off?p.patch:null;
}
/**
 * Applies a format patch to the selection as ONE undo step, or (collapsed caret) holds it for the next typed text.
 * Table/object spans and oversize spans are refused; an engine failure restores the paragraphs.
 */
async function applyFormat(patch:import('./protocol').FormatPatch){
 checkFormatPatch(patch);
 const st=getDocumentsState(),c=st.caret;if(!c)return;const n=norm(c);goalX=null;
 if(cmp(n.s,n.e)===0){
  if(blockText(n.s.block)===null)return;
  patchDocuments({pendingFormat:{block:n.s.block,off:n.s.off,patch:{...(heldFormat()??{}),...patch}}});return;
 }
 const ts=spanTexts(n.s.block,n.e.block);if(!ts)throw new Error(n.e.block-n.s.block+1>MAX_SPAN_BLOCKS?`Selection is too large for one edit (limit ${MAX_SPAN_BLOCKS} paragraphs).`:'This selection includes a part that cannot be edited as text.');
 await structural(eng=>eng.format(n.s,n.e,patch),n.h,n.h);
 setSel(n.a,n.h);
}
/** Font family, size (points) and colour (`RRGGBB` or `auto`) of the selection, or of the next typed text at a caret. */
export const setFont=(font:string)=>run(()=>applyFormat({font}));
export const setFontSize=(size:number)=>run(()=>applyFormat({size}));
export const setFontColor=(color:string)=>run(()=>applyFormat({color}));
/** Superscript or subscript; choosing the one already set returns to normal. */
export const toggleVertAlign=(v:'superscript'|'subscript')=>run(async()=>{
 const cur=heldFormat()?.vertAlign??getDocumentsState().format?.vertAlign??'baseline';
 await applyFormat({vertAlign:cur===v?'baseline':v});
});
/** Highlight colour of the selection, or of the next typed text at a caret. `none` removes it. */
/** Character spacing in points (-5 to 30) on the selection, or held for the next typed text. One undo step. */
export const setCharSpacing=(pt:number)=>run(()=>applyFormat({spacing:pt}));
/** Underline style/colour and character shading on the selection (or held for typing). One undo step. */
export const setCharLook=(patch:Pick<import('./protocol').FormatPatch,'underline'|'underlineStyle'|'underlineColor'|'charShading'>)=>run(()=>applyFormat(patch));
export const setHighlight=(h:import('./protocol').HighlightName)=>run(()=>applyFormat({highlight:h}));
/** The selected text must exist: a link cannot be held for typing. */
const needSelection=()=>{const c=getDocumentsState().caret;if(!c)return false;const n=norm(c);return cmp(n.s,n.e)!==0;};
/** Link (or, with an empty URL, unlink) the selected text. One undo step. */
export const setLink=(url:string)=>run(async()=>{
 const bad=linkProblem(url);if(bad)throw new Error(bad);
 if(!needSelection())throw new Error('Select the text to link first.');
 await applyFormat({link:url});
});
/** Remove direct character formatting from the selection (links stay). One undo step. */
export const clearFormatting=()=>run(async()=>{
 if(!needSelection())throw new Error('Select text to clear its formatting.');
 await applyFormat({clear:true});
});
export const hasTextSelection=needSelection;
/** Grows or shrinks the size by one step of the usual size ladder (stays within 1-400 pt; a mixed selection starts from 11 pt). */
export const FONT_SIZES=[8,9,10,11,12,14,16,18,20,24,28,32,36,48,72] as const;
export const stepFontSize=(dir:-1|1)=>run(async()=>{
 const cur=heldFormat()?.size??getDocumentsState().format?.size??11;
 const next=dir>0?FONT_SIZES.find(s=>s>cur):[...FONT_SIZES].reverse().find(s=>s<cur);
 if(next===undefined)return;await applyFormat({size:next});
});
/** Pastes plain text; every newline starts a new paragraph (copying the paragraph properties). The selection is replaced in the same undo step. */
export const pasteText=(text:string)=>run(async()=>{
 const c=getDocumentsState().caret;if(!c)return;const t=clean(text);if(!t)return;if(t.length>MAX_INSERT_CHARS)throw new Error('The text is too large to insert at once.');const n=norm(c);goalX=null;
 if(!t.includes('\n')&&n.s.block===n.e.block){await applyAtCaret({start:n.s.off,end:n.e.off,text:t});return;}
 await replaceRange(n.s,n.e,t,n.h);
});
/** Backspace/Delete by one user-perceived character, or by word with `word`. A selection (also across paragraphs) is deleted as one step. At a paragraph edge the neighbour is joined. */
export const deleteAtCaret=(dir:-1|1,word=false)=>run(async()=>{
 const c=getDocumentsState().caret;if(!c)return;const n=norm(c);goalX=null;
 if(cmp(n.s,n.e)!==0){if(n.s.block===n.e.block)await applyAtCaret({start:n.s.off,end:n.e.off,text:''});else await replaceRange(n.s,n.e,'',n.h);return;}
 const t=blockText(c.block);if(t===null)return;
 // Backspace at the start of a list item removes the list first and keeps the text.
 if(dir<0&&c.head===0&&inList()){await structural(eng=>eng.setList(c.block,c.block,'none'),{block:c.block,off:0},{block:c.block,off:0});return;}
 const i=utf8ToUtf16Offset(t,c.head);const j=word?wordBoundary(t,i,dir):stepBoundary(t,i,dir);
 if(j===i){await joinAtEdge(c.block,t,dir);return;}
 const k=utf16ToUtf8Offset(t,j);await applyAtCaret(dir<0?{start:k,end:c.head,text:''}:{start:c.head,end:k,text:''});
});
export const selectAllInParagraph=()=>{const c=getDocumentsState().caret;if(!c)return;const t=blockText(c.block);if(t!==null)patchDocuments({caret:{block:c.block,anchor:0,head:u8(t)}});};
/** Ctrl+A: every consecutive editable paragraph around the caret (a table or object paragraph ends the run). */
export const selectAllText=()=>{
 const c=getDocumentsState().caret;if(!c||blockText(c.block)===null)return;
 if(c.block>=CELL_BASE){selectAllInParagraph();return;}
 let lo=c.block,hi=c.block;
 while(lo>0&&hi-lo<MAX_SPAN_BLOCKS&&blockText(lo-1)!==null)lo--;while(hi-lo<MAX_SPAN_BLOCKS&&blockText(hi+1)!==null)hi++;
 setSel({block:lo,off:0},{block:hi,off:u8(blockText(hi)!)});
};
export const clearCaret=()=>patchDocuments({caret:null,caretBox:null,selRects:[],caretLocked:false,imageBlock:null,imageRects:[]});
export type CaretMove='left'|'right'|'up'|'down'|'home'|'end'|'wordLeft'|'wordRight'|'pageUp'|'pageDown'|'docStart'|'docEnd';
const nearbyBlock=(from:number,dir:-1|1)=>{const bs=getDocumentsState().blocks;const b=bs.find(x=>x.index===from+dir);return b&&b.editable&&b.text!==undefined?b:null;};
/** First editable hit on `page`, scanning from y0 by `step` (page-space points) at most `count` times. */
async function probe(e:DocumentsEngine,page:number,x:number,y0:number,step:number,count:number){
 const h=getDocumentsState().pageSizes[page]?.height??0;
 for(let k=0;k<count;k++){const y=y0+k*step;if(y<0||y>h)break;const r=await e.hit(page,x,y);if(r&&r.block!==null&&r.editable&&r.off!==undefined)return r;}
 return null;
}
/** Keyboard caret movement. Up/Down/PageUp/PageDown cross pages using the engine's line geometry; Left/Right and word moves cross into neighbouring editable paragraphs; Shift extends across paragraphs. */
export const moveCaret=(kind:CaretMove,extend:boolean)=>run(async()=>{
 const c=getDocumentsState().caret;const e=engine;if(!c||!e)return;const check=ownerGuard();const n=norm(c);const h=n.h;const t=blockText(h.block);if(t===null)return;
 const go=(block:number,off:number)=>{check();if(extend){if(block!==n.a.block&&!reachable(n.a.block,block))return;setSel(n.a,{block,off});}else setSel({block,off},{block,off});};
 if(kind==='left'||kind==='right'||kind==='wordLeft'||kind==='wordRight'){
  goalX=null;const dir=kind==='left'||kind==='wordLeft'?-1:1;const word=kind==='wordLeft'||kind==='wordRight';
  if(!extend&&cmp(n.s,n.e)!==0&&!word){const p=dir<0?n.s:n.e;go(p.block,p.off);return;}
  const i=utf8ToUtf16Offset(t,h.off);const j=word?wordBoundary(t,i,dir):stepBoundary(t,i,dir);
  if(j!==i){go(h.block,utf16ToUtf8Offset(t,j));return;}
  const nb=nearbyBlock(h.block,dir);if(nb)go(nb.index,dir<0?u8(nb.text!):0);return;
 }
 if(kind==='docStart'||kind==='docEnd'){
  goalX=null;const bs=getDocumentsState().blocks.filter(b=>b.editable&&b.text!==undefined&&b.index<CELL_BASE);const b=kind==='docStart'?bs[0]:bs[bs.length-1];if(b)go(b.index,kind==='docStart'?0:u8(b.text!));return;
 }
 const box=getDocumentsState().caretBox;if(!box)return;const lh=Math.max(box.height,1);const mid=box.top+box.height/2;
 if(kind==='home'||kind==='end'){goalX=null;const r=await e.hit(box.page,kind==='home'?-1e4:1e5,mid);if(r&&r.block===h.block&&r.off!==undefined)go(h.block,r.off);return;}
 goalX??=box.x;const sizes=getDocumentsState().pageSizes;
 if(kind==='pageUp'||kind==='pageDown'){
  const to=box.page+(kind==='pageUp'?-1:1);if(to<0||to>=sizes.length)return;
  const r=await probe(e,to,goalX,box.top,lh*0.6,120)??await probe(e,to,goalX,box.top,-lh*0.6,120);if(r)go(r.block!,r.off!);return;
 }
 const up=kind==='up';const y=up?box.top-lh*0.6:box.top+lh*1.6;let r=await e.hit(box.page,goalX,y);
 if(r&&r.block!==null&&r.editable&&r.off!==undefined){go(r.block,r.off);return;}
 if(r&&r.block!==null)return;/* a table or object paragraph: stay put */
 const pageH=sizes[box.page]?.height??0;
 if(up&&box.page>0&&box.top<pageH/2)r=await probe(e,box.page-1,goalX,(sizes[box.page-1]?.height??0)-lh*0.6,-lh*0.6,60);
 else if(!up&&box.page<sizes.length-1&&box.top>pageH/2)r=await probe(e,box.page+1,goalX,lh*0.6,lh*0.6,60);else r=null;
 if(r)go(r.block!,r.off!);
});
/** Refreshes caret and selection geometry from the engine. A failure drops the caret instead of drawing a guess. */
export async function syncGeometry(){
 const e=engine,g=gen,c=getDocumentsState().caret;if(!e)return;
 if(!c){
  const ib=getDocumentsState().imageBlock;let ir:import('./protocol').Rect5[]=[];
  if(ib!==null&&getDocumentsState().blocks.some(b=>b.index===ib&&!!b.image)){try{ir=await e.rects(ib,0,3);}catch{ir=[];}}/* the picture is one U+FFFC (3 UTF-8 bytes) */
  if(engine===e&&gen===g&&!getDocumentsState().caret)patchDocuments({caretBox:null,selRects:[],imageRects:ir});return;
 }
 try{
  const n=norm(c);const box=await e.caret(c.block,c.head);let rects:import('./protocol').Rect5[]=[];
  if(cmp(n.s,n.e)!==0){
   if(n.s.block===n.e.block)rects=await e.rects(n.s.block,n.s.off,n.e.off);
   else{
    const ts=spanTexts(n.s.block,n.e.block);if(!ts)throw new Error('Selection is no longer editable.');
    for(let k=0;k<ts.length;k+=64){
     const part=await Promise.all(ts.slice(k,k+64).map((t,j)=>{const i=k+j;const from=i===0?n.s.off:0,to=i===ts.length-1?n.e.off:u8(t);return from<to?e.rects(n.s.block+i,from,to):Promise.resolve([]);}));
     for(const p of part)rects.push(...p);
    }
   }
  }
  let para:import('./protocol').ParaState|null=null;
  try{para=await e.paragraphState(n.s.block,n.e.block);}catch{para=null;}
  let format:import('./protocol').FormatState|null=null;
  try{format=await e.formatState(n.s,n.e);}catch{format=null;}
  if(engine===e&&gen===g&&getDocumentsState().caret===c){
   const pf=getDocumentsState().pendingFormat;
   patchDocuments({caretBox:box,selRects:rects,imageRects:[],format,para,...(pf&&(cmp(n.s,n.e)!==0||pf.block!==n.s.block||pf.off!==n.s.off)?{pendingFormat:null}:{})});
  }
 }catch{if(engine===e&&gen===g&&getDocumentsState().caret===c)patchDocuments({caret:null,caretBox:null,selRects:[]});}
}
/** Enter: replaces the selection (if any) and splits there. The new paragraph copies the paragraph properties. */
export const splitAtCaret=()=>run(async()=>{
 const c=getDocumentsState().caret;if(!c)return;const n=norm(c);goalX=null;
 if(blockText(n.s.block)===null)return;
 // Enter on an empty list item ends the list instead of adding another empty item.
 if(cmp(n.s,n.e)===0&&blockText(n.s.block)===''&&inList()){await structural(eng=>eng.setList(n.s.block,n.s.block,'none'),n.h,n.h);return;}
 const check=ownerGuard();await replaceRange(n.s,n.e,'\n',n.h);check();
});
async function joinAtEdge(block:number,t:string,dir:-1|1){
 // Inside a table cell paragraphs join only within their own cell; at the cell edge nothing happens.
 if(block>=CELL_BASE&&!sameCellRange(Math.min(block,block+dir),Math.max(block,block+dir)))return;
 const nb=nearbyBlock(block,dir);if(!nb){if(getDocumentsState().blocks.some(x=>x.index===block+dir))patchDocuments({caretLocked:true});return;}
 if(dir<0)await structural(e=>e.merge(block),{block,off:0},{block:block-1,off:u8(nb.text!)});
 else await structural(e=>e.merge(block+1),{block,off:u8(t)},{block,off:u8(t)});
}

/** No identity supplied at attachment means capture stays unavailable. */
export const captureCurrentDocumentSelection=()=>{if(pending||getDocumentsState().editError||engine?.isDisposed)throw Error('Document work unsettled or failed');return captureDocumentSelection(getDocumentsState(),engine&&identity?{generation:gen,identity}:null);};
/** Await only current queue, then refuse owner/new-work drift. Not an accept lease. */
export async function settleDocumentSelection(){const owner=gen,queue=chain;await queue;if(owner!==gen||queue!==chain)throw Error('Document work changed while settling');return captureCurrentDocumentSelection();}
export function detachEngineIfCurrent(e:DocumentsEngine){if(engine===e)attachEngine(null);}

/**
 * Alignment, indents and spacing for every paragraph the selection touches, as ONE undo step.
 * A table or any non-paragraph block in the span is refused; an engine failure restores the paragraphs.
 */
async function applyPara(patch:ParaPatch){
 checkParaPatch(patch);
 const c=getDocumentsState().caret;if(!c)return;const n=norm(c);goalX=null;
 if(n.e.block-n.s.block+1>MAX_SPAN_BLOCKS)throw new Error(`Selection is too large for one edit (limit ${MAX_SPAN_BLOCKS} paragraphs).`);
 const blocks=getDocumentsState().blocks;
 for(let i=n.s.block;i<=n.e.block;i++){if(blocks.find(b=>b.index===i)?.kind!=='para'&&blocks.find(b=>b.index===i)?.kind!=='cell')throw new Error('This selection includes a part that cannot be formatted as a paragraph.');}
 await structural(eng=>eng.formatParagraphs(n.s.block,n.e.block,patch),n.h,n.h);
 setSel(n.a,n.h);
}
export const setAlign=(align:import('./protocol').ParaAlign)=>run(()=>applyPara({align}));
/** Tab stops (replacing the paragraph's own list) for every paragraph the selection touches. One undo step. */
export const setTabStops=(tabs:import('./protocol').TabStopSpec[])=>run(()=>applyPara({tabs}));
/** Right indent and the flow options (page break before, keep with next, keep lines together, widow control) of every paragraph the selection touches. One undo step. */
export const setParagraphOptions=(patch:ParaPatch)=>run(()=>applyPara(patch));
/** Starts a new page at the caret: splits the paragraph there and makes the new one begin a page. One undo step. */
export const insertPageBreak=()=>run(async()=>{
 const c=getDocumentsState().caret;if(!c)throw new Error('Place the caret where the new page should start.');
 const n=norm(c);if(cmp(n.s,n.e)!==0)throw new Error('Place the caret where the new page should start.');
 if(n.s.block>=CELL_BASE)throw new Error('A page break cannot go inside a table.');
 if(blockText(n.s.block)===null)throw new Error('This paragraph cannot be edited as text.');
 const b=n.s.block,off=n.s.off;
 await structural(async eng=>{await eng.split(b,off);return eng.formatParagraphs(b+1,b+1,{pageBreakBefore:true});},{block:b,off},{block:b+1,off:0});
});
export const setLineSpacing=(lineSpacing:number)=>run(()=>applyPara({lineSpacing}));
export const setSpaceBefore=(spaceBefore:number)=>run(()=>applyPara({spaceBefore}));
export const setSpaceAfter=(spaceAfter:number)=>run(()=>applyPara({spaceAfter}));
/** Paragraph style (Normal, Title, Subtitle, Heading 1-4, Quote) for every paragraph the selection touches. One undo step. */
async function paraSpan(){
 const c=getDocumentsState().caret;if(!c)return null;const n=norm(c);goalX=null;
 if(n.e.block-n.s.block+1>MAX_SPAN_BLOCKS)throw new Error(`Selection is too large for one edit (limit ${MAX_SPAN_BLOCKS} paragraphs).`);
 const blocks=getDocumentsState().blocks;
 for(let i=n.s.block;i<=n.e.block;i++){if(blocks.find(b=>b.index===i)?.kind!=='para'&&blocks.find(b=>b.index===i)?.kind!=='cell')throw new Error('This selection includes a part that cannot be formatted as a paragraph.');}
 return n;
}
export const setParagraphStyle=(style:string)=>run(async()=>{
 if(!(DOC_STYLES as readonly string[]).includes(style)&&!STYLE_ID_RE.test(style))throw new Error('Style is not offered.');
 const n=await paraSpan();if(!n)return;
 await structural(eng=>eng.setParagraphStyle(n.s.block,n.e.block,style),n.h,n.h);setSel(n.a,n.h);
});
/** Bullet or numbered list. Choosing the kind the whole selection already has removes the list (Word behaviour). */
export const toggleList=(kind:'bullet'|'numbered')=>run(async()=>{
 const n=await paraSpan();if(!n)return;
 const next:ListKindId=getDocumentsState().para?.list===kind?'none':kind;
 await structural(eng=>eng.setList(n.s.block,n.e.block,next),n.h,n.h);setSel(n.a,n.h);
});
/** Applies a list style (bullet, dash, square, 1., 1), A., a), i., I.A.1., 1.1.1.) to the selected paragraphs; paragraphs already in a list keep their level. One undo step. */
export const setListStyle=(style:ListStyleId)=>run(async()=>{
 if(!isListKind(style))throw new Error('List style is not valid.');
 const n=await paraSpan();if(!n)return;
 await structural(eng=>eng.setList(n.s.block,n.e.block,style),n.h,n.h);setSel(n.a,n.h);
});
/** Restarts numbering at the first selected paragraph: it and the later items of the same numbered list count from 1 again. One undo step; refused outside a numbered list. */
/* ---- Styles editor ---- */
/** Reads the document's paragraph and character styles into the shared list (not an edit). */
export async function refreshStyles():Promise<void>{
 const e=engine;if(!e||getDocumentsState().status!=='ready'){setStyleList([]);return;}const check=ownerGuard();
 try{const items=await e.listStyles();check();setStyleList(items);}catch{check();}
}
/** Creates a style (no `id`) or changes one (with `id`) and returns its id. One undo step; the text keeps its look until the style is used. */
export async function saveStyle(patch:import('./protocol').StylePatch):Promise<string|null>{
 const bad=stylePatchProblem(patch);if(bad)throw new Error(bad);
 let out:string|null=null;
 await run(async()=>{const c=getDocumentsState().caret;const spot=c?{block:c.block,off:c.head}:await nearEditable(engine!,0);
  await structural(async eng=>{const r=await eng.upsertStyle(patch);out=r.styleId;return r.document;},spot,spot);if(!c)patchDocuments({caret:null});});
 await refreshStyles();return out;
}
/** Deletes a custom style: paragraphs and text that used it go back to Normal / no character style. One undo step. */
export const deleteStyle=(styleId:string)=>run(async()=>{
 if(!STYLE_ID_RE.test(styleId))throw new Error('The style is not valid.');
 const c=getDocumentsState().caret;const spot=c?{block:c.block,off:c.head}:await nearEditable(engine!,0);
 await structural(eng=>eng.deleteStyle(styleId),spot,spot);if(!c)patchDocuments({caret:null});await refreshStyles();
});
/** Applies a character style to the selected text (an empty id removes it). One undo step. */
export const setCharStyle=(styleId:string)=>run(async()=>{
 if(styleId!==''&&!STYLE_ID_RE.test(styleId))throw new Error('The style is not valid.');
 if(!needSelection())throw new Error('Select the text first.');
 await applyFormat({charStyle:styleId});
});
/* ---- Table of contents (static entries built from the headings; the engine finds it again by its TOC styles) ---- */
const tocSpot=()=>{const c=getDocumentsState().caret;const b=c?norm(c).s.block:0;return{block:b,off:c?norm(c).s.off:0};};
/** Inserts a table of contents above the caret paragraph (below the table when the caret is in one). One undo step; refused when the document has no headings. */
export const insertToc=(o:import('./protocol').TocOptions)=>run(async()=>{
 const bad=tocProblem(o);if(bad)throw new Error(bad);
 const sp=tocSpot();const at=sp.block>=CELL_BASE?0:sp.block;
 await structural(eng=>eng.insertToc(sp.block,o),sp,eng=>nearEditable(eng,at));
});
/** Rebuilds the table of contents (the one at the caret, else the first) from the current headings, keeping its title, depth and page numbers. One undo step. */
export const updateToc=()=>run(async()=>{
 const sp=tocSpot();await structural(eng=>eng.updateToc(sp.block),sp,eng=>nearEditable(eng,sp.block>=CELL_BASE?0:sp.block));
});
/** Removes the table of contents (the one at the caret, else the first). One undo step. */
export const removeToc=()=>run(async()=>{
 const sp=tocSpot();await structural(eng=>eng.removeToc(sp.block),sp,eng=>nearEditable(eng,sp.block>=CELL_BASE?0:sp.block));
});
/** Continues the numbering of the nearest numbered list above: the caret's list (and its later items) count on from it. One undo step; refused in tables, in bullet lists and when no numbered list is above. */
export const continueNumbering=()=>run(async()=>{
 const n=await paraSpan();if(!n)return;
 await structural(eng=>eng.continueList(n.s.block,n.e.block),n.h,n.h);setSel(n.a,n.h);
});
export const restartNumbering=()=>run(async()=>{
 const n=await paraSpan();if(!n)return;
 await structural(eng=>eng.restartList(n.s.block,n.e.block),n.h,n.h);setSel(n.a,n.h);
});
/** Removes the list from the selected paragraphs (the text stays). */
export const clearList=()=>run(async()=>{
 const n=await paraSpan();if(!n)return;
 await structural(eng=>eng.setList(n.s.block,n.e.block,'none'),n.h,n.h);setSel(n.a,n.h);
});
/** Tab / Shift+Tab inside a list: one level deeper or shallower. Outside a list the engine refuses and nothing changes. */
export const shiftListLevel=(delta:1|-1)=>run(async()=>{
 const n=await paraSpan();if(!n)return;
 await structural(eng=>eng.shiftListLevel(n.s.block,n.e.block,delta),n.h,n.h);setSel(n.a,n.h);
});
export const INDENT_STEP_PT=36;
/** Moves the left indent by one 36 pt step (clamped to 0-1440); a mixed selection starts from 0. */
export const stepIndent=(dir:-1|1)=>run(()=>{
 const cur=getDocumentsState().para?.indentLeft??0;
 const next=Math.min(1440,Math.max(0,cur+dir*INDENT_STEP_PT));
 return next===cur?Promise.resolve():applyPara({indentLeft:next});
});

/** Insert or delete a row or column around the caret's table cell. One undo step; the caret stays in its original cell (or the nearest one after a delete). */
async function doEditTable(op:TableOp){
 if(!(TABLE_OPS as readonly string[]).includes(op))throw new Error('Table operation is not offered.');
 const c=getDocumentsState().caret;if(!c)return;goalX=null;
 if(c.anchorBlock!==undefined&&c.anchorBlock!==c.block)throw new Error('Place the caret in one table cell.');
 const at=cellOf(getDocumentsState().blocks,c.block);if(!at)throw new Error('Place the caret in a table cell.');
 await structural(eng=>eng.editTable(c.block,op),{block:c.block,off:c.head},async eng=>{
  const nb=blockAfterTableEdit(op,at,await eng.blocks());if(nb===null)throw new Error('The table has no editable cell left.');return{block:nb,off:0};
 });
}
export const editTable=(op:TableOp)=>run(()=>doEditTable(op));

/** Insert an empty table (and an empty paragraph after it) below the caret's paragraph, or below the table when the caret is in a cell. One undo step; the caret goes into the first cell. */
export const insertTable=(rows:number,cols:number)=>run(async()=>{
 if(!Number.isInteger(rows)||!Number.isInteger(cols)||rows<1||rows>MAX_NEW_TABLE_ROWS||cols<1||cols>MAX_NEW_TABLE_COLS)throw new Error(`A new table has 1-${MAX_NEW_TABLE_ROWS} rows and 1-${MAX_NEW_TABLE_COLS} columns.`);
 const c=getDocumentsState().caret;if(!c)throw new Error('Place the caret where the table should go.');goalX=null;
 if(c.anchorBlock!==undefined&&c.anchorBlock!==c.block)throw new Error('Place the caret in one paragraph.');
 const blocks=getDocumentsState().blocks;const cell=cellOf(blocks,c.block);
 if(c.block>=CELL_BASE&&!cell)throw new Error('The caret is not in a paragraph the table can follow.');
 const top=cell?cell.table:c.block;
 await structural(eng=>eng.insertTable(c.block,rows,cols),{block:c.block,off:c.head},async eng=>{
  const b=(await eng.blocks()).find(x=>x.kind==='cell'&&x.table===top+1&&x.row===0&&x.cell===0&&x.editable);if(!b)throw new Error('The new table has no editable cell.');return{block:b.index,off:0};
 });
});

/** Tab / Shift+Tab inside a table cell: the first paragraph of the next / previous cell. Tab in the last cell adds a row below and moves into it. Returns false outside a cell. */
export const tabInCell=(dir:1|-1)=>run(async()=>{
 const c=getDocumentsState().caret;if(!c)return;const blocks=getDocumentsState().blocks;const at=cellOf(blocks,c.block);if(!at)return;goalX=null;
 const cells=blocks.filter(b=>b.kind==='cell'&&b.table===at.table&&b.editable&&b.text!==undefined&&(b.para??0)===0);
 const i=cells.findIndex(b=>b.row===at.row&&b.cell===at.cell);const nb=cells[i+dir];
 if(nb){patchDocuments({caretLocked:false,caret:{block:nb.index,anchor:0,head:0}});return;}
 if(dir<0||i<0)return;
 await doEditTable('row_below');
 const after=getDocumentsState().blocks.find(b=>b.kind==='cell'&&b.table===at.table&&b.row===at.row+1&&b.cell===0&&b.editable);
 if(after)patchDocuments({caret:{block:after.index,anchor:0,head:0}});
});

/** The default header and footer as the engine reports them (not an edit; no undo step). */
export async function readHeaderFooter():Promise<HeaderFooterState|null>{
 const e=engine;if(!e||getDocumentsState().status!=='ready')return null;const check=ownerGuard();const st=await e.headerFooterState();check();return st;
}
/** Set the default header text, footer text and footer page number for every section. A part left undefined stays as it is. One undo step; the caret does not move. */
export const setHeaderFooter=(patch:{header?:string;footer?:string;pageNumber?:boolean;headerAlign?:import('./protocol').HfAlign;footerAlign?:import('./protocol').HfAlign;pageTotal?:boolean})=>run(async()=>{
 for(const v of [patch.headerAlign,patch.footerAlign])if(v!==undefined&&!(HF_ALIGNS as readonly unknown[]).includes(v))throw new Error('The alignment is not valid.');
 if((patch.header!==undefined&&!validHfText(patch.header))||(patch.footer!==undefined&&!validHfText(patch.footer))||(patch.pageNumber!==undefined&&typeof patch.pageNumber!=='boolean'))throw new Error(`Header and footer text is limited to ${MAX_HF_CHARS} characters, without line breaks.`);
 if(patch.header===undefined&&patch.footer===undefined&&patch.pageNumber===undefined&&patch.headerAlign===undefined&&patch.footerAlign===undefined&&patch.pageTotal===undefined)return;
 const c=getDocumentsState().caret;if(!c)throw new Error('Place the caret in the document first.');
 const spot={block:c.block,off:c.head};
 await structural(eng=>eng.setHeaderFooter(patch),spot,spot);
});

export async function readHfVariants():Promise<import('./protocol').HfVariantsState|null>{
 const e=engine;if(!e||getDocumentsState().status!=='ready')return null;const check=ownerGuard();const st=await e.hfVariantsState();check();return st;
}
/** Different first page / odd-even pages and the texts of those headers and footers, for every section. One undo step; the caret does not move. */
export const setHfVariants=(patch:import('./protocol').HfVariantsPatch)=>run(async()=>{
 const bad=hfVariantsProblem(patch);if(bad)throw new Error(bad);
 const c=getDocumentsState().caret;if(!c)throw new Error('Place the caret in the document first.');
 const spot={block:c.block,off:c.head};
 await structural(eng=>eng.setHfVariants(patch),spot,spot);
});

/** Width in points of the grid column under the caret's cell (20-1000). One undo step; the caret stays. */
export const setColumnWidth=(width:number)=>run(async()=>{
 if(typeof width!=='number'||!Number.isFinite(width)||width<MIN_COL_PT||width>MAX_COL_PT)throw new Error(`A column is ${MIN_COL_PT} to ${MAX_COL_PT} points wide.`);
 const c=getDocumentsState().caret;if(!c||!cellOf(getDocumentsState().blocks,c.block))throw new Error('Place the caret in a table cell.');
 goalX=null;const spot={block:c.block,off:c.head};
 await structural(eng=>eng.colWidth(c.block,width),spot,spot);
});
/** Fill, borders, minimum row height and padding for the caret's cell or its whole table. One undo step; the caret stays. */
export const styleTable=(scope:TableStyleScope,style:TableStyle)=>run(async()=>{
 const bad=tableStyleProblem(style);if(bad)throw new Error(bad);if(scope!=='cell'&&scope!=='table')throw new Error('The table style scope is not valid.');
 const c=getDocumentsState().caret;if(!c||!cellOf(getDocumentsState().blocks,c.block))throw new Error('Place the caret in a table cell.');
 goalX=null;const spot={block:c.block,off:c.head};
 await structural(eng=>eng.tableStyle(c.block,scope,style),spot,spot);
});
/* ---- Pictures: a PNG or JPEG lives in its own paragraph; clicking it selects it (imageBlock). ---- */
/** First editable top-level paragraph at or after `from`, else the last one before it. */
async function nearEditable(eng:DocumentsEngine,from:number):Promise<Spot>{
 const bs=(await eng.blocks()).filter(b=>b.kind==='para'&&b.editable);const b=bs.find(x=>x.index>=from)??bs[bs.length-1];if(!b)throw new Error('The document has no editable paragraph.');return{block:b.index,off:0};
}
/** Insert a PNG or JPEG (5 MB, 8000 px a side, 25 megapixels, 200 images) as its own paragraph below the caret paragraph. One undo step; the caret moves to the paragraph after the picture. */
export const insertImage=(bytes:Uint8Array,alt=''):Promise<void>=>run(async()=>{
 const bad=imageProblem(bytes);if(bad)throw new Error(bad==='empty'?'The image is empty.':bad==='size'?'An image is limited to 5 MB.':bad==='type'?'Only PNG and JPEG images can be inserted.':'An image is limited to 8000 pixels a side and 25 megapixels.');
 if(!validHfText(alt))throw new Error('The alt text is limited to 500 characters, without line breaks.');
 const st=getDocumentsState();const c=st.caret;const at=c?c.block:st.imageBlock;
 if(at===null||at===undefined)throw new Error('Place the caret where the picture should go.');
 if(c&&c.anchorBlock!==undefined&&c.anchorBlock!==c.block)throw new Error('Place the caret in one paragraph.');
 if(st.blocks.filter(b=>!!b.image).length>=MAX_IMAGES)throw new Error(`A document holds at most ${MAX_IMAGES} images.`);
 goalX=null;const cell=cellOf(st.blocks,at);const top=cell?cell.table:at;
 await structural(eng=>eng.insertImage(at,bytes,alt),c?{block:c.block,off:c.head}:{block:at,off:0},eng=>nearEditable(eng,top+2));
});
/** Selects (or with null clears) the picture paragraph `block`. */
export const selectImage=(block:number|null)=>{if(block===null){patchDocuments({imageBlock:null,imageRects:[]});return;}if(!getDocumentsState().blocks.some(b=>b.index===block&&!!b.image))return;patchDocuments({imageBlock:block,caret:null,caretLocked:false});void syncGeometry();};
async function editImage(op:ImageOp){
 const block=getDocumentsState().imageBlock;if(block===null)throw new Error('Select a picture first.');
 const b=getDocumentsState().blocks.find(x=>x.index===block);if(!b||!b.image)throw new Error('The selected picture is gone.');
 const c=getDocumentsState().caret;const before=c?{block:c.block,off:c.head}:await nearEditable(engine!,block);
 await structural(eng=>eng.imageEdit(block,op),before,before);
 patchDocuments({caret:null,imageBlock:op.op==='remove'?null:block});await syncGeometry();
}
/** Display width of the selected picture as a percentage of the text width (25, 50, 75 or 100). */
export const resizeImageToPercent=(percent:number)=>run(async()=>{
 if(!(IMAGE_WIDTH_PERCENTS as readonly number[]).includes(percent))throw new Error('Choose 25, 50, 75 or 100 percent.');
 await editImage({op:'fit',percent});
});
export const setImageWidth=(width:number)=>run(()=>editImage({op:'resize',width}));
export const setImageAlt=(alt:string)=>run(()=>editImage({op:'alt',alt}));
export const removeImage=()=>run(()=>editImage({op:'remove'}));

/* ---- Find and replace over the editable paragraphs (body and table cells). ---- */
let findGen=0;
const textsForFind=()=>getDocumentsState().blocks.filter(b=>b.editable&&b.text!==undefined).map(b=>({index:b.index,text:b.text!}));
function currentMatches(){const f=getDocumentsState().find;return findMatches(textsForFind(),f.query,f);}
/** Recomputes the match list, the count, which match the selection is on, and the highlight rectangles (first 300 matches). */
export async function updateFind(){
 const e=engine,g=++findGen,owner=gen;if(!e)return;
 const st=getDocumentsState();if(!st.find.open||!validFindQuery(st.find.query)){patchDocuments({find:{...st.find,count:0,current:0,capped:false},findRects:[]});return;}
 const r=currentMatches();const c=st.caret;let current=0;
 if(c){const n=norm(c);if(n.s.block===n.e.block){const i=r.matches.findIndex(m=>m.block===n.s.block&&m.start===n.s.off&&m.end===n.e.off);current=i+1;}}
 patchDocuments({find:{...st.find,count:r.matches.length,current,capped:r.capped}});
 const rects:import('./protocol').Rect5[]=[];const shown=r.matches.slice(0,MAX_FIND_HIGHLIGHTS);
 try{
  for(let k=0;k<shown.length;k+=32){
   const part=await Promise.all(shown.slice(k,k+32).map(m=>e.rects(m.block,m.start,m.end).catch(()=>[] as import('./protocol').Rect5[])));
   if(g!==findGen||owner!==gen||e!==engine)return;for(const p of part)rects.push(...p);
  }
 }catch{return;}
 if(g===findGen&&owner===gen&&e===engine)patchDocuments({findRects:rects});
}
/** Opens or closes the find bar. Opening keeps the last query; closing drops the highlights. */
export function setFindOpen(open:boolean){
 const f=getDocumentsState().find;if(f.open===open)return;
 if(!open){findGen++;patchDocuments({find:{...f,open:false,count:0,current:0,capped:false},findRects:[]});return;}
 patchDocuments({find:{...f,open:true}});void updateFind();
}
/** Changes the query or an option (a bad query shows no matches). */
export function setFindQuery(p:Partial<{query:string;matchCase:boolean;wholeWord:boolean}>){
 const f=getDocumentsState().find;const next={...f,...p};
 if(typeof next.query!=='string'||next.query.length>1000)return;
 patchDocuments({find:{...next,open:true}});void updateFind();
}
/** Selects the next or previous match from the caret, wrapping around. Resolves with false when there is none. */
export const findStep=(dir:1|-1):Promise<boolean>=>{
 let found=false;
 return run(async()=>{
  const r=currentMatches();if(r.matches.length===0)return;
  const c=getDocumentsState().caret;const n=c?norm(c):null;
  const i=n?nextMatchIndex(r.matches,dir>0?n.e.block:n.s.block,dir>0?n.e.off:n.s.off,dir):0;
  // Moving on from a match that is selected: next starts after its end, previous before its start.
  const m=r.matches[i];goalX=null;patchDocuments({caretLocked:false,imageBlock:null,caret:{block:m.block,anchor:m.start,head:m.end}});found=true;await syncGeometry();await updateFind();
 }).then(()=>found);
};
const selectedMatch=(ms:readonly FindMatch[]):FindMatch|null=>{const c=getDocumentsState().caret;if(!c)return null;const n=norm(c);return ms.find(m=>m.block===n.s.block&&n.s.block===n.e.block&&m.start===n.s.off&&m.end===n.e.off)??null;};
/** Replaces the selected match (when the selection is on one) and moves to the next; otherwise just selects the next match. One undo step. */
export const replaceCurrent=(text:string)=>run(async()=>{
 if(!validReplaceText(text))throw new Error('The replacement is limited to 1000 characters, without line breaks.');
 const r=currentMatches();if(r.matches.length===0)return;const m=selectedMatch(r.matches);
 if(!m){const c=getDocumentsState().caret;const n=c?norm(c):null;const i=n?nextMatchIndex(r.matches,n.s.block,n.s.off,1):0;const x=r.matches[i];patchDocuments({caret:{block:x.block,anchor:x.start,head:x.end}});await syncGeometry();await updateFind();return;}
 goalX=null;const end=m.start+u8(text);
 await structural(eng=>eng.replace({block:m.block,hunks:[{start:m.start,end:m.end,text}]}),{block:m.block,off:m.start},{block:m.block,off:end});
 const after=currentMatches();
 const i=nextMatchIndex(after.matches,m.block,end,1);const x=i>=0?after.matches[i]:null;
 if(x){patchDocuments({caret:{block:x.block,anchor:x.start,head:x.end}});await syncGeometry();}
 await updateFind();
});
/** Replaces every match (up to 5000) in one undo step and reports how many. */
export const replaceAll=(text:string):Promise<number>=>{
 let count=0;
 return run(async()=>{
  if(!validReplaceText(text))throw new Error('The replacement is limited to 1000 characters, without line breaks.');
  const r=currentMatches();if(r.matches.length===0)return;
  const byBlock=new Map<number,FindMatch[]>();for(const m of r.matches)(byBlock.get(m.block)??byBlock.set(m.block,[]).get(m.block)!).push(m);
  if(byBlock.size>MAX_REPLACE_BLOCKS)throw new Error(`Replace all is limited to ${MAX_REPLACE_BLOCKS} paragraphs. Narrow the search.`);
  const first=r.matches[0];const c=getDocumentsState().caret;goalX=null;
  await structural(async eng=>{let d:import('./protocol').OpenedDocument|null=null;for(const [block,ms] of byBlock)d=await eng.replace({block,hunks:ms.map(m=>({start:m.start,end:m.end,text}))});return d!;},c?{block:c.block,off:c.head}:{block:first.block,off:first.start},{block:first.block,off:first.start});
  count=r.matches.length;
 }).then(()=>count);
};
/** Words and characters of the whole document and, when text is selected, of the selection. */
export function documentStats():{words:number;chars:number;charsNoSpaces:number;selectionWords:number}{
 const all=textStats(getDocumentsState().blocks.filter(b=>b.text!==undefined).map(b=>b.text!).join('\n'));
 return{...all,selectionWords:textStats(selectedText()).words};
}

/* ---- Page setup and go to page ---- */
/** The page size, orientation and margins as the engine reports them (not an edit). */
export async function readPageSetup():Promise<PageSetupState|null>{
 const e=engine;if(!e||getDocumentsState().status!=='ready')return null;const check=ownerGuard();const st=await e.pageSetupState();check();return st;
}
/** Page size, orientation and margins for every section. One undo step; the caret stays where it is. */
export const setPageSetup=(patch:PageSetupPatch)=>run(async()=>{
 const bad=pageSetupProblem(patch);if(bad)throw new Error(bad);
 const c=getDocumentsState().caret;const spot=c?{block:c.block,off:c.head}:await nearEditable(engine!,0);
 await structural(eng=>eng.setPageSetup(patch),spot,spot);
 if(!c)patchDocuments({caret:null});
});

/* ---- Comments ---- */
/** The comments as the engine reports them (not an edit). */
export async function readComments():Promise<CommentItem[]|null>{
 const e=engine;if(!e||getDocumentsState().status!=='ready')return null;const check=ownerGuard();const list=await e.commentsState();check();return list;
}
/** The selected range a comment can anchor to: one editable paragraph, non-empty. Null when there is none. */
export function commentSelection():{block:number;start:number;end:number}|null{
 const c=getDocumentsState().caret;if(!c||(c.anchorBlock!==undefined&&c.anchorBlock!==c.block)||c.anchor===c.head)return null;
 const t=blockText(c.block);if(t===null)return null;const start=Math.min(c.anchor,c.head),end=Math.max(c.anchor,c.head);return end<=u8(t)?{block:c.block,start,end}:null;
}
/** Comment on the selected text. One undo step. The commented paragraph becomes read-only (the engine keeps the anchors as inline objects) until the comment is deleted. */
export const addComment=(text:string)=>run(async()=>{
 const bad=commentProblem(text);if(bad)throw new Error(bad);
 const sel=commentSelection();if(!sel)throw new Error('Select text inside one paragraph to comment on.');
 const c=getDocumentsState().caret!;
 await structural(eng=>eng.addComment(sel.block,sel.start,sel.end,text.trim(),commentAuthor(),new Date().toISOString()),{block:c.block,off:c.head},eng=>nearEditable(eng,sel.block));
});
const commentStep=(op:(e:DocumentsEngine)=>Promise<import('./protocol').OpenedDocument>)=>run(async()=>{
 const c=getDocumentsState().caret;const spot=c?{block:c.block,off:c.head}:await nearEditable(engine!,0);
 await structural(op,spot,spot);if(!c)patchDocuments({caret:null});
});
/** The nine levels of the list at the caret (not an edit); null outside a list or without a caret. */
export async function readListOptions():Promise<import('./protocol').ListOptionsState|null>{
 const e=engine;const c=getDocumentsState().caret;if(!e||!c||getDocumentsState().status!=='ready')return null;const check=ownerGuard();
 try{const st=await e.listOptions(norm(c).s.block);check();return st;}catch{check();return null;}
}
/** Changes one level of the caret's list: start value, number format, label text. One undo step; the other lists that shared the definition keep theirs. */
export const setListOptions=(patch:import('./protocol').ListOptionsPatch)=>run(async()=>{
 const n=await paraSpan();if(!n)return;
 const cur=(await engine!.listOptions(n.s.block)).levels[patch?.level];
 const bad=listOptionsProblem(patch,cur?.format,cur);if(bad)throw new Error(bad);
 await structural(eng=>eng.setListOptions(n.s.block,patch),n.h,n.h);setSel(n.a,n.h);
});
/* ---- Document properties ---- */
/** The document properties as the engine reports them (not an edit). */
export async function readProperties():Promise<import('./protocol').PropertiesState|null>{
 const e=engine;if(!e||getDocumentsState().status!=='ready')return null;const check=ownerGuard();const st=await e.propertiesState();check();return st;
}
/** Title, subject, author, keywords, description and category saved with the file. One undo step; the caret stays where it is. */
export const setProperties=(patch:import('./protocol').PropertiesPatch)=>run(async()=>{
 const bad=propertiesProblem(patch);if(bad)throw new Error(bad);
 const c=getDocumentsState().caret;const spot=c?{block:c.block,off:c.head}:await nearEditable(engine!,0);
 await structural(eng=>eng.setProperties(patch),spot,spot);if(!c)patchDocuments({caret:null});
});
/** Reply to a comment (a reply to a reply joins the top-level comment). One undo step. */
export const replyComment=(parent:number,text:string)=>run(async()=>{
 const bad=commentProblem(text);if(bad)throw new Error(bad);
 if(!Number.isInteger(parent)||parent<0||parent>=2**31)throw new Error('The comment is not valid.');
 const c=getDocumentsState().caret;const spot=c?{block:c.block,off:c.head}:await nearEditable(engine!,0);
 await structural(eng=>eng.replyComment(parent,text.trim(),commentAuthor(),new Date().toISOString()),spot,spot);if(!c)patchDocuments({caret:null});
});
/** Scrolls to the page holding a comment's paragraph without moving the caret. False when the comment has no place in the layout. */
export async function goToComment(block:number|null):Promise<boolean>{
 const e=engine;if(!e||getDocumentsState().status!=='ready'||block===null||!Number.isInteger(block)||block<0)return false;
 const check=ownerGuard();let box;try{box=await e.caret(block,0);}catch{return false;}check();
 return box?scrollToPage(box.page):false;
}
/** Resolve or reopen a comment and its replies. One undo step. */
export const resolveComment=(id:number,resolved:boolean)=>commentStep(eng=>eng.resolveComment(id,resolved));
/** Delete a comment, its replies and their anchors. One undo step. */
export const deleteComment=(id:number)=>commentStep(eng=>eng.deleteComment(id));

/**
 * Ctrl+click on a link: copies its address (http, https or mailto only) and says so. Returns false when the point is not on a link.
 * The desktop shell only opens project pages externally, so a document link is copied, never opened.
 */
export async function copyLinkAt(page:number,x:number,y:number):Promise<boolean>{
 const e=engine;if(!e||getDocumentsState().status!=='ready')return false;const check=ownerGuard();
 try{
  const hit=await e.hit(page,x,y);check();if(!hit||hit.block===null||!hit.editable||hit.off===undefined)return false;
  const st=await e.formatState({block:hit.block,off:hit.off},{block:hit.block,off:hit.off});check();
  const url=st.link;if(!url||linkProblem(url)!==null)return false;
  await navigator.clipboard.writeText(url);check();patchDocuments({notice:'linkCopied'});return true;
 }catch{return false;}
}
