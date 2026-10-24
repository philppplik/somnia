/** Photos hidden from the library view (strip, grid, nav) without touching the originals: the media item stays open in the app, so hiding is always undoable. Persisted locally, photos-only. */
import {useSyncExternalStore} from 'react';
const KEY='somnia.photos.hidden.v1';
let state:string[]=[];
try{const d=JSON.parse(globalThis.localStorage?.getItem(KEY)??'null');if(Array.isArray(d))state=d.filter((v):v is string=>typeof v==='string'&&!!v);}catch{/* session only */}
const subs=new Set<()=>void>();
const notify=()=>subs.forEach(f=>f());
function persist(){try{globalThis.localStorage?.setItem(KEY,JSON.stringify(state));}catch{/* session only */}notify();}
export const hiddenPhotos=():readonly string[]=>state;
export const isHidden=(name:string):boolean=>state.includes(name);
/** Hides the names from the library view; already-hidden names are skipped. */
export function hidePhotos(names:readonly string[]){
 const add=[...new Set(names)].filter(n=>n&&!state.includes(n));if(add.length===0)return;
 state=[...state,...add];
 persist();
}
/** Brings every hidden photo back (the undo path). */
export function unhideAll(){if(state.length===0)return;state=[];persist();}
/** Brings specific photos back. */
export function unhidePhotos(names:readonly string[]){
 const drop=new Set(names);if(drop.size===0)return;
 const next=state.filter(n=>!drop.has(n));if(next.length===state.length)return;
 state=next;persist();
}
export const subscribeHidden=(fn:()=>void)=>{subs.add(fn);return()=>{subs.delete(fn);};};
export const useHidden=()=>useSyncExternalStore(subscribeHidden,hiddenPhotos,hiddenPhotos);
