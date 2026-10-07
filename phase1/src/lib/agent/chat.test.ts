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
test('stream failure retains user prompt and partial output with an explicit incomplete warning',()=>{
 const s=run(initialChat,{type:'send',text:'original prompt'},{type:'event',event:{type:'text-delta',text:'partial answer'}},{type:'event',event:{type:'error',message:'Network failed.',retryable:true}});
 assert.equal(s.busy,false);assert.equal(s.items[0].kind,'user');assert.equal(s.items[1].kind,'agent');
 assert.ok(s.items[1].kind==='agent'&&s.items[1].text==='partial answer'&&!s.items[1].streaming);
 assert.ok(s.items[2].kind==='error'&&/incomplete/.test(s.items[2].text)&&s.items[2].retryable);
});
test('usage/status between tokens does not split one answer; preserves newlines and literal markup',()=>{
 const s=run(initialChat,{type:'send',text:'x'},
 {type:'event',event:{type:'text-delta',text:'Hello\n'}},
 {type:'event',event:{type:'usage',outputTokens:1}},
 {type:'event',event:{type:'status',text:'Receiving'}},
 {type:'event',event:{type:'text-delta',text:'<script>literal</script>'}});
 const answers=s.items.filter(i=>i.kind==='agent');assert.equal(answers.length,1);assert.equal(answers[0].text,'Hello\n<script>literal</script>');
 assert.equal(s.items.filter(i=>i.kind==='status').length,0);
});
test('failed and stopped answers are marked partial; completion never hides a stream error',()=>{
 const base=run(initialChat,{type:'send',text:'x'},{type:'event',event:{type:'text-delta',text:'partial'}});
 for(const action of [{type:'stop'} as const,{type:'event',event:{type:'error',message:'Disconnected',retryable:true}} as const]){
  const s=chatReducer(base,action);assert.equal(s.busy,false);const a=s.items.find(i=>i.kind==='agent');assert.ok(a?.kind==='agent'&&!a.streaming&&a.incomplete);
  assert.equal(chatReducer(s,{type:'event',event:{type:'done'}}),s);assert.equal(chatReducer(s,{type:'stop'}),s);
 }
});
test('approval is an answer boundary; empty tokens never create a bubble',()=>{
 let s=run(initialChat,{type:'send',text:'x'},{type:'event',event:{type:'text-delta',text:''}});assert.equal(s.items.length,1);
 s=run(s,{type:'event',event:{type:'text-delta',text:'Before tool'}},{type:'event',event:{type:'approval',approval:{id:'a',path:'x',action:'read',resolve(){}}}},{type:'event',event:{type:'text-delta',text:'After tool'}});
 assert.equal(s.items.filter(i=>i.kind==='agent').length,2);
});
