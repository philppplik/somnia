import type {TextRun} from './editCopy';
import {installBeforeUnload} from '../closeFlow';
import {useEffect,useSyncExternalStore} from 'react';
import {SlidesClient} from './client';
import {assertPptx,type DeckSummary} from './protocol';
import {addMediaFile,closeMedia,findMedia,getMedia,setActiveMedia,subscribeMedia,registerMediaCloseGuard} from '../media';
interface SlidesSession {name:string;source:string;summary:DeckSummary|null;index:number;image:string;texts:string[];thumbnails:Record<number,string>;busy:boolean;error:string;original:Uint8Array|null;working:Uint8Array|null;runs:TextRun[];dirty:boolean;undo:Uint8Array[];redo:Uint8Array[]}
interface Entry {state:SlidesSession;client:SlidesClient;sequence:number;disposed:boolean}
const bounded=(history:Uint8Array[])=>{let total=0;return history.slice(-10).reverse().filter(b=>(total+=b.byteLength)<=64*1024*1024).reverse();};
const empty:SlidesSession={name:'',source:'',summary:null,index:0,image:'',texts:[],thumbnails:{},busy:false,error:'',original:null,working:null,runs:[],dirty:false,undo:[],redo:[]};
const sessions=new Map<string,Entry>();const listeners=new Set<()=>void>();let version=0;
function emit(){version++;listeners.forEach(f=>f());}
function patch(e:Entry,p:Partial<SlidesSession>){if(e.disposed)return;e.state={...e.state,...p};emit();}
const current=()=>{const m=getMedia();return sessions.get(m.active??'')?.state??empty;};
export function useSlidesSession(){const media=getMedia();const name=media.items.find(m=>m.name===media.active&&m.kind==='pptx')?.name;useEffect(()=>{if(name)void ensureSlides(name);},[name]);useSyncExternalStore(f=>{listeners.add(f);return()=>listeners.delete(f);},()=>version,()=>version);return current();}
function dispose(e:Entry){e.disposed=true;e.client.dispose();if(e.state.image)URL.revokeObjectURL(e.state.image);Object.values(e.state.thumbnails).forEach(URL.revokeObjectURL);}
subscribeMedia(()=>{const media=getMedia();for(const [name,e]of sessions){if(media.items.find(m=>m.name===name)?.url!==e.state.source){dispose(e);sessions.delete(name);}}emit();});
/** Entry identity is the source URL, not basename. Max three resident workers, current tab retained. */
export async function ensureSlides(name:string){const m=findMedia(name);if(!m||m.kind!=='pptx')return;if(sessions.get(name)?.state.source===m.url)return;
 if(sessions.size>=3){const victim=[...sessions].find(([n,e])=>n!==getMedia().active&&!e.state.dirty);if(victim){dispose(victim[1]);sessions.delete(victim[0]);}else return;}
 const e:Entry={state:{...empty,name,source:m.url,busy:true,thumbnails:{}},client:new SlidesClient(),sequence:0,disposed:false};sessions.set(name,e);emit();
 try{const bytes=new Uint8Array(await(await fetch(m.url)).arrayBuffer());if(e.disposed)return;const summary=await e.client.open(bytes);if(e.disposed)return;let runs:TextRun[]=[];try{runs=await e.client.runs(bytes);}catch{/* Noncanonical text remains preview-only. */}if(e.disposed)return;patch(e,{summary,original:bytes,working:bytes,runs});await renderSlide(e,0);}
 catch(error){patch(e,{busy:false,error:String(error)});e.client.dispose();}
}
export async function openSlides(file:File){try{assertPptx(file);}catch(error){return String(error);}if(sessions.size>=3&&[...sessions.values()].every(e=>e.state.dirty))return 'Save or close an edited deck before opening another';const r=await addMediaFile(file,file.name);if('error'in r)return r.error;await ensureSlides(r.name);return '';}
export function closeSlides(){const name=getMedia().active;if(name&&findMedia(name)?.kind==='pptx')closeMedia(name);}
function blobUrl(png:Uint8Array){return URL.createObjectURL(new Blob([new Uint8Array(png)],{type:'image/png'}));}
async function renderSlide(e:Entry,index:number){const summary=e.state.summary;if(!summary||index<0||index>=summary.slides||e.disposed)return;const token=++e.sequence;patch(e,{busy:true,error:''});
 try{const scale=Math.min(1.5,1280/summary.widthPt,720/summary.heightPt);const png=await e.client.render(index,scale);const text=await e.client.read(index);if(e.disposed||token!==e.sequence)return;const image=blobUrl(png);if(e.state.image)URL.revokeObjectURL(e.state.image);const thumbnails={...e.state.thumbnails};if(!thumbnails[index]){const thumb=await e.client.render(index,Math.min(180/summary.widthPt,110/summary.heightPt));if(e.disposed){URL.revokeObjectURL(image);return;}thumbnails[index]=blobUrl(thumb);}patch(e,{index,image,texts:text.texts,thumbnails,busy:false});}
 catch(error){patch(e,{error:String(error),busy:false});}
}
export async function showSlide(index:number){const e=sessions.get(getMedia().active??'');if(e)await renderSlide(e,index);}
export async function loadThumbnails(){const e=sessions.get(getMedia().active??'');const summary=e?.state.summary;if(!e||!summary||e.state.busy)return;patch(e,{busy:true});try{for(let index=0;index<summary.slides;index++){if(e.disposed)break;if(e.state.thumbnails[index])continue;const png=await e.client.render(index,Math.min(180/summary.widthPt,110/summary.heightPt));if(e.disposed)break;patch(e,{thumbnails:{...e.state.thumbnails,[index]:blobUrl(png)}});}patch(e,{busy:false});}catch(error){patch(e,{error:String(error),busy:false});}}
export function activateSlides(name:string){setActiveMedia(name);void ensureSlides(name);}

export const slidesIsDirty=(name:string)=>sessions.get(name)?.state.dirty??false;
if(typeof window!=='undefined')installBeforeUnload(()=>[...sessions.values()].some(e=>e.state.dirty));
registerMediaCloseGuard(name=>!slidesIsDirty(name)||window.confirm(`Discard unsaved presentation edits to ${name}?`));
async function setWorking(e:Entry,bytes:Uint8Array){const summary=await e.client.open(bytes);const runs=await e.client.runs(bytes);Object.values(e.state.thumbnails).forEach(URL.revokeObjectURL);patch(e,{working:bytes,summary,runs,dirty:true,thumbnails:{}});await renderSlide(e,e.state.index);}
export async function editSlideText(run:TextRun,text:string){const e=sessions.get(getMedia().active??'');if(!e?.state.working||e.state.busy)return;const before=e.state.working;patch(e,{busy:true,error:''});try{const bytes=await e.client.copy(before,[{...run,old:run.text,text}]);await setWorking(e,bytes);patch(e,{undo:bounded([...e.state.undo,before]),redo:[]});}catch(error){patch(e,{busy:false,error:String(error)});}}
export async function slidesHistory(direction:'undo'|'redo'){const e=sessions.get(getMedia().active??'');if(!e?.state.working||e.state.busy)return;const stack=e.state[direction],bytes=stack.at(-1);if(!bytes)return;const before=e.state.working;patch(e,{busy:true,error:''});try{await setWorking(e,bytes);patch(e,{[direction]:stack.slice(0,-1),[direction==='undo'?'redo':'undo']:bounded([...e.state[direction==='undo'?'redo':'undo'],before])});}catch(error){patch(e,{busy:false,error:String(error)});}}
export async function saveSlidesCopy(){const e=sessions.get(getMedia().active??'');const bytes=e?.state.working;if(!e||!bytes||e.state.busy)return;patch(e,{busy:true,error:''});try{const {isTauri,invoke}=await import('@tauri-apps/api/core');const suggestedName=e.state.name.replace(/^.*[\\/]/,'').replace(/\.pptx$/i,'')+'-edited.pptx';if(isTauri()){const grant=await invoke<{token:string}|null>('slides_save_pick',{suggestedName});if(!grant){patch(e,{busy:false});return;}await invoke('slides_save_write',new Uint8Array(bytes),{headers:{'x-somnia-token':grant.token}});}else{const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'application/vnd.openxmlformats-officedocument.presentationml.presentation'}));const a=document.createElement('a');a.href=url;a.download=suggestedName;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}patch(e,{dirty:isTauri()?false:e.state.dirty,busy:false});}catch(error){patch(e,{busy:false,error:String(error)});}}
