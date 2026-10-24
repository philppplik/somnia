import test from 'node:test';
import assert from 'node:assert/strict';
import {McpRuntime} from './mcpRuntime';
import {createEditorToolRegistry} from './editorTools';
const tool={server:'files',name:'read_it',description:'Reads',input_schema:{type:'object',properties:{p:{type:'string'}}}};
const mk=()=>{const calls:{c:string;a?:Record<string,unknown>}[]=[];let running=false;
 const rt=new McpRuntime(async<T,>(c:string,a?:Record<string,unknown>)=>{calls.push({c,a});
  if(c==='mcp_servers_list')return [{config:{id:'files',command:'/bin/x',args:[],env:{}},running}] as T;
  if(c==='mcp_server_start'){running=true;return [tool] as T;}
  if(c==='mcp_server_stop'){running=false;return undefined as T;}
  if(c==='mcp_tool_call')return 'ok' as T;
  return undefined as T;});return {rt,calls};};
test('save/start/stop use the Rust argument names and track tools',async()=>{
 const {rt,calls}=mk();await rt.save({id:'files',command:'/bin/x',args:[],env:{}});await rt.start('files');
 assert.equal(rt.getSnapshot().tools.length,1);assert.deepEqual(calls.find(c=>c.c==='mcp_server_save')?.a,{config:{id:'files',command:'/bin/x',args:[],env:{}}});
 assert.deepEqual(calls.find(c=>c.c==='mcp_server_start')?.a,{id:'files'});
 await rt.stop('files');assert.equal(rt.getSnapshot().tools.length,0);
});
test('an ungranted tool is not registered; a grant registers it and a call needs approval',async()=>{
 const {rt,calls}=mk();await rt.start('files');
 const r0=createEditorToolRegistry({allowExecute:true});assert.deepEqual(rt.register(r0),[]);
 rt.setGranted(tool,true);const r=createEditorToolRegistry({allowExecute:true});const names=rt.register(r);assert.equal(names.length,1);
 const sig=new AbortController().signal;const grants={levels:['read','propose','execute'] as const};
 const run=r.run(names[0],{p:'a'},{files:()=>({}),propose:async()=>{}} as never,sig,grants);
 await new Promise(x=>setTimeout(x,5));assert.equal(rt.getSnapshot().pending.length,1);assert.equal(calls.some(c=>c.c==='mcp_tool_call'),false);
 rt.decide(rt.getSnapshot().pending[0].id,true);const out=JSON.parse(await run);assert.equal(out.untrusted,true);
 assert.deepEqual(calls.find(c=>c.c==='mcp_tool_call')?.a,{server:'files',tool:'read_it',arguments:{p:'a'},choice:'allow_once'});
});
test('denial and abort never call the tool',async()=>{
 const {rt,calls}=mk();await rt.start('files');rt.setGranted(tool,true);const r=createEditorToolRegistry({allowExecute:true});const [n]=rt.register(r);
 const g={levels:['read','propose','execute'] as const};const ctx={files:()=>({}),propose:async()=>{}} as never;
 const p1=r.run(n,{},ctx,new AbortController().signal,g);await new Promise(x=>setTimeout(x,5));rt.decide(rt.getSnapshot().pending[0].id,false);await assert.rejects(p1);
 const ac=new AbortController();const p2=r.run(n,{},ctx,ac.signal,g);await new Promise(x=>setTimeout(x,5));ac.abort();await assert.rejects(p2);
 assert.equal(rt.getSnapshot().pending.length,0);assert.equal(calls.some(c=>c.c==='mcp_tool_call'),false);
});
test('a changed tool schema drops the grant',async()=>{
 const {rt}=mk();rt.setGranted(tool,true);assert.equal(rt.isGranted(tool),true);assert.equal(rt.isGranted({...tool,description:'Reads and deletes'}),false);
});
const strictTool={server:'files',name:'strict_read',description:'Reads',input_schema:{type:'object',required:['p'],properties:{p:{type:'string'}}}};
test('invalid arguments are rejected before any approval prompt and logged without the arguments',async()=>{
 const {rt,calls}=mk();rt.setGranted(strictTool,true);
 (rt as unknown as {snap:{tools:unknown[]}}).snap.tools=[strictTool];
 const r=createEditorToolRegistry({allowExecute:true});const [n]=rt.register(r);
 const g={levels:['read','propose','execute'] as const};const ctx={files:()=>({}),propose:async()=>{}} as never;
 await assert.rejects(r.run(n,{p:42},ctx,new AbortController().signal,g),/must be string/);
 assert.equal(rt.getSnapshot().pending.length,0);assert.equal(calls.some(c=>c.c==='mcp_tool_call'),false);
 const [a]=rt.getSnapshot().activity;assert.equal(a.outcome,'invalid');assert.equal(a.tool,'strict_read');assert.equal('args' in a,false);
});
test('activity log records approved, denied and failed calls, newest first, capped, clearable',async()=>{
 const {rt}=mk();await rt.start('files');rt.setGranted(tool,true);const r=createEditorToolRegistry({allowExecute:true});const [n]=rt.register(r);
 const g={levels:['read','propose','execute'] as const};const ctx={files:()=>({}),propose:async()=>{}} as never;
 const p1=r.run(n,{p:'a'},ctx,new AbortController().signal,g);await new Promise(x=>setTimeout(x,5));rt.decide(rt.getSnapshot().pending[0].id,true);await p1;
 const p2=r.run(n,{p:'b'},ctx,new AbortController().signal,g);await new Promise(x=>setTimeout(x,5));rt.decide(rt.getSnapshot().pending[0].id,false);await assert.rejects(p2);
 assert.deepEqual(rt.getSnapshot().activity.map(a=>a.outcome),['denied','ok']);
 for(let i=0;i<60;i++){const p=r.run(n,{},ctx,new AbortController().signal,g);await new Promise(x=>setTimeout(x,0));rt.decide(rt.getSnapshot().pending[0].id,false);await assert.rejects(p);}
 assert.equal(rt.getSnapshot().activity.length,50);rt.clearActivity();assert.equal(rt.getSnapshot().activity.length,0);
});
const failClosedTools=[
 {server:'files',name:'uses_ref',description:'r',input_schema:{type:'object',properties:{p:{$ref:'#/$defs/x'}}}},
 {server:'files',name:'no_extra',description:'r',input_schema:{type:'object',additionalProperties:false,properties:{p:{type:'string'}}}},
];
test('fail-closed: unsupported schema keywords and extra arguments never reach approval or the bridge',async()=>{
 const calls:string[]=[];
 const rt=new McpRuntime(async<T,>(c:string)=>{calls.push(c);if(c==='mcp_server_start')return failClosedTools as T;if(c==='mcp_servers_list')return [{config:{id:'files',command:'/bin/x',args:[],env:{}},running:true}] as T;return undefined as T;});
 await rt.start('files');for(const t of failClosedTools)rt.setGranted(t,true);
 const r=createEditorToolRegistry({allowExecute:true});const names=rt.register(r);assert.equal(names.length,2);
 const g={levels:['read','propose','execute'] as const};const ctx={files:()=>({}),propose:async()=>{}} as never;const sig=new AbortController().signal;
 await assert.rejects(r.run(names[0],{p:'a'},ctx,sig,g),(e:Error)=>e.name==='McpArgsError');
 await assert.rejects(r.run(names[1],{p:'a',extra:1},ctx,sig,g),(e:Error)=>e.name==='McpArgsError'&&/not an allowed argument/.test(e.message));
 assert.equal(rt.getSnapshot().pending.length,0);assert.equal(calls.includes('mcp_tool_call'),false);
 assert.deepEqual(rt.getSnapshot().activity.map(a=>a.outcome),['invalid','invalid']);
 assert.match(rt.getSnapshot().activity[0].detail??'',/^SOM-AGT-003 /);
});
const digest='a'.repeat(64);
const toolD={...tool,schema_digest:digest};
const mkB=(opts:{needConsent?:boolean;grants?:unknown}={})=>{const calls:{c:string;a?:Record<string,unknown>}[]=[];let running=false;let grants:unknown=opts.grants??{shell:[],network:[],mcp:[]};
 const rt=new McpRuntime(async<T,>(c:string,a?:Record<string,unknown>)=>{calls.push({c,a});
  if(c==='mcp_servers_list')return [{config:{id:'files',command:'/bin/x',args:['--a'],env:{}},running}] as T;
  if(c==='mcp_server_start'){if(opts.needConsent&&!a?.choice)throw Error('mcp_consent_required');running=true;return [toolD] as T;}
  if(c==='mcp_tool_call')return 'ok' as T;
  if(c==='mcp_grants_list')return grants as T;
  if(c==='mcp_grant_revoke'){grants={shell:[],network:[],mcp:[]};return 1 as T;}
  return undefined as T;});return {rt,calls};};
const gctx={files:()=>({}),propose:async()=>{}} as never;const gg={levels:['read','propose','execute'] as const};
test('consent dialog has three answers: allow for run creates a grant request and refreshes the grants view',async()=>{
 const {rt,calls}=mkB();await rt.start('files');rt.setGranted(toolD,true);const r=createEditorToolRegistry({allowExecute:true});const [n]=rt.register(r);
 const run=r.run(n,{p:'a'},gctx,new AbortController().signal,gg);await new Promise(x=>setTimeout(x,5));
 assert.equal(rt.getSnapshot().pending[0].kind,'call');rt.decide(rt.getSnapshot().pending[0].id,'allow_for_run');await run;
 assert.deepEqual(calls.find(c=>c.c==='mcp_tool_call')?.a,{server:'files',tool:'read_it',arguments:{p:'a'},choice:'allow_for_run'});
 await new Promise(x=>setTimeout(x,5));assert.ok(calls.filter(c=>c.c==='mcp_grants_list').length>=2);
});
test('an exact broker grant answers without a dialog; a different digest still asks; revoke goes through the broker',async()=>{
 const {rt,calls}=mkB({grants:{shell:[],network:[],mcp:[{grantId:'g1',server:'files',tool:'read_it',schemaDigest:digest}]}});
 await rt.start('files');rt.setGranted(toolD,true);const r=createEditorToolRegistry({allowExecute:true});const [n]=rt.register(r);
 await r.run(n,{p:'a'},gctx,new AbortController().signal,gg);assert.equal(rt.getSnapshot().pending.length,0);
 assert.deepEqual(calls.find(c=>c.c==='mcp_tool_call')?.a,{server:'files',tool:'read_it',arguments:{p:'a'}});
 (rt as unknown as {snap:{brokerGrants:{mcp:{schemaDigest:string}[]}}}).snap.brokerGrants.mcp[0].schemaDigest='b'.repeat(64);
 const r2=createEditorToolRegistry({allowExecute:true});const [n2]=rt.register(r2);const p=r2.run(n2,{p:'a'},gctx,new AbortController().signal,gg);
 await new Promise(x=>setTimeout(x,5));assert.equal(rt.getSnapshot().pending.length,1);rt.decide(rt.getSnapshot().pending[0].id,false);await assert.rejects(p);
 await rt.revokeGrant('mcp','g1');assert.deepEqual(calls.find(c=>c.c==='mcp_grant_revoke')?.a,{kind:'mcp',grantId:'g1'});assert.equal(rt.getSnapshot().brokerGrants.mcp.length,0);
});
test('starting a server asks when the broker needs consent and passes the answer; deny keeps it stopped',async()=>{
 const {rt,calls}=mkB({needConsent:true});await rt.refresh();const s=rt.start('files');await new Promise(x=>setTimeout(x,5));
 const req=rt.getSnapshot().pending[0];assert.equal(req.kind,'start');assert.deepEqual(req.args,{command:'/bin/x',arguments:['--a']});
 rt.decide(req.id,'allow_for_run');await s;assert.deepEqual(calls.filter(c=>c.c==='mcp_server_start').map(c=>c.a),[{id:'files'},{id:'files',choice:'allow_for_run'}]);assert.equal(rt.getSnapshot().tools.length,1);
 const b=mkB({needConsent:true});await b.rt.refresh();const s2=b.rt.start('files');await new Promise(x=>setTimeout(x,5));b.rt.decide(b.rt.getSnapshot().pending[0].id,false);await s2;
 assert.equal(b.rt.getSnapshot().tools.length,0);assert.match(b.rt.getSnapshot().error,/mcp_denied/);
});
