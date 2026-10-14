import {assertNativeAction,assertNativeReceipt,type NativeActionContract,type NativeActionReceipt} from './nativeRun';
import type {DocumentSnapshot} from './documentCore';
/** Reviewed Develop acceptance only. Raster photoWorkspace is intentionally unchanged. */
import {getDevelopSession,subscribeDevelop,developRevision,commitDevelopSettings,developSignature,historyDevelop} from '../photos/session';
import {findMedia,getMedia} from '../media';
import {parsePhotoSettings,serializePhotoSettings} from './photoStudio';
const applied=new Map<string,{origin:string;identity:string;before:string;after:string;revision:number;pastLength:number;beforeRevision:number}[]>();
export const subscribePhotoDevelop=subscribeDevelop;
export const photoDevelopRevision=developRevision;
export function getPhotoDevelop(path:string){const media=findMedia(path);const s=media?getDevelopSession(media.url):null;return media?.kind==='image'&&s?.ready&&s.metadata?{path,text:serializePhotoSettings(s.now),session:s}:null;}
export function photoDevelopFiles(){return Object.fromEntries(getMedia().items.flatMap(m=>{const e=getPhotoDevelop(m.name);return e?[[m.name,e.text]]:[];}));}
export function assertPhotoDevelop(path:string){const e=getPhotoDevelop(path);if(!e)throw Error('Photo Develop is no longer open or still loading.');return e;}
function commitPhotoDevelop(path:string,text:string,origin:string){
 if(!origin.startsWith('ai:'))throw Error('AI origin required.');
 const e=assertPhotoDevelop(path),next=parsePhotoSettings(text),after=serializePhotoSettings(next);
 const beforeRevision=e.session.revision,before=e.text;
 const result=commitDevelopSettings(e.session.identity,{revision:beforeRevision,before:developSignature(e.session.now)},next);
 if(result.outcome==='applied'){
  const stack=applied.get(path)??[];stack.push({origin,identity:e.session.identity,before,after,revision:result.revision,pastLength:e.session.past.length,beforeRevision});applied.set(path,stack);
 }
 return result;
}
/** Compatibility reviewed path; explicit no-op stays rejected without history. */
export function applyPhotoDevelop(path:string,text:string,origin:string){const result=commitPhotoDevelop(path,text,origin);if(result.outcome==='noop')throw Error('Proposal makes no change.');}
/** Pilot builder port. snapshot is host-owned and bound to DocumentRegistry, never model supplied. */
export function acceptPhotoDevelopAction(action:NativeActionContract,reviewId:string,after:string,origin:string,snapshot:()=>DocumentSnapshot):NativeActionReceipt{
 const before=snapshot();assertNativeAction(action,before.ref,reviewId);
 if(action.effect!=='edit'||before.ref.adapter!=='photo-develop-settings-v1'||before.ref.studioKind!=='photo')throw Error('Photo Develop edit adapter required.');
 const session=assertPhotoDevelop(action.target.path);
 if(session.text!==before.text)throw Error('Photo snapshot no longer matches the history owner.');
 const canonical=serializePhotoSettings(parsePhotoSettings(after));
 const result=commitPhotoDevelop(action.target.path,canonical,origin);
 const current=assertPhotoDevelop(action.target.path);
 const readback=current.session.identity===session.session.identity&&current.text===canonical&&current.session.revision===result.revision?'verified' as const:'unverified' as const;
 const receipt:NativeActionReceipt={actionId:action.id,target:{...action.target},outcome:readback==='verified'?result.outcome:'unknown',undoEntries:readback==='verified'?result.undoEntries:null,readback};
 assertNativeReceipt(action,receipt);return receipt;
}
export function undoPhotoDevelop(path:string,origin:string){const e=assertPhotoDevelop(path),stack=applied.get(path)??[],head=stack.at(-1);if(!head||head.origin!==origin||head.identity!==e.session.identity)throw Error('A later AI change or replacement exists.');if(e.text!==head.after||e.session.revision!==head.revision||e.session.past.length!==head.pastLength)throw Error('Manual edits happened after this AI change. Not restoring.');historyDevelop(e.session.identity,false);if(serializePhotoSettings(e.session.now)!==head.before)throw Error('Photo undo readback failed.');stack.pop();const previous=stack.at(-1);if(previous&&previous.identity===e.session.identity&&previous.after===serializePhotoSettings(e.session.now)&&previous.revision===head.beforeRevision){previous.revision=e.session.revision;previous.pastLength=e.session.past.length;}}
export const forgetPhotoDevelop=(path:string)=>{applied.delete(path);};
