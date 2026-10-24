import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppBlocklistHost,createBlocklistCache,startBlocklistMonitor,getBlocklistService,getBlocklistStatus,blocklistConfigured,BLOCKLIST_CONFIG} from './blocklistWiring';
import {installExtension,loadExtensions,enabledIds,isExtensionBlocked,setExtensionBlockGate} from './registry';
import {PermissionBroker} from './permissionBroker';
import {V2PackageStore} from './v2PackageStore';
import {generateKeyPairSync,sign as edSign} from 'node:crypto';

const storage=()=>{const m=new Map<string,string>();return{getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>m.set(k,v),removeItem:(k:string)=>{m.delete(k);},map:m};};
type Storage=ReturnType<typeof storage>;
const manifest={id:'test.ext',name:'Test Ext',version:'1.2.0',apiVersion:1,permissions:[],contributes:{panels:[],codeThemes:[],commands:[],snippets:[]}};
function fixture(){
 const ls=storage();
 (globalThis as Record<string,unknown>).localStorage=ls;
 const dispatched:{extensionId:string;code:string;message:string}[]=[];
 (globalThis as Record<string,unknown>).window={dispatchEvent:(e:{type:string;detail?:{extensionId:string;code:string;message:string}})=>{if(e.type==='somnia:extension-consent-blocked'&&e.detail)dispatched.push(e.detail);return true;}};
 const broker=new PermissionBroker(ls,{invalidate:()=>{},notify:()=>{}});
 const packages=new V2PackageStore(ls);
 return {ls,broker,packages,dispatched};
}

test('config: empty bundled key means not configured',()=>{
 assert.equal(blocklistConfigured(BLOCKLIST_CONFIG),false);
 assert.equal(blocklistConfigured({indexUrl:'https://a',signatureUrl:'https://b',publicKeyBase64:'x'}),true);
});
test('cache: roundtrip, rejects corrupt and oversized',async()=>{
 const ls=storage();const cache=createBlocklistCache(ls);
 assert.equal(await cache.read(),null);
 const signed={payload:'{"revision":1,"blocked":[]}',signature:'sig',verifiedAtMs:7};
 await cache.write(signed);assert.deepEqual(await cache.read(),signed);
 ls.setItem('somnia.extensions.blocklist.v1','{"payload":5}');assert.equal(await cache.read(),null);
 ls.setItem('somnia.extensions.blocklist.v1','x'.repeat(5*1024*1024));assert.equal(await cache.read(),null);
});
test('host: disableBlocked disables legacy lane once, notifies with reason link, never removes',async()=>{
 const f=fixture();
 const {installExtension:ie}=await import('./registry.ts').catch(()=>({})) as never;void ie;
 assert.equal(installExtension(JSON.stringify(manifest)).ok,true);
 const host=createAppBlocklistHost({broker:f.broker,packages:f.packages});
 const ext={id:'test.ext',name:'Test Ext',version:'1.2.0',engine:'sandboxed' as const};
 const block={id:'test.ext',versions:'*',reason_url:'https://example.org/a'};
 const before=(f.ls.map.get('somnia.extensions.v1')??'').length;
 await host.disableBlocked(ext,block,3);
 assert.deepEqual(enabledIds(),[]);
 assert.ok(loadExtensions().some(m=>m.id==='test.ext'),'package stays installed');
 assert.ok((f.ls.map.get('somnia.extensions.v1')??'').length>=before-0);
 await host.notify(ext,block);
 assert.equal(f.dispatched.length,1);
 assert.equal(f.dispatched[0].code,'E_BLOCKLISTED');
 assert.match(f.dispatched[0].message,/security feed/);
 assert.match(f.dispatched[0].message,/https:\/\/example\.org\/a/);
});
test('host: v2 lane blocks through the broker idempotently, clear only unlocks',async()=>{
 const f=fixture();
 const example=JSON.parse((await import('node:fs')).readFileSync(new URL('./contracts/v2/example.json',import.meta.url),'utf8'));
 f.packages.put(example,{}, {artifactHash:'a'.repeat(64),manifestHash:'b'.repeat(64),origin:'test'});
 const host=createAppBlocklistHost({broker:f.broker,packages:f.packages});
 const id=example.id as string;
 const ext={id,name:'X',version:example.version,engine:'sandboxed' as const};
 const block={id,versions:'*',reason_url:'https://example.org/a'};
 let notified=0;
 const broker=new PermissionBroker(f.ls,{invalidate:()=>{},notify:()=>{notified++;}});
 const host2=createAppBlocklistHost({broker,packages:f.packages});
 await host2.disableBlocked(ext,block,1);
 await host2.disableBlocked(ext,block,1); // same reason: no repeat notification
 assert.equal(notified,1);
 assert.ok(broker.snapshot().extensions[id]?.blocked);
 assert.equal(broker.snapshot().extensions[id]?.enabled,false);
 void host;
 await host2.notify(ext,block); // v2 already notified by the broker; no double dialog
 assert.equal(f.dispatched.length,0);
 await host2.clearBlock(id,2);
 assert.equal(broker.snapshot().extensions[id]?.blocked,undefined);
 assert.equal(broker.snapshot().extensions[id]?.enabled,false,'clear never re-enables');
});
test('host: installed() merges both lanes, legacy id wins',async()=>{
 const f=fixture();
 assert.equal(installExtension(JSON.stringify(manifest)).ok,true);
 const list=await createAppBlocklistHost({broker:f.broker,packages:f.packages}).installed();
 assert.deepEqual(list,[{id:'test.ext',name:'Test Ext',version:'1.2.0',engine:'sandboxed'}]);
});
test('monitor: unconfigured registers an open gate and reports honestly',()=>{
 const f=fixture();
 const dispose=startBlocklistMonitor({config:BLOCKLIST_CONFIG,storage:f.ls,broker:f.broker,packages:f.packages});
 assert.equal(getBlocklistService(),null);
 assert.equal(getBlocklistStatus().configured,false);
 assert.equal(isExtensionBlocked('test.ext','1.2.0'),false);
 dispose();
});
test('monitor: configured end-to-end signs, disables, notifies, and gates load',async()=>{
 const f=fixture();
 assert.equal(installExtension(JSON.stringify(manifest)).ok,true);
 const {publicKey,privateKey}=generateKeyPairSync('ed25519');
 const pub=(publicKey.export({format:'jwk'}) as {x:string}).x.replace(/-/g,'+').replace(/_/g,'/');
 const payload=JSON.stringify({revision:1,blocked:[{id:'test.ext',versions:'>=1.0.0',reason_url:'https://example.org/a'}]});
 const signature=edSign(null,Buffer.from(payload,'utf8'),privateKey).toString('base64');
 let now=1_000;
 const dispose=startBlocklistMonitor({config:{indexUrl:'https://example.org/i',signatureUrl:'https://example.org/s',publicKeyBase64:pub},storage:f.ls,broker:f.broker,packages:f.packages,now:()=>now,fetchSigned:async()=>({payload,signature})});
 assert.ok(getBlocklistService());
 assert.equal(isExtensionBlocked('test.ext','1.2.0'),false,'gate opens only after the verified feed');
 await new Promise(r=>setTimeout(r,50));
 assert.equal(isExtensionBlocked('test.ext','1.2.0'),true);
 assert.equal(getBlocklistStatus().configured,true);
 assert.equal(getBlocklistStatus().status?.state,'fresh');
 assert.equal(f.dispatched.length,1);
 // Registry gate also holds without the service reference.
 setExtensionBlockGate((id,v)=>getBlocklistService()?.blocked(id,v)!=null);
 assert.equal(isExtensionBlocked('test.ext','1.0.0'),true);
 assert.equal(isExtensionBlocked('other','1.0.0'),false);
 dispose();
});
test('monitor: invalid bundled key degrades to not-configured with an error',()=>{
 const f=fixture();
 const dispose=startBlocklistMonitor({config:{indexUrl:'https://a',signatureUrl:'https://b',publicKeyBase64:'!!!'},storage:f.ls,broker:f.broker,packages:f.packages});
 assert.equal(getBlocklistService(),null);
 assert.equal(getBlocklistStatus().configured,false);
 assert.match(getBlocklistStatus().lastError??'',/key/i);
 dispose();
});
