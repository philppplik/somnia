/** Catalog-backed blocklist wiring (store hardening: unifies SEC-C6 revocation enforcement with the
 * signed catalog index from 16-signed-catalog.md). The BlocklistService stays a generic signed-feed
 * consumer; this module projects the signed catalog's `revoked[]` onto its feed model and provides
 * the shell host that disables matching installs. Policy source of truth is the signed index served
 * from the somnia-extensions repository, verified against the pinned key k1 (catalogTrust.ts).
 *
 * Semantics, deliberately fail-safe:
 * - A matching installed extension is DISABLED and the user is NOTIFIED. Nothing is uninstalled:
 *   no files, settings, history or secrets are touched (BlocklistHost contract).
 * - Checks run at launch and every 24h (monitorBlocklist). Concurrent checks coalesce.
 * - Offline or invalid feed: the last verified policy stays in force. A restart re-verifies the
 *   cached index bytes and keeps enforcing them; expiry of the index never lifts a block and never
 *   disables a healthy extension (the 30-day catalog expiry bounds installs/updates, which the
 *   store layer enforces on the same bytes — revocation enforcement is forward-only).
 * - Only the pinned key can move the policy, and only forward: the catalog serial is the blocklist
 *   revision; lower serials and same-serial-different-content are rejected.
 */
import {CATALOG_KEYS,SIGNED_CATALOG_REQUIRED,SIGNED_INDEX_URL,SIGNED_SIG_URL} from './catalogTrust';
import {fetchSignedPair,parseSignedCatalog,verifyEd25519,SignedCatalogError,type TrustKeyList} from './signedCatalog';
import {BlocklistService,matchesBlockedVersion,monitorBlocklist,type BlockedVersion,type BlocklistCache,type BlocklistFeed,type BlocklistHost,type FeedStatus,type InstalledBlocklistExtension,type SignedIndex} from './blocklist';
import {loadExtensions,setExtensionEnabled} from './registry';
import {V2PackageStore} from './v2PackageStore';
import {securityOf} from './securityPolicy';
import {CONSENT_BLOCKED,getConsentBroker} from './consentUiHost';
import {logInfo,reportError} from '../log';
import type {ExtensionManifest} from './types';
import type {ManifestV2} from './manifestV2';

/** Where revocation notices and reasons are published (the signed catalog's home, 16-signed-catalog.md). */
export const REVOCATIONS_INFO_URL='https://github.com/philppplik/somnia-extensions';
const CACHE_KEY='somnia.blocklist.catalog.v1';
/** The blocklist range grammar caps a range at 500 chars; catalog revocations list exact versions. */
const MAX_RANGE=500;

/** Projects the signed catalog index (schema 2) onto the blocklist feed: serial -> revision,
 * revoked[] -> blocked[]. Exact versions become an equality union range. The whole feed is rejected
 * (fail closed, last policy stays) when any entry cannot be represented exactly. */
export function catalogBlocklistParser(keys:TrustKeyList=CATALOG_KEYS):(payload:string)=>BlocklistFeed {
  return payload=>{
    const catalog=parseSignedCatalog(payload);
    if(!keys.some(k=>k.keyId===catalog.keyId))throw new SignedCatalogError('unknown-key','Index names an unpinned key.');
    const blocked=catalog.revoked.map((r):BlockedVersion=>{
      const versions=r.versions.join(' || ');
      if(versions.length>MAX_RANGE)throw new SignedCatalogError('invalid',`Revocation for ${r.id} exceeds the range grammar (${r.versions.length} versions).`);
      // Validates the range compiles and that every listed version satisfies the closed grammar.
      try{for(const v of r.versions)if(!matchesBlockedVersion(v,versions))throw new Error('no self-match');}
      catch(e){throw new SignedCatalogError('invalid',`Revocation for ${r.id} has an unusable version list: ${e instanceof Error?e.message:String(e)}`);}
      return {id:r.id,versions,reason_url:REVOCATIONS_INFO_URL,reason:r.reason};
    });
    return {revision:catalog.serial,blocked};
  };
}

/** Signature check over the EXACT index bytes against the pinned catalog keys (any of them, for rotation). */
export function catalogBlocklistVerifier(keys:TrustKeyList=CATALOG_KEYS,cryptoApi:Crypto=globalThis.crypto):(signed:SignedIndex)=>Promise<boolean> {
  return async signed=>{
    if(typeof signed.payload!=='string'||typeof signed.signature!=='string')return false;
    for(const k of keys)if(await verifyEd25519(k,signed.payload,signed.signature,cryptoApi))return true;
    return false;
  };
}

const localCache=(storage:Storage,key:string):BlocklistCache=>({
  async read(){try{const v=JSON.parse(storage.getItem(key)??'null');return v&&typeof v.payload==='string'&&typeof v.signature==='string'?v as SignedIndex:null;}catch{return null;}},
  async write(v){storage.setItem(key,JSON.stringify(v));},
});

export interface CatalogBlocklistDeps {keys?:TrustKeyList; storage?:Storage; cacheKey?:string; now?:()=>number; cryptoApi?:Crypto}
/** Builds the catalog-backed BlocklistService, or null while no signing key is pinned (feature off). */
export function createCatalogBlocklistService(host:BlocklistHost,deps:CatalogBlocklistDeps={}):BlocklistService|null {
  const keys=deps.keys??CATALOG_KEYS;
  if(!keys.length)return null;
  const storage=deps.storage??(typeof localStorage!=='undefined'?localStorage:null);
  if(!storage)return null;
  return new BlocklistService(localCache(storage,deps.cacheKey??CACHE_KEY),catalogBlocklistVerifier(keys,deps.cryptoApi),host,deps.now,catalogBlocklistParser(keys));
}

/** Injectable seams; defaults are the real shell surfaces. Never construct for an extension webview. */
export interface ShellBlocklistHostDeps {
  installedV1?:()=>ExtensionManifest[];
  disableV1?:(id:string)=>void;
  packages?:Pick<V2PackageStore,'list'|'get'>;
  broker?:{setBlocked(id:string,reason:string|null,opts?:{notify?:boolean}):Promise<void>;snapshot():{extensions:Record<string,{blocked?:string}>}};
  notifyBlocked?:(extensionId:string,message:string)=>void;
}
const defaultNotify=(extensionId:string,message:string)=>{
  window.dispatchEvent(new CustomEvent(CONSENT_BLOCKED,{detail:{extensionId,code:'E_BLOCKLISTED',message}}));
};
/** Host adapter over the v1 registry lane and the v2 consent broker. Disable + notify, never uninstall.
 * A v1 id shadows a v2 package with the same id, matching the popup host's lane order. */
export function createShellBlocklistHost(deps:ShellBlocklistHostDeps={}):BlocklistHost {
  const installedV1=deps.installedV1??loadExtensions;
  const disableV1=deps.disableV1??((id:string)=>setExtensionEnabled(id,false));
  const packages=deps.packages??new V2PackageStore(localStorage);
  const broker=deps.broker??getConsentBroker();
  const notify=deps.notifyBlocked??defaultNotify;
  const lane=(id:string):'v1'|'v2'|null=>{
    if(installedV1().some(m=>m.id===id))return 'v1';
    if(packages.get(id))return 'v2';
    return null;
  };
  return {
    async installed(){
      const v1=installedV1().map((m):InstalledBlocklistExtension=>({id:m.id,name:m.name,version:m.version,engine:'sandboxed'}));
      const shadowed=new Set(v1.map(e=>e.id));
      const v2=packages.list().filter(p=>!shadowed.has(p.manifest.id)).map((p):InstalledBlocklistExtension=>({id:p.manifest.id,name:p.manifest.name,version:p.manifest.version,engine:securityOf(p.manifest).tier==='B'?'native':'sandboxed'}));
      return [...v1,...v2];
    },
    async disableBlocked(ext,block){
      const reason=block.reason??block.reason_url;
      const l=lane(ext.id);
      if(l==='v2')await broker.setBlocked(ext.id,reason,{notify:false});
      else if(l==='v1')disableV1(ext.id);
      logInfo('extensions/blocklist',`Disabled ${ext.id}@${ext.version}: signed-catalog revocation`,{reason_url:block.reason_url});
    },
    /** Clears only the policy lock; never enables. Skips entries that carry no block. */
    async clearBlock(id){
      if(lane(id)!=='v2')return;
      if(!broker.snapshot().extensions[id]?.blocked)return;
      await broker.setBlocked(id,null,{notify:false});
    },
    async notify(ext,block){
      notify(ext.id,block.reason??`Blocked by the signed extension catalog: ${block.reason_url}`);
    },
  };
}

let shell:BlocklistService|null|undefined;
/** The shell's catalog-backed blocklist service (lazy singleton). Null while the feature is off. */
export function getCatalogBlocklist():BlocklistService|null {
  if(shell!==undefined)return shell;
  shell=SIGNED_CATALOG_REQUIRED?createCatalogBlocklistService(createShellBlocklistHost()):null;
  return shell;
}

/** Launch check + 24h cadence for the shell build. Returns a dispose function for host shutdown.
 * No-op while no catalog key is pinned. Status transitions and failures go to the log; a quiet
 * offline notebook must never produce UI noise from this controller. */
export function startCatalogBlocklistMonitor(report?:(status:FeedStatus|Error)=>void):()=>void {
  const service=getCatalogBlocklist();
  if(!service)return ()=>{};
  let last='';
  const sink=report??((s:FeedStatus|Error)=>{
    if(s instanceof Error){reportError('extensions/blocklist',s);return;}
    const key=`${s.state}:${s.revision??'-'}:${s.offlineDays??'-'}`;
    if(key!==last){last=key;logInfo('extensions/blocklist',`Catalog blocklist ${s.state}`,{revision:s.revision,offlineDays:s.offlineDays,checkedAt:s.checkedAt});}
  });
  return monitorBlocklist(service,()=>fetchSignedPair(SIGNED_INDEX_URL,SIGNED_SIG_URL),sink);
}
