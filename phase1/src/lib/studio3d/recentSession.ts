import {idbStore} from './recentStore';
import {readIndex,putRecent,removeRecent,clearRecent,loadRecent,AUTOSAVE_ID,type PutResult} from './recent';
import {patchStudio3D} from './session';
/** Session glue for recent scenes. Everything fails quietly: a browser without storage simply has no recent list. */
export async function refreshRecent():Promise<void>{patchStudio3D({recent:await readIndex(idbStore)});}
export async function rememberScene(name:string,text:string,auto:boolean):Promise<PutResult>{
 const r=await putRecent(idbStore,{name,text,auto});
 if(r.ok&&!auto)await removeRecent(idbStore,AUTOSAVE_ID);
 await refreshRecent();return r;
}
export async function forgetAutosave():Promise<void>{await removeRecent(idbStore,AUTOSAVE_ID).catch(()=>undefined);await refreshRecent();}
export async function clearRecentScenes():Promise<void>{await clearRecent(idbStore).catch(()=>undefined);await refreshRecent();}
/** A File ready for the normal open path, or null when the entry is gone. */
export async function recentAsFile(id:string):Promise<File|null>{
 const hit=await loadRecent(idbStore,id);if(!hit)return null;
 const name=/\.som3d$/i.test(hit.entry.name)?hit.entry.name:hit.entry.name+'.som3d';
 return new File([hit.text],name,{type:'application/json'});
}
