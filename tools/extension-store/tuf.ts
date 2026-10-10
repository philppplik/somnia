import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile, rename} from 'node:fs/promises';
import {join} from 'node:path';
import {BaseFetcher, Updater} from 'tuf-js';
import {DownloadHTTPError} from 'tuf-js/dist/error.js';
import {Metadata, MetadataKind, Snapshot, Timestamp, MetaFile, Signature} from '@tufjs/models';
import {parseStoreCatalog} from '../../phase1/src/lib/extensions/store/validation.ts';
import {evaluateReview, parseSecurityFeed} from '../../phase1/src/lib/extensions/store/policy.ts';
import {validateAssetInventory} from '../../phase1/src/lib/extensions/store/assets.ts';
import type {StoreCatalog, SecurityFeed, ReleaseEvidence} from '../../phase1/src/lib/extensions/store/types.ts';
export const CATALOG_TARGET='catalog/index.json';
export const SECURITY_TARGET='security/revocations.json';
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const bytes=(v:unknown)=>Buffer.from(JSON.stringify(v));
type Signer=(data:Buffer)=>Signature;
export interface Publication {metadata:Record<string,Buffer>; targets:Record<string,Buffer>}
/** Protected-environment only. No fetching, package execution or key creation. */
export function buildPublication(input:{root:Buffer;catalog:StoreCatalog;security:SecurityFeed;version:number;now:number;signers:{targets:Signer;security:Signer;snapshot:Signer;timestamp:Signer};securityKeyId:string;securityPublicHex:string; releaseTargets:Record<string,Buffer>}):Publication {
 const catalog=parseStoreCatalog(input.catalog),security=parseSecurityFeed(input.security);
 if(!Number.isSafeInteger(input.version)||input.version<1||!Number.isFinite(input.now))throw new Error('Invalid publication context.');
 const root=Metadata.fromJSON(MetadataKind.Root,JSON.parse(input.root.toString()));
 if(!root.signed.consistentSnapshot||root.signed.isExpired(new Date(input.now)))throw new Error('Live consistent-snapshot root is required.');
 root.verifyDelegate('root',root);
 const opts=(days:number)=>({version:input.version,specVersion:'1.0.31',expires:new Date(input.now+days*86400000).toISOString()});
 const releaseTargets:Record<string,Buffer>={};
 for(const listing of catalog.extensions)for(const release of listing.releases){
  if(!['listed','deprecated'].includes(release.state))continue;
  const ep=`evidence/${release.evidence.sha256}.json`,ap=`assets/${release.assets.sha256}.json`;
  const eb=input.releaseTargets[ep],ab=input.releaseTargets[ap];
  if(!eb||!ab||hash(eb)!==release.evidence.sha256||eb.length!==release.evidence.bytes||hash(ab)!==release.assets.sha256||ab.length!==release.assets.bytes)throw new Error('Required evidence/inventory bytes do not match release references.');
  const evidence=JSON.parse(eb.toString()) as ReleaseEvidence;
  const issues=evaluateReview(release,evidence,{prHead:evidence.prHead,policyRevision:catalog.policyRevision,now:input.now});
  issues.push(...validateAssetInventory(JSON.parse(ab.toString()),release));
  if(issues.length)throw new Error(issues.map(e=>e.message).join(' '));
  releaseTargets[ep]=eb;releaseTargets[ap]=ab;
 }
 const cb=bytes(catalog),sb=bytes(security);
 const target=(b:Buffer)=>({length:b.length,hashes:{sha256:hash(b)}});
 const targets=Metadata.fromJSON(MetadataKind.Targets,{signed:{_type:'targets',spec_version:'1.0.31',version:input.version,expires:opts(30).expires,targets:{[CATALOG_TARGET]:target(cb),...Object.fromEntries(Object.entries(releaseTargets).map(([p,b])=>[p,target(b)]))},delegations:{keys:{[input.securityKeyId]:{keytype:'ed25519',scheme:'ed25519',keyval:{public:input.securityPublicHex}}},roles:[{name:'security',keyids:[input.securityKeyId],threshold:1,terminating:true,paths:[SECURITY_TARGET]}]}},signatures:[]});
 targets.sign(input.signers.targets);root.verifyDelegate('targets',targets);
 const delegated=Metadata.fromJSON(MetadataKind.Targets,{signed:{_type:'targets',spec_version:'1.0.31',version:input.version,expires:opts(7).expires,targets:{[SECURITY_TARGET]:target(sb)}},signatures:[]});
 delegated.sign(input.signers.security);targets.verifyDelegate('security',delegated);
 const tb=bytes(targets.toJSON()),db=bytes(delegated.toJSON());
 const meta=(b:Buffer)=>new MetaFile({version:input.version,length:b.length,hashes:{sha256:hash(b)}});
 const snapshot=new Metadata(new Snapshot({...opts(7),meta:{'targets.json':meta(tb),'security.json':meta(db)}}));
 snapshot.sign(input.signers.snapshot);root.verifyDelegate('snapshot',snapshot);
 const snb=bytes(snapshot.toJSON());
 const timestamp=new Metadata(new Timestamp({...opts(2),snapshotMeta:meta(snb)}));
 timestamp.sign(input.signers.timestamp);root.verifyDelegate('timestamp',timestamp);
 return {metadata:{[`${input.version}.targets.json`]:tb,[`${input.version}.security.json`]:db,[`${input.version}.snapshot.json`]:snb,'timestamp.json':bytes(timestamp.toJSON())},targets:{[`catalog/${hash(cb)}.index.json`]:cb,[`security/${hash(sb)}.revocations.json`]:sb,...Object.fromEntries(Object.entries(releaseTargets).map(([p,b])=>{const i=p.lastIndexOf('/');return[p.slice(0,i+1)+hash(b)+'.'+p.slice(i+1),b];}))}};
}
export class PublicHttpsFetcher extends BaseFetcher {
 constructor(private readonly origin:string){super();if(new URL(origin).protocol!=='https:')throw new Error('HTTPS repository required.');}
 async fetch(url:string):Promise<ReadableStream<Uint8Array<ArrayBuffer>>> {
  const u=new URL(url);if(u.origin!==this.origin||u.username||u.password||u.hash||u.search)throw new Error('Unexpected repository origin.');
  const r=await fetch(u,{credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(20000)});
  if(!r.ok||!r.body)throw new DownloadHTTPError(`Repository download failed (${r.status}).`,r.status);return r.body;
 }
}
export interface VerifiedStore {catalog:StoreCatalog;security:SecurityFeed;verifiedAt:string}
/** The bootstrap root must come from the app, never from the candidate repository. */
export async function refreshStore(input:{pinnedRoot:Buffer;cacheDir:string;metadataBaseUrl:string;targetBaseUrl:string;fetcher?:BaseFetcher}):Promise<VerifiedStore> {
 const bootstrap=Metadata.fromJSON(MetadataKind.Root,JSON.parse(input.pinnedRoot.toString()));bootstrap.verifyDelegate('root',bootstrap);
 const now=Date.now();await mkdir(input.cacheDir,{recursive:true});
 const statePath=join(input.cacheDir,'store-state.json');let previous:{verifiedAt:string;catalogSequence:number;securitySequence:number;security?:SecurityFeed}|undefined;
 try{previous=JSON.parse(await readFile(statePath,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 if(previous&&now<Date.parse(previous.verifiedAt))throw new Error('Clock rollback: refresh requires a trustworthy clock.');
 // Seed once. Existing root cache is retained so tuf-js can enforce rotations and rollback.
 try{await writeFile(join(input.cacheDir,'root.json'),input.pinnedRoot,{flag:'wx'});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
 const origin=new URL(input.metadataBaseUrl).origin;
 if(new URL(input.targetBaseUrl).origin!==origin)throw new Error('Metadata/target origin must match.');
 const updater=new Updater({metadataDir:input.cacheDir,metadataBaseUrl:input.metadataBaseUrl,targetBaseUrl:input.targetBaseUrl,targetDir:input.cacheDir,fetcher:input.fetcher??new PublicHttpsFetcher(origin),config:{maxDelegations:8,targetsMaxLength:4*1024*1024}});
 await updater.refresh();
 async function readTarget(path:string):Promise<unknown>{const info=await updater.getTargetInfo(path);if(!info)throw new Error(`Signed target missing: ${path}`);if(info.length>4*1024*1024)throw new Error('Oversized store target.');const file=await updater.downloadTarget(info);return JSON.parse(await readFile(file,'utf8'));}
 const catalog=parseStoreCatalog(await readTarget(CATALOG_TARGET));const incoming=parseSecurityFeed(await readTarget(SECURITY_TARGET));
 if(previous&&(catalog.sequence<previous.catalogSequence||incoming.sequence<previous.securitySequence))throw new Error('Store sequence rollback.');
 // Discovery removal and expiry cannot erase cached blocks. Retain explicit clearance history.
 for(const old of previous?.security?.incidents??[]){const replacement=incoming.incidents.find(i=>i.incidentId===old.incidentId&&i.sequence===old.sequence);if(replacement&&JSON.stringify(replacement)!==JSON.stringify(old))throw new Error('Incident decisions are immutable.');}
 const security=parseSecurityFeed({...incoming,incidents:[...new Map([...(previous?.security?.incidents??[]),...incoming.incidents].map(i=>[`${i.incidentId}:${i.sequence}`,i])).values()]});
 const verifiedAt=new Date(now).toISOString();
 await writeFile(statePath+'.tmp',JSON.stringify({verifiedAt,catalogSequence:catalog.sequence,securitySequence:security.sequence,security}));await rename(statePath+'.tmp',statePath);
 return {catalog,security,verifiedAt};
}
