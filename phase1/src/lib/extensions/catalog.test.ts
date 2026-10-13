import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto,createHash,generateKeyPairSync,sign} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {zipSync,strToU8} from 'fflate';
import {classifyFetchError,validateCatalog,rawGithubURL,fetchCatalog,isReviewed,reviewCatalogPackage,installReviewedPackage,CATALOG_URL,type CatalogEntry} from './catalog';
import {CATALOG_KEYS,SIGNED_INDEX_URL,SIGNED_SIG_URL} from './catalogTrust';
import {loadExtensions,setExtensionEnabled,enabledIds} from './registry';
import {parsePackageZip} from './packageInstall';
const manifest={id:'acme.theme',name:'Theme',version:'1.0.0',apiVersion:1,permissions:[]};
const zip=(m:unknown)=>zipSync({'somnia-extension.json':strToU8(JSON.stringify(m))});
const entry=(bytes:Uint8Array):CatalogEntry=>({...manifest,author:'Acme',description:'Theme',repo:'https://github.com/acme/theme',download:'https://raw.githubusercontent.com/acme/theme/v1/package.zip',sha256:createHash('sha256').update(bytes).digest('hex')});
const wrap=(entries:unknown[])=>({schemaVersion:1,extensions:entries});
const originalFetch=globalThis.fetch;
Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
const ls=new Map<string,string>();(globalThis as any).localStorage={getItem:(k:string)=>ls.get(k)??null,setItem:(k:string,v:string)=>ls.set(k,v)};
(globalThis as any).window={dispatchEvent:()=>true};
function serve(bytes:Uint8Array,status=200){globalThis.fetch=async()=>new Response(bytes as Uint8Array<ArrayBuffer>,{status});}

test('index schema rejects duplicate ids, unknown permission, API mismatch, unsafe URLs and malformed hash',()=>{
 const e=entry(zip(manifest));assert.equal(validateCatalog(wrap([e])).length,1);
 for(const bad of [{...e,sha256:'x'},{...e,permissions:['network']},{...e,apiVersion:2},{...e,download:'https://evil.example/a.zip'},{...e,repo:'javascript:alert(1)'},{...e,description:'x'.repeat(401)}])assert.throws(()=>validateCatalog(wrap([bad])));
 assert.throws(()=>validateCatalog(wrap([e,e])));assert.throws(()=>validateCatalog({schemaVersion:2,extensions:[]}));
 for(const url of ['http://raw.githubusercontent.com/a/b/v/x','https://user@raw.githubusercontent.com/a/b/v/x','https://raw.githubusercontent.com.evil/a/b/v/x','https://raw.githubusercontent.com/a/b/v/x?q=1','https://raw.githubusercontent.com:8443/a/b/v/x'])assert.equal(rawGithubURL(url),false);
});
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const der=publicKey.export({type:'spki',format:'der'});const testKey={keyId:'k1',publicKey:new Uint8Array(der.subarray(der.length-32))};
const signedDoc=(entries:unknown[],o:Record<string,unknown>={})=>{const payload=JSON.stringify({schemaVersion:2,serial:1,issuedAt:new Date(Date.now()-3600_000).toISOString(),expiresAt:new Date(Date.now()+86400_000).toISOString(),keyId:'k1',extensions:entries,revoked:[],...o});return {payload,signature:sign(null,Buffer.from(payload),privateKey).toString('base64')};};
/** Swap the pinned keys for the test key (and restore), so the signed path runs against real Ed25519 fixtures. */
async function withKeys<T>(keys:readonly unknown[],fn:()=>Promise<T>):Promise<T>{const arr=CATALOG_KEYS as unknown as unknown[];const saved=arr.splice(0,arr.length,...keys);ls.clear();try{return await fn();}finally{arr.splice(0,arr.length,...saved);ls.clear();}}
test('signed catalog: downloads are credential-free and opt-in; tampered, malformed and HTTP errors fail',async()=>{
 const e=entry(zip(manifest));const doc=signedDoc([e]);let calls=0;const urls:string[]=[];
 await withKeys([testKey],async()=>{
  globalThis.fetch=async(url,init)=>{calls++;urls.push(String(url));assert.equal(init?.credentials,'omit');assert.equal(init?.redirect,'error');return new Response(String(url)===SIGNED_SIG_URL?doc.signature:doc.payload);};
  assert.equal(calls,0);assert.equal((await fetchCatalog()).length,1);assert.equal(calls,2);assert.deepEqual(urls.sort(),[SIGNED_INDEX_URL,SIGNED_SIG_URL].sort());
  ls.clear();globalThis.fetch=async url=>new Response(String(url)===SIGNED_SIG_URL?doc.signature:doc.payload.replace('Theme','Evil'));await assert.rejects(fetchCatalog(),/does not verify/);
  ls.clear();serve(strToU8('broken'));await assert.rejects(fetchCatalog(),/does not verify/);
  ls.clear();serve(new Uint8Array(),404);await assert.rejects(fetchCatalog(),/404/);
 });globalThis.fetch=originalFetch;
});
test('legacy unsigned index is used only while no key is pinned: credential-free, opt-in, malformed and HTTP errors fail',async()=>{
 const e=entry(zip(manifest));let calls=0;
 await withKeys([],async()=>{
  globalThis.fetch=async(url,init)=>{calls++;assert.equal(url,CATALOG_URL);assert.equal(init?.credentials,'omit');assert.equal(init?.redirect,'error');return new Response(JSON.stringify(wrap([e])));};
  assert.equal(calls,0);assert.equal((await fetchCatalog()).length,1);assert.equal(calls,1);
  serve(strToU8('broken'));await assert.rejects(fetchCatalog(),/valid JSON/);serve(new Uint8Array(),404);await assert.rejects(fetchCatalog(),/404/);
 });globalThis.fetch=originalFetch;
});
test('review verifies hash and manifest identity/permissions without installing; confirmation installs off, including replacement',async()=>{
 ls.clear();const bytes=zip(manifest),e=entry(bytes);serve(bytes);const reviewed=await reviewCatalogPackage(e);assert.equal(loadExtensions().length,0);
 assert.equal(installReviewedPackage(reviewed).ok,true);assert.equal(loadExtensions()[0].id,manifest.id);assert.deepEqual(enabledIds(),[]);
 setExtensionEnabled(manifest.id,true);let observed:string[]|null=null;(globalThis as any).window.dispatchEvent=()=>{observed=enabledIds();return true;};assert.equal(installReviewedPackage(reviewed).ok,true);assert.deepEqual(observed,[]);assert.deepEqual(enabledIds(),[]);
 await assert.rejects(reviewCatalogPackage({...e,sha256:'0'.repeat(64)}),/SHA-256/);
 for(const changed of [{...manifest,id:'acme.other'},{...manifest,version:'2.0.0'},{...manifest,name:'Other'},{...manifest,permissions:['project.read']}]){const b=zip(changed);serve(b);await assert.rejects(reviewCatalogPackage({...e,sha256:entry(b).sha256}),/match the index/);}
 assert.equal(loadExtensions()[0].version,'1.0.0');globalThis.fetch=originalFetch;
});
test('worker code is refused; no-network sandboxed panels are supported',async()=>{
 let bytes=zip({...manifest,code:'await somnia.ui.notify("hi")'});serve(bytes);await assert.rejects(reviewCatalogPackage(entry(bytes)),/worker code/);
 bytes=zip({...manifest,contributes:{panels:[{id:'hello',title:'Hello',side:'left',html:'<p>hello</p>'}]}});serve(bytes);assert.equal((await reviewCatalogPackage(entry(bytes))).manifest.contributes.panels.length,1);globalThis.fetch=originalFetch;
});
test('downloads and uncompressed ZIPs are bounded; path escapes and ambiguous manifests fail',async()=>{
 serve(new Uint8Array(2_000_001));await assert.rejects(reviewCatalogPackage(entry(zip(manifest))),/too large/);globalThis.fetch=originalFetch;
 assert.equal(parsePackageZip(zipSync({'somnia-extension.json':strToU8(JSON.stringify(manifest)),'bomb.txt':new Uint8Array(2_000_001)})).ok,false);
 assert.equal(parsePackageZip(zipSync({'somnia-extension.json':strToU8(JSON.stringify(manifest)),'manifest.json':strToU8('{}')})).ok,false);
 assert.equal(parsePackageZip(zipSync({'../manifest.json':strToU8('{}')})).ok,false);
 assert.equal(parsePackageZip(zipSync({'manifest.json':strToU8(JSON.stringify({...manifest,main:'../code.js'})),'../code.js':strToU8('alert(1)')})).ok,false);
});
test('shipped index and package match the pinned hash',()=>{
 const root=new URL('../../../../docs/extensions/catalog/',import.meta.url);
 const list=validateCatalog(JSON.parse(readFileSync(new URL('index.json',root),'utf8')));
 const bytes=readFileSync(new URL('packages/quiet-colors-1.0.0.zip',root));assert.equal(createHash('sha256').update(bytes).digest('hex'),list[0].sha256);
 const r=parsePackageZip(bytes);assert.equal(r.ok,true);if(r.ok){assert.equal(r.manifest.id,list[0].id);assert.equal(r.manifest.code,undefined);assert.deepEqual(r.manifest.permissions,[]);}
 const accents=list.find(e=>e.id==='somnia.accent-palettes');assert.ok(accents,'accent-palettes entry in the shipped index');
 const ab=readFileSync(new URL('packages/accent-palettes-1.0.0.zip',root));assert.equal(createHash('sha256').update(ab).digest('hex'),accents.sha256);
 const ar=parsePackageZip(ab);assert.equal(ar.ok,true);if(ar.ok){const m=ar.manifest;assert.equal(m.id,accents.id);assert.equal(m.version,accents.version);assert.equal(m.code,undefined);assert.deepEqual(m.permissions,[]);
  assert.equal(m.contributes.accentPalettes.length,7);for(const p of m.contributes.accentPalettes){assert.match(p.light,/^#[0-9a-f]{6}$/);assert.match(p.dark,/^#[0-9a-f]{6}$/);}}
});

test('reviewed flag: default false, strict boolean, reviewedBy needs reviewed',()=>{
 const base=wrap([{...manifest,author:'Acme',description:'Theme',repo:'https://github.com/acme/theme',download:'https://raw.githubusercontent.com/acme/theme/v1/package.zip',sha256:'a'.repeat(64)}]);
 const mk=(extra:object)=>wrap([{...(base.extensions[0] as object),...extra}]);
 assert.equal(validateCatalog(base)[0].reviewed,false);
 assert.equal(isReviewed(validateCatalog(base)[0]),false);
 assert.equal(isReviewed(validateCatalog(mk({reviewed:true,reviewedBy:'Somnia maintainers'}))[0]),true);
 assert.throws(()=>validateCatalog(mk({reviewed:'true'})));
 assert.throws(()=>validateCatalog(mk({reviewed:1})));
 assert.throws(()=>validateCatalog(mk({reviewedBy:'Somnia maintainers'})));
 assert.throws(()=>validateCatalog(mk({reviewed:false,reviewedBy:'Somnia maintainers'})));
 assert.throws(()=>validateCatalog(mk({reviewed:true,reviewedBy:''})));
});
test('shipped first-party entries are marked reviewed, hash match alone is not',()=>{
 const root=new URL('../../../../docs/extensions/catalog/',import.meta.url);
 const list=validateCatalog(JSON.parse(readFileSync(new URL('index.json',root),'utf8')));
 assert.equal(list.length,12);for(const e of list){assert.equal(isReviewed(e),true,e.id);assert.equal(e.author,'Somnia');}
});
test('malformed ZIP and hostile download identity fail without replacing installed data',async()=>{
 const before=JSON.stringify(loadExtensions());const bad=strToU8('not a zip');serve(bad);await assert.rejects(reviewCatalogPackage(entry(bad)),/Invalid ZIP/);
 const bytes=zip({...manifest,apiVersion:99});serve(bytes);await assert.rejects(reviewCatalogPackage(entry(bytes)),/apiVersion/);
 assert.equal(JSON.stringify(loadExtensions()),before);globalThis.fetch=originalFetch;
});

test('classifyFetchError maps 429 and 5xx to distinct reasons, unknown stays network',()=>{
 assert.equal(classifyFetchError(new Error('GitHub download failed (429).')),'rate-limited');
 assert.equal(classifyFetchError(new Error('GitHub download failed (503).')),'server-error');
 assert.equal(classifyFetchError(new Error('GitHub download failed (404).')),'network');
 assert.equal(classifyFetchError(new Error('Extension index is not valid JSON.')),'invalid');
 assert.equal(classifyFetchError(new TypeError('fetch failed')),'network');
});
