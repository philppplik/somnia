import {invoke,isTauri} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {EditorProject} from '@somnia/editor-core';
import {connectEditorProject,getState,markFileSaved,patchState,refreshProject} from '../store/appStore';
import {registerCommand,executeNativeMenuCommand} from './commands';
type Revision={exists:boolean;hash:string|null};
type FileEvent={projectId:string;path:string;clientRevision:number;state:'dirty'|'saving'|'saved'|'error'|'conflict';diskRevision:Revision;error:string|null;durability:string|null};
type Read={content:string|null;revision:Revision;status:FileEvent};
type Recovery={path:string;content:string;clientRevision:number};
export async function installDesktopAdapter(){
 if(!isTauri())return ()=>{};
 let projectId:string|null=null,model:EditorProject|null=null,disconnect:()=>void=()=>{},unsubscribe:()=>void=()=>{},queue:Promise<void>=Promise.resolve(),counter=0;
 let baselines=new Map<string,Revision>(),current=new Map<string,number>(),staged=new Map<string,{revision:number;content:string}>(),saved=new Map<string,string>();
 const fail=(error:unknown)=>patchState({notice:`Disk operation failed: ${typeof error==='string'?error:JSON.stringify(error)}. Edits remain unsaved.`});
 const handle=async(event:FileEvent)=>{
  if(event.projectId!==projectId||!model)return;
  if(event.state==='conflict'||event.state==='error'){patchState({notice:`${event.path}: ${event.error||event.state}. Compare disk and editor before retrying.`});return;}
  if(event.state==='saved'){
   const pending=staged.get(event.path);
   if(pending&&pending.revision===event.clientRevision){saved.set(event.path,pending.content);baselines.set(event.path,event.diskRevision);if(current.get(event.path)===event.clientRevision&&model.files[event.path]===pending.content){markFileSaved(event.path,pending.content);staged.delete(event.path);}return;}
   if(!pending&&JSON.stringify(event.diskRevision)!==JSON.stringify(baselines.get(event.path))&&model.files[event.path]===saved.get(event.path)){
    const read=await invoke<Read>('read_file',{projectId,path:event.path});if(read.content===null){patchState({notice:`${event.path} was removed on disk. Review before changing the project.`});return;}
    if(model.files[event.path]!==saved.get(event.path))return;baselines.set(event.path,read.revision);saved.set(event.path,read.content);model.transact({origin:'internal',operations:[{type:'replaceSource',file:event.path,text:read.content}]});refreshProject();markFileSaved(event.path,read.content);patchState({notice:`Reloaded external disk change: ${event.path}`});
   }
  }
 };
 const enqueueStage=(files:Record<string,string>)=>{
  for(const [path,content] of Object.entries(files)){const revision=++counter;current.set(path,revision);queue=queue.then(async()=>{if(!projectId)return;if(!baselines.has(path)){const read=await invoke<Read>('read_file',{projectId,path});baselines.set(path,read.revision);}
   // Capture exact accepted snapshot. Do not clear dirty if journaling rejects.
   const event=await invoke<FileEvent>('stage_edit',{projectId,path,content,clientRevision:revision});staged.set(path,{revision,content});await handle(event);
  }).catch(fail);}
 };
 const save=async()=>{await queue;if(!projectId||!model)return;const changes:Record<string,string>={};for(const [path,content] of Object.entries(model.files))if(content!==saved.get(path)&&staged.get(path)?.content!==content)changes[path]=content;enqueueStage(changes);await queue;for(const [path,snapshot] of staged){if(model.files[path]===saved.get(path))continue;if(model.files[path]!==snapshot.content){enqueueStage({[path]:model.files[path]});await queue;}const event=await invoke<FileEvent>('save_file',{projectId,path,expectedRevision:baselines.get(path)});await handle(event);}};
 const close=async(keepRecovery:boolean)=>{await queue;if(projectId)await invoke('close_project',{projectId,keepRecovery});unsubscribe();disconnect();projectId=null;model=null;};
 const open=async()=>{
  if(projectId){if(getState().isDirty&&!window.confirm('Keep unsaved edits in recovery and open another folder?'))return;await close(true);}
  else if(getState().isDirty&&!window.confirm('Replace the in-memory project? It cannot be recovered from disk.'))return;
  const selected=await invoke<{projectId:string;name:string}|null>('choose_project');if(!selected)return;
  projectId=selected.projectId;counter=0;baselines=new Map();current=new Map();staged=new Map();saved=new Map();
  const paths=await invoke<string[]>('list_files',{projectId});const editable=paths.filter(p=>/\.(html?|css|js|json|svg|txt|md)$/i.test(p));if(editable.length>64){await invoke('close_project',{projectId,keepRecovery:true});projectId=null;throw Error('This alpha supports at most 64 text documents. Pick a smaller project folder.');}
  const files:Record<string,string>={};for(const path of editable){const read=await invoke<Read>('read_file',{projectId,path});if(read.content!==null){files[path]=read.content;saved.set(path,read.content);}baselines.set(path,read.revision);}
  model=new EditorProject(files);disconnect=connectEditorProject(model,{name:selected.name,alreadySaved:true});
  unsubscribe=model.subscribe('internal',tx=>{const changes:Record<string,string>={};for(const path of tx.changedFiles)if(model&&path in model.files)changes[path]=model.files[path];else patchState({notice:`${path} removed from model. This alpha does not delete disk files; review the retained file manually.`});enqueueStage(changes);});
  patchState({notice:'Folder connected. Native autosave after 1s idle / 5s continuous edits.'});
  const recoveries=await invoke<Recovery[]>('recovery_list',{projectId});for(const recovery of recoveries){registerCommand({id:`recovery.restore.${recovery.path}`,title:`Restore recovery: ${recovery.path}`,category:'Project',enabled:()=>!!projectId,run:async()=>{if(!window.confirm(`Restore recovery for ${recovery.path}? The recovered file enters native autosave immediately. Conflicting disk changes stop saving.`))return;const r=await invoke<Recovery>('recovery_read',{projectId,path:recovery.path});if(!(r.path in model!.files))throw Error('Recovery path is not in the opened model. Use a project containing this file.');const revision=++counter;const event=await invoke<FileEvent>('recovery_restore',{projectId,path:r.path,clientRevision:revision});current.set(r.path,revision);staged.set(r.path,{revision,content:r.content});model!.transact({origin:'internal',operations:[{type:'replaceSource',file:r.path,text:r.content}]});refreshProject();await handle(event);patchState({notice:`Restored ${r.path} from recovery. Native autosave is active; conflicting disk changes are held.`});}});}
  for(const recovery of recoveries)registerCommand({id:`recovery.discard.${recovery.path}`,title:`Discard recovery: ${recovery.path}`,category:'Project',enabled:()=>!!projectId,run:async()=>{if(window.confirm(`Permanently discard the recovery snapshot for ${recovery.path}?`))await invoke('recovery_discard',{projectId,path:recovery.path});}});
  if(recoveries.length)patchState({notice:`${recoveries.length} recovery snapshots available. Open Commands and choose Restore recovery. Nothing restored automatically.`});
 };
 const cleanups=[registerCommand({id:'project.open',title:'Open folder',category:'Project',shortcut:'Mod+O',run:open}),registerCommand({id:'project.save',title:'Save project',category:'Project',shortcut:'Mod+S',allowInInput:true,enabled:()=>!!projectId,run:save}),registerCommand({id:'project.close',title:'Close folder (keep recovery)',category:'Project',enabled:()=>!!projectId,run:()=>close(true)})];
 cleanups.push(await listen<FileEvent>('somnia://file-state',event=>{void handle(event.payload).catch(fail);}));
 cleanups.push(await listen<string>('somnia://menu',event=>{void executeNativeMenuCommand(event.payload);}));
 cleanups.push(await listen('somnia://close-blocked',()=>{void(async()=>{if(window.confirm('Save edits and close Somnia? Cancel keeps the editor open.')){await save();if(getState().isDirty)throw Error('Some edits are still unsaved. Close was cancelled.');await close(false);await getCurrentWindow().close();}})().catch(fail);}));
 return ()=>{cleanups.forEach(fn=>fn());unsubscribe();disconnect();};
}
