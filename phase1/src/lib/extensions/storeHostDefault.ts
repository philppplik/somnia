import {fetchCatalog,reviewCatalogPackage,installReviewedPackage,permissionExplanation,type CatalogEntry,type ReviewedPackage} from './catalog';
import {loadExtensions} from './registry';
import {migrateLegacy} from './legacy/migrate';
import {getConsentBroker,type ConsentCandidate} from './consentUiHost';
import {queryExtensionActivity} from './securityActivity';
import type {ExtensionManifest} from './types';
import type {ManifestV2} from './manifestV2';
import type {Publisher,Release,SecurityFeed,StoreCatalog,StoreListing} from './store';
import type {ConcernReport,StageResult,StoreHost,StoreLoad,StoreSnapshot} from './storeHost';
import {sha256Hex} from './candidateInspect';

const slug=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'unknown';
const EMPTY_DIGEST={sha256:'',bytes:0};
const EMPTY_FEED=(at:string):SecurityFeed=>({securitySchemaVersion:1,sequence:0,generatedAt:at,incidents:[]});

export interface CatalogStoreDeps {
  fetchCatalog?:typeof fetchCatalog;
  review?:typeof reviewCatalogPackage;
  commitReviewed?:typeof installReviewedPackage;
  installed?:()=>ExtensionManifest[];
  /** Verified blocklist match for an exact release. */
  blocked?:(id:string,version:string)=>boolean;
  somniaVersion?:string;
  now?:()=>number;
  /** Local extension log lines for the report preview. */
  errorLog?:(id:string)=>Promise<string|null>;
  recordApproval?:(m:ManifestV2,approve:()=>Promise<void>)=>Promise<void>;
}
declare const __APP_RELEASE__:string|undefined;
const appRelease=()=>typeof __APP_RELEASE__!=='undefined'?String(__APP_RELEASE__):'dev';

/** Honest adapter: the shipping index lists id, version, hash and permissions only. Everything it cannot prove (publisher domain, build provenance, gate evidence) stays empty and reads as "not published", never as passed. */
export function listingsFromEntries(entries:readonly CatalogEntry[],blocked:(id:string,version:string)=>boolean=()=>false,somniaMin='1.0.0'):{publishers:Publisher[];extensions:StoreListing[]}{
 const publishers=new Map<string,Publisher>();const extensions:StoreListing[]=[];
 for(const e of entries){
  const pid=slug(e.author);
  if(!publishers.has(pid))publishers.set(pid,{id:pid,displayName:e.author,githubOwnerId:0,authorizedSubmitterIds:[],repositories:[],securityContact:'',supportUrl:e.repo,rulesAcceptedAt:'',
   // The shipping index carries no 2FA declaration. The type only allows true, the UI compares with === true, so this stays an unproven false.
   declaredGithub2FA:false as unknown as true,state:'registered',official:false});
  const release:Release={id:e.id,version:e.version,channel:'stable',state:blocked(e.id,e.version)?'security-blocked':'listed',packageFormat:2,manifest:'somnia-extension.toml',engine:'sandboxed',apiVersion:e.apiVersion,minSomnia:somniaMin,
   source:{repositoryId:0,url:e.repo,commit:'',extensionPath:''},
   artifact:{sha256:e.sha256,bytes:0,githubAssetId:0,url:e.download,filename:e.download.split('/').pop()??'',expandedBytes:0,fileCount:0,largestFileBytes:0},
   provenance:{artifactSha256:e.sha256,repositoryId:0,commit:'',workflowIdentity:'',attestation:EMPTY_DIGEST},
   build:{lockfile:'',toolchain:'',command:'',lifecycleScripts:[],sbom:EMPTY_DIGEST},
   capabilities:e.permissions.map(p=>({key:p,scope:'',reason:permissionExplanation[p]??''})),capabilitySha256:'',network:[],
   docs:{readme:'',license:'',changelog:'',thirdPartyNotices:'',security:''},dataHandling:{localStorage:'',remoteProcessors:[],retention:'',deletion:''},assets:EMPTY_DIGEST,evidence:EMPTY_DIGEST};
  extensions.push({id:e.id,name:e.name,summary:e.description,category:e.category??'',publisherId:pid,releases:[release]});
 }
 return {publishers:[...publishers.values()],extensions};
}

export function createCatalogStoreHost(deps:CatalogStoreDeps={}):StoreHost{
 const now=deps.now??Date.now;const doFetch=deps.fetchCatalog??fetchCatalog;const review=deps.review??reviewCatalogPackage;const commitReviewed=deps.commitReviewed??installReviewedPackage;
 const installed=deps.installed??loadExtensions;const version=deps.somniaVersion??appRelease();
 let entries:CatalogEntry[]=[];
 const host:StoreHost={
  now,
  async load(signal){
   try{
    entries=await doFetch(signal);const at=new Date(now()).toISOString();
    const {publishers,extensions}=listingsFromEntries(entries,deps.blocked);
    const catalog:StoreCatalog={catalogSchemaVersion:1,sequence:0,generatedAt:at,policyRevision:'',publishers,extensions,tombstones:[]};
    const snapshot:StoreSnapshot={catalog,feed:EMPTY_FEED(at),fetchedAt:at,offline:false,lastTrustedCheck:now()};
    return {status:'ready',snapshot} satisfies StoreLoad;
   }catch{return {status:'unavailable'};}
  },
  /** The shipping index publishes no gate evidence. Never inferred. */
  evidence:async()=>null,
  async stage(id,ver,sha,mode):Promise<StageResult>{
   if(entries.length===0){try{entries=await doFetch();}catch{return {kind:'error',code:'failed'};}}
   const entry=entries.find(e=>e.id===id&&e.version===ver);
   if(!entry)return {kind:'error',code:'stale'};
   if(entry.sha256!==sha)return {kind:'error',code:'mismatch'};
   if(deps.blocked?.(id,ver))return {kind:'error',code:'blocked'};
   const prior=installed().find(m=>m.id===id);
   if(mode==='update'&&!prior)return {kind:'error',code:'stale'};
   const bring=async():Promise<{reviewed:ReviewedPackage;candidate:ConsentCandidate}|StageResult>=>{
    let reviewed:ReviewedPackage;
    try{reviewed=await review(entry);}catch(e){return {kind:'error',code:/sha|hash|match/i.test(String(e))?'mismatch':/not supported/i.test(String(e))?'incompatible':'failed'};}
    const opts={somniaRange:'>=1.0.0 <99.0.0',apiRange:'>=2.0.0 <3.0.0',license:'SEE LICENSE IN LICENSE',description:entry.description||entry.name};
    let migrated:ManifestV2,previous:ManifestV2|undefined;
    try{migrated=migrateLegacy(reviewed.manifest,opts).manifest;previous=prior?migrateLegacy(prior,opts).manifest:undefined;}catch{return {kind:'error',code:'incompatible'};}
    const candidate:ConsentCandidate={manifest:migrated,artifactHash:entry.sha256,manifestHash:await sha256Hex(new TextEncoder().encode(JSON.stringify(reviewed.manifest))),validation:'valid',source:'store',sourcePath:entry.repo,...(previous?{previous}:{})};
    return {reviewed,candidate};
   };
   const first=await bring();
   if('kind' in first)return first;
   let current=first;
   return {kind:'staged',request:{
    candidate:first.candidate,
    revalidate:async()=>{
     if(deps.blocked?.(id,ver))throw new Error('blocked');
     const again=await bring();if('kind' in again)throw new Error(again.kind==='error'?again.code:'failed');current=again;return again.candidate;
    },
    commit:async(c,approve)=>{
     if(deps.blocked?.(id,ver))throw new Error('blocked');
     if(c.artifactHash!==current.candidate.artifactHash)throw new Error('mismatch');
     // Approval is recorded first; the registry write follows, and approval is rolled back if it fails.
     await approve();
     const r=commitReviewed(current.reviewed);
     if(!r.ok){await getConsentBroker().forget(id);throw new Error(r.errors[0]??'failed');}
    },
   }};
  },
  errorLog:async id=>deps.errorLog?deps.errorLog(id):defaultErrorLog(id),
  somniaVersion:()=>version,
  /** There is no private security-report route yet. Failing here makes the report dialog fall back to the public issue form instead of pretending to send. */
  async submitReport(_r:ConcernReport){throw new Error('no private report route');},
  publicIssueUrl(id,ver){return `https://github.com/philppplik/somnia/issues/new?title=${encodeURIComponent(`Extension concern: ${id} ${ver}`)}`;},
 };
 return host;
}
async function defaultErrorLog(id:string):Promise<string|null>{
 try{const page=await queryExtensionActivity({extensionId:id,decision:'denied'},0,20);
  const events=(page as {events?:{ts:string;api:string;decision:string}[]}).events??[];
  return events.length?events.map(e=>`${e.ts} ${e.decision} ${e.api}`).join('\n'):null;}catch{return null;}
}
