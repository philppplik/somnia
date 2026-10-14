import test from 'node:test';import assert from 'node:assert/strict';import {checkLocalContext} from './localContext';import type {AgentProviderRequest} from './types';
const request=(content:string,maxOutputTokens=64):AgentProviderRequest=>({model:'fixture',messages:[{role:'user',content}],tools:[],maxOutputTokens,signal:new AbortController().signal});
test('context budget uses UTF-8, includes schemas and output/framing reserve, never truncates',()=>{
 checkLocalContext(request('short'),1024);assert.throws(()=>checkLocalContext(request('😀'.repeat(200)),1024),/budget/);assert.throws(()=>checkLocalContext(request('short',1024),1024));assert.throws(()=>checkLocalContext({...request('short'),tools:[{name:'x',description:'x'.repeat(2000),parameters:{}}]},1024));checkLocalContext(request('x'.repeat(20000)));assert.throws(()=>checkLocalContext(request('x'),NaN));
});
test('local context leaves prepared image encoded bytes to the explicit image validator',()=>{
 checkLocalContext({...request('describe'),messages:[{role:'user',content:'describe',images:[{mime:'image/png',base64:'a'.repeat(2000),width:1,height:1,label:'fixture'}]}]},1024);
});
