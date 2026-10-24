import type {ApplyPlan, ChangeSet, Decisions} from '../agentDiff';
/** R5-C1 projection. Private full session records stay in the engine. */
export type TaskStatus = 'queued'|'preparing'|'running'|'waiting-input'|'review'|'done'|'failed'|'cancelled';
export interface ContentBinding {contentHash:string; treeSha:string; workspaceGeneration:number; headSha:string}
export interface BoardTask {
 schemaVersion:1; taskId:string; repoId:string; worktreeId:string|null; branch:string; baseSha:string; headSha?:string;
 workspaceGeneration:number; allowedRoots:readonly string[]; status:TaskStatus;
 producer:{kind:'builtin'|'external';name:string;version:string;provider:string;model:string};
 title:string; autoCommit:boolean; checkpoint?:boolean;
 verification?:{commands:readonly string[];outcome:'passed'|'failed'|'pending';treeSha:string;contentHash:string;at:string};
 review?:{reviewedTreeSha:string;contentHash:string;decision:'accepted'|'rejected';at:string};
 cost?:{tokens?:number;amount?:number;currency?:string};
}
export interface BoardSnapshot {tasks:readonly BoardTask[]; contents:Readonly<Record<string,ContentBinding|undefined>>}
export interface BoardRequest {taskId:string;repoId:string;worktreeId:string|null;binding:ContentBinding}
export interface ReviewMaterial {binding:ContentBinding;changeSet:ChangeSet;readCurrent:(path:string)=>string|null}
/** All operations revalidate bindings in the engine. Frontend checks are defense in depth, not authority. */
export interface AgentBoardPort {
 getSnapshot():BoardSnapshot; subscribe(listener:()=>void):()=>void;
 guards(task:BoardTask):{unsavedBuffers:readonly string[];activeReviews:readonly string[]};
 cancel(taskId:string):Promise<void>;
 retry(request:BoardRequest):Promise<void>;
 loadReview(request:BoardRequest):Promise<ReviewMaterial>;
 review(request:BoardRequest,plan:ApplyPlan,decisions:Decisions):Promise<void>;
 /** Returns selected, already redacted structured results, never raw transcripts or logs. */
 prepareExport(taskId:string):Promise<unknown>;
 /** Private local save only, no share/upload/git-add. Exact preview bytes are approved by the user. */
 saveExport(taskId:string,reviewedJSON:string):Promise<void>;
}
