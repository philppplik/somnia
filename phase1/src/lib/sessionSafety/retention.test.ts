import test,{beforeEach} from 'node:test';import assert from 'node:assert/strict';
import {MemoryByteStore,RecoveryStore,StorageFullError} from './recoveryStore';
import {flushOnTeardown,registerActiveSession,clearRecoveryData,recoveryDataCount,setRecoveryStoreForTests} from './flush';
import {resetRecoveryIndexForTests} from './recoveryIndex';
const DAY=24*3600_000;
let clock=1_000_000_000_000;const b=(n:number)=>new Uint8Array(n).fill(7);
const mk=(max=1e9,ttl=7*DAY)=>{const mem=new MemoryByteStore();const store=new RecoveryStore(mem,2,{ttlMs:ttl,maxBytes:max},()=>clock);setRecoveryStoreForTests(store);return{mem,store};};
beforeEach(()=>{resetRecoveryIndexForTests();clock=1_000_000_000_000;});
const put=(store:RecoveryStore,id:string,n:number,rev=1)=>flushOnTeardown({sessionId:id,studio:'sheets',store,sourceFingerprint:'F',revision:rev,format:'xlsx',engineVersion:'1',history:{kind:'none'},view:{},payload:async()=>b(n)});
// Snapshot createdAt uses Date.now(), so TTL tests drive the store clock relative to real time.
test('TTL: snapshots older than 7 days are pruned, fresh ones kept',async()=>{
 const {store}=mk();assert.ok(await put(store,'sheets:old.xlsx',10));assert.ok(await put(store,'sheets:new.xlsx',10));
 const realNow=Date.now();(store as unknown as {now:()=>number}).now=()=>realNow+8*DAY;
 assert.deepEqual((await store.prune(new Set())).sort(),['sheets:new.xlsx','sheets:old.xlsx']);
 (store as unknown as {now:()=>number}).now=()=>realNow+6*DAY;assert.ok(await put(store,'sheets:a.xlsx',10));assert.deepEqual(await store.prune(new Set()),[]);assert.equal(await store.count(),1);
});
test('TTL never prunes a live (open) session',async()=>{
 const {store}=mk();assert.ok(await put(store,'sheets:live.xlsx',10));
 const realNow=Date.now();(store as unknown as {now:()=>number}).now=()=>realNow+30*DAY;
 assert.deepEqual(await store.prune(new Set(['sheets:live.xlsx'])),[]);assert.equal(await store.count(),1);
});
test('size cap evicts the oldest other session first, never the one being written',async()=>{
 const {store}=mk(3200);assert.ok(await put(store,'sheets:a.xlsx',1000));await new Promise(r=>setTimeout(r,5));assert.ok(await put(store,'sheets:b.xlsx',1000));
 assert.ok(await put(store,'sheets:c.xlsx',1000));
 assert.equal(await store.load('sheets:a.xlsx'),null);assert.ok(await store.load('sheets:b.xlsx'));assert.ok(await store.load('sheets:c.xlsx'));
 assert.ok((await store.usageBytes())<=3200);
});
test('size cap: an oversized snapshot is refused and the previous snapshot of that session stays',async()=>{
 const {store}=mk(1500);assert.ok(await put(store,'sheets:a.xlsx',500));
 assert.equal(await put(store,'sheets:a.xlsx',5000,2),false);assert.ok(await store.load('sheets:a.xlsx'));
 await assert.rejects(store.commit('sheets:z.xlsx',1,new Uint8Array(9999),'x'),StorageFullError);
});
test('size cap does not evict live sessions',async()=>{
 const {store}=mk(2200);assert.ok(await put(store,'sheets:live.xlsx',1000));
 // live-ness is tracked through the meta argument
 registerActiveSession('sheets:live.xlsx',{close(){},idle:async()=>undefined},{studio:'sheets',isDirty:()=>true} as never);
 assert.equal(await put(store,'sheets:other.xlsx',1500),false);assert.ok(await store.load('sheets:live.xlsx'));
});
test('clearRecoveryData removes snapshots, keeps live sessions, and count reflects it',async()=>{
 const {store}=mk();assert.ok(await put(store,'documents:a.docx',10));assert.ok(await put(store,'documents:b.docx',10));
 registerActiveSession('documents:b.docx',{close(){},idle:async()=>undefined},{studio:'documents',isDirty:()=>true} as never);
 assert.equal(await recoveryDataCount(),2);assert.equal(await clearRecoveryData(),1);assert.equal(await recoveryDataCount(),1);assert.ok(await store.load('documents:b.docx'));
});
