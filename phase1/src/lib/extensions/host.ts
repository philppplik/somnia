import {registerCommand} from '../commands';
import {applyOperations,getState,patchState} from '../../store/appStore';
import type {ExtensionManifest} from './types';
import {ExtensionRuntime,browserWorker} from './runtime';
/** Declarative host: registers validated contributions as commands. No extension code runs here (see ADR-003, step 3 for the worker sandbox). */
export function activateExtensions(list:ExtensionManifest[]){
 const disposers:Array<()=>void>=[];
 const themes=list.flatMap(e=>e.contributes.codeThemes.map(t=>({id:`${e.id}.${t.id}`,label:t.label,ext:e,t})));
 const style=document.createElement('style');style.dataset.somniaExtensionThemes='';
 const rule=(sel:string,vars:Record<string,string>)=>`${sel}{${Object.entries(vars).map(([k,v])=>`${k}:${v}`).join(';')}}`;
 style.textContent=themes.map(({id,t})=>rule(`:root[data-code-theme="${id}"]`,t.light)+rule(`:root[data-theme=dark][data-code-theme="${id}"]`,t.dark)).join('\n');
 document.head.appendChild(style);patchState({extensionThemes:themes.map(({id,label})=>({id,label}))});
 disposers.push(()=>{style.remove();patchState({extensionThemes:[]});});
 for(const ext of list){
  let runtime:ExtensionRuntime|null=null;
  if(ext.code){runtime=new ExtensionRuntime(ext,{files:()=>getState().files as Record<string,string>,selection:()=>{const id=getState().selectedElementId;let hit:{id:string;tag:string}|null=null;const walk=(ns:{id:string;tag:string;children:any[]}[])=>ns.forEach(n=>{if(n.id===id)hit={id:n.id,tag:n.tag};walk(n.children);});walk(getState().nodes as never);return hit;},notify:text=>patchState({notice:text}),log:text=>patchState({notice:text})},browserWorker);runtime.activate();const rt=runtime;disposers.push(()=>rt.dispose());}
  for(const c of ext.contributes.commands)disposers.push(registerCommand({id:c.id,title:`${c.title} (${ext.name})`,category:c.category,run:async()=>{if(!runtime){patchState({notice:`${c.title} has no code in this extension.`});return;}await runtime.runCommand(c.id);}}));
  ext.contributes.snippets.forEach((s,i)=>disposers.push(registerCommand({id:`${ext.id}.snippet.${i}`,title:`Snippet: ${s.label} (${ext.name})`,category:'Insert',run:async()=>{
   if(s.language==='html'){const parentId=getState().selectedElementId;if(!parentId)throw Error('Select a source container before inserting a snippet.');applyOperations([{type:'insertHTML',file:getState().designFile,parentId,html:`\n${s.body}\n`}]);patchState({notice:`Inserted snippet ${s.label}.`});}
   else{await navigator.clipboard.writeText(s.body);patchState({notice:`Copied ${s.language.toUpperCase()} snippet ${s.label} to the clipboard.`});}}})));
 }
 return()=>disposers.forEach(d=>d());
}
