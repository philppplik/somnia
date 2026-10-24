/** Application wiring that makes the signed blocklist effective: service construction, cache and
 * host adapters, load-time gate, launch + 24h monitoring and a status surface for the settings UI.
 * Trusted shell only. Never import from extension-controlled code. */
import {BlocklistService,ed25519IndexVerifier,monitorBlocklist,signedIndexFetcher,type BlockedVersion,type BlocklistCache,type BlocklistHost,type FeedStatus,type InstalledBlocklistExtension,type SignedIndex} from './blocklist';
import {loadExtensions,setExtensionEnabled,setExtensionBlockGate} from './registry';
import {V2PackageStore} from './v2PackageStore';
import {CONSENT_BLOCKED,getConsentBroker} from './consentUiHost';
import {securityOf} from './securityPolicy';
import type {PermissionBroker} from './permissionBroker';

/** Bundled feed configuration. The private signing key never ships: it lives in the GitHub
 * environment secret behind maintainer review (see docs/extensions-store.md). Until the first
 * signed feed is published the public key stays empty and the blocklist is honestly inactive. */
export interface BlocklistConfig {indexUrl:string;signatureUrl:string;publicKeyBase64:string}
export const BLOCKLIST_CONFIG:BlocklistConfig={
 indexUrl:'https://raw.githubusercontent.com/philppplik/somnia/main/docs/extensions/catalog/blocklist.json',
 signatureUrl:'https://raw.githubusercontent.com/philppplik/somnia/main/docs/extensions/catalog/blocklist.sig',
 publicKeyBase64:'',
};
export const blocklistConfigured=(c:BlocklistConfig)=>!!(c.indexUrl&&c.signatureUrl&&c.publicKeyBase64);

const CACHE_KEY='somnia.extensions.blocklist.v1';
export interface KeyValueStorage {getItem(key:string):string|null;setItem(key:string,value:string):void}
/** Persists only signature-verified bytes; shape is revalidated on every read. */
export function createBlocklistCache(storage:KeyValueStorage):BlocklistCache{
 return{
  async read(){
   const raw=storage.getItem(CACHE_KEY);if(!raw||raw.length>4*1024*1024+1024)return null;
   try{
    const v=JSON.parse(raw) as SignedIndex;
    if(!v||typeof v.payload!=='string'||typeof v.signature!=='string')return null;
    return {payload:v.payload,signature:v.signature,...(typeof v.verifiedAtMs==='number'?{verifiedAtMs:v.verifiedAtMs}:{})};
   }catch{return null;}
  },
  async write(value){storage.setItem(CACHE_KEY,JSON.stringify(value));},
 };
}

const b64Bytes=(text:string):Uint8Array=>{if(!/^[A-Za-z0-9+/]*={0,2}$/.test(text))throw new Error('invalid');return Uint8Array.from(atob(text),c=>c.charCodeAt(0));};

export interface AppBlocklistHostDeps {broker:PermissionBroker;packages:V2PackageStore}
/** Bridges the policy engine to both install lanes. Disable + notify, never uninstall:
 * packages, settings, history and secrets stay untouched in every path. */
export function createAppBlocklistHost(deps:AppBlocklistHostDeps):BlocklistHost{
 const reasonOf=(block:BlockedVersion,revision:number)=>`Blocked by the extension security feed (revision ${revision}). Reason: ${block.reason_url}`;
 return{
  async installed(){
   const v1=loadExtensions().map(m=>({id:m.id,name:m.name,version:m.version,engine:'sandboxed' as const}));
   const ids=new Set(v1.map(e=>e.id));
   const v2=deps.packages.list().filter(p=>!ids.has(p.manifest.id)).map(p=>({id:p.manifest.id,name:p.manifest.name,version:p.manifest.version,engine:securityOf(p.manifest).tier==='B'?'native' as const:'sandboxed' as const}));
   return [...v1,...v2];
  },
  async disableBlocked(extension,block,revision){
   const reason=reasonOf(block,revision);
   if(deps.packages.get(extension.id)){
    // Idempotent across refreshes: an unchanged policy block must not notify again.
    if(deps.broker.snapshot().extensions[extension.id]?.blocked!==reason)await deps.broker.setBlocked(extension.id,reason);
   }
   if(loadExtensions().some(m=>m.id===extension.id))setExtensionEnabled(extension.id,false);
  },
  async clearBlock(id){
   if(deps.broker.snapshot().extensions[id]?.blocked)await deps.broker.setBlocked(id,null);
  },
  async notify(extension,block){
   // The v2 lane already notified through PermissionBroker.setBlocked hooks; only the legacy
   // registry lane needs the dialog dispatch here.
   if(deps.packages.get(extension.id))return;
   window.dispatchEvent(new CustomEvent(CONSENT_BLOCKED,{detail:{extensionId:extension.id,code:'E_BLOCKLISTED',message:`${extension.name} was turned off because the extension security feed blocks this version. More: ${block.reason_url}`}}));
  },
 };
}

export interface BlocklistStatusView {configured:boolean;status:FeedStatus|null;lastError:string|null}
let service:BlocklistService|null=null;
let view:BlocklistStatusView={configured:false,status:null,lastError:null};
const listeners=new Set<()=>void>();
const emit=()=>{for(const fn of[...listeners])fn();};
/** Current feed state for the security settings UI. */
export const getBlocklistStatus=():BlocklistStatusView=>view;
export function subscribeBlocklistStatus(fn:()=>void):()=>void{listeners.add(fn);return()=>{listeners.delete(fn);};}
/** The live service for host gates (popup enable/install, store staging). Null until configured and started. */
export const getBlocklistService=():BlocklistService|null=>service;

export interface BlocklistMonitorDeps {
 config?:BlocklistConfig;
 storage?:KeyValueStorage;
 broker?:PermissionBroker;
 packages?:V2PackageStore;
 fetchSigned?:()=>Promise<SignedIndex>;
 now?:()=>number;
}
/** Starts the launch + 24h monitor and registers the load gate. Safe to call once at app startup;
 * the returned disposer stops the timer. With no bundled key the gate stays open and the status
 * honestly reports "not configured". */
export function startBlocklistMonitor(deps:BlocklistMonitorDeps={}):()=>void{
 const config=deps.config??BLOCKLIST_CONFIG;
 const storage=deps.storage??localStorage;
 const broker=deps.broker??getConsentBroker();
 const packages=deps.packages??new V2PackageStore(storage);
 const host=createAppBlocklistHost({broker,packages});
 // The gate is always registered, so a blocked extension can never run even while still flagged enabled.
 setExtensionBlockGate((id,version)=>service?.blocked(id,version)!=null);
 if(!blocklistConfigured(config)){service=null;view={configured:false,status:null,lastError:null};emit();return()=>{};}
 let key:Uint8Array;
 try{key=b64Bytes(config.publicKeyBase64);if(key.length!==32)throw new Error('invalid');}
 catch{service=null;view={configured:false,status:null,lastError:'The bundled blocklist key is invalid.'};emit();return()=>{};}
 service=new BlocklistService(createBlocklistCache(storage),ed25519IndexVerifier(key),host,deps.now??Date.now);
 const report=(r:FeedStatus|Error)=>{view={configured:true,status:r instanceof Error?(service?.status()??null):r,lastError:r instanceof Error?String(r):null};emit();};
 return monitorBlocklist(service,deps.fetchSigned??signedIndexFetcher(config.indexUrl,config.signatureUrl),report);
}
