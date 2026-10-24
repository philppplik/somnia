import type {BoardFacade,BoardSnapshot as EngineSnapshot} from '../agentTask/board';
import type {SessionExport} from '../agentTask/redact';
import {sha256Hex} from '../agentTask/hash';
import {reviewChangeSet} from '../agentDiff';
import type {AgentBoardPort,BoardSnapshot,BoardRequest,ReviewMaterial} from './contracts';
import {assertRequest,sameContent} from './model';
import {exportPreview} from './export';
import {registerAgentBoardPort} from './registry';
/** The host must load the pinned task worktree diff, never current checkout editor bytes. */
export interface BoardReviewLoader {
 load(request:BoardRequest):Promise<ReviewMaterial>;
 guards(taskId:string):{unsavedBuffers:readonly string[];activeReviews:readonly string[]};
}
export function createEngineBoardPort(facade:BoardFacade,loader:BoardReviewLoader):AgentBoardPort {
 let source:EngineSnapshot|null=null,projected:BoardSnapshot={tasks:[],contents:{}};
 const materials=new Map<string,ReviewMaterial>(),exports=new Map<string,{exp:SessionExport;json:string}>();
 const snapshot=()=>{const s=facade.getSnapshot();if(s!==source){source=s;projected={tasks:s.tasks.map(t=>({...t,checkpoint:!!t.checkpoint,producer:{...t.producer,version:t.producer.version??'',provider:t.producer.provider??'',model:t.producer.model??''},verification:t.verification?{...t.verification,outcome:t.verification.outcome==='pass'?'passed':t.verification.outcome==='fail'?'failed':'pending'}:undefined,review:t.review?{...t.review,decision:t.review.decision==='approved'?'accepted':'rejected'}:undefined,cost:{tokens:t.cost.inputTokens+t.cost.outputTokens,amount:t.cost.costUsd,currency:'USD'}})),contents:Object.fromEntries(Object.entries(s.contents).map(([id,c])=>[id,c.headSha?{...c,headSha:c.headSha}:undefined]))};}return projected;};
 const live=async(r:BoardRequest)=>{await facade.refresh();const task=assertRequest(snapshot(),r),g=loader.guards(r.taskId);if(g.unsavedBuffers.length||g.activeReviews.length)throw Error('board.error.guard');return task;};
 return {
  getSnapshot:snapshot,subscribe:facade.subscribe,guards:t=>loader.guards(t.taskId),
  cancel:async id=>{await facade.cancel(id);},
  retry:async r=>{const t=await live(r);const gate=await facade.guard(r.taskId,'prepare','agent',true);if(!gate.ok)throw Error(gate.code==='unsaved-buffer'?'board.error.guard':'board.error.action');await facade.retry(r.taskId,t.baseSha);},
  loadReview:async r=>{await live(r);const m=await loader.load(r);await live(r);if(!sameContent(m.binding,r.binding)||!m.changeSet.complete)throw Error('board.error.stale');const pinned={...m,binding:{...m.binding},changeSet:structuredClone(m.changeSet)};materials.set(r.taskId,pinned);return pinned;},
  review:async(r,plan,decisions)=>{
   await live(r);const m=materials.get(r.taskId);if(!m||!sameContent(m.binding,r.binding)||!plan.ok)throw Error('board.error.stale');
   const hunks=reviewChangeSet(m.changeSet).flatMap(f=>f.hunks);
   // Never mark the whole worktree accepted after a partial hunk selection. No writes to the open checkout.
   const exact=hunks.length>0&&hunks.every(h=>decisions[h.key]==='accept')&&plan.skipped.length===0&&plan.writes.length===m.changeSet.files.length&&m.changeSet.files.every(f=>plan.writes.some(w=>w.path===f.path&&w.text===f.proposedText));
   await facade.review(r.taskId,exact?'approved':'changes-requested',r.binding);materials.delete(r.taskId);
  },
  prepareExport:async id=>{
   const raw=await facade.prepareExport(id);
   // Conservative export: exclude all free text, commands and paths even after engine redaction.
   const body={format:'somnia-session-export' as const,version:1 as const,taskId:raw.taskId,branch:raw.branch,baseSha:raw.baseSha,headSha:raw.headSha,producer:{kind:raw.producer.kind,name:'Somnia Agent'},status:raw.status,intent:'',plan:[],diffSummary:raw.diffSummary,cost:raw.cost,notes:[]};
   const exp:SessionExport={...body,review:{state:'unreviewed',contentHash:await sha256Hex(JSON.stringify(body))}};
   const json=exportPreview(exp);exports.set(id,{exp,json});return exp;
  },
  saveExport:async(id,json)=>{const e=exports.get(id);if(!e||e.json!==json)throw Error('board.error.stale');await facade.saveExport(e.exp,e.exp.review.contentHash);exports.delete(id);},
 };
}
export function installEngineBoardPort(facade:BoardFacade,loader:BoardReviewLoader){const port=createEngineBoardPort(facade,loader);return registerAgentBoardPort(port);}
