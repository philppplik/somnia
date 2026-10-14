import test from 'node:test';import assert from 'node:assert/strict';
import {LocalModelsRuntime} from './localModels';
import {LocalModelManager,PullParser,registryModel,classifyPullError} from './localModelManager';
const encoded=(text:string)=>Array.from(new TextEncoder().encode(text));
function fixture(lines:string[],verified=true){
 let index=0,cancel=0,removed=false;
 const runtime=new LocalModelsRuntime(undefined,async op=>op==='version'?{version:'1'}:op==='tags'?{models:removed?[]:[{name:'qwen3:4b',digest:'digest'}]}:{model_info:verified?{architecture:'qwen'}:{},capabilities:['completion']},async()=>({installed:true}),()=>true);
 const manager=new LocalModelManager(runtime,{start:async()=> 'owned',next:async()=>index<lines.length?encoded(lines[index++]):null,cancel:async()=>{cancel++;return 'unknown';},remove:async()=>{removed=true;},launch:async()=>({launched:true})},()=>true);
 return {manager,getCancel:()=>cancel};
}
test('NDJSON split across byte chunks preserves complete records',()=>{
 const parser=new PullParser();assert.deepEqual(parser.feed(new TextEncoder().encode('{"status":"pull')),[]);
 assert.deepEqual(parser.feed(new TextEncoder().encode('ing","digest":"d","completed":100,"total":100}\n')),[{status:'pulling',digest:'d',completed:100,total:100}]);
 assert.deepEqual(parser.feed(new TextEncoder().encode('{"status":"success"}'),true),[{status:'success'}]);
 assert.throws(()=>new PullParser().feed(new TextEncoder().encode('broken\n')));
 assert.throws(()=>new PullParser().feed(new TextEncoder().encode('{"total":-1}\n')));
});
test('only terminal success plus fresh installed inventory and local verification Complete',async()=>{
 const {manager,getCancel}=fixture(['{"status":"pulling","digest":"d","completed":100,"total":100}\n','{"status":"success"}\n']);
 await manager.pull('qwen3:4b');assert.equal(manager.snapshot()?.phase,'complete');assert.equal(getCancel(),1);
});
test('100 percent layer and EOF cannot fake completion',async()=>{
 const {manager}=fixture(['{"status":"pulling","digest":"d","completed":100,"total":100}\n']);
 await manager.pull('qwen3:4b');assert.equal(manager.snapshot()?.phase,'interrupted');
});
test('terminal success without local weights cannot fake Complete',async()=>{
 const {manager}=fixture(['{"status":"success"}\n'],false);await manager.pull('qwen3:4b');assert.equal(manager.snapshot()?.phase,'interrupted');
});
test('daemon errors are categorized without passing daemon text to UI',async()=>{
 const {manager}=fixture(['{"error":"no space left on disk /private/path"}\n']);await manager.pull('qwen3:4b');assert.equal(manager.snapshot()?.phase,'failed');assert.equal(manager.snapshot()?.error,'Not enough disk space');
 assert.equal(classifyPullError('permission denied secret'),'Model storage permission denied');
});
test('cancel during preparation preserves honest unknown outcome and never Complete',async()=>{
 const {manager}=fixture(['{"status":"success"}\n']);const running=manager.pull('qwen3:4b');await manager.cancel();await running;
 assert.equal(manager.snapshot()?.cancelOutcome,'unknown');assert.equal(manager.snapshot()?.phase,'interrupted');
});
test('an owned pull is single flight and manager survives subscriptions unmounting',async()=>{
 const {manager}=fixture(['{"status":"success"}\n']);const unsub=manager.subscribe(()=>{});const pending=manager.pull('qwen3:4b');unsub();
 await assert.rejects(manager.pull('qwen3:4b'));await pending;assert.equal(manager.snapshot()?.phase,'complete');
});
test('registry validation refuses remote registry names, traversal and cloud aliases',()=>{
 for(const input of ['evil.test/model','https://evil/model','../evil','model:CLOUD','a/b/c'])assert.throws(()=>registryModel(input));
 assert.equal(registryModel(' qwen3:4b '),'qwen3:4b');
});
test('remove reconciles fresh inventory absence',async()=>{
 const {manager}=fixture([]);await manager.remove('qwen3:4b','digest');
});
test('activity gate blocks launch, pulls and deletes',async()=>{
 const manager=new LocalModelManager(undefined,undefined,()=>false);
 await assert.rejects(manager.pull('qwen3:4b'));await assert.rejects(manager.remove('qwen3:4b','digest'));await assert.rejects(manager.launch());
});
test('failed delete never claims success and prevents implicit retry',async()=>{
 const {manager}=fixture([]);await manager.remove('qwen3:4b','digest');
 const runtime=new LocalModelsRuntime(undefined,async op=>op==='version'?{version:'1'}:{models:[{name:'qwen3:4b',digest:'d'}]},async()=>({installed:true}),()=>true);
 const failed=new LocalModelManager(runtime,{start:async()=>'',next:async()=>null,cancel:async()=> 'unknown',remove:async()=>{throw Error('Delete answered 404');},launch:async()=>({launched:true})},()=>true);
 await assert.rejects(failed.remove('qwen3:4b','d'),/404/);
});
test('untagged names resolve to an explicit reviewed latest variant',()=>{assert.equal(registryModel('qwen3'),'qwen3:latest');});
test('fresh selected volume blocks insufficient catalog pull before transport start',async()=>{
 let starts=0;const runtime=new LocalModelsRuntime(undefined,async op=>op==='version'?{version:'1'}:{models:[]},async()=>({installed:true}),()=>true);
 const manager=new LocalModelManager(runtime,{start:async()=>{starts++;return 'id';},next:async()=>null,cancel:async()=> 'unknown',remove:async()=>{},launch:async()=>({launched:true})},()=>true,async token=>({token,freeBytes:1,checkedAt:Date.now(),source:'user-selected-volume'}));
 await manager.pull('qwen3:4b',{token:'reviewed',freeBytes:20*1024**3,checkedAt:Date.now(),source:'user-selected-volume'});assert.equal(starts,0);assert.match(manager.snapshot()?.error??'',/disk space/);
});
