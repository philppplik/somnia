import {parsePhotoSettings} from './photoStudio';
export interface PhotoDevelopChange {id:'exposure'|'contrast'|'saturation';before:string;after:string}
/** Settings-only review. Never reports a pixel preview it did not render. */
export function diffPhotoDevelop(beforeText:string,afterText:string):PhotoDevelopChange[]{const a=parsePhotoSettings(beforeText),b=parsePhotoSettings(afterText);return (['exposure','contrast','saturation'] as const).filter(id=>a[id]!==b[id]).map(id=>({id,before:String(a[id]),after:String(b[id])}));}
