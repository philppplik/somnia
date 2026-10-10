import type {ManifestV2} from './manifestV2';
import {securityOf} from './securityPolicy';
import type {ActivityEvent,ActivityFilter,ActivityKind} from './securityActivity';

/** View model for the Extensions popup. Host truth in, plain display data out. No React, no I/O. */
export type PopupView='installed'|'browse'|'updates'|'activity'|'add'|'detail';
export type RuntimeStatus='running'|'disabled'|'crashed'|'blocked'|'update-consent';
export type GrantKey='project.read'|'project.write'|'network'|'clipboard'|'folders'|'agent';
export interface GrantRow {
  id:string; key:GrantKey; /** Network rows carry the host, folder rows the canonical folder. */ target?:string; reason?:string; paths?:string[];
  /** toggle: revocable on/off. ask: runtime-only, nothing to toggle. info: shown, never a switch. */
  control:'toggle'|'ask'|'info'; granted:boolean; required?:boolean;
}
export interface SourceInfo {provider:string; repository?:string; release?:string; sha256?:string; url?:string; verification:'signed-match'|'no-signed-match'|'invalid'}
export type UpdateState={kind:'current'}|{kind:'checking'}|{kind:'error'}|{kind:'silent'; version:string}|{kind:'consent'; version:string; added:string[]; keepsRunning:boolean};
export interface PopupExtension {
  id:string; name:string; version:string; description:string; publisher:string;
  /** Publisher badge. The criterion text must come from the index; never claims safety. */
  badge:{criterion:string}|null;
  enabled:boolean; status:RuntimeStatus; statusReason?:string;
  grants:GrantRow[]; contributions:string[];
  lastActivity:{ts:string; target:string|null; api:string}|null|'unreadable';
  source:SourceInfo; update:UpdateState; about?:string;
}

const RISK:Record<GrantKey,number>={'project.write':6,network:5,folders:4,clipboard:3,agent:3,'project.read':2};
export interface PermissionTag {key:string; label:string; count?:number; risk:number}
/** Summary tags for a card: at most two, highest risk first, plus an overflow count that never hides the top grant. */
export function permissionTags(ext:Pick<PopupExtension,'grants'>,max=2):{tags:PermissionTag[]; overflow:number; none:boolean}{
 const live=ext.grants.filter(g=>g.granted||g.control==='ask');
 const byKey=new Map<GrantKey,PermissionTag>();
 for(const g of live){
  const cur=byKey.get(g.key);
  if(g.key==='network'){byKey.set('network',{key:'network',label:'network',count:(cur?.count??0)+1,risk:RISK['network']});}
  else if(!cur)byKey.set(g.key,{key:g.key,label:g.key,risk:RISK[g.key]});
 }
 const all=[...byKey.values()].sort((a,b)=>b.risk-a.risk);
 return {tags:all.slice(0,max),overflow:Math.max(0,all.length-max),none:all.length===0};
}
export const SENSITIVE_NONE=(ext:Pick<PopupExtension,'grants'>)=>permissionTags(ext).none;

export interface NavCounts {installed:number; updates:number}
/** Installed counts disabled installs. Updates counts only pending user decisions. Zero hides the badge. */
export function navCounts(list:PopupExtension[]):NavCounts{return {installed:list.length,updates:list.filter(e=>e.update.kind==='consent'||e.status==='update-consent').length};}
export const badgeText=(n:number)=>n>0?String(n):null;

export type StateFilter='all'|'enabled'|'panels'|'themes'|'commands';
export function filterInstalled(list:PopupExtension[],q:string,f:StateFilter):PopupExtension[]{
 const needle=q.trim().toLowerCase();
 return list.filter(e=>{
  if(f==='enabled'&&!e.enabled)return false;
  if(f==='panels'&&!e.contributions.includes('panels'))return false;
  if(f==='themes'&&!e.contributions.includes('themes'))return false;
  if(f==='commands'&&!e.contributions.includes('commands'))return false;
  return !needle||`${e.name} ${e.description} ${e.publisher}`.toLowerCase().includes(needle);
 });
}

/** Disable never reports success before the host confirms; this decides what the switch shows. */
export function switchState(ext:Pick<PopupExtension,'enabled'|'status'>,pending:boolean):{checked:boolean; canEnable:boolean}{
 return {checked:ext.enabled&&ext.status!=='blocked',canEnable:ext.status!=='blocked'&&!pending};
}

export type ChipId='all'|'allowed'|'denied'|'prompts'|'changes'|'network';
export interface ActivityQuery {extensionId:string|null; chip:ChipId; text:string}
/** Map UI filters onto the host query. Chips combine with extension tab and text. */
export function toActivityFilter(q:ActivityQuery):ActivityFilter{
 const f:ActivityFilter={};
 if(q.extensionId)f.extensionId=q.extensionId;
 if(q.chip==='allowed')f.decision='allowed'; else if(q.chip==='denied')f.decision='denied'; else if(q.chip==='prompts')f.decision='prompted'; else if(q.chip==='changes')f.decision='changed';
 else if(q.chip==='network')f.kind='network' as ActivityKind;
 if(q.text.trim())f.search=q.text.trim();
 return f;
}
export type LogState={status:'loading'}|{status:'error'}|{status:'ready'; events:ActivityEvent[]; nextOffset:number|null; total:number};
export const isEmptyLog=(s:LogState)=>s.status==='ready'&&s.events.length===0;
/** Newest first; stable for equal timestamps. */
export const sortNewest=(events:ActivityEvent[])=>[...events].sort((a,b)=>b.ts.localeCompare(a.ts)||b.id.localeCompare(a.id));
export function dayKey(ts:string,tz?:string):string{return new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ts));}
export function groupByDay(events:ActivityEvent[],tz?:string):{day:string; events:ActivityEvent[]}[]{
 const out:{day:string;events:ActivityEvent[]}[]=[];
 for(const e of sortNewest(events)){const d=dayKey(e.ts,tz);const last=out[out.length-1];if(last&&last.day===d)last.events.push(e);else out.push({day:d,events:[e]});}
 return out;
}
export const timeOf=(ts:string,tz?:string)=>new Intl.DateTimeFormat('en-GB',{timeZone:tz,hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(ts));
export const resultKey=(d:ActivityEvent['decision'])=>({allowed:'allowed',denied:'denied',prompted:'prompted',changed:'saved'} as const)[d];
export const eventActionKey=(api:string)=>api;
/** Tabs: All first, then one per extension seen in installed list or retained history. Removed extensions keep their label. */
export function activityTabs(installed:Pick<PopupExtension,'id'|'name'>[],events:Pick<ActivityEvent,'extensionId'|'extensionName'>[]):{id:string; name:string; removed:boolean}[]{
 const m=new Map<string,{id:string;name:string;removed:boolean}>();
 for(const e of installed)m.set(e.id,{id:e.id,name:e.name,removed:false});
 for(const e of events)if(!m.has(e.extensionId))m.set(e.extensionId,{id:e.extensionId,name:e.extensionName,removed:true});
 return [...m.values()];
}

export function shortHash(h:string):string{return h.length>16?`${h.slice(0,6)}\u2026${h.slice(-4)}`:h;}
export const isSha256=(h:unknown):h is string=>typeof h==='string'&&/^[a-f0-9]{64}$/.test(h);
/** "Matches signed index entry" only when the host reports a real match and the digest is well formed. */
export const showsSignedMatch=(s:SourceInfo)=>s.verification==='signed-match'&&isSha256(s.sha256);
export const installBlocked=(s:SourceInfo)=>s.verification==='invalid';

/** Build grant rows from a v2 manifest and the broker's stored state. Declared is not granted: a revoked capability stays listed but off. */
export function grantsFromManifest(m:ManifestV2,stored:{revoked?:string[];folders?:Record<string,string[]>;clipboard?:boolean}):GrantRow[]{
 const sec=securityOf(m); const revoked=new Set(stored.revoked??[]); const rows:GrantRow[]=[];
 const fsOn=(op:'read'|'write')=>sec.fs?.[op]==='project'||m.permissions.includes(op==='read'?'project.read':'project.write');
 if(fsOn('read'))rows.push({id:'project.read',key:'project.read',control:'toggle',granted:!revoked.has('project.read')});
 if(fsOn('write'))rows.push({id:'project.write',key:'project.write',control:'toggle',granted:!revoked.has('project.write')});
 for(const h of sec.network??[]){const id=`network:${h.host}`;rows.push({id,key:'network',target:h.host,reason:h.reason,paths:h.paths,control:'toggle',granted:!revoked.has(id)&&!revoked.has('network')});}
 if(sec.clipboardRead)rows.push({id:'clipboard',key:'clipboard',reason:sec.clipboardRead.reason,control:'ask',granted:!!stored.clipboard});
 if(sec.fs?.read==='ask'||sec.fs?.write==='ask'){
  const folders=Object.entries(stored.folders??{});
  if(folders.length===0)rows.push({id:'folders',key:'folders',control:'ask',granted:false});
  for(const [folder,ops] of folders)rows.push({id:`folder:${folder}`,key:'folders',target:folder,reason:ops.join(', '),control:'toggle',granted:true});
 }
 if(sec.agent)rows.push({id:'agent',key:'agent',reason:sec.agent.reason,control:'info',granted:!revoked.has('agent')});
 return rows;
}
/** Plain labels for permissionExpansion() codes in the update diff. */
export function describeChange(code:string):{key:string; arg?:string}{
 const [head,...rest]=code.split('.');const arg=rest.join('.')||undefined;
 const known=['project','network','fs','secret','inject','activation','proposal','clipboard','agent','tier','runtime','identity','workspace-capabilities'];
 return known.includes(head)?{key:`ext.change.${head}`,arg}:{key:'ext.change.other',arg:code};
}

/** Add flow state machine inputs. Manifest-only text never enables install. */
export type CandidateState=
 |{kind:'empty'}|{kind:'inspecting'}
 |{kind:'error'; code:'malformed'|'wrongType'|'unknownPermission'|'missingEntry'|'unsupportedApp'|'badHash'|'duplicate'|'failed'; detail?:string; line?:number; column?:number}
 |{kind:'manifestOnly'; id:string; name:string; version:string}
 |{kind:'mismatch'; pastedHash:string; packageHash:string}
 |{kind:'ready'; id:string; name:string; version:string; origin:string; engine:string; verification:SourceInfo['verification']; native:boolean; grants:GrantRow[]}
 |{kind:'installing'};
export const canInstall=(c:CandidateState,developerMode:boolean,reviewed:boolean)=>c.kind==='ready'&&reviewed&&c.verification!=='invalid'&&(!c.native||developerMode);
/** Line/column from TOML or JSON parser messages when present. */
export function locate(message:string):{line?:number; column?:number}{
 const m=/line\s*(\d+)[,\s]+(?:col(?:umn)?\s*)?(\d+)/i.exec(message);if(m)return{line:+m[1],column:+m[2]};
 const p=/position\s+(\d+)/i.exec(message);return p?{column:+p[1]}:{};
}
