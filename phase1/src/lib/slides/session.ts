import {useEffect,useSyncExternalStore} from 'react';
import {SlidesClient} from './client';
import {assertPptx,type DeckSummary} from './protocol';
import {addMediaFile,closeMedia,findMedia,getMedia,setActiveMedia,subscribeMedia} from '../media';
interface SlidesSession {name:string;source:string;summary:DeckSummary|null;index:number;image:string;texts:string[];thumbnails:Record<number,string>;busy:boolean;error:string;original:Uint8Array|null}
interface Entry {state:SlidesSession;client:SlidesClient;sequence:number;disposed:boolean}
const empty:SlidesSession={name:'',source:'',summary:null,index:0,image:'',texts:[],thumbnails:{},busy:false,error:'',original:null};
const sessions=new Map<string,Entry>();const listeners=new Set<()=>void>();let version=0;
function emit(){version++;listeners.forEach(f=>f());}
function patch(e:Entry,p:Partial<SlidesSession>){if(e.disposed)return;e.state={...e.state,...p};emit();}
const current=()=>{const m=getMedia();return sessions.get(m.active??'')?.state??empty;};
export function useSlidesSession(){const media=getMedia();const name=media.items.find(m=>m.name===media.active&&m.kind==='pptx')?.name;useEffect(()=>{if(name)void ensureSlides(name);},[name]);useSyncExternalStore(f=>{listeners.add(f);return()=>listeners.delete(f);},()=>version,()=>version);return current();}
function dispose(e:Entry){e.disposed=true;e.client.dispose();if(e.state.image)URL.revokeObjectURL(e.state.image);Object.values(e.state.thumbnails).forEach(URL.revokeObjectURL);}
subscribeMedia(()=>{const media=getMedia();for(const [name,e]of sessions){if(media.items.find(m=>m.name===name)?.url!==e.state.source){dispose(e);sessions.delete(name);}}emit();});
/** Entry identity is the source URL, not basename. Max three resident workers, current tab retained. */
export async function ensureSlides(name:string){const m=findMedia(name);if(!m||m.kind!=='pptx')return;if(sessions.get(name)?.state.source===m.url)return;
 if(sessions.size>=3){const victim=[...sessions].find(([n])=>n!==getMedia().active);if(victim){dispose(victim[1]);sessions.delete(victim[0]);}}
 const e:Entry={state:{...empty,name,source:m.url,busy:true,thumbnails:{}},client:new SlidesClient(),sequence:0,disposed:false};sessions.set(name,e);emit();
 try{const bytes=new Uint8Array(await(await fetch(m.url)).arrayBuffer());if(e.disposed)return;const summary=await e.client.open(bytes);if(e.disposed)return;patch(e,{summary,original:bytes});await renderSlide(e,0);}
 catch(error){patch(e,{busy:false,error:String(error)});e.client.dispose();}
}
export async function openSlides(file:File){try{assertPptx(file);}catch(error){return String(error);}const r=await addMediaFile(file,file.name);if('error'in r)return r.error;await ensureSlides(r.name);return '';}
export function closeSlides(){const name=getMedia().active;if(name&&findMedia(name)?.kind==='pptx')closeMedia(name);}
function blobUrl(png:Uint8Array){return URL.createObjectURL(new Blob([new Uint8Array(png)],{type:'image/png'}));}
async function renderSlide(e:Entry,index:number){const summary=e.state.summary;if(!summary||index<0||index>=summary.slides||e.disposed)return;const token=++e.sequence;patch(e,{busy:true,error:''});
 try{const scale=Math.min(1.5,1280/summary.widthPt,720/summary.heightPt);const png=await e.client.render(index,scale);const text=await e.client.read(index);if(e.disposed||token!==e.sequence)return;const image=blobUrl(png);if(e.state.image)URL.revokeObjectURL(e.state.image);const thumbnails={...e.state.thumbnails};if(!thumbnails[index]){const thumb=await e.client.render(index,Math.min(180/summary.widthPt,110/summary.heightPt));if(e.disposed){URL.revokeObjectURL(image);return;}thumbnails[index]=blobUrl(thumb);}patch(e,{index,image,texts:text.texts,thumbnails,busy:false});}
 catch(error){patch(e,{error:String(error),busy:false});}
}
export async function showSlide(index:number){const e=sessions.get(getMedia().active??'');if(e)await renderSlide(e,index);}
export async function loadThumbnails(){const e=sessions.get(getMedia().active??'');const summary=e?.state.summary;if(!e||!summary||e.state.busy)return;patch(e,{busy:true});try{for(let index=0;index<summary.slides;index++){if(e.disposed)break;if(e.state.thumbnails[index])continue;const png=await e.client.render(index,Math.min(180/summary.widthPt,110/summary.heightPt));if(e.disposed)break;patch(e,{thumbnails:{...e.state.thumbnails,[index]:blobUrl(png)}});}patch(e,{busy:false});}catch(error){patch(e,{error:String(error),busy:false});}}
export function activateSlides(name:string){setActiveMedia(name);void ensureSlides(name);}
