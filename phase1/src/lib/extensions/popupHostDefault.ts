import {fetchCatalog,reviewCatalogPackage,installReviewedPackage,type CatalogEntry,type ReviewedPackage} from './catalog';
import {installStateOf} from './catalogView';
import type {Permission} from './types';
import {installExtension,loadExtensions,removeExtension,setExtensionEnabled,enabledIds,revokedPermissions,setPermissionRevoked} from './registry';
import {parseManifestV2} from './manifestV2';
import {validateManifest} from './manifest';
import {extensionsRestricted} from './restrictedMode';
import {queryExtensionActivity,exportExtensionActivity} from './securityActivity';
import {locate,type CandidateState,type GrantRow,type PopupExtension} from './popupModel';
import type {BrowseEntry,ExtensionsPopupHost} from './popupHost';
import type {ExtensionManifest} from './types';

const label=(p:string)=>p;
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
const asCandidate=(e:CatalogEntry,r:ReviewedPackage):CandidateState=>({kind:'ready',id:e.id,name:e.name,version:e.version,origin:e.repo,engine:`API ${e.apiVersion}`,verification:'signed-match',native:false,
 grants:r.manifest.permissions.filter(p=>p==='project.read'||p==='project.write').map(p=>({id:p,key:p as 'project.read',control:'toggle' as const,granted:true}))});

/** Host adapter over the current registry, catalog and the persistent activity bridge. Branch 4 broker wiring replaces rows/grant calls at integration. */
export function createDefaultHost():ExtensionsPopupHost{
 const reviews=new Map<string,ReviewedPackage>();let pending:ExtensionManifest|null=null;
 return {
  list:async()=>{const on=enabledIds();return loadExtensions().map(m=>toPopup(m,on));},
  setEnabled:async(id,on)=>{setExtensionEnabled(id,on);},
  disableAll:async()=>{enabledIds().forEach(id=>setExtensionEnabled(id,false));},
  setGrant:async(id,row,on)=>{setPermissionRevoked(id,label(row),!on);},
  remove:async(id)=>{removeExtension(id);},
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
  inspect:async({manifestText})=>{
   const text=manifestText.trim();if(!text)return{kind:'empty'};
   const json=text.startsWith('{');
   if(json){let v:unknown;try{v=JSON.parse(text);}catch(e){const msg=e instanceof Error?e.message:'';return{kind:'error',code:'malformed',...locate(msg)};}
    const r=validateManifest(v);if(!r.ok)return{kind:'error',code:r.errors.some(e=>/permission/i.test(e))?'unknownPermission':'malformed',detail:r.errors[0]};
    if(loadExtensions().some(m=>m.id===r.manifest.id))return{kind:'error',code:'duplicate',detail:r.manifest.id};
    pending=r.manifest;return{kind:'manifestOnly',id:r.manifest.id,name:r.manifest.name,version:r.manifest.version};}
   const r=parseManifestV2(text,{lane:'local'});
   if(!r.ok)return{kind:'error',code:r.errors.some(e=>/permission/i.test(e.message))?'unknownPermission':'malformed',detail:`${r.errors[0].code} ${r.errors[0].path}`.trim()};
   return{kind:'manifestOnly',id:r.manifest.id,name:r.manifest.name,version:r.manifest.version};
  },
  install:async id=>{const r=reviews.get(id);if(r){installReviewedPackage(r);return;}if(pending&&pending.id===id){installExtension(JSON.stringify(pending));return;}throw new Error('failed');},
  browse:async signal=>{
   try{const entries=await fetchCatalog(signal);const inst=loadExtensions();
    const list:BrowseEntry[]=entries.map(e=>{const s=installStateOf(e,inst).state;return{id:e.id,name:e.name,description:e.description,publisher:e.author,badge:null,permissionLabels:e.permissions.filter(p=>p==='project.read'||p==='project.write'),verified:true,state:s==='update-available'?'update-consent':s==='not-installed'?'available':'installed'};});
    entries.forEach(e=>reviews.delete(e.id));return{status:'ready',entries:list,fetchedAt:new Date().toISOString(),offline:false};
   }catch{return{status:'unavailable'};}
  },
  reviewInstall:async id=>{const e=(await fetchCatalog()).find(x=>x.id===id);if(!e)return{kind:'error',code:'failed'};try{const r=await reviewCatalogPackage(e);reviews.set(id,r);return asCandidate(e,r);}catch(err){return{kind:'error',code:/hash|sha/i.test(String(err))?'badHash':'failed'};}},
  developerMode:()=>false,
 };
}
