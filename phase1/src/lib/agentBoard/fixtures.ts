import type {AgentBoardPort,BoardSnapshot,BoardTask,BoardRequest} from './contracts';
import {assertRequest} from './model';
import {createAIProvenance} from '../agent/privacy';
const hash='a'.repeat(64),tree='b'.repeat(40),head='c'.repeat(40),base='d'.repeat(40);
export function fixtureTask(taskId='task-review',extra:Partial<BoardTask>={}):BoardTask{return{schemaVersion:1,taskId,repoId:'fixture-repo',worktreeId:'worktree-'+taskId,branch:'somnia/task/'+taskId,baseSha:base,headSha:head,workspaceGeneration:1,allowedRoots:['src'],status:'review',producer:{kind:'builtin',name:'Somnia Agent',version:'1',provider:'ollama',model:'local-model'},title:'Improve the navigation',autoCommit:false,verification:{commands:['npm test'],outcome:'passed',contentHash:hash,treeSha:tree,at:'2026-10-10T12:00:00Z'},...extra};}
export function createBoardFixture(){
 const listeners=new Set<()=>void>(),events:string[]=[];
 let snapshot:BoardSnapshot={tasks:[fixtureTask('task-queue',{title:'Check image descriptions',status:'queued'}),fixtureTask('task-running',{title:'Tidy the stylesheet',status:'running',autoCommit:true,checkpoint:true}),fixtureTask(),fixtureTask('task-done',{title:'Polish the document layout',status:'done',review:{reviewedTreeSha:tree,contentHash:hash,decision:'accepted',at:'2026-10-10T12:00:00Z'},cost:{tokens:12450,amount:.023,currency:'USD'}}),fixtureTask('task-failed',{title:'Test the mobile menu',status:'failed',verification:{commands:['npm test'],outcome:'failed',treeSha:tree,contentHash:hash,at:'2026-10-10T12:00:00Z'}})],contents:{}};
 snapshot={...snapshot,contents:Object.fromEntries(snapshot.tasks.map(t=>[t.taskId,{contentHash:hash,treeSha:tree,headSha:head,workspaceGeneration:1}]))};
 const emit=()=>listeners.forEach(f=>f());
 const change=(id:string,extra:Partial<BoardTask>)=>{snapshot={...snapshot,tasks:snapshot.tasks.map(t=>t.taskId===id?{...t,...extra}:t)};emit();};
 let dirty=false;
 const port:AgentBoardPort={getSnapshot:()=>snapshot,subscribe:f=>{listeners.add(f);return()=>{listeners.delete(f);};},guards:()=>({unsavedBuffers:dirty?['index.html']:[],activeReviews:[]}),
  cancel:async id=>{events.push('cancel:'+id);change(id,{status:'cancelled'});},
  retry:async r=>{assertRequest(snapshot,r);events.push('retry:'+r.taskId);change(r.taskId,{status:'queued'});},
  loadReview:async r=>{assertRequest(snapshot,r);return {binding:r.binding,changeSet:{id:'fixture-review',complete:true,provenance:createAIProvenance('ollama','local-model'),files:[{path:'src/navigation.html',kind:'edit',baseText:'<nav>Home</nav>',proposedText:'<nav aria-label="Main">Home</nav>'}]},readCurrent:()=>'<nav>Home</nav>'};},
  review:async(r,plan)=>{assertRequest(snapshot,r);if(!plan.ok)throw Error('board.error.action');events.push('review:'+r.taskId);change(r.taskId,{review:{reviewedTreeSha:r.binding.treeSha,contentHash:r.binding.contentHash,decision:'accepted',at:'2026-10-10T12:00:00Z'}});},
  prepareExport:async id=>({taskId:id,status:snapshot.tasks.find(t=>t.taskId===id)?.status,baseSha:base,headSha:head,contentHash:hash,verification:'passed',transcript:'secret transcript',apiKey:'secret'}),
  saveExport:async(id,_json)=>{events.push('export:'+id);},
 };
 return {port,events,setDirty:(v:boolean)=>{dirty=v;},stale:(id='task-review')=>{snapshot={...snapshot,contents:{...snapshot.contents,[id]:{contentHash:'e'.repeat(64),treeSha:'f'.repeat(40),headSha:head,workspaceGeneration:1}}};emit();},combine:async(r:BoardRequest)=>{assertRequest(snapshot,r);events.push('combine:'+r.taskId);}};
}
