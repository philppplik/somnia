import test from 'node:test';
import assert from 'node:assert/strict';
import './commands';
import {commandDispatcher} from '../commandDispatcher';

test('collab commands are ui level specs with empty params',()=>{
 for(const id of['collab.share','collab.join']){
  const spec=commandDispatcher.get(id);
  assert.ok(spec);assert.equal(spec.level,'ui');assert.deepEqual(spec.params,{type:'object',properties:{},additionalProperties:false});
 }
});
test('agent and mcp origins are refused for collab dialogs',async()=>{
 for(const origin of['agent','mcp'] as const){
  const r=await commandDispatcher.tryRunCommand('collab.share',{},{origin});
  assert.equal(r.ok,false);if(!r.ok)assert.equal(r.error.code,'forbidden-origin');
 }
});
test('unknown params are rejected',async()=>{
 const r=await commandDispatcher.tryRunCommand('collab.join',{x:1},{origin:'ui'});
 assert.equal(r.ok,false);if(!r.ok)assert.equal(r.error.code,'invalid-params');
});
