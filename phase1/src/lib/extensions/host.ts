import {registerCommand} from '../commands';
import {applyOperations,getState,patchState} from '../../store/appStore';
import type {ExtensionManifest} from './types';
/** Declarative host: registers validated contributions as commands. No extension code runs here (see ADR-003, step 3 for the worker sandbox). */
export function activateExtensions(list:ExtensionManifest[]){
 const disposers:Array<()=>void>=[];
 for(const ext of list){
  for(const c of ext.contributes.commands)disposers.push(registerCommand({id:c.id,title:`${c.title} (${ext.name})`,category:c.category,run:()=>{patchState({notice:`${c.title} has no code handler yet. Code extensions arrive with the worker sandbox.`});}}));
  ext.contributes.snippets.forEach((s,i)=>disposers.push(registerCommand({id:`${ext.id}.snippet.${i}`,title:`Snippet: ${s.label} (${ext.name})`,category:'Insert',run:async()=>{
   if(s.language==='html'){const parentId=getState().selectedElementId;if(!parentId)throw Error('Select a source container before inserting a snippet.');applyOperations([{type:'insertHTML',file:getState().designFile,parentId,html:`\n${s.body}\n`}]);patchState({notice:`Inserted snippet ${s.label}.`});}
   else{await navigator.clipboard.writeText(s.body);patchState({notice:`Copied ${s.language.toUpperCase()} snippet ${s.label} to the clipboard.`});}}})));
 }
 return()=>disposers.forEach(d=>d());
}
