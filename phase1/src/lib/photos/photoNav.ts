import {PHOTO_INPUT} from './studioSettings';
import {hiddenPhotos} from './hidden';
export interface PhotoNavItem{name:string;kind:string;mime:string;}
export interface PhotoNav{prev:string|null;next:string|null;position:number;total:number;}
/** Developable images only (JPEG/PNG etc., no psd), in library order — the set the workspace can open. */
export function developablePhotos<T extends PhotoNavItem>(items:readonly T[]):T[]{
 return items.filter(i=>i.kind==='image'&&(PHOTO_INPUT.mimes as readonly string[]).includes(i.mime));
}
/** Library-order neighbours of the current photo among developable images only (JPEG/PNG etc., no psd, no wrap). */
export function photoNav(items:readonly PhotoNavItem[],currentName:string):PhotoNav{
 const hidden=new Set(hiddenPhotos());
 const photos=developablePhotos(items).filter(i=>!hidden.has(i.name)); // hidden photos leave the library view, originals stay
 const idx=photos.findIndex(i=>i.name===currentName);
 if(idx<0)return{prev:null,next:null,position:0,total:photos.length};
 return{prev:idx>0?photos[idx-1].name:null,next:idx<photos.length-1?photos[idx+1].name:null,position:idx+1,total:photos.length};
}
