import {presentationScale} from './presentKeyboard';
import {reportError} from '../log';
import {readDeckDocument,serializeDeck,parseDeck,editedDeckBytes} from './deckDocument';
import type {SlidesDiagnostics} from './diagnostics';
import type {TextRun} from './editCopy';
import type {LayoutInfo,DeckModel,BoundsBox,RunFormat,ShapeBoundsEdit,ArrangeMode,SlideTransition,ShapeStylePatch,TableEdit,ThemeEdit} from './deckPackage';
import {installBeforeUnload} from '../closeFlow';
import {useEffect,useSyncExternalStore} from 'react';
import {SlidesClient} from './client';
import {applyReviewed,undoReceipt,type DeckOwnerPort,type UndoPort,type DeckReceipt,type DeckSnapshot,type ReviewedApply} from './deckReceipt';
import {assertPptx,type DeckSummary} from './protocol';
import {addMediaFile,closeMedia,findMedia,getMedia,setActiveMedia,subscribeMedia,registerMediaCloseGuard} from '../media';
export interface SlidesSession {presenting:boolean;wasmBytes:number;diagnostics:SlidesDiagnostics|null;name:string;source:string;summary:DeckSummary|null;index:number;image:string;texts:string[];thumbnails:Record<number,string>;busy:boolean;error:string;original:Uint8Array|null;working:Uint8Array|null;runs:TextRun[];slideIds:number[];layouts:LayoutInfo[];model:DeckModel|null;dirty:boolean;undo:Uint8Array[];redo:Uint8Array[]}
interface Entry {generation:number;revision:number;state:SlidesSession;client:SlidesClient;sequence:number;disposed:boolean;presentCache:Map<string,Promise<string>>;exiting?:boolean;last?:{token:string;before:Uint8Array;after:Uint8Array}}
const bounded=(history:Uint8Array[])=>{let total=0;return history.slice(-10).reverse().filter(b=>(total+=b.byteLength)<=64*1024*1024).reverse();};
const empty:SlidesSession={presenting:false,wasmBytes:0,diagnostics:null,name:'',source:'',summary:null,index:0,image:'',texts:[],thumbnails:{},busy:false,error:'',original:null,working:null,runs:[],slideIds:[],layouts:[],model:null,dirty:false,undo:[],redo:[]};
let generation=0;
const sessions=new Map<string,Entry>();const listeners=new Set<()=>void>();let version=0;
function emit(){version++;listeners.forEach(f=>f());}
function patch(e:Entry,p:Partial<SlidesSession>,cause?:unknown){if(e.disposed)return;if(p.error)reportError('slides.engine',cause??p.error,{context:{studio:'slides',file:e.state.name}});e.state={...e.state,...p};emit();}
const current=()=>{const m=getMedia();return sessions.get(m.active??'')?.state??empty;};
export function useSlidesSession(){const media=getMedia();const name=media.items.find(m=>m.name===media.active&&m.kind==='pptx')?.name;useEffect(()=>{if(name)void ensureSlides(name);},[name]);useSyncExternalStore(f=>{listeners.add(f);return()=>listeners.delete(f);},()=>version,()=>version);return current();}
function clearPresentCache(e:Entry){for(const image of e.presentCache.values())void image.then(URL.revokeObjectURL,()=>{});e.presentCache.clear();}
function dispose(e:Entry){clearPresentCache(e);e.disposed=true;e.client.dispose();if(e.state.image)URL.revokeObjectURL(e.state.image);Object.values(e.state.thumbnails).forEach(URL.revokeObjectURL);}
subscribeMedia(()=>{const media=getMedia();for(const [name,e]of sessions){if(media.items.find(m=>m.name===name)?.url!==e.state.source){dispose(e);sessions.delete(name);}}emit();});
/** Entry identity is the source URL, not basename. Max three resident workers, current tab retained. */
export async function ensureSlides(name:string){const m=findMedia(name);if(!m||m.kind!=='pptx')return;if(sessions.get(name)?.state.source===m.url)return;
 if(sessions.size>=3){const victim=[...sessions].find(([n,e])=>n!==getMedia().active&&!e.state.dirty);if(victim){dispose(victim[1]);sessions.delete(victim[0]);}else return;}
 const e:Entry={generation:++generation,revision:0,state:{...empty,name,source:m.url,busy:true,thumbnails:{}},client:new SlidesClient(),sequence:0,disposed:false,presentCache:new Map()};sessions.set(name,e);emit();
 try{const bytes=new Uint8Array(await(await fetch(m.url)).arrayBuffer());if(e.disposed)return;const summary=await e.client.open(bytes);if(e.disposed)return;let runs:TextRun[]=[];let slideIds:number[]=[];let model:DeckModel|null=null;let layouts:LayoutInfo[]=[];try{runs=await e.client.runs(bytes);model=await modelOf(e,bytes,summary.slides);slideIds=idsOf(model);layouts=await layoutsOf(e,bytes);}catch{/* Noncanonical text remains preview-only. */}if(e.disposed)return;const diagnostics=await e.client.diagnostics(bytes);patch(e,{summary,original:bytes,working:bytes,runs,slideIds,layouts,model,diagnostics});await renderSlide(e,0);}
 catch(error){patch(e,{busy:false,error:String(error)},error);e.client.dispose();}
}
export async function openSlides(file:File){try{assertPptx(file);}catch(error){return String(error);}if(sessions.size>=3&&[...sessions.values()].every(e=>e.state.dirty))return 'Save or close an edited deck before opening another';const r=await addMediaFile(file,file.name);if('error'in r)return r.error;await ensureSlides(r.name);return '';}
export function closeSlides(){const name=getMedia().active;if(name&&findMedia(name)?.kind==='pptx')closeMedia(name);}
async function blankPreview(png:Uint8Array){const image=await createImageBitmap(new Blob([new Uint8Array(png)],{type:'image/png'}));try{const canvas=new OffscreenCanvas(32,32);const c=canvas.getContext('2d');if(!c)return false;c.drawImage(image,0,0,32,32);const p=c.getImageData(0,0,32,32).data;for(let i=4;i<p.length;i+=4)if(Math.abs(p[i]-p[0])+Math.abs(p[i+1]-p[1])+Math.abs(p[i+2]-p[2])>12)return false;return true;}finally{image.close();}}
function blobUrl(png:Uint8Array){return URL.createObjectURL(new Blob([new Uint8Array(png)],{type:'image/png'}));}
async function renderSlide(e:Entry,index:number){const summary=e.state.summary;if(!summary||index<0||index>=summary.slides||e.disposed)return;const token=++e.sequence;patch(e,{busy:true,error:''});
 try{const scale=Math.min(1.5,1280/summary.widthPt,720/summary.heightPt);const presentImage=e.state.presenting?await presentationImage(e,index):null;const png=presentImage?null:await e.client.render(index,scale);const text=await e.client.read(index);const blank=png?await blankPreview(png).catch(()=>false):false;if(blank)patch(e,{diagnostics:e.state.diagnostics?{...e.state.diagnostics,warnings:[...new Set([...e.state.diagnostics.warnings,'This slide rendered uniformly blank. Content may be unsupported; verify in the source app.'])]}:null});if(e.disposed||token!==e.sequence)return;const image=presentImage??blobUrl(png!);if(e.state.image&&!e.state.presenting)URL.revokeObjectURL(e.state.image);const thumbnails={...e.state.thumbnails};if(!thumbnails[index]){const thumb=await e.client.render(index,Math.min(180/summary.widthPt,110/summary.heightPt));if(e.disposed){URL.revokeObjectURL(image);return;}thumbnails[index]=blobUrl(thumb);}const memory=await e.client.memory();if(memory.wasmBytes>256*1024*1024){e.client.dispose();throw Error('Slides WASM memory exceeded 256 MiB observed budget');}patch(e,{index,image,texts:text.texts,thumbnails,busy:false,wasmBytes:memory.wasmBytes});if(e.state.presenting){for(const [k,v]of e.presentCache)if(!k.startsWith(`${index}:`)&&!k.startsWith(`${index+1}:`)){e.presentCache.delete(k);void v.then(URL.revokeObjectURL,()=>{});}if(index+1<summary.slides)void presentationImage(e,index+1).catch(()=>{});}}
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
try{const bytes=await e.client.reorder(before,slideId,toIndex);if(e.disposed||e.state.working!==before)throw Error('Deck changed during reorder.');
const next=ids.slice();next.splice(toIndex,0,next.splice(from,1)[0]);
await setWorking(e,bytes,Math.max(0,next.indexOf(viewedId)));patch(e,{undo:bounded([...e.state.undo,before]),redo:[]});}
catch(error){patch(e,{busy:false,error:String(error)},error);throw error;}}
export async function editSlideText(run:TextRun,text:string){const e=sessions.get(getMedia().active??'');if(!e?.state.working||e.state.busy)return;const before=e.state.working;patch(e,{busy:true,error:''});try{const bytes=await e.client.copy(before,[{...run,old:run.text,text}]);await setWorking(e,bytes);patch(e,{undo:bounded([...e.state.undo,before]),redo:[]});}catch(error){patch(e,{busy:false,error:String(error)},error);}}
export async function slidesHistory(direction:'undo'|'redo'){const e=sessions.get(getMedia().active??'');if(!e?.state.working||e.state.busy)return;const stack=e.state[direction],bytes=stack.at(-1);if(!bytes)return;const before=e.state.working;patch(e,{busy:true,error:''});try{await setWorking(e,bytes);patch(e,{[direction]:stack.slice(0,-1),[direction==='undo'?'redo':'undo']:bounded([...e.state[direction==='undo'?'redo':'undo'],before])});}catch(error){patch(e,{busy:false,error:String(error)},error);}}
export async function saveSlidesCopy(){const e=sessions.get(getMedia().active??'');const bytes=e?.state.working;if(!e||!bytes||e.state.busy)return;patch(e,{busy:true,error:''});try{const {isTauri,invoke}=await import('@tauri-apps/api/core');const suggestedName=e.state.name.replace(/^.*[\\/]/,'').replace(/\.pptx$/i,'')+'-edited.pptx';if(isTauri()){const grant=await invoke<{token:string}|null>('slides_save_pick',{suggestedName});if(!grant){patch(e,{busy:false});return;}await invoke('slides_save_write',new Uint8Array(bytes),{headers:{'x-somnia-token':grant.token}});}else{const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'application/vnd.openxmlformats-officedocument.presentationml.presentation'}));const a=document.createElement('a');a.href=url;a.download=suggestedName;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}patch(e,{dirty:isTauri()?false:e.state.dirty,busy:false});}catch(error){patch(e,{busy:false,error:String(error)},error);}}

/** Metadata-only view for the agent workspace. Never exposes source bytes or image URLs. */
export const subscribeSlides=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
export function getDeckSession(name:string){const e=sessions.get(name);if(!e||e.disposed||e.state.busy||!e.state.working||!e.state.summary)return null;return {text:serializeDeck(readDeckDocument(e.state.working,e.state.summary)),revision:e.revision,identity:e.state.source};}
/** Reviewed apply through the existing session store. Host MUST await this operation. */
export async function applyDeckSession(name:string,text:string,expected:{text:string;revision:number;identity:string}){
 const e=sessions.get(name),current=getDeckSession(name);if(!e||!current||current.identity!==expected.identity||current.revision!==expected.revision||current.text!==expected.text)throw Error('Deck changed since review.');
 const before=e.state.working!,after=editedDeckBytes(before,e.state.summary!,parseDeck(text));
 patch(e,{busy:true,error:''});try{await setWorking(e,after);if(e.disposed)throw Error('Deck closed during apply.');patch(e,{undo:bounded([...e.state.undo,before]),redo:[]});return e.revision;}catch(error){patch(e,{busy:false,error:String(error)},error);throw error;}
}

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
const idAt=(e:Entry,slideId:number)=>{const i=e.state.slideIds.indexOf(slideId);if(i<0)throw Error('Slide order changed. Reselect the slide.');return i;};
export const duplicateSlideAt=(slideId:number)=>structuralEdit(async(e,before)=>{const i=idAt(e,slideId);return {bytes:await e.client.slideEdit(before,'duplicate',slideId),index:i+1};});
export const deleteSlideAt=(slideId:number)=>structuralEdit(async(e,before)=>{const i=idAt(e,slideId);return {bytes:await e.client.slideEdit(before,'delete',slideId),index:Math.min(i,e.state.slideIds.length-2)};});
/** Moves or resizes one text box as one undo step. Stays on the same slide; the box stays selected. */
export const setShapeBoundsAt=(slideId:number,shapeId:number,expected:BoundsBox,next:BoundsBox)=>structuralEdit(async(e,before)=>{const i=idAt(e,slideId);return {bytes:await e.client.shapeBounds(before,slideId,shapeId,expected,next),index:i};});
export const setShapesBoundsAt=(slideId:number,edits:ShapeBoundsEdit[])=>structuralEdit(async(e,before)=>({bytes:await e.client.shapesBounds(before,slideId,edits),index:idAt(e,slideId)}));
export const arrangeShapesAt=(slideId:number,shapeIds:number[],mode:ArrangeMode)=>structuralEdit(async(e,before)=>({bytes:await e.client.arrange(before,slideId,shapeIds,mode),index:idAt(e,slideId)}));
export const setTransitionAt=(slideId:number,transition:SlideTransition)=>structuralEdit(async(e,before)=>({bytes:await e.client.setTransition(before,slideId,transition),index:idAt(e,slideId)}));
export const styleShapesAt=(slideId:number,shapeIds:number[],patch:ShapeStylePatch)=>structuralEdit(async(e,before)=>({bytes:await e.client.styleShapes(before,slideId,shapeIds,patch),index:idAt(e,slideId)}));
export const insertTableAt=(slideId:number,rows:number,cols:number)=>structuralEdit(async(e,before)=>({bytes:await e.client.insertTable(before,slideId,rows,cols),index:idAt(e,slideId)}));
export const editThemeAt=(edit:ThemeEdit)=>structuralEdit(async(e,before)=>({bytes:await e.client.editTheme(before,edit),index:e.state.index}));
export const editTableAt=(slideId:number,shapeId:number,edit:TableEdit)=>structuralEdit(async(e,before)=>({bytes:await e.client.editTable(before,slideId,shapeId,edit),index:idAt(e,slideId)}));
export const setNotesAt=(slideId:number,lines:string[])=>structuralEdit(async(e,before)=>({bytes:await e.client.setNotes(before,slideId,lines),index:idAt(e,slideId)}));
export const groupShapesAt=(slideId:number,shapeIds:number[])=>structuralEdit(async(e,before)=>({bytes:await e.client.group(before,slideId,shapeIds),index:idAt(e,slideId)}));
export const ungroupShapeAt=(slideId:number,shapeId:number)=>structuralEdit(async(e,before)=>({bytes:await e.client.ungroup(before,slideId,shapeId),index:idAt(e,slideId)}));
export const formatShapeAt=(slideId:number,shapeId:number,format:RunFormat)=>structuralEdit(async(e,before)=>({bytes:await e.client.formatText(before,slideId,shapeId,format),index:idAt(e,slideId)}));
export const addTextBoxAt=(slideId:number,label:string)=>structuralEdit(async(e,before)=>({bytes:await e.client.addBox(before,slideId,label),index:idAt(e,slideId)}));
export const removeTextBoxAt=(slideId:number,shapeId:number)=>structuralEdit(async(e,before)=>({bytes:await e.client.removeBox(before,slideId,shapeId),index:idAt(e,slideId)}));
export const insertPictureAt=(slideId:number,image:Uint8Array,alt:string)=>structuralEdit(async(e,before)=>({bytes:await e.client.insertPicture(before,slideId,image,alt),index:idAt(e,slideId)}));
export const replacePictureAt=(slideId:number,shapeId:number,image:Uint8Array)=>structuralEdit(async(e,before)=>({bytes:await e.client.replacePicture(before,slideId,shapeId,image),index:idAt(e,slideId)}));
export const removePictureAt=(slideId:number,shapeId:number)=>structuralEdit(async(e,before)=>({bytes:await e.client.removePicture(before,slideId,shapeId),index:idAt(e,slideId)}));
export const addSlideFromLayout=(layoutPart:string,afterSlideId:number|null)=>structuralEdit(async(e,before)=>{const i=afterSlideId===null?e.state.slideIds.length-1:idAt(e,afterSlideId);return {bytes:await e.client.newSlide(before,layoutPart,afterSlideId),index:i+1};});
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
export function applyDeckReviewed(name:string,review:ReviewedApply,origin:string):Promise<DeckReceipt>{
 const e=sessions.get(name);
 const port:DeckOwnerPort<Staged>|null=e?{...portOf(e),edit:(s,t)=>editedDeckBytes(s.working!,e.state.summary!,parseDeck(t)),stage:b=>stageBytes(e,b),
  commit:(st,before,after,o)=>{const token=`r${++receiptSeq}`;const undo=bounded([...e.state.undo,before]);const kept=undo.at(-1)===before;const revision=commitStaged(e,st,after,{undo,redo:[]});e.last=kept?{token,before,after}:undefined;return {revision,token,undoable:kept};}}:null;
 if(!port)return Promise.reject(Error('Deck is not open.'));
 return applyReviewed(port,review,origin);
}
export function undoDeckReceipt(name:string,receipt:DeckReceipt):Promise<DeckReceipt>{
 const e=sessions.get(name);if(!e)return Promise.reject(Error('Deck is not open.'));
 const port:UndoPort<Staged>={...portOf(e),stage:b=>stageBytes(e,b),
  matches:(token,gen)=>{const l=e.last;return l&&l.token===token&&e.generation===gen&&e.state.working===l.after&&e.state.undo.at(-1)===l.before&&e.state.redo.length===0?l.before:null;},
  commitUndo:(st,token)=>{const l=e.last!;e.last=undefined;return {revision:commitStaged(e,st,l.before,{undo:e.state.undo.slice(0,-1),redo:bounded([...e.state.redo,l.after])})};}};
 return undoReceipt(port,receipt);
}
