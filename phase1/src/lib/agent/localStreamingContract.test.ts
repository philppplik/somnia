import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {chatReducer,initialChat} from './chat';import {OllamaProvider} from './providers/ollama';
test('AI panel uses StudioStatus for live/error/stop and explicitly routes model guidance to local settings',()=>{
 const source=readFileSync('src/components/agent/AgentPanel.tsx','utf8');assert.ok(source.includes('<StudioStatus tone="error" live="assertive">{item.text}'));assert.ok(source.includes('<StudioStatus className="ag-stopped">'));assert.ok(source.includes("settingsAITab:'providers'"),'gear routes to AI Settings after the panel declutter');
});
test('Ollama stream reaches chat incrementally, abort preserves incomplete text and refuses late bytes',async()=>{
 const abort=new AbortController();let state=chatReducer(initialChat,{type:'send',text:'local fixture'});const provider=new OllamaProvider({fetch:async()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{"message":{"content":"first"}}\n{"message":{"content":"late"}}\n{"done":true}\n'));c.close();}}))});
 for await(const event of provider.stream({model:'fixture',messages:[{role:'user',content:'test'}],tools:[],maxOutputTokens:64,signal:abort.signal})){if(event.type==='text'){state=chatReducer(state,{type:'event',event:{type:'text-delta',text:event.text}});abort.abort();state=chatReducer(state,{type:'stop'});}}
 assert.equal(state.busy,false);assert.deepEqual(state.items.filter(i=>i.kind==='agent'),[{id:'m2',kind:'agent',text:'first',streaming:false,incomplete:'stopped'}]);assert.ok(!JSON.stringify(state).includes('late'));
});
