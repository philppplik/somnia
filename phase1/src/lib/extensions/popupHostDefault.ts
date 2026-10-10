import {classifyFetchError,fetchCatalog,reviewCatalogPackage,installReviewedPackage,type CatalogEntry,type ReviewedPackage} from './catalog';
import {installStateOf} from './catalogView';
import type {Permission} from './types';
import {installExtension,loadExtensions,removeExtension,setExtensionEnabled,enabledIds,revokedPermissions,setPermissionRevoked} from './registry';
import {parseManifestV2} from './manifestV2';
import {validateManifest} from './manifest';
import {extensionsRestricted} from './restrictedMode';
import {queryExtensionActivity,exportExtensionActivity} from './securityActivity';
import {type CandidateState,type GrantRow,type PopupExtension} from './popupModel';
import type {BrowseEntry,ExtensionsPopupHost} from './popupHost';
import type {ExtensionManifest} from './types';
import {inspectCandidate,sha256Hex,type Staged} from './candidateInspect';
import {V2PackageStore} from './v2PackageStore';
import {getConsentBroker,requestInstallConsent,consentChanged,type ConsentCandidate} from './consentUiHost';
import {createCatalogStoreHost} from './storeHostDefault';
import {grantsFromManifest} from './popupModel';
import {securityOf} from './securityPolicy';
import type {ManifestV2} from './manifestV2';
import type {BlocklistService} from './blocklist';
import {migrateLegacy} from './legacy/migrate';
import {storagePrefix} from './storageKeys';

const label=(p:string)=>p;
const legacyConsent=(m:ExtensionManifest)=>migrateLegacy(m,{somniaRange:'>=1.0.0 <99.0.0',apiRange:'>=2.0.0 <3.0.0',license:'SEE LICENSE IN LICENSE',description:m.name}).manifest;
const DECLINED='somnia.extensions.declined.v1';
const declined=():Record<string,string[]>=>{try{const v=JSON.parse(localStorage.getItem(DECLINED)||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch{return{};}};
/** Updates found by an explicit user check. Nothing is fetched in the background. */
const staged=new Map<string,{review:ReviewedPackage;added:Permission[]}>();
const rowsOf=(m:ExtensionManifest):GrantRow[]=>{
 const rev=revokedPermissions()[m.id]??[];const rows:GrantRow[]=[];
 for(const p of m.permissions){if(p==='project.read'||p==='project.write')rows.push({id:p,key:p,control:'toggle',granted:!rev.includes(p)});}
 return rows;
};
const contributions=(m:ExtensionManifest)=>[m.contributes.panels.length&&'panels',m.contributes.codeThemes.length&&'themes',m.contributes.commands.length&&'commands',m.contributes.snippets.length&&'snippets'].filter(Boolean) as string[];
const toPopup=(m:ExtensionManifest,on:string[]):PopupExtension=>({
 id:m.id,name:m.name,version:m.version,description:'',publisher:'',badge:null,
 enabled:on.includes(m.id)&&!extensionsRestricted(localStorage),
 grants:rowsOf(m),contributions:contributions(m),lastActivity:null,
 source:{provider:'local',verification:'no-signed-match'},
 update:staged.has(m.id)?{kind:'consent',version:staged.get(m.id)!.review.entry.version,added:staged.get(m.id)!.added.map(p=>p),keepsRunning:true}:{kind:'current'},
 status:on.includes(m.id)?'running':'disabled',
});
const asCandidate=(e:CatalogEntry,r:ReviewedPackage):CandidateState=>({kind:'ready',id:e.id,name:e.name,version:e.version,origin:e.repo,engine:`API ${e.apiVersion}`,verification:'hash-match',native:false,
 grants:r.manifest.permissions.filter(p=>p==='project.read'||p==='project.write').map(p=>({id:p,key:p as 'project.read',control:'toggle' as const,granted:true}))});

/** Host adapter over the current registry, catalog and the persistent activity bridge. Branch 4 broker wiring replaces rows/grant calls at integration. */
export interface DefaultHostOptions {blocklist?:()=>BlocklistService|null; packages?:V2PackageStore}
const v2Popup=(m:ManifestV2,e:{enabled:boolean;revoked:string[];folders:Record<string,string[]>;clipboard:boolean;blocked?:string}|undefined,origin:string):PopupExtension=>({
 id:m.id,name:m.name,version:m.version,description:m.description,publisher:m.publisher,badge:null,
 enabled:!!e?.enabled&&!e.blocked&&!extensionsRestricted(localStorage),
 grants:grantsFromManifest(m,{revoked:e?.revoked,folders:e?.folders,clipboard:e?.clipboard}),
 contributions:Object.entries(m.contributes).filter(([,v])=>Array.isArray(v)&&v.length>0).map(([k])=>k),lastActivity:null,
 source:{provider:origin,verification:'no-signed-match'},update:{kind:'current'},
 status:e?.blocked?'blocked':e?.enabled?'running':'disabled',
});
export function createDefaultHost(options:DefaultHostOptions={}):ExtensionsPopupHost{
 const reviews=new Map<string,ReviewedPackage>();const stagedById=new Map<string,Staged>();
 const packages=options.packages??new V2PackageStore(localStorage);
 const broker=()=>getConsentBroker();
 const blocked=(id:string,v:string)=>!!options.blocklist?.()?.blocked(id,v);
 const v2Ids=()=>new Set(packages.list().map(p=>p.manifest.id));
 const installedVersion=(id:string)=>loadExtensions().find(m=>m.id===id)?.version??packages.get(id)?.manifest.version??null;
 return {
  store:createCatalogStoreHost({blocked,installed:loadExtensions}),
  list:async()=>{
   const on=enabledIds();const snap=broker().snapshot();
   const v1=loadExtensions().map(m=>toPopup(m,on));
   const ids=new Set(v1.map(e=>e.id));
   const v2=packages.list().filter(p=>!ids.has(p.manifest.id)).map(p=>v2Popup(p.manifest,snap.extensions[p.manifest.id],p.origin));
   return [...v1,...v2];
  },
  setEnabled:async(id,on)=>{
   if(v2Ids().has(id)&&!loadExtensions().some(m=>m.id===id)){const p=packages.get(id);if(on){if(p&&blocked(id,p.manifest.version))throw new Error('blocked');await broker().enable(id);}else await broker().disable(id);consentChanged();return;}
   if(on){const p=loadExtensions().find(m=>m.id===id);if(p&&blocked(id,p.version))throw new Error('blocked');if(broker().snapshot().restricted)throw new Error('E_RESTRICTED_MODE');if(broker().snapshot().extensions[id])await broker().enable(id);}
   setExtensionEnabled(id,on);},
  disableAll:async()=>{enabledIds().forEach(id=>setExtensionEnabled(id,false));for(const id of v2Ids())await broker().disable(id);consentChanged();},
  setGrant:async(id,row,on)=>{
   if(v2Ids().has(id)&&!loadExtensions().some(m=>m.id===id)){await broker().setRevoked(id,row,!on);consentChanged();return;}
   setPermissionRevoked(id,label(row),!on);},
  remove:async(id,deleteData)=>{
   const v2=v2Ids().has(id);removeExtension(id);
   if(v2)packages.remove(id);
   // The consent record belongs to both lanes (store installs of v1 packages are approved through it too).
   if(v2||broker().snapshot().extensions[id])await broker().forget(id);
   if(deleteData){const p=storagePrefix(id);for(const k of Object.keys(localStorage).filter(k=>k.startsWith(p)))localStorage.removeItem(k);}
   consentChanged();},
  /** Explicit check against the catalog. A failed fetch throws, so the panel never claims "up to date" without proof. */
  checkUpdate:async id=>{
   const entries=await fetchCatalog();const inst=loadExtensions();const old=inst.find(m=>m.id===id);const e=entries.find(x=>x.id===id);
   if(!old||!e||installStateOf(e,inst).state!=='update-available'||(declined()[id]??[]).includes(e.version)){staged.delete(id);return;}
   const review=await reviewCatalogPackage(e);const added=review.manifest.permissions.filter(p=>!old.permissions.includes(p));
   if(added.length===0){installReviewedPackage(review);staged.delete(id);return;}
   staged.set(id,{review,added});
  },
  reviewUpdate:async id=>{const s=staged.get(id);if(!s)throw new Error('No update is waiting.');return{version:s.review.entry.version,added:s.added.map(p=>`project.${p.replace('project.','')}`),blocked:false};},
  acceptUpdate:async id=>{const s=staged.get(id);if(!s)throw new Error('No update is waiting.');installReviewedPackage(s.review);staged.delete(id);},
  keepCurrent:async id=>{const s=staged.get(id);if(!s)return;const d=declined();d[id]=[...(d[id]??[]),s.review.entry.version];localStorage.setItem(DECLINED,JSON.stringify(d));staged.delete(id);},
  queryActivity:(f,o,l)=>queryExtensionActivity(f,o,l),
  exportActivity:f=>exportExtensionActivity(f),
  copyText:async t=>{await navigator.clipboard.writeText(t);},
  openExternal:async url=>{window.open(url,'_blank','noopener,noreferrer');},
  inspect:async input=>{
   const r=await inspectCandidate(input,{installedVersion,blocked});
   stagedById.clear();if(r.staged)stagedById.set(r.staged.manifest.id,r.staged);
   return r.state;
  },
  install:async id=>{
   const r=reviews.get(id);
   const st=stagedById.get(id);
   if(!r&&!st)throw new Error('failed');
   const manifest=r?legacyConsent(r.manifest):st!.lane==='legacy'?legacyConsent(st!.manifest):st!.manifest;
   if(blocked(manifest.id,manifest.version))throw new Error('blocked');
   const old=loadExtensions().find(m=>m.id===id);
   const prior=broker().snapshot().extensions[id]?.approved??(old?legacyConsent(old):undefined);
   const candidate:ConsentCandidate={manifest,artifactHash:r?r.entry.sha256:st!.artifactHash,
    manifestHash:r?await sha256Hex(new TextEncoder().encode(JSON.stringify(r.manifest))):st!.manifestHash,
    validation:'valid',source:r?'store':'manual',sourcePath:r?r.entry.repo:st!.origin,...(prior?{previous:prior}:{})};
   await requestInstallConsent(candidate,{
    revalidate:async()=>{if(blocked(manifest.id,manifest.version))throw new Error('blocked');return candidate;},
    commit:async(c,approve)=>{
     if(blocked(manifest.id,manifest.version))throw new Error('blocked');
     if(c.artifactHash!==candidate.artifactHash||c.manifestHash!==candidate.manifestHash||JSON.stringify(c.manifest)!==JSON.stringify(manifest))throw new Error('changed');
     if(r||st!.lane==='legacy'){
      // Legacy packages stay disabled until a separate broker-checked enable action.
      // No registry write happens when the review is cancelled or approval fails.
      await approve();
      const result=r?installReviewedPackage(r):installExtension(JSON.stringify(st!.manifest),{disabled:true});
      if(!result.ok){await broker().disable(id);throw new Error(result.errors[0]??'failed');}
      await broker().disable(id);
     }else{
      const v2=st as Extract<Staged,{lane:'v2'}>;
      const undo=packages.put(v2.manifest,v2.files,{artifactHash:v2.artifactHash,manifestHash:v2.manifestHash,origin:v2.origin});
      try{await approve();}catch(e){undo();throw e;}
     }
     stagedById.delete(id);reviews.delete(id);
    },
   });
  },
  browse:async signal=>{
   try{const entries=await fetchCatalog(signal);const inst=loadExtensions();
    const list:BrowseEntry[]=entries.map(e=>{const s=installStateOf(e,inst).state;return{id:e.id,name:e.name,description:e.description,publisher:e.author,badge:null,permissionLabels:e.permissions.filter(p=>p==='project.read'||p==='project.write'),verified:false,state:s==='update-available'?'update-consent':s==='not-installed'?'available':'installed'};});
    entries.forEach(e=>reviews.delete(e.id));return{status:'ready',entries:list,fetchedAt:new Date().toISOString(),offline:false};
   }catch(e){return{status:'unavailable',reason:classifyFetchError(e)};}
  },
  reviewInstall:async id=>{const e=(await fetchCatalog()).find(x=>x.id===id);if(!e)return{kind:'error',code:'failed'};try{const r=await reviewCatalogPackage(e);reviews.set(id,r);return asCandidate(e,r);}catch(err){return{kind:'error',code:/hash|sha/i.test(String(err))?'badHash':'failed'};}},
  developerMode:()=>broker().snapshot().developerMode,
 };
}
