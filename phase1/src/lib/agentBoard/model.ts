import type {BoardRequest, BoardSnapshot, BoardTask, ContentBinding} from './contracts';
export const sameContent=(a:ContentBinding,b:ContentBinding)=>!!a.contentHash&&!!a.treeSha&&!!a.headSha&&a.contentHash===b.contentHash&&a.treeSha===b.treeSha&&a.headSha===b.headSha&&a.workspaceGeneration===b.workspaceGeneration;
export function bindingFor(task:BoardTask,snapshot:BoardSnapshot):ContentBinding|null {
 const b=snapshot.contents[task.taskId];
 return b&&b.contentHash&&b.treeSha&&b.headSha&&b.workspaceGeneration===task.workspaceGeneration&&(!task.headSha||b.headSha===task.headSha)?b:null;
}
export function reviewIsCurrent(task:BoardTask,b:ContentBinding|null):boolean {
 return !!b&&task.review?.decision==='accepted'&&task.review.contentHash===b.contentHash&&task.review.reviewedTreeSha===b.treeSha;
}
export function verificationIsCurrent(task:BoardTask,b:ContentBinding|null):boolean {
 return !!b&&task.verification?.contentHash===b.contentHash&&task.verification.treeSha===b.treeSha;
}
export function requestFor(task:BoardTask,b:ContentBinding):BoardRequest {return{taskId:task.taskId,repoId:task.repoId,worktreeId:task.worktreeId,binding:{...b}};}
export function assertRequest(snapshot:BoardSnapshot,r:BoardRequest):BoardTask {
 const task=snapshot.tasks.find(t=>t.taskId===r.taskId);
 if(!task||task.producer.kind!=='builtin'||task.repoId!==r.repoId||task.worktreeId!==r.worktreeId)throw Error('board.error.stale');
 const current=bindingFor(task,snapshot);if(!current||!sameContent(current,r.binding))throw Error('board.error.stale');
 return task;
}
export function columnFor(status:BoardTask['status']):'queue'|'running'|'review'|'done'|'failed' {
 if(status==='queued'||status==='preparing')return 'queue';
 if(status==='running')return 'running';
 if(status==='review'||status==='waiting-input')return 'review';
 return status==='done'?'done':'failed';
}
