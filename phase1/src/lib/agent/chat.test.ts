import {test} from 'node:test';import assert from 'node:assert/strict';
import {chatReducer,initialChat,type ChatState} from './chat';
import {createStubCore,STUB_REPLY} from './stubCore';
const run=(s:ChatState,...a:Parameters<typeof chatReducer>[1][])=>a.reduce(chatReducer,s);
test('send adds a user bubble and marks busy; blank or double send is ignored',()=>{
 const s=run(initialChat,{type:'send',text:'  hi  '});assert.equal(s.busy,true);assert.deepEqual(s.items.map(i=>i.kind),['user']);
 assert.equal(chatReducer(s,{type:'send',text:'again'}),s);assert.equal(chatReducer(initialChat,{type:'send',text:'  '}),initialChat);
});
test('status shows once, deltas build one streaming bubble, done settles',()=>{
 let s=run(initialChat,{type:'send',text:'x'},{type:'event',event:{type:'status',text:'Editing',file:'a.html'}},{type:'event',event:{type:'status',text:'Editing',file:'a.html'}});
 assert.equal(s.items.filter(i=>i.kind==='status').length,1);
 s=run(s,{type:'event',event:{type:'text-delta',text:'Hel'}},{type:'event',event:{type:'text-delta',text:'lo'}});
 assert.deepEqual(s.items.map(i=>i.kind),['user','agent']);const a=s.items[1];assert.ok(a.kind==='agent'&&a.text==='Hello'&&a.streaming);
 s=run(s,{type:'event',event:{type:'done'}});assert.equal(s.busy,false);assert.ok(s.items[1].kind==='agent'&&!(s.items[1] as {streaming:boolean}).streaming);
});
test('proposal is pending, resolve changes only that proposal; undo goes back to pending',()=>{
 const p={id:'p1',file:'a.html',lines:[],added:0,removed:0};
 let s=run(initialChat,{type:'send',text:'x'},{type:'event',event:{type:'proposal',proposal:p}},{type:'event',event:{type:'done'}});
 const d=()=>s.items.find(i=>i.kind==='diff') as {state:string};assert.equal(d().state,'pending');
 s=run(s,{type:'resolve',proposalId:'other',state:'accepted'});assert.equal(d().state,'pending');
 s=run(s,{type:'resolve',proposalId:'p1',state:'accepted'});assert.equal(d().state,'accepted');
 s=run(s,{type:'resolve',proposalId:'p1',state:'pending'});assert.equal(d().state,'pending');
});
test('stop settles without error; error adds an alert row; events after idle are dropped; reset clears',()=>{
 let s=run(initialChat,{type:'send',text:'x'},{type:'event',event:{type:'text-delta',text:'a'}},{type:'stop'});
 assert.equal(s.busy,false);assert.equal(chatReducer(s,{type:'event',event:{type:'text-delta',text:'late'}}),s);
 s=run(initialChat,{type:'send',text:'x'},{type:'event',event:{type:'error',message:'boom'}});assert.equal(s.busy,false);assert.equal(s.items.at(-1)?.kind,'error');
 assert.equal(run(s,{type:'reset'}).items.length,0);
});
test('stub core streams the scripted reply, proposes one diff and ends with done',async()=>{
 const core=createStubCore({charDelayMs:0,statusDelayMs:0});const events:string[]=[];let text='';
 await new Promise<void>(res=>{core.run({prompt:'p',context:{activeFile:'index.html',selectedElementId:null}},e=>{events.push(e.type);if(e.type==='text-delta')text+=e.text;if(e.type==='done')res();});});
 assert.equal(text,STUB_REPLY);assert.equal(events[0],'status');assert.equal(events.at(-1),'done');assert.equal(events.filter(e=>e==='proposal').length,1);
});
test('stub core cancel stops delivery',async()=>{
 const core=createStubCore({charDelayMs:5,statusDelayMs:0});let n=0;const r=core.run({prompt:'p',context:{activeFile:'a',selectedElementId:null}},()=>{n++;});
 r.cancel();const at=n;await new Promise(res=>setTimeout(res,60));assert.equal(n,at);
});
