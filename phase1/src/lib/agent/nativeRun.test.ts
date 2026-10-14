import {test} from 'node:test';import assert from 'node:assert/strict';
import {assertLocalNativeRun,assertNativeAction,assertNativeReceipt,NativeRunLedger,type NativeActionContract} from './nativeRun';
const target={documentId:'d1',path:'active.html',revision:2,adapter:'code',studioKind:'code' as const};
const action:NativeActionContract={id:'a',target,effect:'edit',reviewId:'review1',history:'one-native-entry'};
test('exact target, immutable review, external refusal and one-history contract',()=>{
 assertNativeAction(action,target,'review1');
 for(const current of [{...target,revision:3},{...target,documentId:'d2'},{...target,path:'other.html'},{...target,adapter:null}])assert.throws(()=>assertNativeAction(action,current,'review1'),/changed/);
 assert.throws(()=>assertNativeAction(action,target,'review2'),/review/);
 assert.throws(()=>assertNativeAction({...action,effect:'external-effect'},target),/external/);
 assert.throws(()=>assertNativeAction({...action,history:'none'},target,'review1'),/undo/);
});
test('applied1 no-op0 failure0, unverifiable mutation stays unknown',()=>{
 const r={actionId:'a',target,outcome:'applied' as const,undoEntries:1 as const,readback:'verified' as const};assertNativeReceipt(action,r);
 assert.throws(()=>assertNativeReceipt(action,{...r,undoEntries:0}),/one/);
 for(const outcome of ['noop','failed']as const){assertNativeReceipt(action,{...r,outcome,undoEntries:0});assert.throws(()=>assertNativeReceipt(action,{...r,outcome}),/zero/);}
 assertNativeReceipt(action,{...r,outcome:'unknown',undoEntries:null,readback:'unverified'});
 assert.throws(()=>assertNativeReceipt(action,{...r,actionId:'wrong'}),/Wrong/);
});
test('local mode blocks cloud, ledger bounded immutable stale suppression no payload fields',()=>{
 assertLocalNativeRun({executionMode:'local-native'},'ollama');assert.throws(()=>assertLocalNativeRun({executionMode:'local-native'},'openai'),/No cloud fallback/);
 const ledger=new NativeRunLedger();ledger.begin('r1','ollama','exact');for(let i=0;i<100;i++)ledger.record('r1',{phase:'prepared',target,history:0,readback:'verified'});
 assert.equal(ledger.snapshot().entries.length,64);assert.ok(Object.isFrozen(ledger.snapshot().entries[0].target));ledger.begin('r2','ollama','exact');ledger.record('r1',{phase:'applied',history:1,readback:'verified'});assert.equal(ledger.snapshot().entries.length,0);ledger.clear();assert.equal(ledger.snapshot().runId,null);
});
test('panel local-native rejects selected cloud before daemon or provider access',async()=>{
 const {configureAgent,realCore}=await import('./panelBridge');const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('No disclosure');};
 try{realCore.clear?.();configureAgent({provider:'openai',model:'external',apiKey:'',allowActiveFile:false});const events:any[]=[];await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Missing error')),2000);realCore.run({prompt:'Synthetic request',context:{executionMode:'local-native',activeFile:'',selectedElementId:null}},e=>{events.push(e);if(e.type==='error'){clearTimeout(timer);resolve();}});});assert.equal(calls,0);assert.match(events[0].message,/No cloud fallback/);}finally{globalThis.fetch=original;realCore.clear?.();}
});
test('metadata projection drops accidental payload fields from host events',()=>{const l=new NativeRunLedger();l.begin('r','ollama','exact');l.record('r',{phase:'review',history:0,readback:'verified',target:{...target,text:'private-doc'},prompt:'private-prompt',arguments:'private-arguments'} as any);assert.ok(!JSON.stringify(l.snapshot()).includes('private-'));});
