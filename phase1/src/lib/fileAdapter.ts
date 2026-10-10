import {folderNameFor} from './folderName';
import {trackNativeDrop,consumeNativeChatDrop,consumeNativeConvertDrop} from './collab/nativeChatDrop';
import {installHoldBackend,isAgentAutosaveHeld,releaseAgentAutosave,clearAgentAutosaveHolds,heldAgentPaths} from './agent/autosaveHold';
import {setCloseHandlers,requestClose} from './closeFlow';
import {EditorProject} from '@somnia/editor-core';
import {connectEditorProject,getState,markFileSaved,patchState,refreshProject} from '../store/appStore';
import {registerCommand,executeNativeMenuCommand} from './commands';
import {setSaveHandlers} from './saveFlow';
import {addTextFiles,closeMemoryProject,openIncoming} from './projectActions';
import {clearDraft} from './draftSession';
import {downloadProject} from './exportProject';
import {loadFolderMedia} from './folderMedia';
import {readProjectDocuments} from './projectIndex';
import {setVersionsSession} from './versionsSession';
import {attachProjectSettings,detachProjectSettings} from './projectSettingsIO';
/** Starts the native open-request intake (D2-E orchestrator). Installed by the app bootstrap; absent in the web build. Returns its cleanup. */
export type IntakeStarter=(port:FilePort)=>Promise<()=>void>;
let intakeStarter:IntakeStarter|null=null;
export const installIntakeStarter=(fn:IntakeStarter|null)=>{intakeStarter=fn;};
export type Revision={exists:boolean;hash:string|null};
export type FileEvent={projectId:string;path:string;clientRevision:number;state:'dirty'|'saving'|'saved'|'error'|'conflict';diskRevision:Revision;error:string|null;durability:string|null};
export type Read={content:string|null;revision:Revision;status:FileEvent};
export type Recovery={path:string;content:string;clientRevision:number};
/** Storage backend for the shared save/recovery/conflict adapter. Desktop implements it over Tauri commands, the web over the File System Access API (ADR-002). Command names and payloads follow NATIVE-CONTRACT.md. */
export interface FilePort{
 invoke<T>(command:string,args?:Record<string,unknown>):Promise<T>;
 listen<T>(event:string,handler:(event:{payload:T})=>void):Promise<()=>void>;
 /** Desktop shell only: native menu events and window-close handling. */
 shell?:{closeWindow():Promise<void>;destroyWindow():Promise<void>};
 /** Shown after a folder connects. Desktop autosaves in the native core, the web saves on Ctrl+S. */
 connectNotice?:string;
 /** True when saving never reaches disk (ZIP working copy). The status bar then shows it as not on disk. */
 volatile?:boolean;
 /** Web only: the port remembers the last folder handle and can ask the browser to re-grant access after a reload. */
 canReconnect?:boolean;
}
export async function installFileAdapter(port:FilePort){

 let projectId:string|null=null,model:EditorProject|null=null,disconnect:()=>void=()=>{},unsubscribe:()=>void=()=>{},queue:Promise<void>=Promise.resolve(),counter=0;
 let pendingWork=0,suppressStage=false;const restoreHeld=new Set<string>();
 let baselines=new Map<string,Revision>(),current=new Map<string,number>(),staged=new Map<string,{revision:number;content:string}>(),saved=new Map<string,string>();
 const fail=(error:unknown)=>patchState({notice:`Disk operation failed: ${error instanceof Error?error.message:typeof error==='string'?error:JSON.stringify(error)}. Edits remain unsaved.`});
 const handle=async(event:FileEvent)=>{
  if(event.projectId!==projectId||!model)return;
  if(event.state==='conflict'||event.state==='error'){patchState({notice:`${event.path}: ${event.error||event.state}. Compare disk and editor before retrying.`});return;}
  if(event.state==='saved'){
   const pending=staged.get(event.path);
   if(pending&&pending.revision===event.clientRevision){saved.set(event.path,pending.content);baselines.set(event.path,event.diskRevision);if(current.get(event.path)===event.clientRevision&&model.files[event.path]===pending.content){markFileSaved(event.path,pending.content);staged.delete(event.path);}return;}
   if(!pending&&JSON.stringify(event.diskRevision)!==JSON.stringify(baselines.get(event.path))&&model.files[event.path]===saved.get(event.path)){
    const read=await port.invoke<Read>('read_file',{projectId,path:event.path});if(read.content===null){patchState({notice:`${event.path} was removed on disk. Review before changing the project.`});return;}
    if(model.files[event.path]!==saved.get(event.path))return;baselines.set(event.path,read.revision);saved.set(event.path,read.content);model.transact({origin:'internal',operations:[{type:'replaceSource',file:event.path,text:read.content}]});refreshProject();markFileSaved(event.path,read.content);patchState({notice:`Reloaded external disk change: ${event.path}`});
   }
  }
 };
 /** File removed or renamed in the editor: delete it on disk only if the disk still matches what the editor last saw. */
 const enqueueDelete=(path:string)=>{current.set(path,++counter);queue=queue.then(async()=>{if(!projectId)return;
  let base=baselines.get(path);if(!base){const read=await port.invoke<Read>('read_file',{projectId,path});base=read.revision;}
  await port.invoke('delete_file',{projectId,path,expectedRevision:base});
  baselines.set(path,{exists:false,hash:null} as Revision);saved.delete(path);staged.delete(path);
  patchState({notice:`Deleted ${path} on disk. Undo restores it on the next autosave.`});
 }).catch(fail);};
 const enqueueStage=(files:Record<string,string>,explicit=false)=>{
  for(const [path,content] of Object.entries(files)){const revision=++counter;current.set(path,revision);pendingWork++;queue=queue.then(async()=>{if(!projectId||(!explicit&&(isAgentAutosaveHeld(path)||restoreHeld.has(path))))return;if(!baselines.has(path)){const read=await port.invoke<Read>('read_file',{projectId,path});baselines.set(path,read.revision);}
   // Capture exact accepted snapshot. Do not clear dirty if journaling rejects.
   const event=await port.invoke<FileEvent>('stage_edit',{projectId,path,content,clientRevision:revision});staged.set(path,{revision,content});await handle(event);
  }).catch(fail).finally(()=>{pendingWork--;});}
 };
 const save=async()=>{

  await queue;if(!projectId||!model)return;
  const changes:Record<string,string>={};for(const [path,content] of Object.entries(model.files))if(content!==saved.get(path)&&staged.get(path)?.content!==content)changes[path]=content;
  enqueueStage(changes,true);await queue;
  for(const path of Object.keys(model.files)){
   if(model.files[path]===saved.get(path))continue;
   if(staged.get(path)?.content!==model.files[path])throw Error(`Latest edits for ${path} were not journaled. Save stopped; retry after fixing the journal error.`);
   const snapshot=staged.get(path)!;const event=await port.invoke<FileEvent>('save_file',{projectId,path,expectedRevision:baselines.get(path)});await handle(event);
   if(event.state==='saved'){releaseAgentAutosave(path);restoreHeld.delete(path);}
   if(event.clientRevision!==snapshot.revision)throw Error(`Save revision changed for ${path}. Review unsaved edits.`);
  }
 };
 const close=async(keepRecovery:boolean)=>{if(heldAgentPaths().length&&getState().isDirty&&!window.confirm('Applied AI changes are only in editor memory and are not in disk recovery. Discard these unsaved changes and close the project?'))throw Error('Close cancelled. Save the applied AI changes first, or explicitly discard them.');await queue;if(projectId)await port.invoke('close_project',{projectId,keepRecovery});unsubscribe();disconnect();detachProjectSettings();projectId=null;model=null;restoreHeld.clear();setVersionsSession(null);clearAgentAutosaveHolds();patchState({nativeConnected:false,storage:'memory',diskComparison:null});};
 const attach=async(selected:{projectId:string;name:string},files:Record<string,string>,nextBaselines:Map<string,Revision>,candidate?:EditorProject)=>{
  clearAgentAutosaveHolds();restoreHeld.clear();projectId=selected.projectId;counter=0;baselines=nextBaselines;current=new Map();staged=new Map();saved=new Map(Object.entries(files));
  model=candidate??new EditorProject(files);disconnect=connectEditorProject(model,{name:selected.name,alreadySaved:true});
  unsubscribe=model.subscribe('internal',tx=>{if(suppressStage)return;const changes:Record<string,string>={};const removed:string[]=[];for(const path of tx.changedFiles)if(model&&path in model.files)changes[path]=model.files[path];else removed.push(path);enqueueStage(changes);removed.forEach(enqueueDelete);});
  {const pid=selected.projectId;await attachProjectSettings({read:()=>port.invoke<string|null>('read_project_settings',{projectId:pid}),write:async content=>{await port.invoke('write_project_settings',{projectId:pid,content});}});}
  patchState({nativeConnected:true,storage:port.volatile?'tab':'disk',notice:port.connectNotice??'Folder connected. Native autosave after 1s idle / 5s continuous edits.'});
   {const pid=selected.projectId;setVersionsSession({projectId:pid,port,nextRevision:()=>++counter,
   hasUnsavedBuffers:()=>pendingWork>0||restoreHeld.size>0||(!!model&&Object.entries(model.files).some(([f,c])=>c!==saved.get(f))),
   settle:async()=>{await queue;},
   applyRecoveryRestore:async(path,content,event)=>{
    if(projectId!==pid||!model)throw Error('The project changed. Reopen History for this project.');
    if(!(path in model.files))throw Error('Recovery path is not in the opened model. Use a project containing this file.');
    restoreHeld.add(path);current.set(path,event.clientRevision);staged.set(path,{revision:event.clientRevision,content});
    suppressStage=true;try{model.transact({origin:'internal',operations:[{type:'replaceSource',file:path,text:content}]});}finally{suppressStage=false;}
    refreshProject();await handle(event);},
   reloadFromDisk:async()=>{
    await queue;if(projectId!==pid||!model)throw Error('The project changed. Reopen History for this project.');
    const changed:string[]=[];const onDisk=new Set(await port.invoke<string[]>('list_files',{projectId:pid}));
    for(const path of Object.keys(model.files)){if(!onDisk.has(path))continue;
     const read=await port.invoke<Read>('read_file',{projectId:pid,path});if(read.content===null||read.content===model.files[path]){if(read.content!==null)baselines.set(path,read.revision);continue;}
     suppressStage=true;try{model.transact({origin:'internal',operations:[{type:'replaceSource',file:path,text:read.content}]});}finally{suppressStage=false;}
     baselines.set(path,read.revision);saved.set(path,read.content);staged.delete(path);markFileSaved(path,read.content);changed.push(path);}
    if(changed.length)refreshProject();
    const added=[...onDisk].filter(f=>!(f in model!.files)),removed=Object.keys(model.files).filter(f=>!onDisk.has(f));
    return{changed,note:added.length||removed.length?`${added.length} added and ${removed.length} removed file(s) on disk are not mirrored into the open editor. Reopen the project to see them.`:undefined};}});}
 const recoveries=await port.invoke<Recovery[]>('recovery_list',{projectId});for(const recovery of recoveries){registerCommand({id:`recovery.restore.${recovery.path}`,title:`Restore recovery: ${recovery.path}`,category:'Project',enabled:()=>!!projectId,run:async()=>{if(!window.confirm(`Restore recovery for ${recovery.path}? The recovered file enters native autosave immediately. Conflicting disk changes stop saving.`))return;const r=await port.invoke<Recovery>('recovery_read',{projectId,path:recovery.path});if(!(r.path in model!.files))throw Error('Recovery path is not in the opened model. Use a project containing this file.');const revision=++counter;const event=await port.invoke<FileEvent>('recovery_restore',{projectId,path:r.path,clientRevision:revision});current.set(r.path,revision);staged.set(r.path,{revision,content:r.content});model!.transact({origin:'internal',operations:[{type:'replaceSource',file:r.path,text:r.content}]});refreshProject();await handle(event);patchState({notice:`Restored ${r.path} from recovery. Native autosave is active; conflicting disk changes are held.`});}});}
  for(const recovery of recoveries)registerCommand({id:`recovery.discard.${recovery.path}`,title:`Discard recovery: ${recovery.path}`,category:'Project',enabled:()=>!!projectId,run:async()=>{if(window.confirm(`Permanently discard the recovery snapshot for ${recovery.path}?`))await port.invoke('recovery_discard',{projectId,path:recovery.path});}});
  if(recoveries.length)patchState({notice:`${recoveries.length} recovery snapshots available. Open Commands and choose Restore recovery. Nothing restored automatically.`});
 };
 let opening=false;
 const open=async(reconnect=false,single=false,dropToken?:string,preselected?:{projectId:string;name:string}|null)=>{
  if(opening)throw Error('Another project is opening. Wait, then drop again.');
  opening=true;try{
  const startRevision=getState().revision,startFiles=getState().files;
  if(projectId&&getState().isDirty&&!window.confirm('Keep unsaved edits in recovery and open another folder?'))return;
  if(!projectId&&getState().isDirty&&!window.confirm('Replace the in-memory project? It cannot be recovered from disk.'))return;
  // Keep the current project alive until the picker and all candidate reads succeed.
  const selected=preselected!==undefined?preselected:await port.invoke<{projectId:string;name:string}|null>(dropToken?'open_dropped_project':single?'choose_file':'choose_project',dropToken?{token:dropToken}:reconnect?{reconnect:true}:undefined);if(!selected)return;
  const files:Record<string,string>={},nextBaselines=new Map<string,Revision>();let candidate:EditorProject;let mediaPaths:string[]=[];
  try{
   const paths=await port.invoke<string[]>('list_files',{projectId:selected.projectId});
   mediaPaths=paths.filter(p=>/\.(png|jpe?g|pdf)$/i.test(p));
   const documents=await readProjectDocuments(paths,path=>port.invoke<Read>('read_file',{projectId:selected.projectId,path}));
   for(const {path,content,revision} of documents){if(content!==null)files[path]=content;nextBaselines.set(path,revision);}
   // Parse once before disconnecting. Reuse this validated model on attach.
   candidate=new EditorProject(files);
   if(getState().revision!==startRevision||getState().files!==startFiles)throw Error('The current project changed while opening. Try again so no edits are lost.');
   if(projectId)await close(true);
  }catch(error){await port.invoke('close_project',{projectId:selected.projectId,keepRecovery:true}).catch(()=>{});throw error;}
  await attach(selected,files,nextBaselines,candidate);
  if(mediaPaths.length){const r=await loadFolderMedia((c,a)=>port.invoke(c,a),selected.projectId,mediaPaths);if(r.notice)patchState({notice:r.notice});}
  }finally{opening=false;}
 };
 /** Memory project (Starter, new): choose a folder, write every file into it, then continue as a normal disk project. Never overwrites existing files. */
 const saveToFolder=async(newFolder=false)=>{
  const files={...getState().files};const paths=Object.keys(files);if(!paths.length)throw Error('There is nothing to save yet.');
  const selected=await port.invoke<{projectId:string;name:string}|null>('choose_project',newFolder?{createSubfolder:folderNameFor(getState().projectName)}:undefined);if(!selected)return false;
  const nextBaselines=new Map<string,Revision>();
  try{
   const existing=new Set(await port.invoke<string[]>('list_files',{projectId:selected.projectId}));const clash=paths.filter(p=>existing.has(p));
   if(clash.length)throw Error(`That folder already contains ${clash.slice(0,3).join(', ')}${clash.length>3?' and more':''}. Pick an empty folder so nothing is overwritten.`);
   let rev=0;for(const path of paths){const read=await port.invoke<Read>('read_file',{projectId:selected.projectId,path});rev+=1;
    await port.invoke<FileEvent>('stage_edit',{projectId:selected.projectId,path,content:files[path],clientRevision:rev});
    const event=await port.invoke<FileEvent>('save_file',{projectId:selected.projectId,path,expectedRevision:read.revision});if(event.state!=='saved')throw Error(`${path}: ${event.error||event.state}`);nextBaselines.set(path,event.diskRevision);}
  }catch(error){await port.invoke('close_project',{projectId:selected.projectId,keepRecovery:false}).catch(()=>{});throw error;}
  clearDraft();await attach(selected,files,nextBaselines);patchState({notice:`Saved ${paths.length} file${paths.length===1?'':'s'} to ${selected.name}. Autosave is on.`});return true;
 };
 /** Export: write a copy of all files into a chosen folder without switching the current project. Never overwrites. */
 const exportToFolder=async(newFolder:boolean)=>{
  const st=getState();const files={...st.files};const paths=Object.keys(files);if(!paths.length)throw Error('There is nothing to export.');
  const selected=await port.invoke<{projectId:string;name:string}|null>('choose_project',newFolder?{createSubfolder:(st.projectName||'somnia-export').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').replace(/[. ]+$/,'').slice(0,80)||'somnia-export'}:undefined);if(!selected)return false;
  try{
   const existing=new Set(await port.invoke<string[]>('list_files',{projectId:selected.projectId}));const clash=paths.filter(p=>existing.has(p));
   if(clash.length)throw Error(`That folder already contains ${clash.slice(0,3).join(', ')}${clash.length>3?' and more':''}. Pick an empty folder so nothing is overwritten.`);
   let rev=0;for(const path of paths){const read=await port.invoke<Read>('read_file',{projectId:selected.projectId,path});rev+=1;
    await port.invoke<FileEvent>('stage_edit',{projectId:selected.projectId,path,content:files[path],clientRevision:rev});
    const event=await port.invoke<FileEvent>('save_file',{projectId:selected.projectId,path,expectedRevision:read.revision});if(event.state!=='saved')throw Error(`${path}: ${event.error||event.state}`);}
  }finally{await port.invoke('close_project',{projectId:selected.projectId,keepRecovery:false}).catch(()=>{});}
  patchState({notice:`Exported ${paths.length} file${paths.length===1?'':'s'} to ${selected.name}.`});return true;
 };
 setSaveHandlers({choose:saveToFolder,exportFolder:exportToFolder,download:()=>{const f=getState();downloadProject(f.files,f.projectName||'somnia-project');patchState({saveDialog:null,notice:'Downloaded a ZIP of the project.'});}});
 const saveCommand=async()=>{
  if(projectId)return save();
  const st=getState();
  if(port.volatile){downloadProject(st.files,st.projectName||'somnia-project');patchState({notice:'Downloaded a ZIP of the project. Browser tabs cannot write into a folder for ZIP projects.'});return;}
  patchState({saveDialog:{error:null,busy:false}});
 };
 const compare=async()=>{await queue;if(!projectId||!model)return;const path=getState().activeFile;const read=await port.invoke<Read>('read_file',{projectId,path});if(read.content===null)throw Error('The disk file is missing. This alpha cannot resolve disk deletion through merge.');const id=projectId;const openedModel=model;const reviewedEditor=model.files[path];patchState({diskComparison:{path,disk:read.content,editor:reviewedEditor,apply:async(content)=>{if(projectId!==id||model!==openedModel)throw Error('The project changed during comparison.');await queue;if(model!.files[path]!==reviewedEditor)throw Error('Editor changed after comparison opened. Reopen comparison before saving.');const revision=++counter;current.set(path,revision);const event=await port.invoke<FileEvent>('stage_edit',{projectId,path,content,clientRevision:revision});staged.set(path,{revision,content});model!.transact({origin:'internal',operations:[{type:'replaceSource',file:path,text:content}]});refreshProject();await handle(event);const savedEvent=await port.invoke<FileEvent>('save_file',{projectId,path,expectedRevision:read.revision});await handle(savedEvent);if(savedEvent.state!=='saved')throw Error(savedEvent.error||'Reviewed save was not accepted. Edits remain unsaved.');patchState({diskComparison:null});}}});};
 const cleanups=[installHoldBackend(async paths=>{await queue;if(projectId&&port.shell)await port.invoke('hold_autosave',{projectId,paths});else if(projectId)for(const path of paths)await port.invoke('read_file',{projectId,path});}),registerCommand({id:'project.compare',title:'Resolve conflict: compare active file with disk',category:'Tools',enabled:()=>!!projectId,run:compare}),registerCommand({id:'project.open',title:'Open folder',category:'Project',shortcut:'Mod+O',run:()=>open()}),...(port.shell?[registerCommand({id:'project.openFile',title:'Open file',category:'Project',keywords:['open','file','single'],run:()=>open(false,true)})]:[]),...(port.canReconnect?[registerCommand({id:'project.reconnect',title:'Reconnect last folder',category:'Project',keywords:['reload','permission','folder'],run:()=>open(true)})]:[]),registerCommand({id:'project.save',title:'Save project',category:'Project',shortcut:'Mod+S',allowInInput:true,enabled:()=>true,run:saveCommand}),registerCommand({id:'project.close',title:'Close project',category:'Project',enabled:()=>!!projectId||getState().coreConnected,run:()=>{if(projectId)return close(true);if(getState().isDirty)patchState({closeProjectPrompt:true});else closeMemoryProject();}})];
 cleanups.push(await port.listen<FileEvent>('somnia://file-state',event=>{void handle(event.payload).catch(fail);}));
 if(port.shell)cleanups.push(await port.listen<{token:string;count:number;media?:boolean;position?:[number,number]}>('somnia://os-drop',event=>{
  const {token,count,media,position}=event.payload;
  if(position)trackNativeDrop('drop',{x:position[0],y:position[1]});
  if(consumeNativeConvertDrop()){void port.invoke<{name:string;text:string;base64?:string}[]>('read_dropped_files',{token,chat:true}).then(files=>{const list=files.map(f=>new File([f.base64===undefined?new TextEncoder().encode(f.text):Uint8Array.from(atob(f.base64),c=>c.charCodeAt(0))],f.name));window.dispatchEvent(new CustomEvent('somnia:convert-drop',{detail:list}));}).catch(fail);return;}
  if(consumeNativeChatDrop()){void port.invoke<{name:string;text:string;base64?:string}[]>('read_dropped_files',{token,chat:true}).then(files=>{const attachments=files.map(f=>new File([f.base64===undefined?new TextEncoder().encode(f.text):Uint8Array.from(atob(f.base64),c=>c.charCodeAt(0))],f.name));window.dispatchEvent(new CustomEvent('somnia:chat-drop',{detail:attachments}));}).catch(fail);return;}
  if(count===1&&!media)void open(false,false,token).catch(fail);
  else if(opening)fail('Another project is opening. Wait, then drop again.');
  else void port.invoke<{name:string;text:string;base64?:string}[]>('read_dropped_files',{token}).then(files=>openIncoming(files.map(f=>f.base64===undefined?{name:f.name,text:f.text}:{name:f.name,text:'',blob:new Blob([Uint8Array.from(atob(f.base64),c=>c.charCodeAt(0))])}))).catch(fail);
 }));
 if(port.shell)cleanups.push(await port.listen<string>('somnia://menu',event=>{void executeNativeMenuCommand(event.payload);}));
 // File association launch / second-instance opens: the host queues them (cold argv and warm opens take the same path) and the
 // intake orchestrator (installed via installIntakeStarter) drains the queue through the normal #166 open pipeline.
 // Failures are surfaced, never swallowed: an empty queue is the only silent result.
 if(port.shell&&intakeStarter)cleanups.push(await intakeStarter(port).catch(error=>{fail(error);return()=>{};}));
 // consumes it Rust-side (the renderer never supplies the path) and the normal open pipeline runs.
 if(port.shell)void port.invoke<{projectId:string;name:string}|null>('open_startup_file').then(sel=>{if(sel)return open(false,false,undefined,sel);}).catch(()=>{/* no startup file or already consumed */});
 if(port.shell){const shell=port.shell;setCloseHandlers('disk',{saveAndClose:async()=>{await save();if(getState().isDirty)throw Error('Some edits are still unsaved. Close was cancelled.');await close(false);await shell.destroyWindow();},discardAndClose:async()=>{await close(true);await shell.destroyWindow();}});cleanups.push(()=>setCloseHandlers('disk',null));cleanups.push(await port.listen('somnia://close-blocked',()=>requestClose('disk')));}
 return ()=>{cleanups.forEach(fn=>fn());unsubscribe();disconnect();};
}
