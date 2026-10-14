import type {Composition} from './model';
import {exportPlan,type ExportFormat,type ExportSettings} from './exportSettings';
/** Render queue: a bounded list of export jobs captured from the export setup. Pure; running lives in renderQueueRun. Session state, never saved in the document. */
export const MAX_QUEUE=20;
export type JobStatus='pending'|'running'|'done'|'error'|'cancelled';
export interface QueueJob{id:string;comp:string;compName:string;format:ExportFormat;settings:ExportSettings;transparent:boolean;status:JobStatus;message:string;fileName:string}
/** Why a job could not run with these settings (`size`, `frames`, ...), or null when it can. */
export const jobProblem=(comp:Composition,format:ExportFormat,s:ExportSettings):string|null=>exportPlan(comp,format,s).problems[0]??null;
export function addJob(q:readonly QueueJob[],j:Omit<QueueJob,'status'|'message'|'fileName'>):QueueJob[]{
 if(q.length>=MAX_QUEUE)throw new Error(`The queue holds at most ${MAX_QUEUE} jobs.`);
 if(q.some(x=>x.id===j.id))throw new Error('Duplicate job.');
 return [...q,{...j,settings:{...j.settings},status:'pending',message:'',fileName:''}];
}
export const removeJob=(q:readonly QueueJob[],id:string):QueueJob[]=>{const j=q.find(x=>x.id===id);if(!j)throw new Error('No such job.');if(j.status==='running')throw new Error('That job is running.');return q.filter(x=>x.id!==id);};
export const clearFinished=(q:readonly QueueJob[]):QueueJob[]=>q.filter(j=>j.status==='pending'||j.status==='running');
export const nextPending=(q:readonly QueueJob[]):QueueJob|undefined=>q.find(j=>j.status==='pending');
export const markJob=(q:readonly QueueJob[],id:string,patch:Partial<Pick<QueueJob,'status'|'message'|'fileName'>>):QueueJob[]=>q.map(j=>j.id===id?{...j,...patch}:j);
/** Jobs that were cancelled or failed go back to pending so "Render all" can retry them. */
export const requeue=(q:readonly QueueJob[]):QueueJob[]=>q.map(j=>j.status==='error'||j.status==='cancelled'?{...j,status:'pending',message:''}:j);
export const queueSummary=(q:readonly QueueJob[])=>({total:q.length,pending:q.filter(j=>j.status==='pending').length,done:q.filter(j=>j.status==='done').length,failed:q.filter(j=>j.status==='error').length});
