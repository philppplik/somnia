/** Media files (PNG, JPEG, PDF) are previewed, never edited: they live in a small in-memory store next to the text project. */
import {useSyncExternalStore} from 'react';
export type MediaKind='image'|'pdf';
export interface MediaItem{name:string;kind:MediaKind;mime:string;url:string;size:number}
export const MEDIA_FILE=/\.(png|jpe?g|pdf)$/i;
export const MAX_MEDIA_BYTES=25_000_000;
export const MEDIA_ACCEPT='.png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf';
export const isMarkdown=(f:string)=>/\.md$/i.test(f);
export const isSvg=(f:string)=>/\.svg$/i.test(f);
/** True when the file shows as a rendered preview instead of the HTML design canvas. */
export const isRenderedText=(f:string)=>isMarkdown(f)||isSvg(f);
/** Looks at the first bytes so a renamed file is not shown as something it is not. */
export function sniffMedia(bytes:Uint8Array):{kind:MediaKind;mime:string}|null{
 const b=(...v:number[])=>v.every((x,i)=>bytes[i]===x);
 if(b(0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a))return{kind:'image',mime:'image/png'};
 if(b(0xff,0xd8,0xff))return{kind:'image',mime:'image/jpeg'};
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
const baseName=(n:string)=>n.replace(/^.*[\\/]/,'');
/** Adds one media file. Returns the stored name, or an error text. A file with the same name is replaced. */
export async function addMediaFile(file:Blob,rawName:string):Promise<{name:string}|{error:string}>{
 const name=baseName(rawName);
 if(file.size>MAX_MEDIA_BYTES)return{error:`${name} is larger than ${MAX_MEDIA_BYTES/1_000_000} MB.`};
 const sniffed=sniffMedia(new Uint8Array(await file.slice(0,16).arrayBuffer()));
 if(!sniffed)return{error:`${name} is not a valid PNG, JPEG or PDF file.`};
 const old=findMedia(name);if(old)URL.revokeObjectURL(old.url);
 const url=URL.createObjectURL(new Blob([file],{type:sniffed.mime}));
 const item:MediaItem={name,kind:sniffed.kind,mime:sniffed.mime,url,size:file.size};
 set({items:[...state.items.filter(i=>i!==old),item],active:name});return{name};}
export function setActiveMedia(name:string|null){if(state.active!==name)set({...state,active:name});}
export function closeMedia(name:string){const it=findMedia(name);if(!it)return;URL.revokeObjectURL(it.url);set({items:state.items.filter(i=>i!==it),active:state.active===it.name?null:state.active});}
export function clearMedia(){state.items.forEach(i=>URL.revokeObjectURL(i.url));set({items:[],active:null});}
export const formatBytes=(n:number)=>n<1024?`${n} B`:n<1_048_576?`${(n/1024).toFixed(1)} KB`:`${(n/1_048_576).toFixed(1)} MB`;
