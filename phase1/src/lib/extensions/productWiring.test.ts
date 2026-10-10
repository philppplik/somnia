import test from 'node:test';
import assert from 'node:assert/strict';
import {stringify} from 'smol-toml';
import {zipSync} from 'fflate';
import example from './contracts/v2/example.json' with {type:'json'};
import {inspectCandidate,sha256Hex} from './candidateInspect';
import {V2PackageStore} from './v2PackageStore';
import {listingsFromEntries,createCatalogStoreHost} from './storeHostDefault';
import {PermissionBroker} from './permissionBroker';
import {MANIFEST_V2_FILENAME} from './manifestV2';
import type {CatalogEntry,ReviewedPackage} from './catalog';

const mem=()=>{const m=new Map<string,string>();return {getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>{m.set(k,v);}};};
const none={installedVersion:()=>null};
const declarative=()=>{const m=structuredClone(example) as Record<string,any>;m.runtime={type:'declarative'};m.activationEvents=[];m.contributes={};m.permissions=[];delete m.security;return m;};
const enc=new TextEncoder();

test('pasted v1 JSON becomes a ready, unsigned candidate',async()=>{
 const json=JSON.stringify({id:'acme.hello',name:'Hello',version:'1.0.0',apiVersion:1,permissions:['project.read'],contributes:{}});
 const r=await inspectCandidate({manifestText:json},none);
 assert.equal(r.state.kind,'ready');if(r.state.kind==='ready'){assert.equal(r.state.verification,'no-signed-match');assert.equal(r.state.native,false);assert.equal(r.state.grants[0].id,'project.read');}
 assert.equal(r.staged?.lane,'legacy');
});
test('malformed, unknown permission, duplicate and blocked are reported, not installable',async()=>{
 assert.equal((await inspectCandidate({manifestText:'{'},none)).state.kind,'error');
 const bad=JSON.stringify({id:'acme.hello',name:'Hello',version:'1.0.0',apiVersion:1,permissions:['root.everything'],contributes:{}});
 const b=await inspectCandidate({manifestText:bad},none);assert.ok(b.state.kind==='error'&&b.state.code==='unknownPermission');
 const ok=JSON.stringify({id:'acme.hello',name:'Hello',version:'1.0.0',apiVersion:1,permissions:[],contributes:{}});
 const d=await inspectCandidate({manifestText:ok},{installedVersion:()=>'1.0.0'});assert.ok(d.state.kind==='error'&&d.state.code==='duplicate');
 const k=await inspectCandidate({manifestText:ok},{...none,blocked:()=>true});assert.ok(k.state.kind==='error'&&k.state.code==='blocked');assert.equal(k.staged,undefined);
});
test('.somniax with a v2 manifest is verified from real bytes and hashed',async()=>{
 const m=declarative();const toml=stringify(m);
 const zip=zipSync({[MANIFEST_V2_FILENAME]:enc.encode(toml)});
 const r=await inspectCandidate({manifestText:'',packageName:'x.somniax',bytes:zip},none);
 assert.equal(r.state.kind,'ready');assert.equal(r.staged?.lane,'v2');assert.equal(r.staged?.artifactHash,await sha256Hex(zip));
 const wrong=await inspectCandidate({manifestText:'',packageName:'x.exe',bytes:zip},none);assert.ok(wrong.state.kind==='error'&&wrong.state.code==='wrongType');
 const junk=await inspectCandidate({manifestText:'',packageName:'x.somniax',bytes:enc.encode('nope')},none);assert.equal(junk.state.kind,'error');
});
test('pasted TOML that references a missing file is not a ready candidate',async()=>{
 const m=declarative();m.runtime={type:'js',entry:'extension.js'};
 const r=await inspectCandidate({manifestText:stringify(m)},none);assert.equal(r.state.kind,'error');assert.equal(r.staged,undefined);
 const okr=await inspectCandidate({manifestText:stringify(declarative())},none);assert.equal(okr.state.kind,'ready');
});
test('folder picks strip the single top-level folder',async()=>{
 const files={['pkg/'+MANIFEST_V2_FILENAME]:enc.encode(stringify(declarative()))};
 const r=await inspectCandidate({manifestText:'',packageName:'pkg',files},none);assert.equal(r.state.kind,'ready');
});
test('package store keeps verified bytes, rolls back and rejects tampering',async()=>{
 const st=mem();const store=new V2PackageStore(st);
 const r=await inspectCandidate({manifestText:stringify(declarative())},none);assert.equal(r.staged?.lane,'v2');
 const s=r.staged as Extract<NonNullable<typeof r.staged>,{lane:'v2'}>;
 const undo=store.put(s.manifest,s.files,{artifactHash:s.artifactHash,manifestHash:s.manifestHash,origin:'t'});
 assert.equal(store.list().length,1);assert.ok(store.files(s.manifest.id));
 undo();assert.equal(store.list().length,0);
 store.put(s.manifest,s.files,{artifactHash:s.artifactHash,manifestHash:s.manifestHash,origin:'t'});
 const raw=JSON.parse(st.getItem('somnia.extensions.v2.packages.v1')!);raw[s.manifest.id].manifest.id='other.id';st.setItem('somnia.extensions.v2.packages.v1',JSON.stringify(raw));
 assert.equal(store.list().length,0);
});
test('broker enable/forget keep blocklist and approval rules',async()=>{
 const r=await inspectCandidate({manifestText:stringify(declarative())},none);const m=(r.staged as any).manifest;
 const b=new PermissionBroker(mem(),{invalidate(){}},()=>0);
 await assert.rejects(()=>b.enable(m.id),/E_PERMISSION_DENIED/);
 await b.approve(m,'manual');await b.disable(m.id);await b.enable(m.id);assert.equal(b.snapshot().extensions[m.id].enabled,true);
 await b.setBlocked(m.id,'bad');await assert.rejects(()=>b.enable(m.id),/E_BLOCKLISTED/);
 await b.forget(m.id);assert.equal(b.snapshot().extensions[m.id],undefined);
});
const entry:CatalogEntry={id:'acme.hello',name:'Hello',version:'1.2.0',author:'Acme Co',description:'Says hi',repo:'https://github.com/acme/hello',download:'https://raw.githubusercontent.com/acme/hello/main/hello.zip',sha256:'a'.repeat(64),apiVersion:1,permissions:['project.read'],category:'Tools'};
test('store adapter lists catalog entries without claiming verification or evidence',async()=>{
 const {publishers,extensions}=listingsFromEntries([entry]);
 assert.equal(publishers[0].domain,undefined);assert.equal(publishers[0].official,false);assert.equal(publishers[0].declaredGithub2FA as unknown,false);
 assert.equal(extensions[0].releases[0].artifact.sha256,entry.sha256);
 const host=createCatalogStoreHost({fetchCatalog:async()=>[entry],installed:()=>[],somniaVersion:'11.3.0'});
 const l=await host.load();assert.equal(l.status,'ready');assert.equal(await host.evidence('acme.hello','1.2.0'),null);
 const off=createCatalogStoreHost({fetchCatalog:async()=>{throw new Error('x');}});assert.equal((await off.load()).status,'unavailable');
 const blocked=listingsFromEntries([entry],()=>true);assert.equal(blocked.extensions[0].releases[0].state,'security-blocked');
});
test('store stage reports mismatch, blocked and review failures',async()=>{
 const base={fetchCatalog:async()=>[entry],installed:()=>[]};
 const h=createCatalogStoreHost(base);await h.load();
 assert.deepEqual(await h.stage('acme.hello','1.2.0','b'.repeat(64),'install'),{kind:'error',code:'mismatch'});
 assert.deepEqual(await h.stage('acme.hello','9.9.9',entry.sha256,'install'),{kind:'error',code:'stale'});
 assert.deepEqual(await h.stage('acme.hello','1.2.0',entry.sha256,'update'),{kind:'error',code:'stale'});
 const bl=createCatalogStoreHost({...base,blocked:()=>true});await bl.load();assert.deepEqual(await bl.stage('acme.hello','1.2.0',entry.sha256,'install'),{kind:'error',code:'blocked'});
 const bad=createCatalogStoreHost({...base,review:async()=>{throw new Error('SHA-256 mismatch.');}});await bad.load();assert.deepEqual(await bad.stage('acme.hello','1.2.0',entry.sha256,'install'),{kind:'error',code:'mismatch'});
});
test('store stage hands a bound candidate to consent and commits only after approval',async()=>{
 const manifest={id:'acme.hello',name:'Hello',version:'1.2.0',apiVersion:1 as const,permissions:['project.read' as const],contributes:{commands:[],panels:[],codeThemes:[],snippets:[]}};
 const reviewed={entry,manifest} as unknown as ReviewedPackage;let installed=0;
 const h=createCatalogStoreHost({fetchCatalog:async()=>[entry],installed:()=>[],review:async()=>reviewed,commitReviewed:()=>{installed++;return {ok:true as const,manifest:manifest as never};}});
 await h.load();const r=await h.stage('acme.hello','1.2.0',entry.sha256,'install');assert.equal(r.kind,'staged');if(r.kind!=='staged')return;
 assert.equal(r.request.candidate.artifactHash,entry.sha256);assert.equal(r.request.candidate.source,'store');
 await assert.rejects(()=>r.request.commit(r.request.candidate,async()=>{throw new Error('declined');}),/declined/);assert.equal(installed,0);
 await r.request.commit(r.request.candidate,async()=>{});assert.equal(installed,1);
});
