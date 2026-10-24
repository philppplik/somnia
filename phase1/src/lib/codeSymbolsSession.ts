import {useSyncExternalStore} from 'react';
import {getActiveEditor} from './editorBridge';import {getCodeEditorHost} from './codeEditorHost';import {collectCodeSymbols,type CodeSymbol} from './codeSymbols';
function capture(){const host=getCodeEditorHost(),view=getActiveEditor(),s=host.read();if(!view?.dom.isConnected||s.activeStudio!=='code'||!s.coreConnected||view.state.doc.toString()!==s.files[s.activeFile])return null;return {host,view,file:s.activeFile,raw:view.state.doc.toString(),generation:host.generation()};}
export type CodeSymbolsTarget=ReturnType<typeof capture>;
let state:{open:boolean;target:CodeSymbolsTarget;result:ReturnType<typeof collectCodeSymbols>|null}={open:false,target:null,result:null};const listeners=new Set<()=>void>();
export function openCodeSymbols(){const target=capture();state={open:true,target,result:target?collectCodeSymbols(target.file,target.raw):null};listeners.forEach(f=>f());}
export function closeCodeSymbols(){state={open:false,target:null,result:null};listeners.forEach(f=>f());}
export const useCodeSymbols=()=>useSyncExternalStore(f=>{listeners.add(f);return()=>{listeners.delete(f);};},()=>state);
export function revealCodeSymbol(target:CodeSymbolsTarget,symbol:CodeSymbol){
 const current=capture();if(!target||!current||current.host!==target.host||current.view!==target.view||current.generation!==target.generation||current.file!==target.file||current.raw!==target.raw)return false;
 // Do not allow a stale/forged row to become an arbitrary jump.
 const result=collectCodeSymbols(target.file,target.raw);if(result.status!=='ready'||!result.symbols.some(s=>JSON.stringify(s)===JSON.stringify(symbol)))return false;
 return target.host.reveal(target.file,{from:symbol.from,to:symbol.to,raw:target.raw});
}
