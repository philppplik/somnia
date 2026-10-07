import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStreamSink} from './streaming';
import type {AgentEvent} from './core';
const pause=()=>new Promise(r=>setTimeout(r,20));
test('coalesces token deltas without loss and flushes before non-text events',async()=>{
 const events:AgentEvent[]=[];const sink=createStreamSink(e=>events.push(e),5);
 for(const text of ['Hel','lo','\n','🌍'])sink.receive({type:'text-delta',text});
 assert.equal(events.length,0);await pause();assert.deepEqual(events,[{type:'text-delta',text:'Hello\n🌍'}]);
 sink.receive({type:'text-delta',text:' tail'});sink.receive({type:'usage',outputTokens:5});sink.receive({type:'done'});
 assert.deepEqual(events.map(e=>e.type),['text-delta','text-delta','usage','done']);
 sink.receive({type:'text-delta',text:'late'});sink.receive({type:'error',message:'late'});await pause();assert.equal(events.length,4);
});
test('mid-stream errors flush partial text first, close delivery and never append done',async()=>{
 const events:AgentEvent[]=[];const sink=createStreamSink(e=>events.push(e),5);
 sink.receive({type:'text-delta',text:'partial'});sink.receive({type:'error',message:'Stream interrupted',retryable:true});sink.receive({type:'done'});
 await pause();assert.deepEqual(events.map(e=>e.type),['text-delta','error']);
});
test('stop preserves buffered text, unmount/reset discard it, and both suppress late events',async()=>{
 for(const keep of [true,false]){
  const events:AgentEvent[]=[];const sink=createStreamSink(e=>events.push(e),5);
  sink.receive({type:'text-delta',text:'received'});sink.close(keep);sink.receive({type:'error',message:'late'});await pause();assert.equal(events.length,keep?1:0);
 }
});
