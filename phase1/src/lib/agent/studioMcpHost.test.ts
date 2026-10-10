import test from 'node:test';
import assert from 'node:assert/strict';
import {StudioMcpHost,type StudioMcpDeps} from './studioMcpHost';
import {AgentToolRegistry} from './toolRegistry';

const obj=(properties:Record<string,unknown>,required:string[]=[])=>({type:'object',properties,required});
function fakeDeps(over:{path?:string;withSource?:boolean}={}){
 const calls:{cmd:string;args?:unknown}[]=[];
 let cb:((p:{id:number;message:string})=>void|Promise<void>)|null=null;
 let running=false;
 const target={path:over.path??'notes.md'};
 const staged:string[]=[];
 const registry=new AgentToolRegistry({allowExecute:true})
  .register({level:'read',definition:{name:'doc_inspect',description:'Inspect',parameters:obj({})},run:async()=>'{"ok":true}'})
  .register({level:'propose',definition:{name:'doc_propose',description:'Propose',parameters:obj({v:{type:'integer'}},['v'])},run:async a=>{staged.push(String(a.v));return'{"state":"proposed"}';}})
  .register({level:'execute',definition:{name:'doc_run',description:'Run',parameters:obj({})},run:async()=>'boom'});
 const deps:StudioMcpDeps={
  invoke:async<T>(cmd:string,args?:Record<string,unknown>):Promise<T>=>{
   calls.push({cmd,args});
   if(cmd==='studio_mcp_start'){running=true;return{running:true,port:4310,token:'tok'} as T;}
   if(cmd==='studio_mcp_stop'){running=false;return undefined as T;}
   if(cmd==='studio_mcp_status')return{running,port:running?4310:0,token:running?'tok':''} as T;
   return undefined as T;
  },
  listen:async(_e,f)=>{cb=f;return()=>{cb=null;};},
  source:p=>p===target.path&&over.withSource!==false?{studio:'code',registry,context:{files:()=>({'notes.md':'hi'}),propose:async()=>{}}}:null,
  target:()=>target,
 };
 return{deps,calls,target,staged,fire:async(id:number,msg:unknown)=>{await cb!({id,message:typeof msg==='string'?msg:JSON.stringify(msg)});}};
}
const respond=(calls:{cmd:string;args?:unknown}[])=>{const c=calls.filter(x=>x.cmd==='studio_mcp_respond').at(-1);return c?(c.args as {id:number;response:string|null}):null;};

test('start runs the gateway, exposes the active document and answers tools/list',async()=>{
 const{deps,calls,fire}=fakeDeps();
 const h=new StudioMcpHost(deps);
 await h.attach();await h.start();
 assert.equal(h.getSnapshot().running,true);
 assert.equal(h.getSnapshot().port,4310);
 assert.equal(h.getSnapshot().document,'notes.md');
 await fire(1,{jsonrpc:'2.0',id:1,method:'tools/list'});
 const r=JSON.parse(respond(calls)!.response!);
 assert.deepEqual(r.result.tools.map((t:{name:string})=>t.name),['doc_inspect','doc_propose']);
});

test('read and propose calls run, validate args and record activity; execute is never listed',async()=>{
 const{deps,calls,staged,fire}=fakeDeps();
 const h=new StudioMcpHost(deps);
 await h.attach();await h.start();
 await fire(1,{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'doc_propose',arguments:{v:3}}});
 await fire(2,{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'doc_propose',arguments:{v:'x'}}});
 await fire(3,{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'doc_run',arguments:{}}});
 const rs=calls.filter(c=>c.cmd==='studio_mcp_respond').map(c=>JSON.parse((c.args as {response:string}).response));
 assert.equal(rs[0].result.isError,false);
 assert.deepEqual(staged,['3']);
 assert.match(rs[1].result.content[0].text,/Invalid arguments/);
 assert.equal(rs[2].error.code,-32602);
 assert.deepEqual(h.getSnapshot().activity.map(a=>a.outcome),['invalid','ok']); // unknown tool names are protocol errors and never reach the activity log
});

test('before start and after stop every request is answered turned off',async()=>{
 const{deps,calls,fire}=fakeDeps();
 const h=new StudioMcpHost(deps);
 await h.attach();
 await fire(1,{jsonrpc:'2.0',id:1,method:'tools/list'});
 assert.match(respond(calls)!.response!,/turned off/);
 await h.start();await h.stop();
 assert.equal(h.getSnapshot().running,false);
 assert.equal(h.getSnapshot().token,'');
 await fire(2,{jsonrpc:'2.0',id:2,method:'tools/list'});
 assert.match(respond(calls)!.response!,/turned off/);
});

test('without a compatible document the server answers with an empty tool set',async()=>{
 const{deps,calls,fire}=fakeDeps({withSource:false});
 const h=new StudioMcpHost(deps);
 await h.attach();await h.start();
 assert.equal(h.getSnapshot().document,'');
 await fire(1,{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18'}});
 await fire(2,{jsonrpc:'2.0',id:2,method:'tools/list'});
 const rs=calls.filter(c=>c.cmd==='studio_mcp_respond').map(c=>JSON.parse((c.args as {response:string}).response));
 assert.equal(rs[0].result.serverInfo.name,'somnia');
 assert.deepEqual(rs[1].result.tools,[]);
});

test('malformed messages get a parse error, notifications get no response',async()=>{
 const{deps,calls,fire}=fakeDeps();
 const h=new StudioMcpHost(deps);
 await h.attach();await h.start();
 await fire(1,'not json');
 assert.match(respond(calls)!.response!,/-32700/);
 await fire(2,{jsonrpc:'2.0',method:'notifications/initialized'});
 assert.equal(respond(calls)!.response,null);
});
