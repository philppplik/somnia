import {presentationScale} from './presentKeyboard';
import {reportError} from '../log';
import {readDeckDocument,serializeDeck,parseDeck,editedDeckBytes,singleRunEditBytes,sameSlideEditBytes} from './deckDocument';
import type {SlidesDiagnostics} from './diagnostics';
import type {TextRun} from './editCopy';
import type {ShapePreset,LayoutInfo,DeckModel,BoundsBox,RunFormat,ShapeBoundsEdit,ArrangeMode,SlideTransition,ShapeStylePatch,TableEdit,ThemeEdit,SlideBackground,FooterEdit,SectionEdit} from './deckPackage';
import {installBeforeUnload} from '../closeFlow';
import {useEffect,useSyncExternalStore} from 'react';
import {SlidesClient} from './client';
import {applyReviewed,undoReceipt,type DeckOwnerPort,type UndoPort,type DeckReceipt,type DeckSnapshot,type ReviewedApply} from './deckReceipt';
import {assertPptx,type DeckSummary} from './protocol';
import {addMediaFile,closeMedia,findMedia,getMedia,setActiveMedia,subscribeMedia,registerMediaCloseGuard} from '../media';
import {getCollab,onSessionChange} from '../collab/session';
import {buildMismatches} from '../collab/buildSync';
import {shareSlidesFile,adoptSlidesFile} from '../collab/office/officeSession';
import {buildPngZip,exportScale,exportZipName} from './exportPng';
import {openSlidesModel,slidesModelMeta,type SlidesOpKind} from '../collab/office/slidesModel';
import {SlidesCollabBinding} from '../collab/office/slidesBinding';
import {slidesClientPort} from '../collab/office/slidesPort';
import {announceSlide} from '../collab/office/slidesPresence';
export interface SlidesSession {presenting:boolean;wasmBytes:number;diagnostics:SlidesDiagnostics|null;name:string;source:string;summary:DeckSummary|null;index:number;image:string;texts:string[];thumbnails:Record<number,string>;busy:boolean;error:string;original:Uint8Array|null;working:Uint8Array|null;runs:TextRun[];slideIds:number[];layouts:LayoutInfo[];model:DeckModel|null;dirty:boolean;undo:Uint8Array[];redo:Uint8Array[]}
interface Entry {generation:number;revision:number;state:SlidesSession;client:SlidesClient;sequence:number;disposed:boolean;presentCache:Map<string,Promise<string>>;exiting?:boolean;last?:{token:string;before:Uint8Array;after:Uint8Array};collab:SlidesCollabBinding|null}
const bounded=(history:Uint8Array[])=>{let total=0;return history.slice(-10).reverse().filter(b=>(total+=b.byteLength)<=64*1024*1024).reverse();};
const empty:SlidesSession={presenting:false,wasmBytes:0,diagnostics:null,name:'',source:'',summary:null,index:0,image:'',texts:[],thumbnails:{},busy:false,error:'',original:null,working:null,runs:[],slideIds:[],layouts:[],model:null,dirty:false,undo:[],redo:[]};
let generation=0;
const sessions=new Map<string,Entry>();const listeners=new Set<()=>void>();let version=0;
function emit(){version++;listeners.forEach(f=>f());}
function patch(e:Entry,p:Partial<SlidesSession>,cause?:unknown){if(e.disposed)return;if(p.error)reportError('slides.engine',cause??p.error,{context:{studio:'slides',file:e.state.name}});e.state={...e.state,...p};emit();}
const current=()=>{const m=getMedia();return sessions.get(m.active??'')?.state??empty;};
export function useSlidesSession(){const media=getMedia();const name=media.items.find(m=>m.name===media.active&&m.kind==='pptx')?.name;useEffect(()=>{if(name)void ensureSlides(name);},[name]);useSyncExternalStore(f=>{listeners.add(f);return()=>listeners.delete(f);},()=>version,()=>version);return current();}
function clearPresentCache(e:Entry){for(const image of e.presentCache.values())void image.then(URL.revokeObjectURL,()=>{});e.presentCache.clear();}
function dispose(e:Entry){clearPresentCache(e);e.disposed=true;if(e.collab){const c=getCollab();if(c)announceSlide(c.doc.awareness,null,0);e.collab.destroy();e.collab=null;}e.client.dispose();if(e.state.image)URL.revokeObjectURL(e.state.image);Object.values(e.state.thumbnails).forEach(URL.revokeObjectURL);}
subscribeMedia(()=>{const media=getMedia();for(const [name,e]of sessions){if(media.items.find(m=>m.name===name)?.url!==e.state.source){dispose(e);sessions.delete(name);}}emit();});
/** Entry identity is the source URL, not basename. Max three resident workers, current tab retained. */
export async function ensureSlides(name:string){const m=findMedia(name);if(!m||m.kind!=='pptx')return;if(sessions.get(name)?.state.source===m.url)return;
 if(sessions.size>=3){const victim=[...sessions].find(([n,e])=>n!==getMedia().active&&!e.state.dirty);if(victim){dispose(victim[1]);sessions.delete(victim[0]);}else return;}
 const e:Entry={generation:++generation,revision:0,state:{...empty,name,source:m.url,busy:true,thumbnails:{}},client:new SlidesClient(),sequence:0,disposed:false,presentCache:new Map(),collab:null};sessions.set(name,e);emit();
 try{const bytes=new Uint8Array(await(await fetch(m.url)).arrayBuffer());if(e.disposed)return;const summary=await e.client.open(bytes);if(e.disposed)return;let runs:TextRun[]=[];let slideIds:number[]=[];let model:DeckModel|null=null;let layouts:LayoutInfo[]=[];try{runs=await e.client.runs(bytes);model=await modelOf(e,bytes,summary.slides);slideIds=idsOf(model);layouts=await layoutsOf(e,bytes);}catch{/* Noncanonical text remains preview-only. */}if(e.disposed)return;const diagnostics=await e.client.diagnostics(bytes);patch(e,{summary,original:bytes,working:bytes,runs,slideIds,layouts,model,diagnostics});await attachCollab(e);if(e.disposed)return;await renderSlide(e,e.state.index);}
 catch(error){patch(e,{busy:false,error:String(error)},error);e.client.dispose();}
}
/** Collab (CO3): a clean open deck joins the session's shared model; a dirty one cannot rebase and stays local-only with a note. */
async function attachCollab(e:Entry){
 if(e.disposed||e.collab||!e.state.working||!e.state.original||e.state.busy)return;
 const c=getCollab();if(!c)return;
 if(buildMismatches(c.doc.awareness).length){patch(e,{error:'A participant is on a different app version. Co-editing is paused - reload the page.'});return;}
 if(e.state.dirty){patch(e,{error:'This deck has local edits. Co-editing starts from the original file - close and reopen it to join the session.'});return;}
 const bytes=e.state.original;
 if(slidesModelMeta(openSlidesModel(c.doc,e.state.name))){
  const ad=await adoptSlidesFile(c.doc,e.state.name,bytes);
  if(e.disposed||!ad.ok)return;
  e.collab=new SlidesCollabBinding(c.doc,e.state.name,bytes,{engine:slidesClientPort(e.client),onBytes:nb=>{if(!e.disposed)void setWorking(e,nb);}});
  await e.collab.replay();
 }else{
  await shareSlidesFile(c.doc,e.state.name,bytes);
  if(e.disposed)return;
  e.collab=new SlidesCollabBinding(c.doc,e.state.name,bytes,{engine:slidesClientPort(e.client),onBytes:nb=>{if(!e.disposed)void setWorking(e,nb);}});
 }
}
function detachCollab(e:Entry){if(!e.collab)return;const c=getCollab();if(c)announceSlide(c.doc.awareness,null,0);e.collab.destroy();e.collab=null;}
if(typeof window!=='undefined')onSessionChange(()=>{const live=getCollab();for(const e of sessions.values()){if(!live)detachCollab(e);else void attachCollab(e);}});
export async function openSlides(file:File){try{assertPptx(file);}catch(error){return String(error);}if(sessions.size>=3&&[...sessions.values()].every(e=>e.state.dirty))return 'Save or close an edited deck before opening another';const r=await addMediaFile(file,file.name);if('error'in r)return r.error;await ensureSlides(r.name);return '';}
export function closeSlides(){const name=getMedia().active;if(name&&findMedia(name)?.kind==='pptx')closeMedia(name);}
async function blankPreview(png:Uint8Array){const image=await createImageBitmap(new Blob([new Uint8Array(png)],{type:'image/png'}));try{const canvas=new OffscreenCanvas(32,32);const c=canvas.getContext('2d');if(!c)return false;c.drawImage(image,0,0,32,32);const p=c.getImageData(0,0,32,32).data;for(let i=4;i<p.length;i+=4)if(Math.abs(p[i]-p[0])+Math.abs(p[i+1]-p[1])+Math.abs(p[i+2]-p[2])>12)return false;return true;}finally{image.close();}}
function blobUrl(png:Uint8Array){return URL.createObjectURL(new Blob([new Uint8Array(png)],{type:'image/png'}));}
async function renderSlide(e:Entry,index:number){const summary=e.state.summary;if(!summary||index<0||index>=summary.slides||e.disposed)return;const token=++e.sequence;patch(e,{busy:true,error:''});
 try{const scale=Math.min(1.5,1280/summary.widthPt,720/summary.heightPt);const presentImage=e.state.presenting?await presentationImage(e,index):null;const png=presentImage?null:await e.client.render(index,scale);const text=await e.client.read(index);const blank=png?await blankPreview(png).catch(()=>false):false;if(blank)patch(e,{diagnostics:e.state.diagnostics?{...e.state.diagnostics,warnings:[...new Set([...e.state.diagnostics.warnings,'This slide rendered uniformly blank. Content may be unsupported; verify in the source app.'])]}:null});if(e.disposed||token!==e.sequence)return;const image=presentImage??blobUrl(png!);if(e.state.image&&!e.state.presenting)URL.revokeObjectURL(e.state.image);const thumbnails={...e.state.thumbnails};if(!thumbnails[index]){const thumb=await e.client.render(index,Math.min(180/summary.widthPt,110/summary.heightPt));if(e.disposed){URL.revokeObjectURL(image);return;}thumbnails[index]=blobUrl(thumb);}const memory=await e.client.memory();if(memory.wasmBytes>256*1024*1024){e.client.dispose();throw Error('Slides WASM memory exceeded 256 MiB observed budget');}patch(e,{index,image,texts:text.texts,thumbnails,busy:false,wasmBytes:memory.wasmBytes});if(e.collab){const c=getCollab();if(c)announceSlide(c.doc.awareness,e.state.name,index);}if(e.state.presenting){for(const [k,v]of e.presentCache)if(!k.startsWith(`${index}:`)&&!k.startsWith(`${index+1}:`)){e.presentCache.delete(k);void v.then(URL.revokeObjectURL,()=>{});}if(index+1<summary.slides)void presentationImage(e,index+1).catch(()=>{});}}
 catch(error){patch(e,{error:String(error),busy:false},error);}
}
export async function showSlide(index:number){const e=sessions.get(getMedia().active??'');if(e)await renderSlide(e,index);}
export async function loadThumbnails(){const e=sessions.get(getMedia().active??'');const summary=e?.state.summary;if(!e||!summary||e.state.busy)return;patch(e,{busy:true});try{for(let index=0;index<summary.slides;index++){if(e.disposed)break;if(e.state.thumbnails[index])continue;const png=await e.client.render(index,Math.min(180/summary.widthPt,110/summary.heightPt));if(e.disposed)break;patch(e,{thumbnails:{...e.state.thumbnails,[index]:blobUrl(png)}});}patch(e,{busy:false});}catch(error){patch(e,{error:String(error),busy:false},error);}}
export function activateSlides(name:string){setActiveMedia(name);void ensureSlides(name);}

export const dirtySlideNames=()=>[...sessions].filter(([,e])=>e.state.dirty).map(([n])=>n);
export const slidesIsDirty=(name:string)=>sessions.get(name)?.state.dirty??false;
if(typeof window!=='undefined')installBeforeUnload(()=>[...sessions.values()].some(e=>e.state.dirty));
registerMediaCloseGuard(name=>!slidesIsDirty(name)||window.confirm(`Discard unsaved presentation edits to ${name}?`));
/** Stable slide ids in deck order; empty when the deck is not canonical (reordering stays off). */
async function modelOf(e:Entry,bytes:Uint8Array,slides:number){try{const m=await e.client.model(bytes);return m.slides.length===slides?m:null;}catch{return null;}}
const idsOf=(m:DeckModel|null)=>m?m.slides.map(s=>s.id):[];
async function layoutsOf(e:Entry,bytes:Uint8Array){try{return await e.client.layouts(bytes);}catch{return [];}}
async function setWorking(e:Entry,bytes:Uint8Array,index=e.state.index){const summary=await e.client.open(bytes);
const runs=await e.client.runs(bytes);const model=await modelOf(e,bytes,summary.slides);const slideIds=idsOf(model);const layouts=await layoutsOf(e,bytes);e.revision++;clearPresentCache(e);Object.values(e.state.thumbnails).forEach(URL.revokeObjectURL);patch(e,{working:bytes,summary,runs,slideIds,layouts,model,dirty:true,thumbnails:{}});await renderSlide(e,Math.min(Math.max(index,0),summary.slides-1));}
/** One user action, one undo entry: the whole before-deck is pushed once. The viewed slide follows its id. */
export async function moveSlideTo(slideId:number,toIndex:number){const e=sessions.get(getMedia().active??'');if(!e?.state.working||e.state.busy)return;
const before=e.state.working,ids=e.state.slideIds,from=ids.indexOf(slideId);
if(from<0||!Number.isInteger(toIndex)||toIndex<0||toIndex>=ids.length)throw Error('Slide order changed. Reselect the slide.');
if(from===toIndex)return;
const viewedId=ids[e.state.index];patch(e,{busy:true,error:''});
if(e.collab){const next=ids.slice();next.splice(toIndex,0,next.splice(from,1)[0]);const idx=Math.max(0,next.indexOf(viewedId));
 try{await e.collab.applyLocalOp('reorder',[slideId,toIndex]);if(e.disposed)return;await renderSlide(e,idx);patch(e,{busy:false});}catch(error){patch(e,{busy:false,error:String(error)},error);throw error;}
 return;}
try{const bytes=await e.client.reorder(before,slideId,toIndex);if(e.disposed||e.state.working!==before)throw Error('Deck changed during reorder.');
const next=ids.slice();next.splice(toIndex,0,next.splice(from,1)[0]);
await setWorking(e,bytes,Math.max(0,next.indexOf(viewedId)));patch(e,{undo:bounded([...e.state.undo,before]),redo:[]});}
catch(error){patch(e,{busy:false,error:String(error)},error);throw error;}}
export async function editSlideText(run:TextRun,text:string){const e=sessions.get(getMedia().active??'');if(!e?.state.working||e.state.busy)return;const before=e.state.working;patch(e,{busy:true,error:''});
 if(e.collab){const edit={...run,old:run.text,text};const inverse={fn:'textEdits' as const,args:[[{...run,old:text,text:run.text}]]};
  try{await e.collab.applyLocalOp('textEdits',[[edit]],inverse);patch(e,{busy:false});}catch(error){patch(e,{busy:false,error:String(error)},error);}
  return;}
 try{const bytes=await e.client.copy(before,[{...run,old:run.text,text}]);await setWorking(e,bytes);patch(e,{undo:bounded([...e.state.undo,before]),redo:[]});}catch(error){patch(e,{busy:false,error:String(error)},error);}}
export async function slidesHistory(direction:'undo'|'redo'){const e=sessions.get(getMedia().active??'');if(!e?.state.working||e.state.busy)return;
 if(e.collab){patch(e,{busy:true,error:''});try{if(direction==='undo')await e.collab.undo();else await e.collab.redo();patch(e,{busy:false});}catch(error){patch(e,{busy:false,error:String(error)},error);}return;}
 const stack=e.state[direction],bytes=stack.at(-1);if(!bytes)return;const before=e.state.working;patch(e,{busy:true,error:''});try{await setWorking(e,bytes);patch(e,{[direction]:stack.slice(0,-1),[direction==='undo'?'redo':'undo']:bounded([...e.state[direction==='undo'?'redo':'undo'],before])});}catch(error){patch(e,{busy:false,error:String(error)},error);}}
export async function saveSlidesCopy(){const e=sessions.get(getMedia().active??'');const bytes=e?.state.working;if(!e||!bytes||e.state.busy)return;patch(e,{busy:true,error:''});try{const {isTauri,invoke}=await import('@tauri-apps/api/core');const suggestedName=e.state.name.replace(/^.*[\\/]/,'').replace(/\.pptx$/i,'')+'-edited.pptx';if(isTauri()){const grant=await invoke<{token:string}|null>('slides_save_pick',{suggestedName});if(!grant){patch(e,{busy:false});return;}await invoke('slides_save_write',new Uint8Array(bytes),{headers:{'x-somnia-token':grant.token}});}else{const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'application/vnd.openxmlformats-officedocument.presentationml.presentation'}));const a=document.createElement('a');a.href=url;a.download=suggestedName;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}patch(e,{dirty:isTauri()?false:e.state.dirty,busy:false});}catch(error){patch(e,{busy:false,error:String(error)},error);}}

/** Renders every slide to a PNG (longer side 1920 px) and saves them as one zip. Edits are blocked while it runs; nothing in the deck changes. */
export async function exportSlidesPng(){
  const e=sessions.get(getMedia().active??'');const summary=e?.state.summary;
  if(!e||!summary||!e.state.working||e.state.busy||e.disposed)return;
  const revision=e.revision;patch(e,{busy:true,error:''});
  try{
    const scale=exportScale(summary.widthPt,summary.heightPt),pngs:Uint8Array[]=[];
    for(let i=0;i<summary.slides;i++){
      const png=await e.client.render(i,scale);
      if(e.disposed||e.revision!==revision)throw Error('The presentation changed during export');
      pngs.push(png);
    }
    const zip=buildPngZip(pngs),url=URL.createObjectURL(new Blob([new Uint8Array(zip)],{type:'application/zip'})),a=document.createElement('a');
    a.href=url;a.download=exportZipName(e.state.name);a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
    patch(e,{busy:false});
  }catch(error){patch(e,{busy:false,error:String(error)},error);}
}

/** Metadata-only view for the agent workspace. Never exposes source bytes or image URLs. */
export const subscribeSlides=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
export function getDeckSession(name:string){const e=sessions.get(name);if(!e||e.disposed||e.state.busy||!e.state.working||!e.state.summary)return null;return {text:serializeDeck(readDeckDocument(e.state.working,e.state.summary)),revision:e.revision,identity:e.state.source};}
/** Reviewed apply through the existing session store. Host MUST await this operation. */
export async function applyDeckSession(name:string,text:string,expected:{text:string;revision:number;identity:string}){
 const e=sessions.get(name),current=getDeckSession(name);if(!e||!current||current.identity!==expected.identity||current.revision!==expected.revision||current.text!==expected.text)throw Error('Deck changed since review.');
 const before=e.state.working!,after=editedDeckBytes(before,e.state.summary!,parseDeck(text));
 patch(e,{busy:true,error:''});try{await setWorking(e,after);if(e.disposed)throw Error('Deck closed during apply.');patch(e,{undo:bounded([...e.state.undo,before]),redo:[]});return e.revision;}catch(error){patch(e,{busy:false,error:String(error)},error);throw error;}
}

/** Collab undo availability for the active deck; null when not co-editing (byte-stack undo applies). */
export const collabHistoryState=()=>{const e=sessions.get(getMedia().active??'');return e?.collab?{canUndo:e.collab.canUndo,canRedo:e.collab.canRedo}:null;};
/** Snapshot of the active deck session for command enablement (slides/commands.ts). Empty state when no deck is active. */
export const getSlidesSessionState=():SlidesSession=>current();

let presentationReturnFocus:Element|null=null;
export const getPresentationReturnFocus=()=>presentationReturnFocus;
/** Presentation images use the actual screen size, with a sub-8 MP render budget. Cache retains current/next only. */
async function presentationImage(e:Entry,index:number){
 const summary=e.state.summary!;const scale=presentationScale(summary.widthPt,summary.heightPt,window.innerWidth,window.innerHeight,window.devicePixelRatio);
 const key=`${index}:${scale}`;let pending=e.presentCache.get(key);if(pending)return pending;
 const revision=e.revision;
 pending=e.client.render(index,scale).then(png=>{if(e.disposed||e.revision!==revision)throw Error('Presentation source changed');return blobUrl(png);});
 e.presentCache.set(key,pending);
 void pending.catch(()=>{if(e.presentCache.get(key)===pending)e.presentCache.delete(key);});
 return pending;
}
export async function presentSlides(fromStart=false){const e=sessions.get(getMedia().active??'');if(!e?.state.summary?.slides||e.state.busy)return;presentationReturnFocus=document.activeElement;
 if(e.state.image)URL.revokeObjectURL(e.state.image);
 // Request while the command still has the user's activation. Rejection keeps full-window mode.
 if(!document.fullscreenElement)void document.documentElement.requestFullscreen?.().catch(()=>{});
 patch(e,{presenting:true,image:''});await renderSlide(e,fromStart?0:e.state.index);}
export async function exitSlidesPresentation(){
 const e=sessions.get(getMedia().active??'');if(!e?.state.presenting||e.exiting)return;e.exiting=true;
 try{if(document.fullscreenElement)await document.exitFullscreen().catch(()=>{});patch(e,{presenting:false});await renderSlide(e,e.state.index);clearPresentCache(e);if(presentationReturnFocus instanceof HTMLElement&&presentationReturnFocus.isConnected)presentationReturnFocus.focus();}finally{e.exiting=false;}
}

/** Duplicate, delete or add a slide as one undo step. The viewed slide follows the result. */
async function structuralEdit(make:(e:Entry,before:Uint8Array)=>Promise<{bytes:Uint8Array;index:number}>){
 const e=sessions.get(getMedia().active??'');if(!e?.state.working||e.state.busy)return;
 const before=e.state.working;patch(e,{busy:true,error:''});
 try{const {bytes,index}=await make(e,before);if(e.disposed||e.state.working!==before)throw Error('Deck changed during edit.');
  await setWorking(e,bytes,index);patch(e,{undo:bounded([...e.state.undo,before]),redo:[]});}
 catch(error){patch(e,{busy:false,error:String(error)},error);throw error;}
}
/** Collab route: the same op through the shared journal (bytes come back via onBytes), then follow the view. */
async function structuralEditCollab(e:Entry,fn:SlidesOpKind,args:unknown[],index:(e:Entry)=>number){
 patch(e,{busy:true,error:''});
 const idx=index(e);   // pre-edit slide ids: the journal apply refreshes them via onBytes
 try{await e.collab!.applyLocalOp(fn,args);if(e.disposed)return;await renderSlide(e,Math.min(Math.max(idx,0),(e.state.summary?.slides??1)-1));patch(e,{busy:false});}
 catch(error){patch(e,{busy:false,error:String(error)},error);throw error;}
}
const idAt=(e:Entry,slideId:number)=>{const i=e.state.slideIds.indexOf(slideId);if(i<0)throw Error('Slide order changed. Reselect the slide.');return i;};
/** One structural op: through the shared journal when co-editing, straight to the worker otherwise. */
const route=(fn:SlidesOpKind,args:(e:Entry)=>unknown[],index:(e:Entry)=>number)=>{
 const e=sessions.get(getMedia().active??'');
 if(e?.collab&&e.state.working&&!e.state.busy)return structuralEditCollab(e,fn,args(e),index);
 return structuralEdit(async(e,before)=>({bytes:await slidesClientPort(e.client).apply(fn,before,args(e)),index:index(e)}));};
export const duplicateSlideAt=(slideId:number)=>route('slideEdit',()=>['duplicate',slideId],e=>idAt(e,slideId)+1);
export const deleteSlideAt=(slideId:number)=>route('slideEdit',()=>['delete',slideId],e=>Math.min(idAt(e,slideId),e.state.slideIds.length-2));
export const setShapeBoundsAt=(slideId:number,shapeId:number,expected:BoundsBox,next:BoundsBox)=>route('shapeBounds',()=>[slideId,shapeId,expected,next],e=>idAt(e,slideId));
export const setShapesBoundsAt=(slideId:number,edits:ShapeBoundsEdit[])=>route('shapesBounds',()=>[slideId,edits],e=>idAt(e,slideId));
export const arrangeShapesAt=(slideId:number,shapeIds:number[],mode:ArrangeMode)=>route('arrange',()=>[slideId,shapeIds,mode],e=>idAt(e,slideId));
export const setTransitionAt=(slideId:number,transition:SlideTransition)=>route('transition',()=>[slideId,transition],e=>idAt(e,slideId));
export const styleShapesAt=(slideId:number,shapeIds:number[],patch:ShapeStylePatch)=>route('style',()=>[slideId,shapeIds,patch],e=>idAt(e,slideId));
export const insertTableAt=(slideId:number,rows:number,cols:number)=>structuralEdit(async(e,before)=>({bytes:await e.client.insertTable(before,slideId,rows,cols),index:idAt(e,slideId)}));
export const setFirstNumAt=(value:number)=>structuralEdit(async(e,before)=>({bytes:await e.client.setFirstNum(before,value),index:e.state.index}));
export const setFooterAt=(slideId:number|null,want:FooterEdit)=>structuralEdit(async(e,before)=>({bytes:await e.client.setFooter(before,slideId,want),index:slideId===null?e.state.index:idAt(e,slideId)}));
export const setSlideSizeAt=(cx:number,cy:number)=>structuralEdit(async(e,before)=>({bytes:await e.client.setSlideSize(before,cx,cy),index:e.state.index}));
export const setAllBackgroundsAt=(background:{kind:'inherit'}|{kind:'solid';color:string})=>structuralEdit(async(e,before)=>({bytes:await e.client.setAllBackgrounds(before,background),index:e.state.index}));
export const replaceTextAt=(find:string,replacement:string,matchCase:boolean,notes=false)=>structuralEdit(async(e,before)=>({bytes:await e.client.replaceText(before,find,replacement,matchCase,notes),index:e.state.index}));
export const setDecorativeAt=(slideId:number,shapeId:number,decorative:boolean)=>structuralEdit(async(e,before)=>({bytes:await e.client.setDecorative(before,slideId,shapeId,decorative),index:idAt(e,slideId)}));
export const setAltAt=(slideId:number,shapeId:number,alt:string|null)=>structuralEdit(async(e,before)=>({bytes:await e.client.setAlt(before,slideId,shapeId,alt),index:idAt(e,slideId)}));
export const editSectionAt=(edit:SectionEdit)=>structuralEdit(async(e,before)=>{const cur=e.state.slideIds[e.state.index],bytes=await e.client.editSection(before,edit);
  const at=edit.kind==='move'?(await e.client.model(bytes)).slides.findIndex(s=>s.id===cur):-1;return {bytes,index:at>=0?at:e.state.index};});
export const setHiddenAt=(slideId:number,hidden:boolean)=>structuralEdit(async(e,before)=>({bytes:await e.client.setHidden(before,slideId,hidden),index:e.state.index}));
export const setBackgroundAt=(slideId:number,background:SlideBackground)=>structuralEdit(async(e,before)=>({bytes:await e.client.setBackground(before,slideId,background),index:idAt(e,slideId)}));
export const editLayoutBoxAt=(layoutPart:string,shapeId:number,expected:BoundsBox,next:BoundsBox)=>structuralEdit(async(e,before)=>({bytes:await e.client.editLayoutBox(before,layoutPart,shapeId,expected,next),index:e.state.index}));
export const editMasterBoxAt=(shapeId:number,expected:BoundsBox,next:BoundsBox)=>structuralEdit(async(e,before)=>({bytes:await e.client.editMasterBox(before,shapeId,expected,next),index:e.state.index}));
export const editThemeAt=(edit:ThemeEdit)=>structuralEdit(async(e,before)=>({bytes:await e.client.editTheme(before,edit),index:e.state.index}));
export const editTableAt=(slideId:number,shapeId:number,edit:TableEdit)=>route('table',()=>[slideId,shapeId,edit],e=>idAt(e,slideId));
export const setNotesAt=(slideId:number,lines:string[])=>route('notes',()=>[slideId,lines],e=>idAt(e,slideId));
export const groupShapesAt=(slideId:number,shapeIds:number[])=>route('group',()=>[slideId,shapeIds],e=>idAt(e,slideId));
export const ungroupShapeAt=(slideId:number,shapeId:number)=>route('ungroup',()=>[slideId,shapeId],e=>idAt(e,slideId));
export const paragraphAt=(slideId:number,shapeId:number,format:import('./deckPackage').ParagraphFormat)=>route('paragraph',()=>[slideId,shapeId,format],e=>idAt(e,slideId));
export const formatShapeAt=(slideId:number,shapeId:number,format:RunFormat)=>route('formatText',()=>[slideId,shapeId,format],e=>idAt(e,slideId));
export const addTextBoxAt=(slideId:number,label:string)=>route('boxEdit',()=>['add',slideId,label],e=>idAt(e,slideId));
export const addShapeAt=(slideId:number,preset:ShapePreset)=>route('boxEdit',()=>['shape',slideId,preset],e=>idAt(e,slideId));
export const removeTextBoxAt=(slideId:number,shapeId:number)=>route('boxEdit',()=>['remove',slideId,shapeId],e=>idAt(e,slideId));
/** Picture payloads are inline bytes: not part of the CO3 journal. */
const picturesBlocked=()=>{const e=sessions.get(getMedia().active??'');if(e?.collab)throw Error('Picture edits are not available while the deck is shared.');};
export const insertPictureAt=(slideId:number,image:Uint8Array,alt:string)=>(picturesBlocked(),structuralEdit(async(e,before)=>({bytes:await e.client.insertPicture(before,slideId,image,alt),index:idAt(e,slideId)})));
export const replacePictureAt=(slideId:number,shapeId:number,image:Uint8Array)=>(picturesBlocked(),structuralEdit(async(e,before)=>({bytes:await e.client.replacePicture(before,slideId,shapeId,image),index:idAt(e,slideId)})));
export const removePictureAt=(slideId:number,shapeId:number)=>(picturesBlocked(),structuralEdit(async(e,before)=>({bytes:await e.client.removePicture(before,slideId,shapeId),index:idAt(e,slideId)})));
export const addSlideFromLayout=(layoutPart:string,afterSlideId:number|null)=>route('newSlide',()=>[layoutPart,afterSlideId],e=>(afterSlideId===null?e.state.slideIds.length-1:idAt(e,afterSlideId))+1);

/** Metadata lease for selected-run summary. No deck serialization or worker call. */
export function getSlideSummaryOwner(){const e=sessions.get(getMedia().active??'');if(!e||e.disposed||e.state.busy||!e.state.working||!e.state.summary||!e.state.diagnostics?.editable)throw Error('Slide selection unavailable');return {source:e.state.source,generation:e.generation,revision:e.revision,index:e.state.index,runs:e.state.runs};}

/* Reviewed apply with an owner receipt. Staging opens the new bytes natively before any session field changes;
   commit is one synchronous step (working bytes, revision, one undo entry). Render and listener failures come after it. */
type Staged={summary:DeckSummary;runs:TextRun[];model:DeckModel|null;slideIds:number[];layouts:LayoutInfo[]};
let receiptSeq=0;
const snap=(e:Entry|undefined):DeckSnapshot|null=>{if(!e)return null;const t=e.disposed||!e.state.working||!e.state.summary?null:serializeDeck(readDeckDocument(e.state.working,e.state.summary));return {generation:e.generation,identity:e.state.source,revision:e.revision,busy:e.state.busy,disposed:e.disposed,text:t,working:e.state.working};};
async function stageBytes(e:Entry,bytes:Uint8Array):Promise<Staged>{const summary=await e.client.open(bytes);const runs=await e.client.runs(bytes);const model=await modelOf(e,bytes,summary.slides);return {summary,runs,model,slideIds:idsOf(model),layouts:await layoutsOf(e,bytes)};}
function commitStaged(e:Entry,st:Staged,bytes:Uint8Array,history:Partial<SlidesSession>){e.revision++;clearPresentCache(e);Object.values(e.state.thumbnails).forEach(URL.revokeObjectURL);patch(e,{working:bytes,summary:st.summary,runs:st.runs,slideIds:st.slideIds,layouts:st.layouts,model:st.model,dirty:true,thumbnails:{},...history});return e.revision;}
const renderOwner=(e:Entry)=>async()=>{await renderSlide(e,Math.min(Math.max(e.state.index,0),(e.state.summary?.slides??1)-1));if(e.state.error)throw Error(e.state.error);};
const portOf=(e:Entry)=>({snapshot:()=>snap(e),setBusy:(on:boolean)=>patch(e,{busy:on,...(on?{error:''}:{})}),restoreNative:async(w:Uint8Array)=>{await e.client.open(w);},render:renderOwner(e),
 readback:()=>e.state.working&&e.state.summary?serializeDeck(readDeckDocument(e.state.working,e.state.summary)):null,fail:(m:string)=>patch(e,{error:m},m)});
export function applyDeckReviewed(name:string,review:ReviewedApply,origin:string):Promise<DeckReceipt>{return applyReviewedScoped(name,review,origin,singleRunEditBytes);}
/** Same owner path (one apply, one receipt, one undo step, same stale/busy/closed checks) for a reviewed edit of several runs on ONE slide, at most MAX_SLIDE_REVIEW_RUNS. */
export function applyDeckReviewedSlide(name:string,review:ReviewedApply,origin:string):Promise<DeckReceipt>{return applyReviewedScoped(name,review,origin,sameSlideEditBytes);}
function applyReviewedScoped(name:string,review:ReviewedApply,origin:string,build:typeof singleRunEditBytes):Promise<DeckReceipt>{
 const e=sessions.get(name);
 const port:DeckOwnerPort<Staged>|null=e?{...portOf(e),edit:(s,t)=>build(s.working!,e.state.summary!,parseDeck(t)),stage:b=>stageBytes(e,b),
  commit:(st,before,after,_o)=>{const token=`r${++receiptSeq}`;const undo=bounded([...e.state.undo,before]);const kept=undo.at(-1)===before;const revision=commitStaged(e,st,after,{undo,redo:[]});e.last=kept?{token,before,after}:undefined;return {revision,token,undoable:kept};}}:null;
 if(!port)return Promise.reject(Error('Deck is not open.'));
 return applyReviewed(port,review,origin);
}
export function undoDeckReceipt(name:string,receipt:DeckReceipt):Promise<DeckReceipt>{
 const e=sessions.get(name);if(!e)return Promise.reject(Error('Deck is not open.'));
 const port:UndoPort<Staged>={...portOf(e),stage:b=>stageBytes(e,b),
  matches:(token,gen)=>{const l=e.last;return l&&l.token===token&&e.generation===gen&&e.state.working===l.after&&e.state.undo.at(-1)===l.before&&e.state.redo.length===0?l.before:null;},
  commitUndo:(st,_token)=>{const l=e.last!;e.last=undefined;return {revision:commitStaged(e,st,l.before,{undo:e.state.undo.slice(0,-1),redo:bounded([...e.state.redo,l.after])})};}};
 return undoReceipt(port,receipt);
}
