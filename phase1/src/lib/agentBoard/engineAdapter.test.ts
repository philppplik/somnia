import test from 'node:test';
import assert from 'node:assert/strict';
import {BoardFacade,TaskEngine,MemoryTaskStore} from '../agentTask/index';
import {createEngineBoardPort} from './engineAdapter';
import {bindingFor,requestFor,reviewIsCurrent} from './model';
import {planApply,reviewChangeSet,type ChangeSet} from '../agentDiff';
const SHA='a'.repeat(40),HASH='b'.repeat(64),TREE='c'.repeat(40);
async function setup(){
 const store=new MemoryTaskStore(),engine=new TaskEngine({store,newId:()=> 'adapter-task'});await engine.create({repoId:'r',baseSha:SHA,intent:'secret intent',producer:{kind:'builtin',name:'Somnia Agent'}});
 for(const status of ['preparing','running','review'] as const)await engine.transition('adapter-task',status);
 const task=(await store.getTask('adapter-task'))!;task.headSha=SHA;task.workspaceGeneration=1;await store.putTask(task);
 const exports:unknown[]=[];let dirty=false;
 const facade=new BoardFacade({engine,store,liveContent:async()=>({contentHash:HASH,treeSha:TREE,workspaceGeneration:1,headSha:SHA}),unsavedBuffers:()=>dirty?1:0,writeExport:async exp=>{exports.push(exp);}});await facade.refresh();
 const cs:ChangeSet={id:'diff',complete:true,files:[{path:'src/a.html',kind:'edit',baseText:'a\nx\nb\ny\nc',proposedText:'A\nx\nb\ny\nC'}]};
 const port=createEngineBoardPort(facade,{guards:()=>({unsavedBuffers:dirty?['src/a.html']:[],activeReviews:[]}),load:async request=>({binding:request.binding,changeSet:cs,readCurrent:()=>cs.files[0].baseText})});
 const t=port.getSnapshot().tasks[0],r=requestFor(t,bindingFor(t,port.getSnapshot())!);
 return {port,engine,r,cs,exports,setDirty:()=>{dirty=true;}};
}
test('adapter caches stable projection and records full exact-result hunk review without editor writes',async()=>{const f=await setup();assert.equal(f.port.getSnapshot(),f.port.getSnapshot());const m=await f.port.loadReview(f.r),d=Object.fromEntries(reviewChangeSet(m.changeSet).flatMap(r=>r.hunks.map(h=>[h.key,'accept'] as const)));await f.port.review(f.r,planApply(m.changeSet,d,m.readCurrent),d);assert.equal((await f.engine.get(f.r.taskId)).review?.decision,'approved');const s=f.port.getSnapshot();assert.equal(reviewIsCurrent(s.tasks[0],bindingFor(s.tasks[0],s)),true);});
test('partial result records changes-requested, never approved and no Combine',async()=>{const f=await setup(),m=await f.port.loadReview(f.r);const hunks=reviewChangeSet(m.changeSet).flatMap(r=>r.hunks);const d=Object.fromEntries(hunks.map((h,i)=>[h.key,i?'reject':'accept'] as const));await f.port.review(f.r,planApply(m.changeSet,d,m.readCurrent),d);assert.equal((await f.engine.get(f.r.taskId)).review?.decision,'changes-requested');const s=f.port.getSnapshot();assert.equal(reviewIsCurrent(s.tasks[0],bindingFor(s.tasks[0],s)),false);});
test('altered apply plan cannot approve exact result',async()=>{const f=await setup(),m=await f.port.loadReview(f.r),d=Object.fromEntries(reviewChangeSet(m.changeSet).flatMap(r=>r.hunks.map(h=>[h.key,'accept'] as const))),p=planApply(m.changeSet,d,m.readCurrent);p.writes[0].text='tampered';await f.port.review(f.r,p,d);assert.equal((await f.engine.get(f.r.taskId)).review?.decision,'changes-requested');});
test('adapter blocks dirty review, even user gate could otherwise permit',async()=>{const f=await setup();f.setDirty();await assert.rejects(f.port.loadReview(f.r),/guard/);});
test('adapter writes only exactly previewed conservative export after confirmation',async()=>{const f=await setup(),e=await f.port.prepareExport(f.r.taskId);const {exportPreview}=await import('./export');const json=exportPreview(e);assert.doesNotMatch(json,/secret intent/);await assert.rejects(f.port.saveExport(f.r.taskId,json+' '),/stale/);assert.equal(f.exports.length,0);await f.port.saveExport(f.r.taskId,json);assert.equal(f.exports.length,1);});
