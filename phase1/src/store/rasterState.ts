/** Serializable raster intent lives beside text state; decoded pixels stay in the provider. */
import type {ImageOperation} from '../lib/image-editor';
import {DEFAULT_ADJUST_PARAMS,type AdjustParams} from '../lib/imageedit/adjust';
export interface RasterSnapshot {stack:readonly ImageOperation[];adjust:AdjustParams;filter:ImageOperation|null}
export interface RasterDocumentState {now:RasterSnapshot;past:RasterSnapshot[];future:RasterSnapshot[];saved:string;layerDirty?:boolean}
export const emptyRasterSnapshot=():RasterSnapshot=>({stack:[],adjust:{...DEFAULT_ADJUST_PARAMS},filter:null});
export const rasterSignature=(s:RasterSnapshot)=>JSON.stringify(s);
export const createRasterState=():RasterDocumentState=>{const now=emptyRasterSnapshot();return{now,past:[],future:[],saved:rasterSignature(now)};};
export const rasterDirty=(d:RasterDocumentState)=>!!d.layerDirty||rasterSignature(d.now)!==d.saved;
export function rasterCommit(d:RasterDocumentState,now:RasterSnapshot):RasterDocumentState{
 if(rasterSignature(now)===rasterSignature(d.now))return d;
 return {...d,now,past:[...d.past.slice(-99),d.now],future:[]};
}
export function rasterUndo(d:RasterDocumentState):RasterDocumentState{const now=d.past.at(-1);return now?{...d,now,past:d.past.slice(0,-1),future:[d.now,...d.future]}:d;}
export function rasterRedo(d:RasterDocumentState):RasterDocumentState{const now=d.future[0];return now?{...d,now,past:[...d.past,d.now],future:d.future.slice(1)}:d;}
