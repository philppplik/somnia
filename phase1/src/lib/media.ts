/** Media files (PNG, JPEG, PDF) are previewed, never edited: they live in a small in-memory store next to the text project. */
import {useSyncExternalStore} from 'react';
export type MediaKind='image'|'pdf'|'psd';
export interface MediaItem{name:string;kind:MediaKind;mime:string;url:string;size:number}
export const MEDIA_FILE=/\.(png|jpe?g|webp|pdf|psd)$/i;
export const MAX_MEDIA_BYTES=25_000_000;
export const MEDIA_ACCEPT='.psd,.png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf';
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
 return null;}
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
/** Adds one media file. Returns the stored name, or an error text. A file with the same name is replaced. */
/** `key` (folder-relative path, e.g. img/a.png) keeps same-named files in different subfolders apart; without it the file name is the key. */
export async function addMediaFile(file:Blob,rawName:string,key?:string):Promise<{name:string}|{error:string}>{
 const name=key??baseName(rawName);
 if(file.size>MAX_MEDIA_BYTES)return{error:`${name} is larger than ${MAX_MEDIA_BYTES/1_000_000} MB.`};
 const sniffed=sniffMedia(new Uint8Array(await file.slice(0,16).arrayBuffer()));
 if(!sniffed)return{error:/\.psd$/i.test(name)?`${name} is not a valid PSD v1 file.`:`${name} is not a valid PNG, JPEG, WebP or PDF file.`};
 const old=findMedia(name);if(old&&!canClose(name))return{error:'Replacing the image was cancelled.'};if(old)URL.revokeObjectURL(old.url);
 const url=URL.createObjectURL(new Blob([file],{type:sniffed.mime}));
 const item:MediaItem={name,kind:sniffed.kind,mime:sniffed.mime,url,size:file.size};
 set({items:[...state.items.filter(i=>i!==old),item],active:name});return{name};}
export function setActiveMedia(name:string|null){if(state.active!==name)set({...state,active:name});}
export function closeMedia(name:string){const it=findMedia(name);if(!it||!canClose(name))return;URL.revokeObjectURL(it.url);set({items:state.items.filter(i=>i!==it),active:state.active===it.name?null:state.active});}
export function clearMedia(){if(!state.items.every(it=>canClose(it.name)))return;state.items.forEach(i=>URL.revokeObjectURL(i.url));set({items:[],active:null});}
export const formatBytes=(n:number)=>n<1024?`${n} B`:n<1_048_576?`${(n/1024).toFixed(1)} KB`:`${(n/1_048_576).toFixed(1)} MB`;
