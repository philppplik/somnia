import {collabEnabled} from './flag';
import {CollabDoc} from './collabDoc';
/** The active host session for this window. Null while collaboration is off or not started. */
let current:CollabDoc|null=null;
const listeners=new Set<()=>void>();
export const getCollab=()=>current;
export function startHostSession(name='Host',color='#7c5cff'):CollabDoc{
 if(!current){current=new CollabDoc();current.awareness.setLocalStateField('user',{name,color,colorLight:color+'33'});listeners.forEach(f=>f());}
 return current;
}
export function stopSession(){current?.destroy();current=null;listeners.forEach(f=>f());}
export function onSessionChange(f:()=>void){listeners.add(f);return()=>{listeners.delete(f);};}
/** Dev hook for testing while there is no UI: with the flag on, run `__somniaCollab.start()` in the dev console (Ctrl+Shift+I), then `__somniaCollab.text('index.html')` to read the shared text. */
if(typeof window!=='undefined'&&collabEnabled())(window as unknown as {__somniaCollab:unknown}).__somniaCollab={start:startHostSession,stop:stopSession,text:(p:string)=>current?.text(p).toString(),snapshot:()=>current?.snapshot()};
