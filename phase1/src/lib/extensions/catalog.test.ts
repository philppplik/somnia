import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {zipSync,strToU8} from 'fflate';
import {classifyFetchError,validateCatalog,rawGithubURL,fetchCatalog,reviewCatalogPackage,installReviewedPackage,CATALOG_URL,type CatalogEntry} from './catalog';
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
test('downloads are credential-free and opt-in; malformed index and HTTP errors fail',async()=>{
 const e=entry(zip(manifest));let calls=0;globalThis.fetch=async(url,init)=>{calls++;assert.equal(url,CATALOG_URL);assert.equal(init?.credentials,'omit');assert.equal(init?.redirect,'error');return new Response(JSON.stringify(wrap([e])));};
 assert.equal(calls,0);assert.equal((await fetchCatalog()).length,1);assert.equal(calls,1);
 serve(strToU8('broken'));await assert.rejects(fetchCatalog(),/valid JSON/);serve(new Uint8Array(),404);await assert.rejects(fetchCatalog(),/404/);globalThis.fetch=originalFetch;
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
