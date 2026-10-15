/** Capture-date cache for the EXIF sort: one entry per photo (keyed by media name, invalidated by byte size), persisted locally. Missing entries load async with bounded concurrency; a photo whose EXIF has no date resolves as undated (null), so the sort can gate on completeness instead of reordering progressively. Originals are never modified. */
import {useSyncExternalStore} from 'react';
import {readPhotoInfo} from './exifInfo';
const KEY='somnia.photos.captureDates.v4'; // v4: entries carry the full daily EXIF set (lens/exposure/aperture/ISO/focal) next to date+camera+dimensions (one fetch feeds all); older entries reload
const CONCURRENCY=3;
export interface CaptureEntry{t:number|null;s:number;cam:string|null;w:number|null;h:number|null;lens:string|null;exp:string|null;ap:string|null;iso:number|null;fl:string|null}
let state:Record<string,CaptureEntry>={};
try{
 const d=JSON.parse(globalThis.localStorage?.getItem(KEY)??'null');
 if(d&&typeof d==='object'&&!Array.isArray(d))for(const[k,v]of Object.entries(d)){const e=v as CaptureEntry;if(e&&typeof e.s==='number'&&(typeof e.t==='number'||e.t===null))state[k]={t:e.t,s:e.s,cam:typeof (e as CaptureEntry).cam==='string'?(e as CaptureEntry).cam:null,w:typeof (e as CaptureEntry).w==='number'?(e as CaptureEntry).w:null,h:typeof (e as CaptureEntry).h==='number'?(e as CaptureEntry).h:null,lens:typeof (e as CaptureEntry).lens==='string'?(e as CaptureEntry).lens:null,exp:typeof (e as CaptureEntry).exp==='string'?(e as CaptureEntry).exp:null,ap:typeof (e as CaptureEntry).ap==='string'?(e as CaptureEntry).ap:null,iso:typeof (e as CaptureEntry).iso==='number'?(e as CaptureEntry).iso:null,fl:typeof (e as CaptureEntry).fl==='string'?(e as CaptureEntry).fl:null};}
}catch{/* session only */}
const subs=new Set<()=>void>();
const notify=()=>subs.forEach(f=>f());
const persist=()=>{try{globalThis.localStorage?.setItem(KEY,JSON.stringify(state));}catch{/* session only */}};
/** EXIF DateTimeOriginal "YYYY:MM:DD HH:MM:SS" -> epoch ms (local time; EXIF carries no timezone), null when absent or unparseable. */
export const parseExifDate=(v:string|undefined):number|null=>{
 if(!v)return null;
 const m=/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(v.trim());
 if(!m)return null;
 const d=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),Number(m[4]),Number(m[5]),Number(m[6]));
 return Number.isNaN(d.getTime())?null:d.getTime();
};
export const getCaptureEntry=(name:string,size:number):CaptureEntry|null=>{const e=state[name];return e&&e.s===size?e:null;};
export const putCaptureDate=(name:string,size:number,t:number|null,cam:string|null=null,w:number|null=null,h:number|null=null,ex?:Partial<Pick<CaptureEntry,'lens'|'exp'|'ap'|'iso'|'fl'>>)=>{state={...state,[name]:{t,s:size,cam,w,h,lens:ex?.lens??null,exp:ex?.exp??null,ap:ex?.ap??null,iso:ex?.iso??null,fl:ex?.fl??null}};persist();notify();};
/** Pure mapping from the parsed EXIF info to a cache entry - the one place the loader and the tests share. */
export function entryFromInfo(size:number,info:{dateTime?:string;camera?:string;width?:number;height?:number;lens?:string;exposure?:string;aperture?:string;iso?:number;focalLength?:string}):CaptureEntry{
 return{t:parseExifDate(info.dateTime),s:size,cam:info.camera??null,w:info.width??null,h:info.height??null,lens:info.lens??null,exp:info.exposure??null,ap:info.aperture??null,iso:info.iso??null,fl:info.focalLength??null};
}
/** The exposure scan line photographers read: shutter, aperture, ISO, focal length - only the parts present. */
export function exposureLine(e:CaptureEntry):string{
 return[e.exp,e.ap,e.iso!=null?`ISO ${e.iso}`:null,e.fl].filter(Boolean).join(' · ');
}
const inFlight=new Set<string>();
let running=0;
const queue:(()=>Promise<void>)[]=[];
const pump=()=>{
 while(running<CONCURRENCY&&queue.length){
  const job=queue.shift()!;
  running++;
  void job().finally(()=>{running--;pump();});
 }
};
/** Load the capture dates of every photo without a valid cache entry; bounded concurrency, failures resolve as undated so the completeness gate always settles. */
export function ensureCaptureDates(items:readonly {name:string;size:number;url:string;mime:string}[]){
 for(const it of items){
  if(!it.name||inFlight.has(it.name)||getCaptureEntry(it.name,it.size))continue;
  inFlight.add(it.name);
  queue.push(async()=>{
   let e:CaptureEntry={t:null,s:it.size,cam:null,w:null,h:null,lens:null,exp:null,ap:null,iso:null,fl:null};
   try{e=entryFromInfo(it.size,readPhotoInfo(it.mime,await(await fetch(it.url)).arrayBuffer()));}catch{/* unresolved */}
   inFlight.delete(it.name);
   state={...state,[it.name]:e};persist();notify();
  });
 }
 pump();
}
/** Every distinct camera in the cache, sorted - the camera filter's options. */
/** Every distinct ISO in the cache, ascending - the ISO filter's options. */
export const allIsos=():number[]=>[...new Set(Object.values(state).map(e=>e.iso).filter((i):i is number=>typeof i==='number'))].sort((a,b)=>a-b);
/** Every distinct focal length in the cache ('35 mm'), ascending by millimetres - the focal-length filter's options. */
export const allFocalLengths=():string[]=>[...new Set(Object.values(state).map(e=>e.fl).filter((f):f is string=>!!f))].sort((a,b)=>parseFloat(a)-parseFloat(b));
export const allCameras=():string[]=>[...new Set(Object.values(state).map(e=>e.cam).filter((c):c is string=>!!c))].sort((a,b)=>a.localeCompare(b));
/** The duplicate key: byte size plus pixel dimensions. A heuristic, not a content hash - documented as candidates. */
export const duplicateKey=(e:CaptureEntry):string|null=>e.w&&e.h?`${e.s}:${e.w}x${e.h}`:null;
export const subscribeCaptureDates=(fn:()=>void)=>{subs.add(fn);return()=>{subs.delete(fn);};};
export const useCaptureDates=()=>useSyncExternalStore(subscribeCaptureDates,()=>state,()=>state);
