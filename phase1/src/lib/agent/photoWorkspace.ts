/** AI Photo uses the mounted RasterEditor resource owner and its real history.
 * No independent decoder, media viewer, pixels in model context, or disk writes. */
import {getState,subscribe} from '../../store/appStore';
import {rasterDirty,rasterSignature,type RasterDocumentState,type RasterSnapshot} from '../../store/rasterState';
import {findMedia} from '../media';
import {ImageEditorRenderer} from '../image-editor/renderer';
import {serializeDocument,parseDocument} from '../image-editor/document';
import type {ImageEditDocument} from '../image-editor/types';
import {DEFAULT_ADJUST_PARAMS} from '../imageedit/adjust';
import {validatePhoto,type PhotoPreview} from './photoStudio';
export interface RasterPhotoPort {
 sourceURL:string; document:ImageEditDocument; renderer:ImageEditorRenderer; state:RasterDocumentState;
 busy:boolean; layered:boolean; selection:boolean;
 commit(next:RasterSnapshot):void; undo():void; saveCopy():Promise<boolean>;
}
type Resolver=(path:string)=>RasterPhotoPort|null;
let resolve:Resolver=()=>null;let revision=0;const listeners=new Set<()=>void>();
const emit=()=>{revision++;listeners.forEach(l=>l());};
export function registerRasterPhotoPort(resolver:Resolver){resolve=resolver;emit();return()=>{if(resolve===resolver){resolve=()=>null;emit();}};}
export function notifyRasterPhotoChange(){emit();}
let previous=getState().rasterDoc;
subscribe(()=>{const next=getState().rasterDoc;if(next!==previous){previous=next;emit();}});
export const subscribePhotos=(l:()=>void)=>{listeners.add(l);return()=>{listeners.delete(l);};};
export const photoRevision=()=>revision;
export function getPhoto(path:string){const port=resolve(path);if(!port||findMedia(path)?.url!==port.sourceURL)return null;return {...port,path,text:serializeDocument(port.document),dirty:rasterDirty(port.state)};}
export function photoFiles(){return Object.fromEntries(Object.keys(getState().rasterDoc).flatMap(path=>{const e=getPhoto(path);return e?[[path,e.text]]:[];}));}
function ready(path:string){const e=assertPhoto(path);if(e.busy)throw Error('Finish the current RasterEditor action first.');if(e.layered)throw Error('AI Photo adjust/filter/crop are not implemented for retained layers or masks. No flattening will be performed.');if(e.selection)throw Error('Clear the active pixel selection before using whole-image AI Photo tools. Selection-scoped edits are not implemented.');validatePhoto(e.text);return e;}
export function assertPhoto(path:string){const e=getPhoto(path);if(!e)throw Error('Raster document is no longer open or still loading.');return e;}
export async function preparePhoto(path:string,signal?:AbortSignal){signal?.throwIfAborted();return ready(path);}
export async function previewPhoto(path:string,after:string,signal:AbortSignal):Promise<PhotoPreview>{
 const e=ready(path),before=e.text,doc=validatePhoto(after),base=parseDocument(before);
 if(JSON.stringify(doc.source)!==JSON.stringify(base.source))throw Error('Photo source identity cannot change.');
 if(doc.operations.length!==base.operations.length+1||JSON.stringify(doc.operations.slice(0,-1))!==JSON.stringify(base.operations))throw Error('Photo tools may only append one native operation.');
 // Same real source/registry; separate render job avoids superseding the viewport.
 const renderer=new ImageEditorRenderer(e.renderer.source,e.renderer.registry);
 try{const b=await renderer.render(base,{signal}),a=await renderer.render(doc,{signal});
  const current=ready(path);if(current.sourceURL!==e.sourceURL||current.text!==before)throw Error('Photo changed during rendering. Refresh preview.');
  return {before:b.canvas.toDataURL('image/png'),after:a.canvas.toDataURL('image/png'),beforeWidth:b.canvas.width,beforeHeight:b.canvas.height,width:a.canvas.width,height:a.canvas.height,operations:doc.operations.slice(-1)};
 }finally{renderer.dispose();}
}
const accepted=new Map<string,{origin:string;before:RasterSnapshot;after:string;pastLength:number;sourceURL:string}>();
export function applyPhoto(path:string,text:string,origin:string,_preview:PhotoPreview){
 const e=ready(path),doc=validatePhoto(text),base=e.document;
 if(JSON.stringify(doc.source)!==JSON.stringify(base.source)||doc.operations.length!==base.operations.length+1||JSON.stringify(doc.operations.slice(0,-1))!==JSON.stringify(base.operations))throw Error('Photo proposal base changed.');
 const before=e.state.now;
 const next:RasterSnapshot={stack:doc.operations,adjust:{...DEFAULT_ADJUST_PARAMS},filter:null};
 e.commit(next);const applied=assertPhoto(path);
 if(applied.text!==text)throw Error('RasterEditor transaction readback failed.');
 accepted.set(path,{origin,before,after:rasterSignature(next),pastLength:applied.state.past.length,sourceURL:e.sourceURL});
}
export function undoPhoto(path:string,origin:string){const e=ready(path),last=accepted.get(path);if(!last||last.origin!==origin||last.sourceURL!==e.sourceURL||rasterSignature(e.state.now)!==last.after||e.state.past.length!==last.pastLength||rasterSignature(e.state.past.at(-1)!)!==rasterSignature(last.before))throw Error('Later Photo edits exist. Request a new restoration preview.');e.undo();accepted.delete(path);}
/** Always explicit PNG save-copy through the RasterEditor host, never overwrite. */
export async function savePhotoCopy(path:string){return ready(path).saveCopy();}
