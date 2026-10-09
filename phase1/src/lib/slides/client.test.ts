import test from 'node:test';
import assert from 'node:assert/strict';
import {SlidesClient} from './client';
class FakeWorker {
 static current:FakeWorker;onmessage:((e:{data:unknown})=>void)|null=null;onerror:(()=>void)|null=null;terminated=false;calls:unknown[]=[];
 constructor(){FakeWorker.current=this;}
 postMessage(data:unknown){this.calls.push(data);}
 terminate(){this.terminated=true;}
 reply(data:unknown){this.onmessage?.({data});}
}
test('RPC serial IDs, errors, disposal and later requests fail closed',async()=>{
 const old=globalThis.Worker;globalThis.Worker=FakeWorker as unknown as typeof Worker;
 try{const c=new SlidesClient();const opening=c.open(new Uint8Array([1]));const w=FakeWorker.current;assert.deepEqual(w.calls,[{op:'init',id:1}]);w.reply({id:1,result:true});await Promise.resolve();assert.equal(w.calls.length,2);w.reply({id:2,result:{slides:2,widthPt:720,heightPt:405}});assert.equal((await opening).slides,2);
 const pending=c.render(0,1);c.dispose();await assert.rejects(pending,/cancelled/);assert.ok(w.terminated);await assert.rejects(c.read(0),/closed/);c.dispose();
 const d=new SlidesClient();const rejected=d.open(new Uint8Array());FakeWorker.current.reply({id:1,error:'WASM unavailable'});await assert.rejects(rejected,/WASM unavailable/);d.dispose();
 }finally{globalThis.Worker=old;}
});
test('worker failure rejects all pending calls and terminates execution',async()=>{
 const old=globalThis.Worker;globalThis.Worker=FakeWorker as unknown as typeof Worker;
 try{const c=new SlidesClient();const p=c.open(new Uint8Array());FakeWorker.current.onerror?.();await assert.rejects(p,/worker failed/);assert.ok(FakeWorker.current.terminated);}finally{globalThis.Worker=old;}
});
