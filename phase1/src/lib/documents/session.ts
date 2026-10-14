import {captureDocumentSelection} from './selectionCapture';
import {caretAfterEdit,diffEdit,inverseOf,UndoStack,type TextEdit,type UndoEntry} from './edit';
import {stepBoundary,utf16ToUtf8Offset,utf8ToUtf16Offset,wordBoundary} from './text';
import {getDocumentsState,patchDocuments,resetDocuments,INITIAL_VIEW,type Caret,type DocumentsState} from './store';
import {DocumentsEngine} from './engine';
import {inspectDocx} from './inspect';
/** The one open document: engine, undo history and the refresh after each edit. UI components only call these functions. */
let engine:DocumentsEngine|null=null;let undo=new UndoStack();let chain:Promise<unknown>=Promise.resolve();let pending=0;
export const getEngine=()=>engine;
const flags=()=>({canUndo:undo.canUndo,canRedo:undo.canRedo});
/* ---- Per-file sessions: a file keeps its engine, undo history and dirty flag while the studio or tab is switched away. ---- */
const STASH=['blocks','pages','pageSizes','words','rev','canUndo','canRedo','edited','caret','risks','engineMs','editError','notice'] as const;
interface Entry{key:string;url:string;engine:DocumentsEngine|null;undo:UndoStack;stash:Partial<DocumentsState>;working:Uint8Array|null;dirty:boolean;used:number;undoReleased:boolean}
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
 const e=entries.get(key);if(!e)return;entries.delete(key);e.engine?.dispose?.();e.engine=null;
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
    const fresh:Entry={key:target.key,url:target.url,engine:e,undo:new UndoStack(),stash:{},working:null,dirty:false,used:++tick,undoReleased:false};
    const restored=!!entry?.working;if(entry&&!live(entry))entries.delete(target.key);else if(entry)discardDocument(target.key);
    entries.set(target.key,fresh);cur=fresh;engine=e;undo=fresh.undo;identity=target.key;
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
export function attachEngine(e:DocumentsEngine|null,key?:string){
 if(!e){identity=null;void switchDocument(null);return;}
 ++gen;stashCurrent();const k=key??'document';if(entries.get(k)?.engine!==e)discardDocument(k);
 const en:Entry={key:k,url:k,engine:e,undo:new UndoStack(),stash:{},working:null,dirty:false,used:++tick,undoReleased:false};
 entries.set(k,en);cur=en;engine=e;undo=en.undo;chain=Promise.resolve();goalX=null;identity=key??null;
 patchDocuments({...INITIAL_VIEW,name:k,...flags(),editError:'',edited:false,notice:''});
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
 if(to<from||to-from+1>MAX_SPAN_BLOCKS)return null;const out:string[]=[];
 for(let i=from;i<=to;i++){const t=blockText(i);if(t===null)return null;out.push(t);}return out;
}
const reachable=(a:number,b:number)=>spanTexts(Math.min(a,b),Math.max(a,b))!==null;
let goalX:number|null=null;
export const selectedText=()=>{
 const c=getDocumentsState().caret;if(!c)return '';const {s,e}=norm(c);const ts=spanTexts(s.block,e.block);if(!ts)return '';
 return ts.map((t,k)=>t.slice(k===0?utf8ToUtf16Offset(t,s.off):0,k===ts.length-1?utf8ToUtf16Offset(t,e.off):t.length)).join('\n');
};
async function pointTo(page:number,x:number,y:number,extend:boolean){
 const e=engine;if(!e)return;const hit=await e.hit(page,x,y);const c=getDocumentsState().caret;
 if(!hit||hit.block===null||!hit.editable||hit.off===undefined){if(!extend)patchDocuments({caret:null,caretLocked:!!hit});return;}
 if(extend){if(!c)return;const a=norm(c).a;if(a.block!==hit.block&&!reachable(a.block,hit.block))return;setSel(a,{block:hit.block,off:hit.off});}
 else{patchDocuments({caretLocked:false,editError:''});setSel({block:hit.block,off:hit.off},{block:hit.block,off:hit.off});}
}
/** Places the caret (or extends the selection) at a page-space point. */
export const pointerAt=(page:number,x:number,y:number,extend=false)=>{goalX=null;return run(()=>pointTo(page,x,y,extend));};
let pend:{page:number;x:number;y:number}|null=null,busy=false;
/** Drag selection: only the latest pointer position is sent, so a fast drag never floods the worker. */
export function dragTo(page:number,x:number,y:number){pend={page,x,y};if(busy)return;busy=true;void(async()=>{while(pend){const p=pend;pend=null;await run(()=>pointTo(p.page,p.x,p.y,true));}busy=false;})();}
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
export const typeText=(text:string)=>run(async()=>{
 const c=getDocumentsState().caret;if(!c)return;const t=clean(text).replace(/\n+/g,' ');if(!t)return;if(t.length>MAX_INSERT_CHARS)throw new Error('The text is too large to insert at once.');const n=norm(c);goalX=null;
 if(n.s.block===n.e.block)await applyAtCaret({start:n.s.off,end:n.e.off,text:t},n.s.off===n.e.off);
 else await replaceRange(n.s,n.e,t,n.h);
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
 const i=utf8ToUtf16Offset(t,c.head);const j=word?wordBoundary(t,i,dir):stepBoundary(t,i,dir);
 if(j===i){await joinAtEdge(c.block,t,dir);return;}
 const k=utf16ToUtf8Offset(t,j);await applyAtCaret(dir<0?{start:k,end:c.head,text:''}:{start:c.head,end:k,text:''});
});
export const selectAllInParagraph=()=>{const c=getDocumentsState().caret;if(!c)return;const t=blockText(c.block);if(t!==null)patchDocuments({caret:{block:c.block,anchor:0,head:u8(t)}});};
/** Ctrl+A: every consecutive editable paragraph around the caret (a table or object paragraph ends the run). */
export const selectAllText=()=>{
 const c=getDocumentsState().caret;if(!c||blockText(c.block)===null)return;let lo=c.block,hi=c.block;
 while(lo>0&&hi-lo<MAX_SPAN_BLOCKS&&blockText(lo-1)!==null)lo--;while(hi-lo<MAX_SPAN_BLOCKS&&blockText(hi+1)!==null)hi++;
 setSel({block:lo,off:0},{block:hi,off:u8(blockText(hi)!)});
};
export const clearCaret=()=>patchDocuments({caret:null,caretBox:null,selRects:[],caretLocked:false});
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
 const c=getDocumentsState().caret;const e=engine;if(!c||!e)return;const n=norm(c);const h=n.h;const t=blockText(h.block);if(t===null)return;
 const go=(block:number,off:number)=>{if(extend){if(block!==n.a.block&&!reachable(n.a.block,block))return;setSel(n.a,{block,off});}else setSel({block,off},{block,off});};
 if(kind==='left'||kind==='right'||kind==='wordLeft'||kind==='wordRight'){
  goalX=null;const dir=kind==='left'||kind==='wordLeft'?-1:1;const word=kind==='wordLeft'||kind==='wordRight';
  if(!extend&&cmp(n.s,n.e)!==0&&!word){const p=dir<0?n.s:n.e;go(p.block,p.off);return;}
  const i=utf8ToUtf16Offset(t,h.off);const j=word?wordBoundary(t,i,dir):stepBoundary(t,i,dir);
  if(j!==i){go(h.block,utf16ToUtf8Offset(t,j));return;}
  const nb=nearbyBlock(h.block,dir);if(nb)go(nb.index,dir<0?u8(nb.text!):0);return;
 }
 if(kind==='docStart'||kind==='docEnd'){
  goalX=null;const bs=getDocumentsState().blocks.filter(b=>b.editable&&b.text!==undefined);const b=kind==='docStart'?bs[0]:bs[bs.length-1];if(b)go(b.index,kind==='docStart'?0:u8(b.text!));return;
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
 const e=engine,c=getDocumentsState().caret;if(!e)return;
 if(!c){patchDocuments({caretBox:null,selRects:[]});return;}
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
  if(getDocumentsState().caret===c)patchDocuments({caretBox:box,selRects:rects});
 }catch{if(getDocumentsState().caret===c)patchDocuments({caret:null,caretBox:null,selRects:[]});}
}
/** Enter: replaces the selection (if any) and splits there. The new paragraph copies the paragraph properties. */
export const splitAtCaret=()=>run(async()=>{
 const c=getDocumentsState().caret;if(!c)return;const n=norm(c);goalX=null;
 if(blockText(n.s.block)===null)return;
 await replaceRange(n.s,n.e,'\n',n.h);
});
async function joinAtEdge(block:number,t:string,dir:-1|1){
 const nb=nearbyBlock(block,dir);if(!nb){if(getDocumentsState().blocks.some(x=>x.index===block+dir))patchDocuments({caretLocked:true});return;}
 if(dir<0)await structural(e=>e.merge(block),{block,off:0},{block:block-1,off:u8(nb.text!)});
 else await structural(e=>e.merge(block+1),{block,off:u8(t)},{block,off:u8(t)});
}

/** No identity supplied at attachment means capture stays unavailable. */
export const captureCurrentDocumentSelection=()=>captureDocumentSelection(getDocumentsState(),engine&&identity?{generation:gen,identity}:null);
export function detachEngineIfCurrent(e:DocumentsEngine){if(engine===e)attachEngine(null);}
