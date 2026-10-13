import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {catalogBlocklistParser,catalogBlocklistVerifier,createCatalogBlocklistService,createShellBlocklistHost,REVOCATIONS_INFO_URL} from './catalogBlocklist';
import {BlocklistService,type BlocklistHost,type FeedStatus,type SignedIndex} from './blocklist';
import type {TrustedKey} from './signedCatalog';

const crypto=webcrypto as unknown as Crypto;
const memStorage=()=>{const m=new Map<string,string>();return {getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>{m.set(k,v);}} as unknown as Storage;};
const catalogPayload=(over:Record<string,unknown>={})=>JSON.stringify({
  schemaVersion:2,serial:1,issuedAt:'2026-10-01T00:00:00Z',expiresAt:'2026-10-30T00:00:00Z',keyId:'k1',
  extensions:[],revoked:[{id:'svg-optimizer',versions:['1.2.0','1.2.1'],reason:'Remote code execution in the SVG import path.'}],...over});
const keypair=async()=>{
  const pair=await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']) as CryptoKeyPair;
  const key:TrustedKey={keyId:'k1',publicKey:new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey))};
  const sign=async(payload:string)=>Buffer.from(await crypto.subtle.sign('Ed25519',pair.privateKey,new TextEncoder().encode(payload))).toString('base64');
  return {key,sign};
};
const signed=async(sign:(p:string)=>Promise<string>,payload:string):Promise<SignedIndex>=>({payload,signature:await sign(payload)});
const pkg=(manifest:never)=>({manifest,artifactHash:'a'.repeat(64),manifestHash:'b'.repeat(64),origin:'test',installedAt:'2026-10-01T00:00:00Z',files:{}});
function hostSpy(){
  const calls:string[]=[];
  const host:BlocklistHost={
    installed:async()=>[{id:'svg-optimizer',name:'SVG Optimizer',version:'1.2.0',engine:'sandboxed'},{id:'notes',name:'Notes',version:'3.0.0',engine:'native'}],
    disableBlocked:async ext=>{calls.push(`disable:${ext.id}`);},
    clearBlock:async id=>{calls.push(`clear:${id}`);},
    notify:async ext=>{calls.push(`notify:${ext.id}`);},
  };
  return {host,calls};
}

test('parser projects revoked[] onto the feed: serial, exact-version union, reason text',()=>{
  const feed=catalogBlocklistParser([{keyId:'k1',publicKey:new Uint8Array(32)}])(catalogPayload());
  assert.equal(feed.revision,1);
  assert.deepEqual(feed.blocked,[{id:'svg-optimizer',versions:'1.2.0 || 1.2.1',reason_url:REVOCATIONS_INFO_URL,reason:'Remote code execution in the SVG import path.'}]);
  assert.equal(feed.blocked[0]&&feed.blocked[0].versions.includes('1.2.1'),true);
});
test('parser rejects unpinned keyId, legacy schema and unrepresentable version lists',()=>{
  const parse=catalogBlocklistParser([{keyId:'k1',publicKey:new Uint8Array(32)}]);
  assert.throws(()=>parse(catalogPayload({keyId:'k9'})),/unpinned key/);
  assert.throws(()=>parse(JSON.stringify({schemaVersion:1,extensions:[]})));
  const many=Array.from({length:60},(_,i)=>`1.0.${i}`);
  assert.throws(()=>parse(catalogPayload({revoked:[{id:'svg-optimizer',versions:many,reason:'x'}]})),/exceeds the range grammar/);
});
test('verifier accepts only the pinned key over the exact bytes',async()=>{
  const {key,sign}=await keypair();const other=await keypair();
  const payload=catalogPayload();const s=await signed(sign,payload);
  assert.equal(await catalogBlocklistVerifier([key],crypto)(s),true);
  assert.equal(await catalogBlocklistVerifier([key],crypto)({payload:payload+' ',signature:s.signature}),false);
  assert.equal(await catalogBlocklistVerifier([other.key],crypto)(s),false);
  // Rotation: any pinned key may verify.
  assert.equal(await catalogBlocklistVerifier([other.key,key],crypto)(s),true);
});
test('service is off while no key is pinned',()=>{
  const {host}=hostSpy();
  assert.equal(createCatalogBlocklistService(host,{keys:[],storage:memStorage()}),null);
});
test('signed catalog disables + notifies matching installs, never uninstalls',async()=>{
  const {key,sign}=await keypair();const {host,calls}=hostSpy();
  const service=createCatalogBlocklistService(host,{keys:[key],storage:memStorage(),cryptoApi:crypto})!;
  const status=await service.refresh(async()=>signed(sign,catalogPayload()));
  assert.equal(status.state,'fresh');assert.equal(status.revision,1);
  assert.deepEqual(calls,['disable:svg-optimizer','notify:svg-optimizer','clear:notes']);
  assert.ok(service.blocked('svg-optimizer','1.2.1'));
  assert.equal(service.blocked('svg-optimizer','1.3.0'),null);
  assert.equal(service.blocked('notes','3.0.0'),null);
});
test('offline keeps the last verified policy; restart re-verifies cached bytes; expiry never lifts a block',async()=>{
  const {key,sign}=await keypair();const {host,calls}=hostSpy();
  const storage=memStorage();let now=Date.now();
  const service=createCatalogBlocklistService(host,{keys:[key],storage,cryptoApi:crypto,now:()=>now})!;
  await service.refresh(async()=>signed(sign,catalogPayload()));
  now+=10*86400000;calls.length=0; // ten days later: index expired, machine offline
  const st=await service.refresh(async()=>{throw Error('offline')});
  assert.equal(st.state,'offline');assert.equal(st.offlineDays,10);
  assert.ok(service.blocked('svg-optimizer','1.2.0'));
  // The offline refresh re-enforces the cached policy (idempotent disable, notify stays deduplicated).
  assert.deepEqual(calls,['disable:svg-optimizer','clear:notes']);calls.length=0;
  // Restart with the expired cached index: protection persists (fail-safe), state reports offline.
  const again=createCatalogBlocklistService(host,{keys:[key],storage,cryptoApi:crypto,now:()=>now})!;
  const st2=await again.start();
  assert.equal(st2.state,'offline');assert.ok(again.blocked('svg-optimizer','1.2.0'));
  assert.deepEqual(calls,['disable:svg-optimizer','notify:svg-optimizer','clear:notes']);
});
test('a newer serial without the revocation clears the lock but never enables',async()=>{
  const {key,sign}=await keypair();const {host,calls}=hostSpy();const storage=memStorage();
  const service=createCatalogBlocklistService(host,{keys:[key],storage,cryptoApi:crypto})!;
  await service.refresh(async()=>signed(sign,catalogPayload()));calls.length=0;
  const st=await service.refresh(async()=>signed(sign,catalogPayload({serial:2,revoked:[]})));
  assert.equal(st.state,'fresh');assert.equal(st.revision,2);
  assert.deepEqual(calls,['clear:svg-optimizer','clear:notes']);
  assert.equal(service.blocked('svg-optimizer','1.2.0'),null);
});
test('rollback, same-serial conflict and forged indexes are rejected; last policy stays',async()=>{
  const {key,sign}=await keypair();const other=await keypair();const {host}=hostSpy();const storage=memStorage();
  const service=createCatalogBlocklistService(host,{keys:[key],storage,cryptoApi:crypto})!;
  await service.refresh(async()=>signed(sign,catalogPayload({serial:2})));
  for(const bad of [
    await signed(sign,catalogPayload({serial:1})),                                             // rollback
    await signed(sign,catalogPayload({serial:2,revoked:[]})),                                  // same serial, different policy
    {payload:catalogPayload({serial:3}),signature:await other.sign(catalogPayload({serial:3}))}, // forged
    {payload:'{"schemaVersion":1}',signature:await sign('{"schemaVersion":1}')},                 // legacy schema
  ]){const st=await service.refresh(async()=>bad);assert.equal(st.state,'invalid');assert.equal(st.revision,2);assert.ok(service.blocked('svg-optimizer','1.2.0'));}
});
test('shell host: v1 disables via registry, v2 via broker without broker-notify; clear is lazy',async()=>{
  const calls:string[]=[];const blocked:Record<string,string|undefined>={'v2.ext':'older reason'};
  const host=createShellBlocklistHost({
    installedV1:()=>[{id:'v1.ext',name:'Legacy',version:'1.0.0',apiVersion:1,permissions:[],contributes:{}} as never],
    disableV1:id=>{calls.push(`v1:${id}`);},
    packages:{list:()=>[pkg({id:'v2.ext',name:'V2',version:'2.0.0'} as never)],get:(id:string)=>id==='v2.ext'?pkg({id:'v2.ext',name:'V2',version:'2.0.0'} as never):null},
    broker:{setBlocked:async(id,reason,opts)=>{calls.push(`v2:${id}:${reason??'null'}:notify=${opts?.notify!==false}`);blocked[id]=reason??undefined;},snapshot:()=>({extensions:Object.fromEntries(Object.entries(blocked).map(([k,v])=>[k,{blocked:v}]))})},
    notifyBlocked:(id,message)=>{calls.push(`notify:${id}:${message}`);},
  });
  const list=await host.installed();
  assert.deepEqual(list.map(e=>`${e.id}:${e.engine}`),['v1.ext:sandboxed','v2.ext:sandboxed']);
  const block={id:'x',versions:'*',reason_url:REVOCATIONS_INFO_URL,reason:'Malware.'};
  await host.disableBlocked(list[0]!,block,1);
  await host.disableBlocked(list[1]!,block,1);
  await host.notify(list[0]!,block);
  await host.clearBlock('v2.ext',2);   // carries a block -> cleared
  await host.clearBlock('v1.ext',2);   // v1 lane: no persistent lock, no-op
  assert.deepEqual(calls,[
    'v1:v1.ext',
    'v2:v2.ext:Malware.:notify=false',
    'notify:v1.ext:Malware.',
    'v2:v2.ext:null:notify=false',
  ]);
  assert.equal(blocked['v2.ext'],undefined);
});
test('shell host: v2 native tier maps to native engine; v1 shadows duplicate v2 id',async()=>{
  const host=createShellBlocklistHost({
    installedV1:()=>[{id:'same',name:'Legacy',version:'1.0.0'} as never],
    packages:{list:()=>[
      pkg({id:'same',name:'V2 dup',version:'2.0.0'} as never),
      pkg({id:'native.ext',name:'N',version:'1.0.0',security:{tier:'B'}} as never),
    ],get:()=>null},
    broker:{setBlocked:async()=>{},snapshot:()=>({extensions:{}})},
  });
  const list=await host.installed();
  assert.deepEqual(list.map(e=>e.id),['same','native.ext']);
  assert.equal(list[1]!.engine,'native');
});
