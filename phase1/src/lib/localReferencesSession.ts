import {useSyncExternalStore} from 'react';import {getActiveEditor} from './editorBridge';import {getCodeEditorHost} from './codeEditorHost';import {collectLocalReferences,type LocalReference} from './localReferences';
function capture(){const host=getCodeEditorHost(),view=getActiveEditor(),s=host.read();if(!view?.dom.isConnected||s.activeStudio!=='code'||!s.coreConnected||view.state.doc.toString()!==s.files[s.activeFile])return null;const {from,to}=view.state.selection.main;return {host,view,file:s.activeFile,raw:view.state.doc.toString(),generation:host.generation(),from,to};}
export type LocalReferencesTarget=ReturnType<typeof capture>;
let state:{open:boolean;target:LocalReferencesTarget;result:ReturnType<typeof collectLocalReferences>|null}={open:false,target:null,result:null};const listeners=new Set<()=>void>();
export function openLocalReferences(){const target=capture();state={open:true,target,result:target?collectLocalReferences(target.file,target.raw,target.from,target.to):null};listeners.forEach(f=>f());}
export function closeLocalReferences(){state={open:false,target:null,result:null};listeners.forEach(f=>f());}
export const useLocalReferences=()=>useSyncExternalStore(f=>{listeners.add(f);return()=>{listeners.delete(f);};},()=>state);
export function revealLocalReference(target:LocalReferencesTarget,row:LocalReference){const current=capture();if(!target||!current||current.host!==target.host||current.view!==target.view||current.generation!==target.generation||current.file!==target.file||current.raw!==target.raw)return false;
 const result=collectLocalReferences(target.file,target.raw,target.from,target.to);if(result.status!=='ready'||!result.rows.some(r=>JSON.stringify(r)===JSON.stringify(row)))return false;
 return target.host.reveal(target.file,{from:row.from,to:row.to,raw:target.raw});
}
