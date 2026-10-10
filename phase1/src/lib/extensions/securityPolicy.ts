import type {ManifestV2} from './manifestV2';

export type TrustTier = 'A' | 'B';
export type FsScope = 'none' | 'project' | 'ask';
export interface NetworkScope {host:string; paths?:string[]; reason:string}
export interface SecretInjection {secret:string; host:string; header:string; prefix?:string}
export interface ExtensionSecurity {
  tier:TrustTier;
  fs?:{read:FsScope; write:FsScope};
  network?:NetworkScope[];
  secrets?:string[];
  inject?:SecretInjection[];
  agent?:{models:['host-default']; reason:string};
  clipboardRead?:{reason:string};
  clipboardWrite?:boolean;
}
export const SECURITY_DEFAULTS:Readonly<ExtensionSecurity> = Object.freeze({tier:'A'});
export const securityOf = (manifest:ManifestV2):ExtensionSecurity => manifest.security ?? SECURITY_DEFAULTS;
export const validHost = (host:string):boolean => host.length<=253 && host.split('.').every(label=>label.length<=63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label));
export const validNetworkPath = (path:string):boolean => path.startsWith('/') && path.length<=512 && !/[\\?#%\u0000-\u0020\u007f]/.test(path) && !path.split('/').some(p=>p==='.'||p==='..') && (!path.includes('*')||path.endsWith('*')&&path.indexOf('*')===path.length-1);
export function pathCovered(path:string, scopes:string[]|undefined):boolean {
  if(scopes===undefined) return true;
  return scopes.some(scope=>path.startsWith(scope.endsWith('*')?scope.slice(0,-1):scope));
}
export function allowedNetworkUrl(raw:string, scopes:NetworkScope[]):URL|null {
  try {
    if(raw.length>8192 || /[\\\u0000-\u0020\u007f]/.test(raw)) return null;
    const u=new URL(raw);
    if(u.protocol!=='https:' || u.username || u.password || u.port && u.port!=='443' || u.hash || new TextEncoder().encode(u.search).length>4096) return null;
    // Reject encoded path separators/traversal, rather than letting URL or the server normalize it differently.
    const path=decodeURIComponent(u.pathname);
    if(/[%\\\u0000-\u0020\u007f]/.test(path) || path.split('/').some(p=>p==='.'||p==='..')) return null;
    const authority=raw.slice(raw.indexOf('://')+3).split(/[/?#]/)[0];
    const originalPath=raw.slice(raw.indexOf('://')+3+authority.length).split(/[?#]/)[0]||'/';
    if(decodeURIComponent(originalPath).split('/').some(p=>p==='.'||p==='..')) return null;
    return scopes.some(scope=>scope.host===u.hostname && pathCovered(path,scope.paths))?u:null;
  } catch {return null;}
}
function stable(value:unknown):string {
  if(Array.isArray(value)) return '['+value.map(stable).sort().join(',')+']';
  if(value && typeof value==='object') return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')+'}';
  return JSON.stringify(value);
}
/** Immutable consent target. Includes runtime and proposal revisions, never secret values. */
export function consentTarget(manifest:ManifestV2):string {
  return stable({id:manifest.id,permissions:manifest.permissions,security:securityOf(manifest),runtime:manifest.runtime,capabilities:manifest.capabilities,activationEvents:manifest.activationEvents,proposedApis:manifest.proposedApis??[]});
}
export function permissionExpansion(previous:ManifestV2, next:ManifestV2):string[] {
  const changes:string[]=[]; const a=securityOf(previous),b=securityOf(next);
  if(previous.id!==next.id) return ['identity'];
  for(const permission of next.permissions) if(!previous.permissions.includes(permission)) changes.push(permission);
  if(a.tier!==b.tier && b.tier==='B') changes.push('tier.B');
  if(stable(previous.runtime)!==stable(next.runtime)) changes.push('runtime');
  if(stable(previous.capabilities)!==stable(next.capabilities)) changes.push('workspace-capabilities');
  for(const event of next.activationEvents)if(!previous.activationEvents.includes(event))changes.push(`activation.${event}`);
  for(const proposal of next.proposedApis??[]) if(!(previous.proposedApis??[]).some(p=>p.id===proposal.id&&p.revision===proposal.revision)) changes.push(`proposal.${proposal.id}`);
  const rank={none:0,project:1,ask:2};
  for(const operation of ['read','write'] as const) if(rank[b.fs?.[operation]??'none']>rank[a.fs?.[operation]??'none']) changes.push(`fs.${operation}`);
  for(const host of b.network??[]) {
    const old=(a.network??[]).find(h=>h.host===host.host);
    if(!old || old.reason!==host.reason || old.paths && (!host.paths || host.paths.some(p=>!pathCovered(p.endsWith('*')?p.slice(0,-1):p,old.paths)))) changes.push(`network.${host.host}`);
  }
  for(const slot of b.secrets??[]) if(!a.secrets?.includes(slot)) changes.push(`secret.${slot}`);
  for(const injection of b.inject??[]) if(!(a.inject??[]).some(i=>stable(i)===stable(injection))) changes.push(`inject.${injection.host}.${injection.header}`);
  if(b.agent && stable(a.agent)!==stable(b.agent)) changes.push('agent');
  if(b.clipboardRead && stable(a.clipboardRead)!==stable(b.clipboardRead)) changes.push('clipboard.read');
  if(b.clipboardWrite && !a.clipboardWrite) changes.push('clipboard.write');
  return changes;
}
