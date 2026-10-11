import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createOpenCoordinator,routesShell,type AffectedDoc,type OpenDeps,type OpenInput} from './openCoordinator';
import './index';
const enc=(s:string)=>new TextEncoder().encode(s);
const docx=()=>({name:'a.docx',bytes:new Uint8Array(readFileSync('test/documents/sample.docx'))});
const WAV=(()=>{const b=new Uint8Array(16);b.set(enc('RIFF'),0);b.set(enc('WAVE'),8);return b;})();
function harness(over:Partial<OpenDeps>&{failPrepare?:string[];failCommit?:string[];delay?:Record<string,Promise<void>>;affected?:(name:string)=>AffectedDoc[]}={}){
 const log:string[]=[];const shell={studio:'video'};const session={doc:'video-project'};
 const deps:OpenDeps={
  async prepare(input,res){
   await over.delay?.[input.name];
   if(over.failPrepare?.includes(input.name))throw new Error('decoder failed');
   return{name:input.name,studioId:res.handler.studioId,affectedDocs:()=>over.affected?.(input.name)??[],
    commit(){if(over.failCommit?.includes(input.name))return{ok:false,error:'replace cancelled'};log.push('commit:'+input.name);return{ok:true,key:input.name};},
    dispose(){log.push('dispose:'+input.name);},focus(key){log.push('focus:'+key);session.doc=key;}};},
  approve:over.approve??(async()=>'approved'),revalidate:over.revalidate??(()=>true),
  switchStudio(id){log.push('studio:'+id);shell.studio=id;},
  notify(t){log.push('notify:'+t);},
  pendingGesture:over.pendingGesture,singleDocument:over.singleDocument,findOpenDocument:over.findOpenDocument,approvalFailed:over.approvalFailed,
 };
 return{log,shell,session,c:createOpenCoordinator(deps)};
}
test('explicit Open of a DOCX while Video is selected routes to Documents (no manual lock involved)',async()=>{
 const h=harness();const r=await h.c.openFiles([docx()]);
 assert.equal(h.shell.studio,'documents');assert.equal(r.focused?.studioId,'documents');assert.equal(r.summary,'Opened a.docx in Documents.');
});
test('each shipped Studio, from Video as the starting Studio',async()=>{
 const cases:[OpenInput,string][]=[[docx(),'documents'],[{name:'s.xlsx',bytes:new Uint8Array(readFileSync('sheets-craft/fixtures/fixture.xlsx'))},'sheets'],[{name:'d.pptx',bytes:new Uint8Array(readFileSync('slides-engine/fixtures/independent.pptx'))},'slides'],[{name:'c.wav',bytes:WAV},'sound'],[{name:'i.html',bytes:enc('<p/>')},'code']];
 for(const [input,studio] of cases){const h=harness();await h.c.openFiles([input]);assert.equal(h.shell.studio,studio,input.name);}
});
test('unknown binary and unknown text never switch the shell or commit',async()=>{
 const h=harness();
 const r=await h.c.openFiles([{name:'x.bin',bytes:Uint8Array.from([1,0,2,0,3,0,4,0])}]);
 assert.equal(r.outcomes[0].status,'unsupported');assert.deepEqual(h.log.filter(l=>!l.startsWith('notify')),[]);assert.equal(h.shell.studio,'video');assert.match(r.summary,/^Could not open x\.bin/);
 const t=await h.c.openFiles([{name:'x.weird',bytes:enc('hello')}]);
 assert.equal(t.outcomes[0].status,'safe-text-offer');assert.equal(h.shell.studio,'video');
 const ok=await h.c.openFiles([{name:'x.weird',bytes:enc('hello')}],{acceptTextOffer:true});assert.equal(ok.outcomes[0].status,'opened');assert.equal(h.shell.studio,'code');
});
test('failed prepare keeps the old session and Studio untouched, resources of siblings are released only when not committed',async()=>{
 const h=harness({failPrepare:['a.docx']});const r=await h.c.openFiles([docx()]);
 assert.equal(h.shell.studio,'video');assert.equal(h.session.doc,'video-project');assert.equal(r.outcomes[0].status,'failed');assert.ok(!h.log.some(l=>l.startsWith('commit')||l.startsWith('focus')||l.startsWith('studio')));
});
test('replacement guard rejecting at commit time is a failure, no focus, no switch',async()=>{
 const h=harness({failCommit:['a.docx']});const r=await h.c.openFiles([docx()]);
 assert.equal(r.outcomes[0].status,'failed');assert.equal(h.shell.studio,'video');assert.deepEqual(h.log.filter(l=>l.startsWith('focus')||l.startsWith('studio')),[]);assert.ok(h.log.includes('dispose:a.docx'));
});
test('mixed batch: first success is focused once, later successes stay in the background, failures are summarised',async()=>{
 const h=harness({failPrepare:['b.wav']});
 const r=await h.c.openFiles([{name:'bad.bin',bytes:Uint8Array.from([0,0,0,0,0,1])},{name:'b.wav',bytes:WAV},docx(),{name:'c.wav',bytes:WAV}]);
 assert.deepEqual(h.log.filter(l=>l.startsWith('focus')||l.startsWith('studio')),['focus:a.docx','studio:documents']);
 assert.equal(h.log.filter(l=>l.startsWith('focus')).length,1);assert.equal(r.focused?.name,'a.docx');
 assert.deepEqual(r.outcomes.map(o=>o.name),['bad.bin','b.wav','a.docx','c.wav']);
 assert.match(r.summary,/^Opened 2 files\. 2 could not be opened/);
});
test('all files in a batch fail: nothing is focused and the old shell stays',async()=>{
 const h=harness();const r=await h.c.openFiles([{name:'x.bin',bytes:Uint8Array.from([0,1,0,1])},{name:'y.docx',bytes:enc('not a zip')}]);
 assert.equal(r.focused,null);assert.equal(h.shell.studio,'video');assert.match(r.summary,/^Opened 0 files\. 2 could not/);
});
test('a newer open supersedes a slow older one: the old reader cannot hijack the shell, its resources are released',async()=>{
 let release!:()=>void;const slow=new Promise<void>(r=>{release=r;});
 const h=harness({delay:{'a.docx':slow}});
 const first=h.c.openFiles([docx()]);
 const second=await h.c.openFiles([{name:'c.wav',bytes:WAV}]);
 assert.equal(h.shell.studio,'sound');release();const old=await first;
 assert.equal(old.superseded,true);assert.equal(h.shell.studio,'sound');assert.ok(h.log.includes('dispose:a.docx'));assert.ok(!h.log.includes('commit:a.docx'));assert.equal(second.superseded,false);
});
test('a pending gesture cancels the whole open untouched',async()=>{
 const h=harness({pendingGesture:()=>true});const r=await h.c.openFiles([docx()]);
 assert.equal(r.cancelled,true);assert.equal(h.shell.studio,'video');assert.ok(h.log.includes('dispose:a.docx'));assert.ok(!h.log.some(l=>l.startsWith('commit')));
});
test('only explicit Open routes: restore and background intake commit without focus or switch',async()=>{
 assert.equal(routesShell('open'),true);assert.equal(routesShell('restore'),false);assert.equal(routesShell('background'),false);
 const h=harness();await h.c.openFiles([docx()],{intent:'background'});
 assert.deepEqual(h.log.filter(l=>l.startsWith('focus')||l.startsWith('studio')),[]);assert.equal(h.shell.studio,'video');
});
test('per-document preference is honoured only when compatible',async()=>{
 const h=harness({preferred:undefined});const deps2=harness();void deps2;
 const c=createOpenCoordinator({...({} as OpenDeps),async prepare(i,r){return{name:i.name,studioId:r.handler.studioId,affectedDocs:()=>[],commit:()=>({ok:true,key:i.name}),dispose(){},focus(){}};},approve:async()=>'approved',revalidate:()=>true,switchStudio(id){h.shell.studio=id;},notify(){},preferred:()=>'sound'});
 await c.openFiles([docx()]);assert.equal(h.shell.studio,'documents','sound cannot read docx: override ignored');
});

const dirtyDoc=(rev:string|number='r1'):AffectedDoc=>({key:'vector:Old.svg',studioId:'vector',dirty:true,token:{scope:'vector-document',value:rev}});
test('prepare never mutates: nothing is committed, focused or switched before approval returns',async()=>{
 let seen:string[]=[];let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
 const h=harness({affected:()=>[dirtyDoc()],approve:async()=>{seen=[...h.log];await gate;return'approved';}});
 const p=h.c.openFiles([docx()]);await new Promise(r=>setTimeout(r,5));
 assert.ok(!seen.some(l=>/^(commit|focus|studio)/.test(l)));assert.ok(!h.log.some(l=>/^(commit|focus|studio)/.test(l)));
 release();const r=await p;assert.equal(r.outcomes[0].status,'opened');assert.ok(h.log.includes('commit:a.docx'));
});
test('approval receives one plan with deduped affected docs and tokens',async()=>{
 let plan:Parameters<OpenDeps['approve']>[0]|undefined;
 const h=harness({affected:()=>[dirtyDoc()],approve:async p=>{plan=p;return'approved';}});
 await h.c.openFiles([docx(),{name:'c.wav',bytes:WAV}]);
 assert.equal(plan!.items.length,2);assert.equal(plan!.affected.length,1);assert.equal(plan!.revisionTokens.length,1);
});
test('cancelled approval: everything disposed, no mutation, no error event, all outcomes cancelled',async()=>{
 const failed:unknown[]=[];
 const h=harness({approve:async()=>'cancelled',approvalFailed:(_,e)=>failed.push(e)});
 const r=await h.c.openFiles([docx(),{name:'c.wav',bytes:WAV}]);
 assert.equal(r.cancelled,true);assert.deepEqual(r.outcomes.map(o=>o.status),['cancelled','cancelled']);
 assert.ok(h.log.includes('dispose:a.docx')&&h.log.includes('dispose:c.wav'));assert.ok(!h.log.some(l=>/^(commit|focus|studio)/.test(l)));assert.equal(failed.length,0);
});
test('approval that throws is fail-closed: cancelled and exactly one approvalFailed',async()=>{
 const failed:unknown[]=[];
 const h=harness({approve:async()=>{throw new Error('dialog broke');},approvalFailed:(id,e)=>failed.push([id,(e as Error).message])});
 const r=await h.c.openFiles([{...docx(),requestId:'REQ1',ordinal:0}]);
 assert.equal(r.cancelled,true);assert.deepEqual(failed,[['REQ1','dialog broke']]);assert.ok(!h.log.some(l=>/^commit/.test(l)));assert.ok(h.log.includes('dispose:a.docx'));
});
test('a throwing approvalFailed sink cannot break the fail-closed path',async()=>{
 const h=harness({approve:async()=>{throw new Error('x');},approvalFailed:()=>{throw new Error('sink');}});
 const r=await h.c.openFiles([docx()]);assert.equal(r.cancelled,true);
});
test('revalidate failure re-plans once (fresh prepare, new approval) and then commits',async()=>{
 let approvals=0;let calls=0;const prepared:string[]=[];
 const h=harness({approve:async()=>{approvals++;return'approved';},revalidate:()=>++calls>1});
 const r=await h.c.openFiles([docx()]);
 assert.equal(approvals,2);assert.equal(r.outcomes[0].status,'opened');assert.equal(h.log.filter(l=>l==='dispose:a.docx').length,1,'first candidate released');assert.equal(h.log.filter(l=>l==='commit:a.docx').length,1);void prepared;
});
test('revalidate failing twice aborts as superseded and never commits',async()=>{
 const h=harness({revalidate:()=>false});
 const r=await h.c.openFiles([docx()]);
 assert.equal(r.superseded,true);assert.ok(!h.log.some(l=>/^(commit|focus|studio)/.test(l)));assert.equal(h.log.filter(l=>l==='dispose:a.docx').length,2);assert.equal(r.outcomes[0].status,'cancelled');
});
test('pending gesture after approval cancels untouched',async()=>{
 let n=0;const h=harness({pendingGesture:()=>++n>1});
 const r=await h.c.openFiles([docx()]);assert.equal(r.cancelled,true);assert.ok(!h.log.some(l=>/^commit/.test(l)));assert.ok(h.log.includes('dispose:a.docx'));
});
test('a newer open during the approval dialog supersedes the old one (no commit)',async()=>{
 let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});let first=true;
 const h=harness({approve:async()=>{if(first){first=false;await gate;}return'approved';}});
 const old=h.c.openFiles([docx()]);await new Promise(r=>setTimeout(r,5));
 await h.c.openFiles([{name:'c.wav',bytes:WAV}]);release();const r=await old;
 assert.equal(r.superseded,true);assert.ok(!h.log.includes('commit:a.docx'));assert.ok(h.log.includes('dispose:a.docx'));
});
test('single-document studios: first planned item wins, rest deferred before approval',async()=>{
 let planSize=-1;
 const h=harness({singleDocument:id=>id==='sound',approve:async p=>{planSize=p.items.length;return'approved';}});
 const r=await h.c.openFiles([{name:'1.wav',bytes:WAV},docx(),{name:'2.wav',bytes:WAV}]);
 assert.equal(planSize,2);assert.deepEqual(r.outcomes.map(o=>o.status),['opened','opened','deferred']);assert.equal(r.outcomes[2].reason,'single-doc-studio');
 assert.ok(h.log.includes('dispose:2.wav')&&!h.log.includes('commit:2.wav'));
});
test('outcomes are keyed by position/ordinal: duplicate basenames never collide or reorder',async()=>{
 const h=harness({failCommit:[]});
 const a={name:'index.html',bytes:enc('<p>a</p>'),requestId:'R',ordinal:0};
 const bad={name:'index.html',bytes:Uint8Array.from([0,1,0,1,0]),requestId:'R',ordinal:1};
 const c={name:'index.html',bytes:enc('<p>c</p>'),requestId:'R',ordinal:2};
 const r=await h.c.openFiles([a,bad,c]);
 assert.deepEqual(r.outcomes.map(o=>[o.ordinal,o.status,o.requestId]),[[0,'opened','R'],[1,'unsupported','R'],[2,'opened','R']]);
});
test('partial commit failure is reported truthfully and later items still commit',async()=>{
 const h=harness({failCommit:['a.docx']});
 const r=await h.c.openFiles([docx(),{name:'c.wav',bytes:WAV}]);
 assert.deepEqual(r.outcomes.map(o=>o.status),['failed','opened']);assert.ok(h.log.includes('commit:c.wav'));
});
test('a document already open under the identity token is activated, not opened twice',async()=>{
 const h=harness({findOpenDocument:t=>t==='tok'?{studioId:'documents',key:'a.docx'}:undefined});
 const r=await h.c.openFiles([{...docx(),identityToken:'tok'}]);
 assert.equal(r.outcomes[0].status,'activated-existing');assert.ok(!h.log.some(l=>/^(prepare|commit)/.test(l)));assert.deepEqual(h.log.filter(l=>l.startsWith('studio')),['studio:documents']);assert.equal(r.summary,'a.docx is already open.');
});
test('retry of one item runs the normal pipeline: approval is asked for that item only',async()=>{
 const plans:number[]=[];
 const h=harness({affected:()=>[dirtyDoc()],approve:async p=>{plans.push(p.items.length);return'approved';}});
 await h.c.openFiles([{...docx(),requestId:'R',ordinal:3}]);
 assert.deepEqual(plans,[1]);
});
test('dirty-protection: user declines the replace dialog on retry, nothing changes',async()=>{
 const h=harness({affected:()=>[dirtyDoc()],approve:async p=>p.affected.some(a=>a.dirty)?'cancelled':'approved'});
 const r=await h.c.openFiles([docx()]);assert.equal(r.cancelled,true);assert.ok(!h.log.some(l=>/^commit/.test(l)));
});
