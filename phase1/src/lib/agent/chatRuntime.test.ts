import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AgentChatRuntime} from './chatRuntime';
import type {AgentCore,AgentEvent} from './core';
const request={prompt:'hello',context:{activeFile:'a.html',selectedElementId:null}};
const tick=()=>new Promise<void>(r=>setTimeout(r,40));
test('detaching a panel does not cancel stream; later observer sees retained result',async()=>{
 let send:(event:AgentEvent)=>void=()=>{};let cancelled=false;
 const core={run(_r,fn){send=fn;return{cancel(){cancelled=true;}};}} as AgentCore;
 const runtime=new AgentChatRuntime(async()=>core);const detach=runtime.subscribe(()=>{});await runtime.send(request);detach();
 send({type:'text-delta',text:'retained'});send({type:'done'});await tick();
 assert.equal(cancelled,false);assert.equal(runtime.snapshot().busy,false);assert.equal(runtime.snapshot().items.some(i=>i.kind==='agent'&&i.text==='retained'),true);
});
test('explicit stop cancels run and rejects late events',async()=>{
 let send:(event:AgentEvent)=>void=()=>{};let cancelled=false;
 const runtime=new AgentChatRuntime(async()=>({run(_r,fn){send=fn;return{cancel(){cancelled=true;}};}} as AgentCore));
 await runtime.send(request);runtime.stop();send({type:'text-delta',text:'stale'});await tick();assert.equal(cancelled,true);assert.equal(runtime.snapshot().items.some(i=>i.kind==='agent'),false);
});
test('remount revision unchanged does not cancel; settings change does',async()=>{
 let cancels=0;const runtime=new AgentChatRuntime(async()=>({run(){return{cancel(){cancels++;}};}} as unknown as AgentCore));
 runtime.configureRevision(1);await runtime.send(request);runtime.configureRevision(1);assert.equal(cancels,0);runtime.configureRevision(2);assert.equal(cancels,1);
});
