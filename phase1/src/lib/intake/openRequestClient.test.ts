import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpenRequestClient,type OpenRequestsListen} from './openRequestClient';
import {CommandError,__testing} from '../invokeCmd';

function harness(){
 const calls:{command:string;args?:Record<string,unknown>}[]=[];
 const listeners=new Map<string,(e:{payload:unknown})=>void>();
 let impl:(command:string,args?:Record<string,unknown>)=>Promise<unknown>=async()=>({});
 __testing.setTransport(async(name,args)=>{calls.push({command:name,args});return impl(name,args);});
 const lis:OpenRequestsListen=async(event,handler)=>{listeners.set(event,handler as (e:{payload:unknown})=>void);return()=>{listeners.delete(event);};};
 return{calls,listeners,setImpl:(fn:typeof impl)=>{impl=fn;},client:createOpenRequestClient(lis)};
}
test.afterEach(()=>__testing.reset());

test('claim/ack/release/retry send camelCase args and surface the corr on rejections',async()=>{
 const h=harness();
 h.setImpl(async()=>({items:[],accepted:[],retryTokens:[]}));
 await h.client.claimOpenRequest('req-1');
 await h.client.ackOpenRequest('req-1',[{ordinal:0,status:'opened'}]);
 await h.client.releaseCandidate('req-1');
 await h.client.retryOpenItem('req-1',2,'tok-9');
 assert.deepEqual(h.calls.map(c=>[c.command,c.args]),[
  ['claim_open_request',{requestId:'req-1'}],
  ['ack_open_request',{requestId:'req-1',outcomes:[{ordinal:0,status:'opened'}]}],
  ['release_candidate',{requestId:'req-1'}],
  ['retry_open_item',{requestId:'req-1',ordinal:2,retryToken:'tok-9'}]]);
 h.setImpl(async()=>{throw{id:'SOM-APP-002',code:'unknown-request',message:'gone',incident_id:'inc-1',expected:false};});
 const err=await h.client.claimOpenRequest('req-1').catch(e=>e);
 assert.ok(err instanceof CommandError);
 assert.equal(err.corr,'req-1','rejection carries the request correlation id');
});

test('typed boundary rejection becomes a CommandError carrying id, code and incident_id',async()=>{
 const h=harness();
 h.setImpl(async()=>{throw{id:'SOM-APP-002',code:'locked',message:'project locked',detail:'d',incident_id:'inc-7',expected:false};});
 const err=await h.client.claimOpenRequest('req-1').catch(e=>e);
 assert.ok(err instanceof CommandError);
 assert.equal(err.id,'SOM-APP-002');assert.equal(err.code,'locked');assert.equal(err.incident_id,'inc-7');assert.equal(err.expected,false);
});

test('legacy string rejection is normalised to the reserved untyped id',async()=>{
 const h=harness();
 h.setImpl(async()=>{throw 'boom';});
 const err=await h.client.drainOpenRequests().catch(e=>e);
 assert.ok(err instanceof CommandError);
 assert.equal(err.id,'SOM-APP-099');assert.equal(err.message,'boom');
});

test('readByGrant decodes base64 bytes from the camelCase DTO',async()=>{
 const h=harness();
 h.setImpl(async()=>({name:'a.html',ext:'html',size:5,identityToken:'tok',dataBase64:btoa('hello')}));
 const read=await h.client.readByGrant('g1','req-1');
 assert.equal(read.name,'a.html');assert.equal(read.identityToken,'tok');assert.equal(read.size,5);
 assert.deepEqual([...read.bytes],[...new TextEncoder().encode('hello')]);
 assert.deepEqual(h.calls[0],{command:'read_by_grant',args:{grant:'g1'}});
});

test('readByGrant rejects a contract violation instead of decoding garbage',async()=>{
 const h=harness();
 h.setImpl(async()=>({name:'a.html',size:1,identityToken:'tok'}));
 await assert.rejects(()=>h.client.readByGrant('g1','req-1'),/contract violation/);
});

test('ack surfaces retry tokens; a missing expiresAt is preserved as absent (no retry offer)',async()=>{
 const h=harness();
 h.setImpl(async()=>({accepted:[0],retryTokens:[{ordinal:0,token:'t1'}]}));
 const reply=await h.client.ackOpenRequest('req-1',[{ordinal:0,status:'failed',cause:'locked'}]);
 assert.deepEqual(reply.retryTokens,[{ordinal:0,token:'t1'}]);
 assert.equal(reply.retryTokens[0].expiresAt,undefined);
});

test('the open-requests listener is registered through the event API and yields counts only',async()=>{
 const h=harness();
 const seen:number[]=[];
 await h.client.onOpenRequestsChanged(e=>seen.push(e.count));
 assert.equal(h.listeners.size,1);
 h.listeners.get('somnia://open-requests')!({payload:{count:3}});
 assert.deepEqual(seen,[3]);
});

test('policy commands round-trip the allowUnc flag camelCase',async()=>{
 const h=harness();
 h.setImpl(async()=>null);
 await h.client.setIntakePolicy({allowUnc:true});
 assert.deepEqual(h.calls[0],{command:'set_intake_policy',args:{allowUnc:true}});
});
