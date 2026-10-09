/** Media resources. Native raster inputs keep the editor path; additional codecs are read-only previews. */
import {RASTER_EXTENSIONS,RASTER_ACCEPT,sniffRaster,decodeRasterPreview} from './rasterPreview';
import {useSyncExternalStore} from 'react';
import {AUDIO_EXTENSIONS,sniffAudio} from './sound/format';
import {VIDEO_EXTENSIONS,sniffVideo} from './video/format';
export type MediaKind='image'|'pdf'|'psd'|'docx'|'xlsx'|'pptx'|'raster-preview'|'audio'|'video'|'video-project';
export interface MediaItem{name:string;kind:MediaKind;mime:string;url:string;size:number;sourceUrl?:string;warning?:string}
export const MEDIA_FILE=new RegExp(`\\.(${RASTER_EXTENSIONS}|pdf|psd|docx|xlsx|pptx|${AUDIO_EXTENSIONS}|${VIDEO_EXTENSIONS})$`,'i');
export const MAX_MEDIA_BYTES=25_000_000;
export const MEDIA_ACCEPT=RASTER_ACCEPT+',.psd,.png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf,.docx,.xlsx,.pptx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.mp3,.wav,.flac,.ogg,.oga,.aif,.aiff,audio/mpeg,audio/wav,audio/flac,audio/ogg,audio/aiff,.mp4,.m4v,.mov,.webm,.mkv,video/mp4,video/quicktime,video/webm,video/x-matroska,video/x-m4v';
const OFFICE_MIME={pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'} as const;
export const isMarkdown=(f:string)=>/\.(md|markdown)$/i.test(f);
export const isSvg=(f:string)=>/\.svg$/i.test(f);
/** True when the file shows as a rendered preview instead of the HTML design canvas. */
export const isTex=(f:string)=>/\.tex$/i.test(f);
export const isRenderedText=(f:string)=>isMarkdown(f)||isSvg(f)||isTex(f);
/** Looks at the first bytes so a renamed file is not shown as something it is not. */
export function sniffMedia(bytes:Uint8Array):{kind:MediaKind;mime:string}|null{
 if(bytes.length>=6&&bytes[0]===56&&bytes[1]===66&&bytes[2]===80&&bytes[3]===83&&bytes[4]===0&&bytes[5]===1)return{kind:'psd',mime:'image/vnd.adobe.photoshop'};
 const b=(...v:number[])=>v.every((x,i)=>bytes[i]===x);
 if(b(0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a))return{kind:'image',mime:'image/png'};
 if(b(0xff,0xd8,0xff))return{kind:'image',mime:'image/jpeg'};
 if(b(0x52,0x49,0x46,0x46)&&bytes[8]===0x57&&bytes[9]===0x45&&bytes[10]===0x42&&bytes[11]===0x50)return{kind:'image',mime:'image/webp'};
 if(b(0x25,0x50,0x44,0x46,0x2d))return{kind:'pdf',mime:'application/pdf'};
 const raster=sniffRaster(bytes);if(raster)return{kind:'raster-preview',mime:raster};
 const audio=sniffAudio(bytes);if(audio)return{kind:'audio',mime:audio.mime};
 const video=sniffVideo(bytes);return video?{kind:'video',mime:video.mime}:null;}
interface MediaState{items:MediaItem[];active:string|null}
let state:MediaState={items:[],active:null};
const listeners=new Set<()=>void>();
const set=(s:MediaState)=>{state=s;listeners.forEach(l=>l());};
export const getMedia=()=>state;
export const subscribeMedia=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
export const useMedia=()=>useSyncExternalStore(subscribeMedia,getMedia,getMedia);
export const findMedia=(name:string)=>state.items.find(i=>i.name.toLowerCase()===name.toLowerCase());
const closeGuards=new Set<(name:string)=>boolean>();
export function registerMediaCloseGuard(guard:(name:string)=>boolean){closeGuards.add(guard);return()=>{closeGuards.delete(guard);};}
const canClose=(name:string)=>[...closeGuards].every(guard=>guard(name));
const baseName=(n:string)=>n.replace(/^.*[\\/]/,'');
export interface PreparedMedia{item:MediaItem;name:string;commit(opts?:{activate?:boolean}):{name:string}|{error:string};dispose():void}
/** Validates and decodes one media file WITHOUT touching the media list (prepare step of prepare-then-commit). Creates object URLs: call `dispose()` if the result is not committed. */
export async function prepareMediaFile(file:Blob,rawName:string,key?:string):Promise<PreparedMedia|{error:string}>{
 const name=key??baseName(rawName);
 if(file.size>MAX_MEDIA_BYTES)return{error:`${name} is larger than ${MAX_MEDIA_BYTES/1_000_000} MB.`};
 let sniffed=sniffMedia(new Uint8Array(await file.slice(0,256).arrayBuffer()));
 if(!sniffed&&/\.(docx|xlsx|pptx)$/i.test(name)){const {sniffOffice}=await import('./office/zipProbe');const k=sniffOffice(new Uint8Array(await file.arrayBuffer()));

  if(k==='docx'||k==='xlsx'||k==='pptx')sniffed={kind:k,mime:OFFICE_MIME[k]};}
 if(!sniffed&&/\.tga$/i.test(name))sniffed={kind:'raster-preview',mime:'image/x-tga'};
 if(!sniffed)return{error:/\.(docx|xlsx|pptx)$/i.test(name)?`${name} is not a valid ${name.slice(-4).toUpperCase()} file.`:/\.psd$/i.test(name)?`${name} is not a valid PSD v1 file.`:`${name} is not a valid supported raster image or PDF file.`};
 let preview:{blob:Blob;mime:string;warning?:string}={blob:file,mime:sniffed.mime};
 if(sniffed.kind==='raster-preview')try{preview=await decodeRasterPreview(file,name,sniffed.mime);}catch(error){return{error:`${name}: ${error instanceof Error?error.message:String(error)}`};}
 const url=URL.createObjectURL(new Blob([preview.blob],{type:preview.mime}));
 const item:MediaItem={name,kind:sniffed.kind,mime:preview.mime,url,size:file.size,warning:preview.warning,...(sniffed.kind==='raster-preview'?{sourceUrl:URL.createObjectURL(file)}:{})};
 let done=false;
 const dispose=()=>{if(done)return;done=true;URL.revokeObjectURL(url);if(item.sourceUrl)URL.revokeObjectURL(item.sourceUrl);};
 return{item,name,dispose,commit(opts={}){
  if(done)return{error:`${name} was already released.`};
  // Guards run at commit time: the session may have changed while the file was being prepared.
  const old=findMedia(name);if(old&&!canClose(name)){dispose();return{error:'Replacing the image was cancelled.'};}
  if(old){URL.revokeObjectURL(old.url);if(old.sourceUrl)URL.revokeObjectURL(old.sourceUrl);}
  done=true;
  const active=opts.activate===false?(old&&state.active===old.name?null:state.active):name;
  set({items:[...state.items.filter(i=>i!==old),item],active});return{name};}};
}
/** Adds one media file. Returns the stored name, or an error text. A file with the same name is replaced.
 * `key` (folder-relative path, e.g. img/a.png) keeps same-named files in different subfolders apart; without it the file name is the key.
 * `activate:false` registers availability only (folder load, background intake): it never changes the active item and so never routes the Studio. */
export async function addMediaFile(file:Blob,rawName:string,key?:string,opts:{activate?:boolean}={}):Promise<{name:string}|{error:string}>{
 const prepared=await prepareMediaFile(file,rawName,key);if('error' in prepared)return prepared;return prepared.commit(opts);}
/** Studio routing for active media lives in `studios/studioRouting.ts` (one coordinator), not here. */
export function setActiveMedia(name:string|null){if(state.active!==name)set({...state,active:name});}
export const canReplaceMedia=(name:string)=>!findMedia(name)||canClose(name);
export function closeMedia(name:string){const it=findMedia(name);if(!it||!canClose(name))return;URL.revokeObjectURL(it.url);if(it.sourceUrl)URL.revokeObjectURL(it.sourceUrl);set({items:state.items.filter(i=>i!==it),active:state.active===it.name?null:state.active});}
export function clearMedia(){if(!state.items.every(it=>canClose(it.name)))return false;state.items.forEach(i=>{URL.revokeObjectURL(i.url);if(i.sourceUrl)URL.revokeObjectURL(i.sourceUrl);});set({items:[],active:null});return true;}
export const formatBytes=(n:number)=>n<1024?`${n} B`:n<1_048_576?`${(n/1024).toFixed(1)} KB`:`${(n/1_048_576).toFixed(1)} MB`;

/** Empty edit-list project. Not a video source and never sent to a decoder. */
export function addBlankVideoProject(name:string):void{
 if(findMedia(name))throw Error('A project with this name is already open.');
 const url=URL.createObjectURL(new Blob([], {type:'application/x-somnia-video-project'}));
 const item:MediaItem={name,kind:'video-project',mime:'application/x-somnia-video-project',url,size:0};
 set({items:[...state.items,item],active:name});
}
