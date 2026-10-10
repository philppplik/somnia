import type {EditorProject,Operation} from '../../../../packages/editor-core/src/index';
import {ExtensionError,type EditRequest,type EditResult} from '../contracts/v2/api';
import {validateEdit} from '../broker';
/** Core's monotonic project revision is conservative: unrelated edits also invalidate the snapshot. */
export function projectRevision(project:EditorProject):string{return `project:${project.revision}`;}
/** Synchronous core transactions keep validation, authorization and commit in one JS turn. */
export function createEditorCommit(project:EditorProject,authorize:()=>void):(request:EditRequest,signal:AbortSignal)=>Promise<EditResult> {
 return async(request,signal)=>{
  const clean=validateEdit(request);authorize();if(signal.aborted)throw new ExtensionError('E_CANCELLED','Edit was cancelled.');
  const revision=projectRevision(project);for(const [path,base] of Object.entries(clean.baseRevisions)){
   if(!Object.hasOwn(project.files,path))throw new ExtensionError('E_INVALID_ARGUMENT','Edit file is not in the current project.');
   if(base!==revision)throw new ExtensionError('E_STALE_REVISION','Project changed since the extension read it.');
  }
  // EditorProject.transact validates every operation before publishing and rolls back failed batches.
  // No await can interleave revocation between the authorization check and this commit.
  const tx=project.transact({origin:'external',expectedRevision:project.revision,operations:clean.operations as Operation[]});
  if(!tx)throw new ExtensionError('E_INVALID_ARGUMENT','Edit did not change the project.');
  const revisions:Record<string,string>=Object.create(null);for(const path of tx.changedFiles)revisions[path]=projectRevision(project);
  return {transactionId:tx.id,revisions};
 };
}
