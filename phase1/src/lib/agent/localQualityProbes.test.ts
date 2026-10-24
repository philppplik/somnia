import test from 'node:test';import assert from 'node:assert/strict';
import {runToolProbe,runVisionProbe,storeProbe,readProbe,type ProbeIdentity} from './localQualityProbes';
import type {AgentProvider,AgentProviderRequest} from './types';
const id:ProbeIdentity={endpoint:'http://127.0.0.1:11434',model:'fixture',digest:'d',daemonVersion:'1',numCtx:8192};
test('nine tool fixtures only inspect calls and synthetic roundtrip, no host tools',async()=>{
 const calls:AgentProviderRequest[]=[];const provider:AgentProvider={id:'fixture',locality:'local',async *stream(request){calls.push(request);if(request.messages.some(m=>m.role==='tool'))yield {type:'text',text:'ok'};else yield {type:'tool-call',index:0,id:'1',name:'echo',arguments:'{"text":"ok"}'};yield {type:'finish',reason:'stop'};}};
 const report=await runToolProbe(provider,id,new AbortController().signal);assert.equal(report.passed,true);assert.equal(report.checks.length,9);assert.equal(calls.length,9);assert.ok(!calls.some(r=>r.messages.some(m=>m.content.includes('/private/'))));
 storeProbe(report);assert.equal(readProbe(id,'tools')?.passed,true);assert.equal(readProbe({...id,digest:'changed'},'tools'),undefined);assert.equal(readProbe({...id,daemonVersion:'2'},'tools'),undefined);assert.equal(readProbe({...id,numCtx:16384},'tools'),undefined);
});
test('wrong tool/arguments fail instead of passing text-only response',async()=>{
 const provider:AgentProvider={id:'fixture',locality:'local',async *stream(){yield {type:'tool-call',index:0,name:'evil',arguments:'{}'};yield {type:'finish',reason:'stop'};}};
 const report=await runToolProbe(provider,id,new AbortController().signal);assert.equal(report.passed,false);
});
test('vision probe uses injected synthetic images and never grants tools',async()=>{
 const provider:AgentProvider={id:'fixture',locality:'local',async *stream(request){assert.equal(request.tools.length,0);assert.equal(request.messages[0].images?.[0].label,'synthetic');yield {type:'text',text:'red'};yield {type:'finish',reason:'stop'};}};
 const report=await runVisionProbe(provider,id,new AbortController().signal,[{id:'V1',image:{mime:'image/png',base64:'aGVsbG8=',width:1,height:1,label:'synthetic'},prompt:'color',answer:'red'}]);assert.equal(report.passed,true);
});
test('cancelled probe cannot be stored as a successful report',async()=>{
 const controller=new AbortController();controller.abort();const provider:AgentProvider={id:'x',locality:'local',async *stream(){yield {type:'finish',reason:'stop'};}};
 await assert.rejects(runToolProbe(provider,id,controller.signal));
});
test('cached result cannot be modified through read references',async()=>{
 const provider:AgentProvider={id:'x',locality:'local',async *stream(){yield {type:'text',text:'ok'};yield {type:'finish',reason:'stop'};}};
 const report=await runToolProbe(provider,{...id,digest:'readonly'},new AbortController().signal);storeProbe(report);const copy=readProbe(report.identity,'tools')!;copy.passed=true;assert.equal(readProbe(report.identity,'tools')?.passed,false);
});
