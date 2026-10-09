/** Bridge between the native AI layer and the Sound Studio session store: settings as text, reviewed apply, guarded undo. */
import {getSoundSession,subscribeSound,updateSoundSettings} from '../sound/session';
import {findMedia,getMedia} from '../media';
import {parseSound,serializeSound} from './soundStudio';
const applied=new Map<string,{origin:string;before:string;after:string}[]>();
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
export function applySound(path:string,text:string,origin:string):void{
 const e=assertSound(path);const next=parseSound(text,e.session.plugins,e.session.original!.report.input.duration_s);
 const after=serializeSound(next);
 const stack=applied.get(path)??[];stack.push({origin,before:e.text,after});applied.set(path,stack);
 updateSoundSettings(path,()=>next);
}
/** Undo only when this transaction is the newest AI change and nothing was edited since. Never restores over later edits. */
export function undoSound(path:string,origin:string):void{
 const e=assertSound(path),stack=applied.get(path)??[],head=stack.at(-1);
 if(!head||head.origin!==origin)throw Error('A later change exists. Undo it first.');
 if(e.text!==head.after)throw Error('The settings changed after this AI edit. Not restoring over your edits.');
 stack.pop();updateSoundSettings(path,()=>parseSound(head.before));
}
export const forgetSound=(path:string)=>{applied.delete(path);};
