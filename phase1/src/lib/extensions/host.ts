import {registerCommandSpec} from '../commandBridge';
import {registerExtensionOpenOffer,setExtensionOpenOfferDispatch} from './openRouter';
import {extensionCommandId} from './commandIds';
import {applyOperations,getState,patchState} from '../../store/appStore';
import type {ExtensionManifest} from './types';
import {ExtensionRuntime,browserWorker} from './runtime';
import {reportError} from '../log';
import {ExtensionIdleSuspender,type IdleSuspendOptions} from './idleSuspend';
/** Opt-in idle suspend wiring (everything of IdleSuspendOptions except create, which host.ts supplies). */
export type ExtensionIdleOptions=Omit<IdleSuspendOptions<ExtensionRuntime>,'create'>;
import {storagePrefix,migrateStorageKeys,countStorageKeys,MAX_STORAGE_KEYS} from './storageKeys';
const NO_PARAMS={type:'object',properties:{},additionalProperties:false} as const;
/** Declarative host: registers validated contributions as commands. No extension code runs here (see ADR-003, step 3 for the worker sandbox). */
export function activateExtensions(list:ExtensionManifest[],idle?:ExtensionIdleOptions){
 const disposers:Array<()=>void>=[];
 let suspender:ExtensionIdleSuspender<ExtensionRuntime>|null=null;
 const themes=list.flatMap(e=>e.contributes.codeThemes.map(t=>({id:`${e.id}.${t.id}`,label:t.label,ext:e,t})));
 const style=document.createElement('style');style.dataset.somniaExtensionThemes='';
 const rule=(sel:string,vars:Record<string,string>)=>`${sel}{${Object.entries(vars).map(([k,v])=>`${k}:${v}`).join(';')}}`;
 style.textContent=themes.map(({id,t})=>rule(`:root[data-code-theme="${id}"]`,t.light)+rule(`:root[data-theme=dark][data-code-theme="${id}"]`,t.dark)).join('\n');
 document.head.appendChild(style);patchState({extensionThemes:themes.map(({id,label})=>({id,label}))});
 const accentPalettes=list.flatMap(e=>e.contributes.accentPalettes.map(p=>({id:`${e.id}.${p.id}`,label:`${p.label} (${e.name})`,light:p.light,dark:p.dark})));
 patchState({extensionAccents:accentPalettes});
 const panels=list.flatMap(e=>e.contributes.panels.map(p=>({id:`${e.id}.${p.id}`,extId:e.id,title:p.title,side:p.side,html:p.html})));
 patchState({extensionPanels:panels});
 disposers.push(()=>{style.remove();patchState({extensionThemes:[],extensionAccents:[],extensionPanels:[],activePanel:{left:null,right:null}});});
 const makers=new Map<string,()=>ExtensionRuntime>();
 if(idle)suspender=new ExtensionIdleSuspender<ExtensionRuntime>({...idle,create:id=>makers.get(id)!()});
 if(suspender){const sp=suspender;sp.start();disposers.push(()=>sp.dispose());}
 for(const ext of list){
  let runtime:ExtensionRuntime|null=null;let hosted=false;
  const make=()=>{const r=new ExtensionRuntime(ext,{files:()=>getState().files as Record<string,string>,applyOperations:ops=>{applyOperations(ops as never);},selection:()=>{const id=getState().selectedElementId;let hit:{id:string;tag:string}|null=null;const walk=(ns:{id:string;tag:string;children:any[]}[])=>ns.forEach(n=>{if(n.id===id)hit={id:n.id,tag:n.tag};walk(n.children);});walk(getState().nodes as never);return hit;},storage:{get:k=>localStorage.getItem(`${storagePrefix(ext.id)}${k}`),set:(k,v)=>{if(localStorage.getItem(`${storagePrefix(ext.id)}${k}`)===null&&countStorageKeys(ext.id,localStorage)>=MAX_STORAGE_KEYS)throw Error(`Storage is limited to ${MAX_STORAGE_KEYS} keys per extension.`);localStorage.setItem(`${storagePrefix(ext.id)}${k}`,v);}},notify:text=>patchState({notice:text}),log:text=>patchState({notice:text})},browserWorker);r.activate();return r;};
  makers.set(ext.id,make);
  if(ext.code){try{migrateStorageKeys(ext.id,localStorage);if(suspender){suspender.register(ext.id);hosted=true;}else runtime=make();}catch(e){runtime=null;hosted=false;reportError('extensions.load',e,{message:`Extension ${ext.name} (${ext.id}) could not be loaded`,notify:`Extension ${ext.name} could not be loaded.`});}if(runtime){const rt=runtime;disposers.push(()=>rt.dispose());}}
  for(const c of ext.contributes.commands)disposers.push(registerCommandSpec({id:extensionCommandId(c.id),title:`${c.title} (${ext.name})`,category:c.category,level:'ui',params:NO_PARAMS,run:async()=>{if(hosted&&suspender){await suspender.run(ext.id,c.id);return;}if(!runtime){patchState({notice:`${c.title} has no code in this extension.`});return;}await runtime.runCommand(c.id);}}));
  for(const o of ext.contributes.openOffers??[]){
   try{
    disposers.push(registerExtensionOpenOffer({id:o.id,extensionId:ext.id,kinds:o.kinds,commandId:o.command,capability:o.capability,priority:o.priority,title:o.title},(eid,cid)=>eid===ext.id&&ext.contributes.commands.some(c=>c.id===cid)));
    disposers.push(setExtensionOpenOfferDispatch(o.id,async args=>{if(hosted&&suspender){await suspender.run(ext.id,o.command,args);return;}if(!runtime)throw new Error(`${o.title} has no code in this extension.`);await runtime.runCommand(o.command,args);}));
   }catch(e){reportError('extensions.openOffer',e,{message:`Open offer ${o.id} (${ext.id}) could not be registered`,notify:`An open offer from ${ext.name} could not be registered.`});}
  }
  ext.contributes.snippets.forEach((s,i)=>disposers.push(registerCommandSpec({id:extensionCommandId(`${ext.id}.snippet.${i}`),title:`Snippet: ${s.label} (${ext.name})`,category:'Insert',level:'ui',params:NO_PARAMS,run:async()=>{
   if(s.language==='html'){const parentId=getState().selectedElementId;if(!parentId)throw Error('Select a source container before inserting a snippet.');applyOperations([{type:'insertHTML',file:getState().designFile,parentId,html:`\n${s.body}\n`}]);patchState({notice:`Inserted snippet ${s.label}.`});}
   else{await navigator.clipboard.writeText(s.body);patchState({notice:`Copied ${s.language.toUpperCase()} snippet ${s.label} to the clipboard.`});}}})));
 }
 return()=>disposers.forEach(d=>d());
}
