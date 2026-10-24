import {useSyncExternalStore} from 'react';import {getCodeEditorHost} from './codeEditorHost';import {getActiveEditor} from './editorBridge';import {rankQuickOpen} from './codeQuickOpen';
function capture(){const host=getCodeEditorHost(),s=host.read();return s.activeStudio==='code'&&s.coreConnected&&host.revealPosition?{host,generation:host.generation(),files:s.files,active:s.activeFile}:null;}
export type QuickOpenTarget=ReturnType<typeof capture>;
let state:{open:boolean;target:QuickOpenTarget}={open:false,target:null};const listeners=new Set<()=>void>();
export function openCodeQuickOpen(){state={open:true,target:capture()};listeners.forEach(f=>f());}
export function closeCodeQuickOpen(){state={open:false,target:null};listeners.forEach(f=>f());}
export const useCodeQuickOpen=()=>useSyncExternalStore(f=>{listeners.add(f);return()=>{listeners.delete(f);};},()=>state);
export function chooseCodeQuickOpen(target:QuickOpenTarget,path:string,query:string){
 if(!target||getCodeEditorHost()!==target.host||target.host.generation()!==target.generation)return false;
 const current=target.host.read();if(!current.coreConnected||current.activeStudio!=='code'||!(path in target.files)||current.files[path]!==target.files[path])return false;
 const view=getActiveEditor();if(view?.dom.isConnected&&view.state.doc.toString()!==current.files[current.activeFile])return false;
 const result=rankQuickOpen(Object.keys(target.files),query,target.active);if(result.status!=='ready'||!result.rows.some(row=>row.path===path))return false;
 return target.host.revealPosition?.(path,{raw:target.files[path],line:result.location.line,column:result.location.column})??false;
}
