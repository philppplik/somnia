import {parseArrangement} from './arrangement';
export interface SessionSavePort{invoke<T>(command:string,args?:Record<string,unknown>):Promise<T>}
export type SessionSaveOutcome='saved'|'cancelled';
/** Existing project text-file rail, with a fresh explicit folder grant and no overwrite. */
export async function saveSessionToFolder(port:SessionSavePort,text:string,fileName:string):Promise<SessionSaveOutcome>{
 parseArrangement(text);if(!/^[a-zA-Z0-9 _-]+\.somnia-sound\.json$/.test(fileName))throw Error('Invalid session file name');
 const selected=await port.invoke<{projectId:string;name:string}|null>('choose_project');if(!selected)return'cancelled';
 try{
  const existing=await port.invoke<string[]>('list_files',{projectId:selected.projectId});if(existing.includes(fileName))throw Error('Session file already exists. Choose another folder or rename the session.');
  const read=await port.invoke<{revision:{exists:boolean}}>('read_file',{projectId:selected.projectId,path:fileName});if(read.revision.exists)throw Error('Session destination already exists');
  await port.invoke('stage_edit',{projectId:selected.projectId,path:fileName,content:text,clientRevision:1});
  const result=await port.invoke<{state:string;error?:string}>('save_file',{projectId:selected.projectId,path:fileName,expectedRevision:read.revision});if(result.state!=='saved')throw Error(result.error||'Session write was not verified');
  const after=await port.invoke<{content:string|null}>('read_file',{projectId:selected.projectId,path:fileName});if(after.content!==text)throw Error('Session readback did not match');return'saved';
 }finally{await port.invoke('close_project',{projectId:selected.projectId,keepRecovery:false});}
}
