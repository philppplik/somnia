import test from 'node:test';
import assert from 'node:assert/strict';
import { BlocklistService, matchesBlockedVersion } from './blocklist';
import type { BlockedVersion, BlocklistHost, SignedIndex } from './blocklist';
const signed = (revision = 1, blocked: BlockedVersion[] = [{id:'svg-optimizer',versions:'>=1.0.0 <2.0.0',reason_url:'https://example.org/security'}]): SignedIndex => ({payload:JSON.stringify({revision,blocked}),signature:'valid'});
function setup() {
  let cache: SignedIndex | null = null, now = 0;
  const calls: string[] = [];
  const host: BlocklistHost = {installed:async()=>[{id:'svg-optimizer',name:'SVG',version:'1.2.0',engine:'native'}],disableBlocked:async()=>{calls.push('disable')},clearBlock:async()=>{calls.push('clear')},notify:async()=>{calls.push('notify')}};
  const service = new BlocklistService({read:async()=>cache,write:async v=>{cache=v}},async v=>v.signature==='valid',host,()=>now);
  return {service,calls,host,cache:()=>cache,setNow:(v:number)=>{now=v}};
}
test('matches exact, comparator, union, build, prerelease versions',()=>{
  assert.ok(matchesBlockedVersion('1.2.0','>=1.0.0 <2.0.0'));
  assert.ok(matchesBlockedVersion('1.2.0+hash','1.2.0'));
  assert.ok(matchesBlockedVersion('11.4.0-beta.2','>=11.4.0-beta.1 <11.4.0'));
  assert.ok(matchesBlockedVersion('2.0.0','1.0.0 || 2.0.0'));
  assert.ok(matchesBlockedVersion('1.0.0-beta.11','>1.0.0-beta.2'));
  assert.equal(matchesBlockedVersion('2.0.0','>=1.0.0 <2.0.0'),false);
  for(const range of ['^1.0.0','1.2','>=1.0.0 ||','01.2.3','1.0.0-beta.01']) assert.throws(()=>matchesBlockedVersion('1.2.0',range));
});
test('verified feed disables before notify, never uninstalls, deduplicates notice',async()=>{
  const x=setup(); await x.service.refresh(async()=>signed()); assert.deepEqual(x.calls,['disable','notify']);
  assert.ok(x.cache()); await x.service.enforce(); assert.deepEqual(x.calls,['disable','notify','disable']);
});
test('offline past seven days retains healthy operation and cached blocks',async()=>{
  const x=setup(); await x.service.refresh(async()=>signed()); x.setNow(9*86400000);
  await x.service.refresh(async()=>{throw Error('Offline')});
  assert.equal(x.service.status().state,'offline'); assert.equal(x.service.status().offlineDays,9); assert.ok(x.service.blocked('svg-optimizer','1.2.0'));
  assert.equal(x.service.blocked('other','1.0.0'),null);
});
test('bad signature, malformed ranges, rollback cannot replace valid cache',async()=>{
  const x=setup(); await x.service.refresh(async()=>signed(2)); const cached=x.cache();
  for(const feed of [{...signed(3,[]),signature:'fake'},signed(1,[]),signed(2,[]),signed(3,[{id:'svg-optimizer',versions:'^1.0.0',reason_url:'https://example.org'}])]) {
    await x.service.refresh(async()=>feed); assert.equal(x.service.status().state,'invalid'); assert.deepEqual(x.cache(),cached); assert.ok(x.service.blocked('svg-optimizer','1.2.0'));
  }
});
test('new valid revision clears policy lock but never enables',async()=>{
  const x=setup(); await x.service.refresh(async()=>signed()); await x.service.refresh(async()=>signed(2,[])); assert.equal(x.calls.at(-1),'clear'); assert.equal(x.service.blocked('svg-optimizer','1.2.0'),null);
});
test('startup verifies cached bytes, invalid initial cache never disables',async()=>{
  const x=setup(); await x.service.refresh(async()=>signed());
  const y=new BlocklistService({read:async()=>x.cache(),write:async()=>{}},async()=>true,x.host); await y.start(); assert.ok(y.blocked('svg-optimizer','1.2.0'));
  const z=new BlocklistService({read:async()=>signed(),write:async()=>{}},async()=>false,x.host); const before=x.calls.length; await z.start(); assert.equal(x.calls.length,before); assert.equal(z.status().state,'invalid');
});
test('failed runtime stop never notifies successful disable',async()=>{
  const x=setup(); x.host.disableBlocked=async()=>{throw Error('Termination failed')}; await assert.rejects(x.service.refresh(async()=>signed()),/Termination failed/); assert.equal(x.calls.length,0);
});
test('concurrent refresh coalesces and does not fetch twice',async()=>{
  const x=setup(); let count=0; const fetch=async()=>{count++;return signed()}; await Promise.all([x.service.refresh(fetch),x.service.refresh(fetch)]); assert.equal(count,1);
});
import { ed25519IndexVerifier, signedIndexFetcher } from './blocklist';
import { webcrypto } from 'node:crypto';
test('real Ed25519 verifier rejects forged signature and modified payload',async()=>{
  const crypto=webcrypto as unknown as Crypto;
  const keys=await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']) as CryptoKeyPair;
  const key=new Uint8Array(await crypto.subtle.exportKey('raw',keys.publicKey)); const verify=ed25519IndexVerifier(key,crypto);
  const payload=signed().payload;
  const signature=Buffer.from(await crypto.subtle.sign('Ed25519',keys.privateKey,new TextEncoder().encode(payload))).toString('base64');
  assert.ok(await verify({payload,signature})); assert.equal(await verify({payload:payload+' ',signature}),false); assert.equal(await verify({payload,signature:'forged'}),false);
});
test('transport rejects HTTP, failed response and overlarge bodies',async()=>{
  assert.throws(()=>signedIndexFetcher('http://example.org/index','https://example.org/sig'));
  const fail=(async()=>new Response('',{status:500})) as typeof fetch;
  await assert.rejects(signedIndexFetcher('https://example.org/index','https://example.org/sig',fail)());
  const big=(async()=>new Response('a'.repeat(4*1024*1024+1))) as typeof fetch;
  await assert.rejects(signedIndexFetcher('https://example.org/index','https://example.org/sig',big)(),/size limit/);
});
test('cache storage failure retains old policy and does not mark a feed fresh',async()=>{
  let cache=signed(1); let fail=false;
  const calls:string[]=[];
  const host:BlocklistHost={installed:async()=>[],disableBlocked:async()=>{},clearBlock:async()=>{},notify:async()=>{calls.push('notify')}};
  const s=new BlocklistService({read:async()=>cache,write:async v=>{if(fail)throw Error('Disk full');cache=v}},async()=>true,host,()=>1000);
  await s.start(); fail=true; await s.refresh(async()=>signed(2,[])); assert.equal(s.status().state,'invalid'); assert.equal(s.status().revision,1); assert.ok(s.blocked('svg-optimizer','1.2.0'));
});
test('startup timestamp preserves offline age after restart',async()=>{
  const x=setup(); await x.service.refresh(async()=>signed());
  const s=new BlocklistService({read:async()=>x.cache(),write:async()=>{}},async()=>true,x.host,()=>8*86400000);
  await s.start(); assert.equal(s.status().offlineDays,8);
});
test('unreadable cache does not prevent a fresh signed recovery',async()=>{
  const x=setup(); const s=new BlocklistService({read:async()=>{throw Error('Corrupt cache')},write:async()=>{}},async()=>true,x.host);
  assert.equal((await s.start()).state,'invalid'); assert.equal((await s.refresh(async()=>signed())).state,'fresh');
});
