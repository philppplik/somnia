import test from 'node:test';
import assert from 'node:assert/strict';
import {browserWorker,workerUrl,ExtensionRuntime,type WorkerLike,type WorkerEnv} from './runtime';
import {WORKER_SOURCE} from './workerSource';
import type {ExtensionManifest} from './types';

const manifest={id:'acme.demo',name:'Demo',version:'1.0.0',apiVersion:1,code:'1',permissions:[],contributes:{commands:[],snippets:[],codeThemes:[],panels:[]}} as unknown as ExtensionManifest;
const fake=():WorkerLike&{sent:any[];ended:boolean}=>({sent:[],ended:false,onmessage:null,onerror:null,postMessage(m){this.sent.push(m);},terminate(){this.ended=true;}});
const deps={files:()=>({}),applyOperations(){},selection:()=>null,storage:{get:()=>null,set(){}},notify(){},log(){}};

test('workerUrl follows the somnia-ext contract',()=>{
 assert.equal(workerUrl('acme.demo',false),'somnia-ext://worker/acme.demo');
 assert.equal(workerUrl('acme.demo',true),'http://somnia-ext.localhost/worker/acme.demo');
 assert.equal(workerUrl('a b/c',false),'somnia-ext://worker/a%20b%2Fc');
});
test('desktop creates the worker from the scheme URL, never from a blob',()=>{
 const urls:string[]=[];let blobs=0;const env:WorkerEnv={tauri:true,windowsStyle:false,create:u=>{urls.push(u);return fake();},createFromSource:()=>{blobs++;return fake();}};
 browserWorker(WORKER_SOURCE,'acme.demo',env);
 assert.deepEqual(urls,['somnia-ext://worker/acme.demo']);assert.equal(blobs,0);
});
test('web fallback without Tauri uses the blob worker',()=>{
 const srcs:string[]=[];let urls=0;const env:WorkerEnv={tauri:false,windowsStyle:false,create:()=>{urls++;return fake();},createFromSource:s=>{srcs.push(s);return fake();}};
 browserWorker(WORKER_SOURCE,'acme.demo',env);
 assert.deepEqual(srcs,[WORKER_SOURCE]);assert.equal(urls,0);
});
test('runtime passes the extension id to the factory, keeps timeout and dispose',async()=>{
 const w=fake();let got:string[]=[];
 const rt=new ExtensionRuntime(manifest,deps,(s,id)=>{got=[s,id];return w;},20);
 assert.equal(got[1],'acme.demo');assert.equal(got[0],WORKER_SOURCE);
 rt.activate();assert.equal(w.sent[0].type,'activate');
 await assert.rejects(rt.runCommand('acme.demo.x'),/did not finish in time/);
 rt.dispose();assert.equal(w.ended,true);
});
test('permission checks still apply to api calls',()=>{
 const w=fake();new ExtensionRuntime(manifest,deps,()=>w,20);
 w.onmessage!({data:{type:'api.call',requestId:1,method:'project.listFiles',args:[]}});
 assert.equal(w.sent[0].ok,false);
});
test('worker load error is surfaced once',()=>{
 const w=fake();new ExtensionRuntime(manifest,deps,()=>w,20);
 w.onerror!({message:'blocked'});w.onerror!({message:'blocked'});
});
test('desktop falls back to the relay when the scheme worker throws (SecurityError)',()=>{
 const relay=fake();const asked:string[]=[];
 const env:WorkerEnv={tauri:true,windowsStyle:false,create:()=>{throw new Error('SecurityError');},createFromSource:()=>fake(),createRelay:id=>{asked.push(id);return relay;}};
 const w=browserWorker(WORKER_SOURCE,'acme.demo',env);w.postMessage({type:'activate'});
 assert.deepEqual(asked,['acme.demo']);assert.equal(relay.sent.length,1);
});
test('desktop falls back once after an error event before the first message and replays sent messages',()=>{
 const direct=fake();const relay=fake();let relays=0;
 const env:WorkerEnv={tauri:true,windowsStyle:false,create:()=>direct,createFromSource:()=>fake(),createRelay:()=>{relays++;return relay;}};
 const w=browserWorker(WORKER_SOURCE,'acme.demo',env);w.postMessage({type:'activate'});
 direct.onerror?.({message:'x'});assert.equal(relays,1);assert.equal(direct.ended,true);assert.equal(relay.sent.length,1);
 relay.onerror?.({message:'y'});let surfaced=0;w.onerror=()=>{surfaced++;};relay.onerror?.({message:'z'});assert.equal(surfaced,1);assert.equal(relays,1);
});
test('an error after the worker answered is not retried through the relay',()=>{
 const direct=fake();let relays=0;
 const env:WorkerEnv={tauri:true,windowsStyle:false,create:()=>direct,createFromSource:()=>fake(),createRelay:()=>{relays++;return fake();}};
 const w=browserWorker(WORKER_SOURCE,'acme.demo',env);let errs=0;w.onerror=()=>{errs++;};
 direct.onmessage?.({data:{type:'activated'}});direct.onerror?.({message:'late'});assert.equal(relays,0);assert.equal(errs,1);
});
