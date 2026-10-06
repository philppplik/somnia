import {EditorProject} from '@somnia/editor-core';
import {applyOperations,closeCore,connectEditorProject,getState,subscribe,openFileTab} from '../../store/appStore';
import type {ProjectPort} from './projectBridge';
/** The real project of this window: reads the store, writes through the editor core (one transaction per file, origin 'external'). */
export const appProject:ProjectPort={
 files:()=>getState().files,
 write(path,text){
  const has=path in getState().files;
  applyOperations([has?{type:'replaceSource',file:path,text}:{type:'createFile',file:path,text}],'external');},
 subscribe:fn=>subscribe(fn),
 adopt(files){
  closeCore();
  connectEditorProject(new EditorProject(files),{name:'Shared project',alreadySaved:true});
  const first=Object.keys(files).find(f=>/\.html?$/i.test(f))??Object.keys(files)[0];
  if(first)openFileTab(first);},
};
/** Can this window join without risking local work? A disk project or unsaved changes would be overwritten or mixed up. */
export function canJoinHere():{ok:true}|{ok:false;reason:'unsaved-project'}{
 const st=getState();
 if(st.coreConnected&&(st.storage!=='memory'||st.nativeConnected||st.isDirty))return{ok:false,reason:'unsaved-project'};
 return{ok:true};}
export function hostFilesReady():boolean{const st=getState();return st.coreConnected&&Object.keys(st.files).length>0;}
