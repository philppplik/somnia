import {test} from 'node:test';
import assert from 'node:assert/strict';
import {browserJsFactory,assertBundledGuestUrl,type JsWorkerLike} from './browserJsTransport';
import {ExtensionError} from '../contracts/v2/api';
import type {RuntimeBootstrap} from '../supervisor';

const bootstrap=(runtime:RuntimeBootstrap['runtime']={type:'js',entry:'dist/extension.js'}):RuntimeBootstrap=>({extensionId:'acme.word-count',digest:'a'.repeat(64),generation:3,apiVersion:'2.0.0',protocolVersion:1,runtime});

class FakeWorker implements JsWorkerLike {
 posted:unknown[]=[];terminated=false;
 onmessage:((event:{data:unknown})=>void)|null=null;
 onerror:((event:unknown)=>void)|null=null;
 onmessageerror:((event:unknown)=>void)|null=null;
 postMessage(message:unknown){this.posted.push(message);}
 terminate(){this.terminated=true;}
}
const make=(opts:{resolve?:Parameters<typeof browserJsFactory>[0];worker?:FakeWorker;signal?:AbortSignal}={})=>{
 const worker=opts.worker??new FakeWorker();
 const factory=browserJsFactory(opts.resolve??(async()=>'http://localhost:1420/src/guest.ts'),{spawnWorker:()=>worker,origin:'http://localhost:1420'});
 return {factory,worker};
};

test('rejects non-js runtimes before touching the resolver',async()=>{
 let resolved=false;
 const factory=browserJsFactory(async()=>{resolved=true;return 'http://localhost:1420/src/guest.ts';},{origin:'http://localhost:1420'});
 await assert.rejects(factory(bootstrap({type:'wasm',entry:'e.wasm',abi:'somnia-json-1'}),new AbortController().signal),(e:unknown)=>e instanceof ExtensionError&&e.code==='E_INCOMPATIBLE_API');
 assert.equal(resolved,false);
});

test('resolver rejection propagates and no worker is spawned',async()=>{
 let spawned=false;
 const factory=browserJsFactory(async()=>{throw new ExtensionError('E_PERMISSION_DENIED','nope');},{spawnWorker:()=>{spawned=true;return new FakeWorker();},origin:'http://localhost:1420'});
 await assert.rejects(factory(bootstrap(),new AbortController().signal),(e:unknown)=>e instanceof ExtensionError&&e.code==='E_PERMISSION_DENIED');
 assert.equal(spawned,false);
});

test('cross-origin guest URL is refused and no worker is spawned',async()=>{
 let spawned=false;
 const factory=browserJsFactory(async()=>'https://evil.example/guest.js',{spawnWorker:()=>{spawned=true;return new FakeWorker();},origin:'http://localhost:1420'});
 await assert.rejects(factory(bootstrap(),new AbortController().signal),(e:unknown)=>e instanceof ExtensionError&&e.code==='E_PERMISSION_DENIED');
 assert.equal(spawned,false);
});

test('assertBundledGuestUrl accepts same-origin and refuses invalid or foreign URLs',()=>{
 assert.doesNotThrow(()=>assertBundledGuestUrl('http://localhost:1420/src/guest.ts','http://localhost:1420'));
 assert.throws(()=>assertBundledGuestUrl('not a url','http://localhost:1420'),(e:unknown)=>e instanceof ExtensionError&&e.code==='E_INVALID_ARGUMENT');
 assert.throws(()=>assertBundledGuestUrl('https://other.example/g.js','http://localhost:1420'),(e:unknown)=>e instanceof ExtensionError&&e.code==='E_PERMISSION_DENIED');
 assert.throws(()=>assertBundledGuestUrl('http://localhost:1420/src/g.ts',''),(e:unknown)=>e instanceof ExtensionError&&e.code==='E_PERMISSION_DENIED');
});

test('loads the worker with entry URL and generation, forwards host frames',async()=>{
 const {factory,worker}=make();
 const transport=await factory(bootstrap(),new AbortController().signal);
 assert.deepEqual(worker.posted[0],{type:'load',entryUrl:'http://localhost:1420/src/guest.ts',generation:3});
 const frame={protocolVersion:1 as const,generation:3,method:'bootstrap',params:{apiVersion:'2.0.0',protocolVersions:[1],digest:'a'.repeat(64)}};
 transport.send(frame);
 assert.deepEqual(worker.posted[1],frame);
 transport.terminate();
 assert.equal(worker.terminated,true);
});

test('guest frames reach onFrame; fatal notices and worker errors reach onError',async()=>{
 const {factory,worker}=make();
 const transport=await factory(bootstrap(),new AbortController().signal);
 const seen:unknown[]=[];const errors:unknown[]=[];
 transport.onFrame=f=>seen.push(f);transport.onError=e=>errors.push(e);
 const hello={protocolVersion:1,generation:3,method:'hello',params:{protocolVersions:[1],runtime:'js'}};
 worker.onmessage?.({data:hello});
 assert.deepEqual(seen,[hello]);
 worker.onmessage?.({data:{type:'fatal',message:'Guest activation failed.'}});
 assert.equal(errors.length,1);assert.ok(errors[0] instanceof ExtensionError);assert.equal((errors[0] as ExtensionError).code,'E_EXTENSION_FAULTED');
 worker.onerror?.({});
 worker.onmessageerror?.({});
 assert.equal(errors.length,3);
});

test('aborted signal after resolution cancels and terminates the worker',async()=>{
 const controller=new AbortController();
 const {factory,worker}=make({resolve:async()=>{controller.abort();return 'http://localhost:1420/src/guest.ts';}});
 await assert.rejects(factory(bootstrap(),controller.signal),(e:unknown)=>e instanceof ExtensionError&&e.code==='E_CANCELLED');
 assert.equal(worker.terminated,false); // aborted before spawn: worker was never created
});

test('aborted signal right after spawn terminates the spawned worker',async()=>{
 const controller=new AbortController();
 let worker:FakeWorker|undefined;
 const factory=browserJsFactory(async()=> 'http://localhost:1420/src/guest.ts',{spawnWorker:()=>{worker=new FakeWorker();controller.abort();return worker;},origin:'http://localhost:1420'});
 await assert.rejects(factory(bootstrap(),controller.signal),(e:unknown)=>e instanceof ExtensionError&&e.code==='E_CANCELLED');
 assert.equal(worker?.terminated,true);
});
