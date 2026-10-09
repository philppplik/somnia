import test from 'node:test';
import assert from 'node:assert/strict';
import {openPanelDocument,closeExtDocuments,relayWorker,type NativePorts} from './nativeScheme';
const mk=()=>{const calls:Array<[string,any]>=[];let onMsg:any=null;const posted:unknown[]=[];let removed=false;
 const ports:NativePorts={invoke:async(c:string,a:any)=>{calls.push([c,a]);return{url:'somnia-ext://worker/a/host?n=1',session:'S'} as any;},
  mountRelay:(_u,cb)=>{onMsg=cb;return{post:m=>posted.push(m),remove:()=>{removed=true;}};}};
 return{ports,calls,posted,emit:(d:unknown)=>onMsg('relay',d),get removed(){return removed;}};};
test('openPanelDocument sends the full document to ext_panel_open',async()=>{
 const t=mk();const r=await openPanelDocument('a','p','<html/>',t.ports);assert.equal(r.session,'S');assert.deepEqual(t.calls[0],['ext_panel_open',{extId:'a',panelId:'p',document:'<html/>'}]);
});
test('closeExtDocuments calls ext_close with null panel for a whole extension',async()=>{const t=mk();closeExtDocuments('a',undefined,t.ports);assert.deepEqual(t.calls[0],['ext_close',{extId:'a',panelId:null}]);});
test('relayWorker queues, unwraps {session,data} and surfaces errors',async()=>{
 const t=mk();const w=relayWorker('a',t.ports);w.postMessage({n:1});
 await new Promise(r=>setTimeout(r,0));assert.deepEqual(t.posted,[{n:1}]);
 const got:unknown[]=[];w.onmessage=e=>got.push(e.data);const errs:string[]=[];w.onerror=e=>errs.push((e as {message:string}).message);
 t.emit({session:'S',data:{type:'activated'}});t.emit({session:'S',error:'boom'});
 assert.deepEqual(got,[{type:'activated'}]);assert.deepEqual(errs,['boom']);
 w.terminate();assert.equal(t.removed,true);assert.equal(t.calls.at(-1)![0],'ext_close');
});
