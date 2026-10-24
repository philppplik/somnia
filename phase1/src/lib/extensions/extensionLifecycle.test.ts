import test from 'node:test';
import assert from 'node:assert/strict';
import {ExtensionRuntime,type WorkerLike} from './runtime';
import type {ExtensionManifest} from './types';

const manifest={id:'acme.demo',name:'Demo',version:'1.0.0',apiVersion:1,code:'1',permissions:[],contributes:{commands:[],snippets:[],codeThemes:[],accentPalettes:[],panels:[]}} as unknown as ExtensionManifest;
const fake=():WorkerLike&{sent:any[];ended:boolean}=>({sent:[],ended:false,onmessage:null,onerror:null,postMessage(m){this.sent.push(m);},terminate(){this.ended=true;}});
const deps={files:()=>({}),applyOperations(){},selection() {return null;},storage:{get:()=>null,set(){}},notify(){},log(){}};
const flush=async()=>{for(let i=0;i<6;i++)await new Promise(r=>setImmediate(r));};

const activated=(w:ReturnType<typeof fake>,protocol=2)=>w.onmessage!({data:{type:'activated',protocol}});

test('suspend captures state and terminates the worker; runCommand resumes on demand',async()=>{
 const workers:ReturnType<typeof fake>[]=[];
 const rt=new ExtensionRuntime(manifest,deps,()=>{const w=fake();workers.push(w);return w;},50);
 rt.activate();activated(workers[0]);
 const pending=rt.suspend();
 await flush();
 const req=workers[0].sent.find(m=>m.type==='suspend');
 assert.ok(req,'suspend request posted');
 workers[0].onmessage!({data:{type:'suspend.done',requestId:req.requestId,ok:true,state:{cursor:3}}});
 const result=await pending;
 assert.deepEqual(result,{ok:true});
 assert.equal(workers[0].ended,true);
 assert.equal(rt.isSuspended(),true);
 // A command auto-resumes: new worker, re-activation, then onResume with the state.
 const run=rt.runCommand('acme.demo.x');
 await flush();
 assert.equal(workers.length,2);
 activated(workers[1]);
 await flush();
 const resumeMsg=workers[1].sent.find(m=>m.type==='resume');
 assert.deepEqual(resumeMsg?.state,{cursor:3});
 workers[1].onmessage!({data:{type:'resume.done',requestId:resumeMsg.requestId,ok:true}});
 await flush();
 const cmd=workers[1].sent.find(m=>m.type==='command.run');
 workers[1].onmessage!({data:{type:'command.done',requestId:cmd.requestId}});
 await run;
 assert.equal(rt.isSuspended(),false);
});

test('suspend is refused while a command is in flight (legacy pin)',async()=>{
 const w=fake();
 const rt=new ExtensionRuntime(manifest,deps,()=>w,1000);
 rt.activate();activated(w);
 const run=rt.runCommand('acme.demo.x');
 const result=await rt.suspend();
 assert.deepEqual(result,{ok:false,reason:'command-in-flight'});
 assert.equal(w.ended,false);
 w.onmessage!({data:{type:'command.done',requestId:1}});
 await run;
 rt.dispose();
});

test('a protocol v1 worker stays resident: suspend reports unsupported-protocol',async()=>{
 const w=fake();
 const rt=new ExtensionRuntime(manifest,deps,()=>w,50);
 rt.activate();
 w.onmessage!({data:{type:'activated'}}); // no protocol field = v1
 assert.deepEqual(await rt.suspend(),{ok:false,reason:'unsupported-protocol'});
 assert.equal(w.ended,false);
 rt.dispose();
});

test('a failed onSuspend keeps the extension resident without killing the worker',async()=>{
 const w=fake();
 const rt=new ExtensionRuntime(manifest,deps,()=>w,50);
 rt.activate();activated(w);
 const pending=rt.suspend();
 await flush();
 const req=w.sent.find(m=>m.type==='suspend');
 w.onmessage!({data:{type:'suspend.done',requestId:req.requestId,ok:false,error:'boom'}});
 assert.deepEqual(await pending,{ok:false,reason:'onSuspend-failed'});
 assert.equal(w.ended,false);
 assert.equal(rt.isSuspended(),false);
 rt.dispose();
});

test('a hung suspend terminates the worker with a diagnosis (timeout)',async()=>{
 const w=fake();
 const rt=new ExtensionRuntime(manifest,deps,()=>w,20);
 rt.activate();activated(w);
 const result=await rt.suspend();
 assert.deepEqual(result,{ok:false,reason:'onSuspend-failed'});
 assert.equal(w.ended,true); // failHard killed the hung worker
 rt.dispose();
});

test('suspend without an onSuspend handler captures no state and resumes clean',async()=>{
 const workers:ReturnType<typeof fake>[]=[];
 const rt=new ExtensionRuntime(manifest,deps,()=>{const w=fake();workers.push(w);return w;},50);
 rt.activate();activated(workers[0]);
 const pending=rt.suspend();
 await flush();
 const req=workers[0].sent.find(m=>m.type==='suspend');
 workers[0].onmessage!({data:{type:'suspend.done',requestId:req.requestId,ok:true,state:null,noHandler:true}});
 assert.deepEqual(await pending,{ok:true});
 // Resume: no state, so no resume message is sent at all.
 const resumed=rt.resume();
 await flush();
 activated(workers[1]);
 assert.equal(await resumed,true);
 assert.equal(workers[1].sent.some(m=>m.type==='resume'),false);
 rt.dispose();
});
