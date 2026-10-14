import {assertNativeAction,assertNativeReceipt,type NativeActionContract,type NativeActionReceipt} from './nativeRun';
import type {DocumentSnapshot} from './documentCore';
/** Bridge between the native AI layer and the Sound Studio session store: settings as text, reviewed apply, guarded undo. */
import {getSoundSession,subscribeSound,commitSoundSettings,undoSoundSettings,soundSettingsRevision,forgetSoundSettingsHistory} from '../sound/session';
import {findMedia,getMedia} from '../media';
import {parseSound,serializeSound} from './soundStudio';
export function soundRevisionFor(path:string):number {assertSound(path);return soundSettingsRevision(path);}
const active=(path:string)=>{const s=getSoundSession(path);return s&&s.original&&s.status!=='loading'&&findMedia(path)?s:null;};
export const subscribeSounds=subscribeSound;
let revision=0;subscribeSound(()=>{revision++;});
export const soundRevision=()=>revision;
export function getSound(path:string){const s=active(path);return s?{path,text:serializeSound(s.settings),session:s}:null;}
/** Settings text of every open, decoded clip, keyed by media name. Feeds the document registry. */
export function soundFiles(){
 const out:Record<string,string>={};
 for(const m of getMedia().items){if(m.kind!=='audio')continue;const e=getSound(m.name);if(e)out[m.name]=e.text;}
 return out;
}
export function assertSound(path:string){const e=getSound(path);if(!e)throw Error('Audio is no longer open or still loading.');return e;}
const acceptedIdentities=new Map<string,{path:string;identity:string}>();
export function applySound(path:string,text:string,origin:string):void{
 const e=assertSound(path),next=parseSound(text,e.session.plugins,e.session.original!.report.input.duration_s);
 const receipt=commitSoundSettings(path,{settings:e.session.settings,revision:soundSettingsRevision(path)},next,origin);
 if(receipt.outcome==='noop')throw Error('Proposal makes no change.');acceptedIdentities.set(origin,{path,identity:findMedia(path)!.url});
}
/** Host-owned pinned snapshot and exact reviewed ID, never a model-supplied target. */
export function acceptSoundAction(action:NativeActionContract,reviewId:string,after:string,origin:string,snapshot:()=>DocumentSnapshot):NativeActionReceipt{
 const before=snapshot();assertNativeAction(action,before.ref,reviewId);
 if(action.effect!=='edit'||before.ref.adapter!=='sound-settings-v1'||before.ref.studioKind!=='sound')throw Error('Sound settings edit adapter required.');
 const e=assertSound(action.target.path),identity=findMedia(action.target.path)!.url;
 if(e.text!==before.text)throw Error('Sound snapshot no longer matches settings owner.');
 const next=parseSound(after,e.session.plugins,e.session.original!.report.input.duration_s),canonical=serializeSound(next);
 const result=commitSoundSettings(action.target.path,{settings:e.session.settings,revision:soundSettingsRevision(action.target.path)},next,origin);
 if(result.outcome==='applied')acceptedIdentities.set(origin,{path:action.target.path,identity});
 const current=assertSound(action.target.path),readback=current.text===canonical&&findMedia(action.target.path)?.url===identity&&soundSettingsRevision(action.target.path)===result.revision?'verified' as const:'unverified' as const;
 const receipt:NativeActionReceipt={actionId:action.id,target:{...action.target},outcome:readback==='verified'?result.outcome:'unknown',undoEntries:readback==='verified'?result.undoEntries:null,readback};assertNativeReceipt(action,receipt);return receipt;
}
export function undoSound(path:string,origin:string):void{assertSound(path);if(!acceptedIdentities.has(origin))throw Error('A later change exists. Undo it first.');if(acceptedIdentities.get(origin)?.identity!==findMedia(path)?.url)throw Error('Sound source replaced. Not restoring.');undoSoundSettings(path,origin);acceptedIdentities.delete(origin);}
export const forgetSound=(path:string)=>{forgetSoundSettingsHistory(path);for(const [origin,value] of acceptedIdentities)if(value.path===path)acceptedIdentities.delete(origin);};
