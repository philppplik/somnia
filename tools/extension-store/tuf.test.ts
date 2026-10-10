import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash,sign} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Metadata, MetadataKind, Signature} from '@tufjs/models';
import {BaseFetcher} from 'tuf-js';
import {DownloadHTTPError} from 'tuf-js/dist/error.js';
import {buildPublication,refreshStore} from './tuf.ts';
import {catalog,time} from '../../phase1/src/lib/extensions/store/fixtures.ts';
import type {SecurityFeed} from '../../phase1/src/lib/extensions/store/types.ts';
function key(){const {privateKey,publicKey}=generateKeyPairSync('ed25519');const hex=(publicKey.export({format:'der',type:'spki'}) as Buffer).subarray(-32).toString('hex');const id=createHash('sha256').update(hex).digest('hex');return{id,hex,signer:(data:Buffer)=>new Signature({keyID:id,sig:sign(null,data,privateKey).toString('hex')})};}
function fixture(){const keys={root:key(),targets:key(),snapshot:key(),timestamp:key(),security:key()},now=Date.now();
 const root=Metadata.fromJSON(MetadataKind.Root,{signed:{_type:'root',spec_version:'1.0.31',version:1,expires:new Date(now+365*86400000).toISOString(),consistent_snapshot:true,keys:Object.fromEntries(Object.values(keys).map(k=>[k.id,{keytype:'ed25519',scheme:'ed25519',keyval:{public:k.hex}}])),roles:Object.fromEntries(['root','targets','snapshot','timestamp'].map(role=>[role,{keyids:[keys[role as keyof typeof keys].id],threshold:1}]))},signatures:[]});root.sign(keys.root.signer);
 const feed:SecurityFeed={securitySchemaVersion:1,sequence:1,generatedAt:new Date(now).toISOString(),incidents:[]};
 const input={root:Buffer.from(JSON.stringify(root.toJSON())),catalog:catalog(),security:feed,version:1,now,signers:{targets:keys.targets.signer,security:keys.security.signer,snapshot:keys.snapshot.signer,timestamp:keys.timestamp.signer},securityKeyId:keys.security.id,securityPublicHex:keys.security.hex,releaseTargets:{}};
 return{input,keys};
}
class MemoryFetcher extends BaseFetcher {
 constructor(readonly files:Map<string,Buffer>){super();}
 async fetch(url:string):Promise<ReadableStream<Uint8Array<ArrayBuffer>>>{const b=this.files.get(url);if(!b)throw new DownloadHTTPError('Not found',404);return new ReadableStream({start(c){c.enqueue(new Uint8Array(b));c.close();}});}
}
async function env(){const {input,keys}=fixture();const publication=buildPublication(input);const files=new Map<string,Buffer>([...Object.entries(publication.metadata).map(([p,b])=>['https://store.example/metadata/'+p,b] as const),...Object.entries(publication.targets).map(([p,b])=>['https://store.example/targets/'+p,b] as const)]);
 const cacheDir=await mkdtemp(join(tmpdir(),'somnia-store-'));return{input,keys,files,cacheDir,fetcher:new MemoryFetcher(files)};}
const read=(e:Awaited<ReturnType<typeof env>>)=>refreshStore({pinnedRoot:e.input.root,cacheDir:e.cacheDir,metadataBaseUrl:'https://store.example/metadata/',targetBaseUrl:'https://store.example/targets/',fetcher:e.fetcher});
test('real tuf-js validates roles, consistent hashed targets and security delegation',async()=>{
 const e=await env();try{const result=await read(e);assert.equal(result.catalog.catalogSchemaVersion,1);assert.equal(result.security.securitySchemaVersion,1);assert.ok(result.verifiedAt);}finally{await rm(e.cacheDir,{recursive:true,force:true});}
});
test('tampered signed timestamp and missing target fail closed',async()=>{
 for(const mode of ['signature','target']){const e=await env();try{if(mode==='signature'){const p='https://store.example/metadata/timestamp.json';const json=JSON.parse(e.files.get(p)!.toString());json.signed.version=999;e.files.set(p,Buffer.from(JSON.stringify(json)));}else {for(const p of e.files.keys())if(p.includes('/targets/catalog/'))e.files.delete(p);}await assert.rejects(read(e));}finally{await rm(e.cacheDir,{recursive:true,force:true});}}
});
test('bad catalog hash/length, expired metadata and wrong-root signatures are rejected',async()=>{
 for(const mode of ['hash','expiry','wrong-root']){const e=await env();try{
  if(mode==='hash'){for(const p of e.files.keys())if(p.includes('/targets/catalog/'))e.files.set(p,Buffer.from('{}'));}
  if(mode==='expiry'){const p='https://store.example/metadata/timestamp.json';const json=JSON.parse(e.files.get(p)!.toString());json.signed.expires='2020-01-01T00:00:00Z';const md=Metadata.fromJSON(MetadataKind.Timestamp,json);md.sign(e.keys.timestamp.signer);e.files.set(p,Buffer.from(JSON.stringify(md.toJSON())));}
  if(mode==='wrong-root')e.input.root=fixture().input.root;
  await assert.rejects(read(e));
 }finally{await rm(e.cacheDir,{recursive:true,force:true});}}
});
test('persisted clock and application sequence rollback is rejected',async()=>{
 const e=await env();try{await read(e);await writeFile(join(e.cacheDir,'store-state.json'),JSON.stringify({verifiedAt:new Date(Date.now()+86400000).toISOString(),catalogSequence:1,securitySequence:1}));await assert.rejects(read(e),/Clock rollback/);
 await writeFile(join(e.cacheDir,'store-state.json'),JSON.stringify({verifiedAt:time,catalogSequence:2,securitySequence:1}));await assert.rejects(read(e),/sequence rollback/);
 }finally{await rm(e.cacheDir,{recursive:true,force:true});}
});

test('publication refuses installable releases without digest-bound actual evidence and assets',()=>{
 const {input}=fixture();input.catalog.extensions[0].releases[0].state='listed';assert.throws(()=>buildPublication(input),/evidence\/inventory/);
});

test('TUF root rotation requires old and new root authority',async()=>{
 for(const authorized of [true,false]){const e=await env();try{
  const next=fixture();const rotated=Metadata.fromJSON(MetadataKind.Root,JSON.parse(next.input.root.toString()));const json=rotated.toJSON();(json.signed as any).version=2;
  const root2=Metadata.fromJSON(MetadataKind.Root,json);root2.sign(next.keys.root.signer);if(authorized)root2.sign(e.keys.root.signer,true);
  e.files.set('https://store.example/metadata/2.root.json',Buffer.from(JSON.stringify(root2.toJSON())));
  const pub=buildPublication({...next.input,root:Buffer.from(JSON.stringify(root2.toJSON()))});
  for(const [p,b] of Object.entries(pub.metadata))e.files.set('https://store.example/metadata/'+p,b);
  for(const [p,b] of Object.entries(pub.targets))e.files.set('https://store.example/targets/'+p,b);
  if(authorized)assert.equal((await read(e)).catalog.sequence,1);else await assert.rejects(read(e));
 }finally{await rm(e.cacheDir,{recursive:true,force:true});}}
});

test('signed metadata rollback is rejected against persistent version cache',async()=>{
 const e=await env();try{const high=buildPublication({...e.input,version:2});for(const [p,b] of Object.entries(high.metadata))e.files.set('https://store.example/metadata/'+p,b);await read(e);
 const old=buildPublication(e.input);for(const [p,b] of Object.entries(old.metadata))e.files.set('https://store.example/metadata/'+p,b);await assert.rejects(read(e));
 }finally{await rm(e.cacheDir,{recursive:true,force:true});}
});

test('discovery removal retains cached digest blocks until signed explicit clearance',async()=>{
 const e=await env();try{const block={incidentId:'INC',sequence:1,action:'security-blocked' as const,digests:['a'.repeat(64)],versions:[],reason:'malware' as const,issuedAt:new Date(Date.now()).toISOString(),reviewStatus:'investigating' as const,summary:'Investigating',appealUrl:'https://store.example/appeal'};
 async function publish(sequence:number,incidents:any[]){const pub=buildPublication({...e.input,version:sequence,security:{...e.input.security,sequence,incidents}});for(const [p,b] of Object.entries(pub.metadata))e.files.set('https://store.example/metadata/'+p,b);for(const [p,b] of Object.entries(pub.targets))e.files.set('https://store.example/targets/'+p,b);}
 await publish(1,[block]);assert.equal((await read(e)).security.incidents.length,1);await publish(2,[]);assert.equal((await read(e)).security.incidents.length,1);
 await publish(3,[{...block,sequence:3,reviewStatus:'cleared',supersedes:'INC'}]);assert.equal((await read(e)).security.incidents.length,2);
 }finally{await rm(e.cacheDir,{recursive:true,force:true});}
});
