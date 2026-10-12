/** Project > Save all files / Close all files, across studios. */
import {patchState} from '../store/appStore';
import {t} from './i18n';
import {dirtyDocs,openDocCount,saveAllDocs,closeAllDocs,discardAndCloseAll} from './workDocs';
import {installWorkProviders} from './workDocsProviders';
installWorkProviders();
export const canSaveAll=()=>dirtyDocs().length>0;
export const canCloseAll=()=>openDocCount()>0;
let running=false;
export async function saveAllFiles():Promise<boolean>{
 if(running)return false;running=true;
 try{const r=await saveAllDocs();
  if(!r.saved.length&&!r.failed.length){patchState({notice:t('workdocs.nothingToSave')});return true;}
  if(r.failed.length){patchState({notice:t('workdocs.saveStopped',{saved:r.saved.length,name:r.failed[0].name,open:r.failed.length+r.skipped.length})});return false;}
  patchState({notice:t('workdocs.saved',{count:r.saved.length})});return true;}
 finally{running=false;}}
/** Nothing unsaved: close right away. Otherwise ask first; unsaved changes are never dropped silently. */
export function requestCloseAll(){
 const dirty=dirtyDocs();
 if(!dirty.length){closeAllDocs();patchState({notice:t('workdocs.closed')});return;}
 patchState({closeAllPrompt:dirty});}
export const cancelCloseAll=()=>patchState({closeAllPrompt:null});
export async function resolveCloseAll(choice:'save'|'discard'){
 patchState({closeAllPrompt:null});
 if(choice==='discard'){const left=discardAndCloseAll();patchState({notice:left.length?t('workdocs.closedKept',{count:left.length}):t('workdocs.closed')});return;}
 const ok=await saveAllFiles();
 if(!ok||dirtyDocs().length){patchState({notice:t('workdocs.notClosed')});return;}
 closeAllDocs();patchState({notice:t('workdocs.savedClosed')});}
