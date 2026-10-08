import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EditorProject} from '@somnia/editor-core';
import {DocumentRegistry,PolicyGateway,TransactionManager,buildContext,type NativeProposal} from './documentCore';
import {codeAdapter,createCodeStudioRegistry,validateHTML} from './codeStudio';
import {AgentProjectTools} from './projectTools';
function fixture(){
 const core=new EditorProject({'index.html':'<h1>Hello</h1>','other.html':'<p>private</p>'});
 const registry=new DocumentRegistry([codeAdapter]);const sync=()=>registry.sync(core.files,core.revision);sync();
 const base=registry.snapshot('index.html').ref;const policy=new PolicyGateway();policy.grant({effect:'inspect',documentIds:[base.documentId]});
 let guest=false;let held:string[]=[];let duringHold=()=>{};
 const tx=new TransactionManager(registry,policy,{hold:async path=>{held.push(path);duringHold();sync();},apply:(path,text,origin)=>{core.transact({origin:'ai',group:origin,operations:[{type:'replaceSource',file:path,text}]});sync();},undo:origin=>{core.undoGroup(origin);sync();},canAccept:()=>!guest});
 const propose=()=>tx.propose('run-1',base,'<h1>Improved</h1>');
 const approve=(p:NativeProposal)=>policy.grant({effect:'edit',documentIds:[p.base.documentId],proposalId:p.id});
 return {core,registry,base,policy,tx,sync,propose,approve,held,setGuest:(v:boolean)=>{guest=v;},duringHold:(fn:()=>void)=>{duringHold=fn;}};
}
test('document identity survives edits and explicit rename, reopen is new, metadata revisions conflict',()=>{
 const f=fixture();f.core.transact({origin:'code',operations:[{type:'replaceSource',file:'index.html',text:'<p>typed</p>'}]});f.sync();
 const s=f.registry.snapshot('index.html');assert.equal(s.ref.documentId,f.base.documentId);assert.ok(s.ref.revision>f.base.revision);
 assert.throws(()=>f.registry.assert(f.base),/changed/);
 f.registry.rename('index.html','renamed.html');assert.equal(f.registry.snapshot('renamed.html').ref.documentId,f.base.documentId);
 f.registry.sync({});f.registry.sync({'index.html':'<h1>Hello</h1>'});assert.notEqual(f.registry.snapshot('index.html').ref.documentId,f.base.documentId);
});
test('bounded active selection is tagged untrusted and does not include other file',()=>{
 const f=fixture();const c=buildContext(f.registry,f.policy,'index.html',{from:4,to:9});assert.equal(c.data.text,'Hello');assert.equal(c.data.trust,'untrusted-document');assert.ok(!JSON.stringify(c).includes('private'));
 assert.throws(()=>buildContext(f.registry,f.policy,'other.html',null),/inspect permission/);
 assert.throws(()=>buildContext(f.registry,f.policy,'index.html',{from:-1,to:1}),/outside/);
 assert.throws(()=>buildContext(f.registry,f.policy,'index.html',null,1),/exceeds/);
});
test('four policy classes independent, recipients exact, external effects fail closed',()=>{
 const f=fixture();assert.throws(()=>f.policy.assert({effect:'disclose',documentIds:[f.base.documentId],destination:'openai'}),/permission/);
 f.policy.grant({effect:'disclose',documentIds:[f.base.documentId],destination:'openai'});f.policy.assert({effect:'disclose',documentIds:[f.base.documentId],destination:'openai'});
 assert.throws(()=>f.policy.assert({effect:'disclose',documentIds:[f.base.documentId],destination:'claude'}),/permission/);
 assert.throws(()=>f.policy.assert({effect:'edit',documentIds:[f.base.documentId]}),/permission/);
 f.policy.grant({effect:'external-effect',documentIds:[]});assert.throws(()=>f.policy.assert({effect:'external-effect',documentIds:[]}),/not available/);
 f.policy.revoke();assert.throws(()=>f.policy.assert({effect:'inspect',documentIds:[f.base.documentId]}),/permission/);
});
test('preview accept repeat undo is one origin-tagged in-memory group',async()=>{
 const f=fixture();const p=f.propose();assert.equal(f.core.files['index.html'],p.before);
 await assert.rejects(f.tx.accept(p.id,p.after),/edit permission/);f.approve(p);
 await assert.rejects(f.tx.accept(p.id,'unreviewed'),/preview/);await f.tx.accept(p.id,p.after);const revision=f.core.revision;
 await f.tx.accept(p.id,p.after);assert.equal(f.core.revision,revision);assert.deepEqual(f.held,['index.html']);
 f.tx.undo(p.id);assert.equal(f.core.files['index.html'],p.before);assert.equal(f.core.files['other.html'],'<p>private</p>');
});
test('reject does not mutate; stale same-text ABA and lock revisions block acceptance',async()=>{
 for(const mode of ['text','aba','lock']){
  const f=fixture();const p=f.propose();f.approve(p);
  if(mode==='lock')f.core.transact({origin:'canvas',operations:[{type:'setMeta',file:'index.html',nodeId:f.core.tree('index.html')[0].id,locked:true}]});
  else {f.core.transact({origin:'code',operations:[{type:'replaceSource',file:'index.html',text:'<p>User edit</p>'}]});if(mode==='aba')f.core.undo();}
  f.sync();await assert.rejects(f.tx.accept(p.id,p.after),/changed/);
 }
 const f=fixture();const p=f.propose();f.tx.reject(p.id);f.approve(p);await assert.rejects(f.tx.accept(p.id,p.after),/not pending/);assert.equal(f.core.files['index.html'],p.before);
});
test('async hold rechecks revisions and collaboration ownership, later remote edit survives undo attempt',async()=>{
 const f=fixture();const p=f.propose();f.approve(p);f.duringHold(()=>f.core.transact({origin:'code',operations:[{type:'replaceSource',file:'index.html',text:'<p>Manual</p>'}]}));
 await assert.rejects(f.tx.accept(p.id,p.after),/changed/);assert.equal(f.core.files['index.html'],'<p>Manual</p>');
 const g=fixture();const q=g.propose();g.approve(q);g.setGuest(true);await assert.rejects(g.tx.accept(q.id,q.after),/host/);g.setGuest(false);await g.tx.accept(q.id,q.after);
 g.core.transact({origin:'external',operations:[{type:'replaceSource',file:'index.html',text:'<p>Remote</p>'}]});g.sync();assert.throws(()=>g.tx.undo(q.id),/Later edits/);assert.equal(g.core.files['index.html'],'<p>Remote</p>');
});
test('parallel acceptance cannot mutate twice',async()=>{const f=fixture();const p=f.propose();f.approve(p);const a=f.tx.accept(p.id,p.after);await assert.rejects(f.tx.accept(p.id,p.after),/already in progress/);await a;assert.equal(f.core.revision,1);});
test('typed HTML tools inspect native IDs and stage parser-backed transform, no legacy file or executable fallback',async()=>{
 const f=fixture();let seen='';const registry=createCodeStudioRegistry({snapshot:()=>f.registry.assert(f.base),nodes:()=>f.core.tree('index.html'),selection:()=>null,propose:after=>{seen=after;}});
 const tools=new AgentProjectTools({projectId:'p',files:()=>({'index.html':f.core.files['index.html']}),allowed:()=>true},undefined,undefined,{registry,nativeOnly:true});
 const call=(name:string,a:object)=>tools.execute({id:'t',name,arguments:JSON.stringify(a)},new AbortController().signal);
 assert.deepEqual(tools.definitions().map(t=>t.name),['code_read_range','dom_inspect','code_propose_html','dom_set_attribute']);
 const nodes=JSON.parse(await call('dom_inspect',{})).nodes;await call('dom_set_attribute',{nodeId:nodes[0].id,name:'class',value:'hero'});assert.match(seen,/class="hero"/);assert.equal(f.core.files['index.html'],'<h1>Hello</h1>');assert.equal(tools.proposals().length,1);
 await assert.rejects(call('write_file',{path:'other.html',content:'bad'}),/Only scoped/);
 await assert.rejects(call('dom_set_attribute',{nodeId:nodes[0].id,name:'onclick',value:'alert(1)'}),/Executable/);
 await assert.rejects(call('code_read_range',{from:0,to:99}),/Invalid/);
 await assert.rejects(call('dom_inspect',{grant:'all'}),/Unexpected/);
});
test('locked nodes, malformed HTML and unknown adapters fail clearly',async()=>{
 const f=fixture();const n=f.core.tree('index.html')[0];f.core.transact({origin:'canvas',operations:[{type:'setMeta',file:'index.html',nodeId:n.id,locked:true}]});f.sync();
 const registry=createCodeStudioRegistry({snapshot:()=>f.registry.snapshot('index.html'),nodes:()=>f.core.tree('index.html'),selection:()=>null,propose:()=>{assert.fail('should not propose');}});
 const ctx={files:()=>f.core.files,propose:async()=>{}};
 await assert.rejects(registry.run('dom_set_attribute',{nodeId:n.id,name:'class',value:'x'},ctx,new AbortController().signal),/locked/);
 await assert.rejects(registry.run('code_propose_html',{from:0,to:14,text:'<p>x</p>'},ctx,new AbortController().signal),/locked/);
 assert.throws(()=>validateHTML('<p a="unclosed>'),/parse failed/);
 const r=new DocumentRegistry([codeAdapter]);r.sync({'photo.png':'image'});assert.throws(()=>r.validate(r.snapshot('photo.png').ref,'image2'),/No implemented/);
});
