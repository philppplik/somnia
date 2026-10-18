import test from 'node:test';import assert from 'node:assert/strict';
import {SessionCheckpointer,StaleGenerationError,type Clock} from './checkpointer';
import {MemoryByteStore,RecoveryStore,StorageFullError,slotKey} from './recoveryStore';
import {SnapshotError,assertPlainView,createSnapshot,decodeSnapshot,encodeSnapshot,fingerprintBytes} from './snapshot';
const bytes=(s:string)=>new TextEncoder().encode(s);
class FakeClock implements Clock{t=0;q:{at:number;fn:()=>void;id:number}[]=[];n=0;
 setTimeout(fn:()=>void,ms:number){const id=++this.n;this.q.push({at:this.t+ms,fn,id});return id;}
 clearTimeout(h:unknown){this.q=this.q.filter(x=>x.id!==h);}now(){return this.t;}
 advance(ms:number){this.t+=ms;const due=this.q.filter(x=>x.at<=this.t);this.q=this.q.filter(x=>x.at>this.t);due.forEach(d=>d.fn());}}
function harness(over:Partial<ConstructorParameters<typeof SessionCheckpointer>[0]>={},quota=Infinity){
 const mem=new MemoryByteStore(quota);const store=new RecoveryStore(mem);const clock=new FakeClock();
 const st={rev:0,dirty:false,text:'v0',captures:0,pins:[] as string[]};
 const cp=new SessionCheckpointer({sessionId:'documents:a.docx',studio:'documents',store,sourceFingerprint:'src1',clock,
  getRevision:()=>st.rev,isDirty:()=>st.dirty,
  capture:async()=>{st.captures++;return{revision:st.rev,payload:bytes(st.text),history:{kind:'journal',data:{u:st.rev},truncated:false},view:{scroll:st.rev},format:'docx',engineVersion:'t1'};},
  onPin:r=>st.pins.push(r),...over});
 const edit=(t:string)=>{st.text=t;st.rev++;st.dirty=true;cp.noteEdit();};
 return{mem,store,clock,st,cp,edit};
}
test('snapshot round trip and corruption detection',async()=>{
 const s=await createSnapshot({sessionId:'x',studio:'documents',format:'docx',engineVersion:'1',sourceFingerprint:'f',revision:3,generation:1,history:{kind:'none'},view:{a:1}},bytes('hello'));
 const enc=encodeSnapshot(s);const back=await decodeSnapshot(enc);assert.equal(new TextDecoder().decode(back.payload),'hello');assert.equal(back.meta.revision,3);
 const flip=enc.slice();flip[flip.length-1]^=1;await assert.rejects(decodeSnapshot(flip),(e:SnapshotError)=>e.kind==='checksum-mismatch');
 await assert.rejects(decodeSnapshot(enc.slice(0,enc.length-2)),(e:SnapshotError)=>e.kind==='size-mismatch');
 await assert.rejects(decodeSnapshot(enc.slice(0,5)),(e:SnapshotError)=>e.kind==='truncated');
 await assert.rejects(decodeSnapshot(bytes('NOPE0000')),(e:SnapshotError)=>e.kind==='bad-magic');
 const hdr=JSON.parse(new TextDecoder().decode(enc.subarray(8,8+new DataView(enc.buffer).getUint32(4,true))));
 const tampered=await createSnapshot({sessionId:'x',studio:'documents',format:'docx',engineVersion:'1',sourceFingerprint:'f',revision:3,generation:1,history:{kind:'none'},view:{}},bytes('hello'));
 tampered.meta.schema=99;await assert.rejects(decodeSnapshot(encodeSnapshot(tampered)),(e:SnapshotError)=>e.kind==='unsupported-schema');assert.ok(hdr.checksum);
});
test('view state rejects handles, blob urls and credentials',()=>{
 assert.throws(()=>assertPlainView({u:'blob:http://x/1'}));assert.throws(()=>assertPlainView({apiKey:'k'}));assert.throws(()=>assertPlainView({f:()=>1}));assertPlainView({scroll:[1,2],sel:{a:'A1'}});
});
test('fingerprint differs for different bytes',async()=>{assert.notEqual(await fingerprintBytes(bytes('a')),await fingerprintBytes(bytes('b')));});
test('debounce coalesces edits, max interval bounds latency',async()=>{
 const h=harness();h.edit('a');h.clock.advance(1000);h.edit('ab');h.clock.advance(1000);assert.equal(h.st.captures,0);
 for(let i=0;i<10;i++){h.edit('x'+i);h.clock.advance(1000);}
 await new Promise(r=>setImmediate(r));assert.ok(h.st.captures>=1,'max interval forces a checkpoint during continuous typing');
});
test('checkpoint verifies, prunes to two slots, newest wins',async()=>{
 const h=harness();for(let i=1;i<=4;i++){h.edit('t'+i);const r=await h.cp.checkpoint();assert.ok(r.ok);}
 const keys=(await h.mem.keys()).sort();assert.equal(keys.length,2);
 const l=await h.store.load('documents:a.docx');assert.equal(new TextDecoder().decode(l!.snapshot.payload),'t4');
});
test('crash mid-write: corrupt newest slot falls back to previous good one',async()=>{
 const h=harness();h.edit('good');await h.cp.checkpoint();h.edit('newer');await h.cp.checkpoint();
 const keys=(await h.mem.keys()).sort();const newest=keys[keys.length-1];const b=h.mem.map.get(newest)!;h.mem.map.set(newest,b.slice(0,b.length-3));
 const l=await h.store.load('documents:a.docx');assert.equal(new TextDecoder().decode(l!.snapshot.payload),'good');assert.equal(l!.skippedCorrupt,1);
});
test('failed write keeps the previous snapshot and pins the session',async()=>{
 const h=harness();h.edit('one');assert.ok((await h.cp.checkpoint()).ok);h.edit('two');h.mem.failNextPut=new Error('disk gone');
 const r=await h.cp.checkpoint();assert.equal(r.ok,false);assert.equal(h.cp.pinned?.reason,'checkpoint-failed');
 const l=await h.store.load('documents:a.docx');assert.equal(new TextDecoder().decode(l!.snapshot.payload),'one');
 let disposed=false;assert.equal(h.cp.disposeIfSafe(()=>{disposed=true;}),false);assert.equal(disposed,false);
 h.mem.failNextPut=new Error('still gone');const s=await h.cp.prepareSuspend();assert.equal(s.ok,false);assert.equal(disposed,false);
 assert.ok((await h.cp.checkpoint()).ok);assert.equal(h.cp.pinned,null);
});
test('storage full is reported as such',async()=>{
 const h=harness({},50);h.edit('x'.repeat(500));const r=await h.cp.checkpoint();assert.equal(r.ok,false);if(!r.ok)assert.equal(r.reason,'storage-full');
 assert.ok(new StorageFullError() instanceof Error);
});
test('edit during capture is detected and retried; racing forever pins',async()=>{
 let n=0;const h=harness();
 const cp=new SessionCheckpointer({sessionId:'r',studio:'documents',store:h.store,sourceFingerprint:'s',clock:h.clock,getRevision:()=>h.st.rev,isDirty:()=>true,maxRaceRetries:2,
  capture:async()=>{const rev=h.st.rev;n++;h.st.rev++;return{revision:rev,payload:bytes('p'),history:{kind:'none'},view:{},format:'docx',engineVersion:'1'};}});
 const r=await cp.checkpoint();assert.equal(r.ok,false);if(!r.ok)assert.equal(r.reason,'edits-racing');assert.equal(n,3);
});
test('edit between verified write and return forces a re-capture',async()=>{
 const h=harness();h.edit('a');let injected=false;
 const orig=h.store.commit.bind(h.store);h.store.commit=async(...a)=>{await orig(...a);if(!injected){injected=true;h.st.rev++;h.st.text='b';}};
 const r=await h.cp.checkpoint();assert.ok(r.ok);const l=await h.store.load('documents:a.docx');assert.equal(new TextDecoder().decode(l!.snapshot.payload),'b','retry captured the newer state');assert.equal(h.st.captures,2);assert.equal(h.cp.isCurrent(),true);
});
test('suspend: clean session needs no checkpoint; dirty one gets verified first; leased is refused',async()=>{
 const h=harness();let s=await h.cp.prepareSuspend();assert.ok(s.ok);assert.equal(h.st.captures,0);
 h.edit('dirty');s=await h.cp.prepareSuspend();assert.ok(s.ok);assert.equal(h.st.captures,1);
 let leased=true;const g=harness({hasLease:()=>leased});g.edit('x');const d=await g.cp.prepareSuspend();assert.equal(d.ok,false);if(!d.ok)assert.equal(d.reason,'leased');
 assert.equal(g.cp.disposeIfSafe(()=>assert.fail('must not dispose')),false);leased=false;assert.ok((await g.cp.prepareSuspend()).ok);
});
test('disposeIfSafe re-checks revision synchronously (edit between prepare and dispose)',async()=>{
 const h=harness();h.edit('a');assert.ok((await h.cp.prepareSuspend()).ok);h.st.rev++;let ran=false;
 assert.equal(h.cp.disposeIfSafe(()=>{ran=true;}),false);assert.equal(ran,false);
 assert.ok((await h.cp.prepareSuspend()).ok);const g0=h.cp.generation;assert.equal(h.cp.disposeIfSafe(()=>{ran=true;}),true);assert.equal(ran,true);assert.equal(h.cp.generation,g0+1);
});
test('lossy history blocks suspend unless under pressure',async()=>{
 const h=harness({hasUndoHistory:()=>true,historyRestorable:()=>false});h.edit('a');
 const d=await h.cp.prepareSuspend();assert.equal(d.ok,false);if(!d.ok)assert.equal(d.reason,'history-would-be-lost');
 const p=await h.cp.prepareSuspend({pressure:true});assert.ok(p.ok);if(p.ok)assert.equal(p.historyLost,true);
});
test('not-quiescent input pins instead of capturing',async()=>{
 const h=harness({quiesce:async()=>false});h.edit('a');const r=await h.cp.checkpoint();assert.equal(r.ok,false);assert.equal(h.st.captures,0);
});
test('resume: restores newest, dedups concurrent calls, detects changed source, drops stale generations',async()=>{
 const h=harness();h.edit('kept');await h.cp.checkpoint();
 let restores=0;const restore=async()=>{restores++;await new Promise(r=>setImmediate(r));};
 const [a,b]=await Promise.all([h.cp.resume(restore,async()=>'src1'),h.cp.resume(restore,async()=>'src1')]);assert.ok(a.ok&&b.ok);assert.equal(restores,1);
 const c=await h.cp.resume(restore,async()=>'OTHER');assert.equal(c.ok,false);if(!c.ok)assert.equal(c.reason,'source-changed');
 const slow=h.cp.resume(async()=>{await new Promise(r=>setTimeout(r,5));},async()=>'src1');h.cp.disposeIfSafe(()=>undefined);
 await assert.rejects(slow,StaleGenerationError);
 const e=harness();const m=await e.cp.resume(restore,async()=>'src1');assert.equal(m.ok,false);if(!m.ok)assert.equal(m.reason,'missing');
});
test('releaseAfterSave only drops snapshots when nothing changed since the save',async()=>{
 const h=harness();h.edit('a');await h.cp.checkpoint();const rev=h.st.rev;h.st.rev++;
 assert.equal(await h.cp.releaseAfterSave(rev),false);assert.ok(await h.store.load('documents:a.docx'));
 assert.equal(await h.cp.releaseAfterSave(h.st.rev),true);assert.equal(await h.store.load('documents:a.docx'),null);
});
test('listRecoverable finds sessions after a "crash" (new store instance over the same bytes)',async()=>{
 const h=harness();h.edit('a');await h.cp.checkpoint();const again=new RecoveryStore(h.mem);
 const l=await again.listRecoverable();assert.equal(l.length,1);assert.equal(l[0].sessionId,'documents:a.docx');assert.ok(slotKey('a',1).endsWith('0000000001'));
});
