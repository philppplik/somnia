import type {ManifestV2} from './manifestV2';
import {validateManifestV2} from './manifestV2';
import {allowedNetworkUrl,consentTarget,permissionExpansion,securityOf,type SecretInjection} from './securityPolicy';

export const SECURITY_STORE_KEY='somnia.extensions.security.v2';
export const NATIVE_HOLD_MS=3000;
export type RuntimeChoice='once'|'session'|'always'|'deny';
export type PermissionDecision={allowed:true}|{allowed:false; code:string; prompt?:RuntimePrompt};
export interface RuntimePrompt {id:number; extensionId:string; name:string; capability:string; target:string; reason?:string}
export interface ConsentStorage {getItem(key:string):string|null; setItem(key:string,value:string):void}
interface StoredExtension {approved?:ManifestV2; enabled:boolean; revoked:string[]; folders:Record<string,string[]>; clipboard:boolean; blocked?:string; declinedVersions:string[]}
interface StoredState {version:2; restricted:boolean; acknowledged:boolean; developerMode:boolean; extensions:Record<string,StoredExtension>}
export interface LifecycleChange {extensionId:string; generation:number; reason:string}
export interface PermissionHooks {
  /** Trusted host must cancel requests, terminate this host and unload its panels. Never supplied by guest code. */
  invalidate(change:LifecycleChange):void|Promise<void>;
  notify?(message:{extensionId:string; code:string; message:string}):void|Promise<void>;
}
interface SessionState {manifest:ManifestV2; generation:number; closed:boolean; controller:AbortController; folders:Record<string,string[]>; once:Set<string>; clipboard:boolean; denied:Set<string>; denialCount:number}
/** Opaque identity is bound by the supervisor, never accepted from RPC params. */
export interface PermissionSession {readonly generation:number}
interface PendingPrompt {session:SessionState; prompt:RuntimePrompt; key:string}
export class PermissionError extends Error {constructor(public readonly code:string){super(code);}}
const deny=(code:string):PermissionDecision=>({allowed:false,code});
const blank=():StoredState=>({version:2,restricted:true,acknowledged:false,developerMode:false,extensions:Object.create(null)});
const record=():StoredExtension=>({enabled:false,revoked:[],folders:Object.create(null),clipboard:false,declinedVersions:[]});
const own=(object:object,key:string)=>Object.hasOwn(object,key);
const safeCanonical=(path:string)=>path.length>0&&path.length<=4096&&!/[\u0000-\u001f\u007f]/.test(path)&&path.split(/[\\/]/).every(p=>p!=='.'&&p!=='..')&&(/^(?:\/|[A-Za-z]:[\\/])/.test(path));
/** Only use on canonical, host-resolved paths. This helper is NOT an OS symlink boundary. */
export function isPathWithin(root:string,path:string):boolean {
  if(!safeCanonical(root)||!safeCanonical(path)) return false;
  const windows=/^[A-Za-z]:/.test(root); const normalize=(p:string)=>{
    const text=windows?p.replace(/\\/g,'/').toLowerCase():p;
    return text==='/'?text:text.replace(/\/+$/,'');
  };
  const r=normalize(root),p=normalize(path); return p===r||p.startsWith(r==='/'?'/':r+'/');
}
/** Trusted host policy engine. It exposes decisions and UI prompts, never performs guest I/O. */
export class PermissionBroker {
  private state:StoredState;
  private readonly sessions=new WeakMap<PermissionSession,SessionState>();
  private readonly active=new Set<SessionState>();
  private readonly prompts=new Map<number,PendingPrompt>();
  private readonly holds=new Map<string,{start:number; target:string}>();
  private readonly generations=new Map<string,number>();
  private seq=0;
  constructor(private readonly storage:ConsentStorage,private readonly hooks:PermissionHooks,private readonly clock:()=>number=()=>performance.now()) {
    this.state=this.restore();
  }
  private restore():StoredState {
    try {
      const raw=this.storage.getItem(SECURITY_STORE_KEY); if(!raw) return blank();
      if(raw.length>4*1024*1024) return blank();
      const s=JSON.parse(raw);
      if(s.version!==2||typeof s.restricted!=='boolean'||typeof s.acknowledged!=='boolean'||typeof s.developerMode!=='boolean'||!s.extensions||Array.isArray(s.extensions)||typeof s.extensions!=='object') return blank();
      const result=blank(); result.restricted=s.restricted||!s.acknowledged; result.acknowledged=s.acknowledged; result.developerMode=s.developerMode;
      for(const [id,value] of Object.entries(s.extensions)) {
        if(!/^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)?$/.test(id)) return blank();
        const e=value as StoredExtension;
        if(!e||typeof e.enabled!=='boolean'||!Array.isArray(e.revoked)||!e.revoked.every(p=>typeof p==='string')||!e.folders||typeof e.folders!=='object'||Array.isArray(e.folders)||typeof e.clipboard!=='boolean'||!Array.isArray(e.declinedVersions)||!e.declinedVersions.every(v=>typeof v==='string')||e.blocked!==undefined&&typeof e.blocked!=='string') return blank();
        for(const [op,paths] of Object.entries(e.folders)) if(!['read','write'].includes(op)||!Array.isArray(paths)||!paths.every(p=>typeof p==='string'&&safeCanonical(p))) return blank();
        const clean=record(); Object.assign(clean,{enabled:e.enabled,revoked:[...e.revoked],clipboard:e.clipboard,blocked:e.blocked,declinedVersions:[...e.declinedVersions]});
        for(const [op,paths] of Object.entries(e.folders)) clean.folders[op]=[...paths];
        if(e.approved) {const parsed=validateManifestV2(e.approved,{lane:'experimental'}); if(!parsed.ok||parsed.manifest.id!==id) return blank(); clean.approved=parsed.manifest;}
        result.extensions[id]=clean;
      }
      return result;
    } catch {return blank();}
  }
  private persist():void {try {this.storage.setItem(SECURITY_STORE_KEY,JSON.stringify(this.state));}catch {this.state.restricted=true; for(const session of this.active){session.closed=true;session.controller.abort();}this.active.clear();this.prompts.clear();this.holds.clear();throw new PermissionError('E_CONSENT_STORAGE_FAILED');}}
  private entry(id:string):StoredExtension {return own(this.state.extensions,id)?this.state.extensions[id]:this.state.extensions[id]=record();}
  snapshot():Readonly<StoredState> {return structuredClone(this.state);}
  private manifest(m:ManifestV2):ManifestV2 {const r=validateManifestV2(m,{lane:'experimental'}); if(!r.ok) throw new PermissionError('E_INVALID_MANIFEST'); return r.manifest;}
  private async invalidate(id:string,reason:string):Promise<void> {
    const generation=(this.generations.get(id)??0)+1; this.generations.set(id,generation);
    this.holds.delete(id);
    for(const s of this.active) if(s.manifest.id===id) {s.closed=true;s.controller.abort();this.active.delete(s);}
    for(const [key,p] of this.prompts) if(p.session.manifest.id===id) this.prompts.delete(key);
    await this.hooks.invalidate({extensionId:id,generation,reason});
  }
  private async invalidateAll(reason:string):Promise<void> {
    const ids=new Set([...this.active].map(s=>s.manifest.id)); this.holds.clear();
    // Revoke all capabilities before awaiting any one host's shutdown.
    const jobs=[...ids].map(id=>this.invalidate(id,reason)); await Promise.all(jobs);
  }
  async setRestrictedMode(on:boolean):Promise<void> {
    if(!on&&!this.state.acknowledged) throw new PermissionError('E_FIRST_RUN_CONFIRMATION_REQUIRED');
    this.state.restricted=on; this.persist(); if(on) await this.invalidateAll('restricted-mode');
  }
  /** UI calls this only after the first-run settings review, not merely on opening Settings. */
  acknowledgeFirstRun():void {this.state.acknowledged=true;this.state.restricted=false;this.persist();}
  async setDeveloperMode(on:boolean):Promise<void> {
    this.state.developerMode=on; this.persist();
    if(!on) {this.holds.clear(); const ids=new Set([...this.active].filter(s=>securityOf(s.manifest).tier==='B').map(s=>s.manifest.id)); await Promise.all([...ids].map(id=>this.invalidate(id,'developer-mode-off')));}
  }
  /** Pointer/key down on trusted consent UI. Cancel on release, blur, lost capture or hidden document. */
  beginNativeHold(manifest:ManifestV2):void {
    const m=this.manifest(manifest); if(!this.state.developerMode||securityOf(m).tier!=='B') throw new PermissionError('E_DEVELOPER_MODE_REQUIRED');
    this.holds.set(m.id,{start:this.clock(),target:JSON.stringify(m)});
  }
  cancelNativeHold(id:string):void {this.holds.delete(id);}
  nativeHoldProgress(id:string):number {const h=this.holds.get(id);return h?Math.max(0,Math.min(1,(this.clock()-h.start)/NATIVE_HOLD_MS)):0;}
  async approve(manifest:ManifestV2,source:'manual'|'store'):Promise<void> {
    const m=this.manifest(manifest),tier=securityOf(m).tier;
    if(tier==='B') {
      const hold=this.holds.get(m.id);this.holds.delete(m.id);
      if(source!=='manual') throw new PermissionError('E_NATIVE_STORE_FORBIDDEN');
      if(!this.state.developerMode) throw new PermissionError('E_DEVELOPER_MODE_REQUIRED');
      if(!hold||hold.target!==JSON.stringify(m)||this.clock()-hold.start<NATIVE_HOLD_MS) throw new PermissionError('E_NATIVE_HOLD_REQUIRED');
    }
    const e=this.entry(m.id); if(e.blocked) throw new PermissionError('E_BLOCKLISTED');
    e.approved=m; e.enabled=true; e.declinedVersions=e.declinedVersions.filter(v=>v!==m.version);this.persist();
    await this.invalidate(m.id,'approval');
  }
  async acceptNonExpandingUpdate(manifest:ManifestV2):Promise<boolean> {
    const m=this.manifest(manifest),e=this.entry(m.id);
    if(!e.approved||securityOf(m).tier==='B'||permissionExpansion(e.approved,m).length) return false;
    e.approved=m;this.persist();await this.invalidate(m.id,'update');return true;
  }
  updateReview(manifest:ManifestV2):{required:boolean; changes:string[]; declined:boolean} {
    const m=this.manifest(manifest),e=this.entry(m.id); const changes=e.approved?permissionExpansion(e.approved,m):['install'];
    return {required:changes.length>0||securityOf(m).tier==='B',changes,declined:e.declinedVersions.includes(m.version)};
  }
  declineUpdate(id:string,version:string):void {const e=this.entry(id); if(!e.declinedVersions.includes(version)) e.declinedVersions.push(version);this.persist();}
  async disable(id:string):Promise<void> {this.entry(id).enabled=false;this.persist();await this.invalidate(id,'disabled');}
  async setRevoked(id:string,capability:string,revoked:boolean):Promise<void> {
    const e=this.entry(id);e.revoked=e.revoked.filter(p=>p!==capability);if(revoked)e.revoked.push(capability);
    if(revoked) {if(capability==='fs.read'||capability==='fs.write') delete e.folders[capability.slice(3)];if(capability==='clipboard.read')e.clipboard=false;}
    this.persist();await this.invalidate(id,'permission-change');
  }
  async revokeFolder(id:string,operation:'read'|'write',canonicalFolder:string):Promise<void> {
    const e=this.entry(id);e.folders[operation]=(e.folders[operation]??[]).filter(p=>p!==canonicalFolder);this.persist();await this.invalidate(id,'folder-revoked');
  }
  /** Called only by the host's verified-index blocklist controller. Retains all data and secrets. */
  async setBlocked(id:string,reason:string|null):Promise<void> {
    const e=this.entry(id); e.blocked=reason??undefined;if(reason)e.enabled=false;this.persist();
    if(reason) {await this.invalidate(id,'blocklisted');await this.hooks.notify?.({extensionId:id,code:'E_BLOCKLISTED',message:reason});}
  }
  openSession(manifest:ManifestV2,workspace:{trusted:boolean; virtual:boolean}={trusted:false,virtual:false}):PermissionSession {
    const m=structuredClone(this.manifest(manifest)),e=this.entry(m.id);
    if(this.state.restricted) throw new PermissionError('E_RESTRICTED_MODE');
    if(e.blocked) throw new PermissionError('E_BLOCKLISTED');
    if(!e.enabled||!e.approved||e.approved.version!==m.version||consentTarget(e.approved)!==consentTarget(m)) throw new PermissionError('E_CONSENT_REQUIRED');
    if(securityOf(m).tier==='B'&&!this.state.developerMode) throw new PermissionError('E_DEVELOPER_MODE_REQUIRED');
    if(!workspace.trusted&&securityOf(m).tier==='B')throw new PermissionError('E_WORKSPACE_UNTRUSTED');
    if(!workspace.trusted && m.capabilities.untrustedWorkspaces.supported==='unsupported')throw new PermissionError('E_WORKSPACE_UNTRUSTED');
    if(workspace.virtual&&!m.capabilities.virtualWorkspaces.supported)throw new PermissionError('E_VIRTUAL_WORKSPACE_UNSUPPORTED');
    if(!workspace.trusted) {m.permissions=m.permissions.filter(p=>['commands','selection','ui.notify','storage'].includes(p)&&(m.capabilities.untrustedWorkspaces.supported!=='limited'||m.capabilities.untrustedWorkspaces.allowedPermissions?.includes(p)));m.security={tier:securityOf(m).tier};}
    const generation=this.generations.get(m.id)??0,token=Object.freeze({generation});
    const s:SessionState={manifest:m,generation,closed:false,controller:new AbortController(),folders:Object.create(null),once:new Set(),clipboard:false,denied:new Set(),denialCount:0};
    this.sessions.set(token,s);this.active.add(s);return token;
  }
  closeSession(token:PermissionSession):void {const s=this.sessions.get(token);if(s){s.closed=true;s.controller.abort();this.active.delete(s);for(const [id,p] of this.prompts)if(p.session===s)this.prompts.delete(id);}}
  private session(token:PermissionSession,capability:string):SessionState {
    const s=this.sessions.get(token);if(!s||s.closed||this.state.restricted)throw new PermissionError('E_SESSION_REVOKED');
    const e=this.entry(s.manifest.id);if(!e.enabled||e.blocked||e.revoked.includes(capability))throw new PermissionError('E_PERMISSION_DENIED');return s;
  }
  cancellationSignal(token:PermissionSession):AbortSignal {return this.session(token,'').controller.signal;}
  assertCurrent(token:PermissionSession):void {this.session(token,'');}
  assertIdentity(token:PermissionSession,id:string):void {if(this.session(token,'').manifest.id!==id)throw new PermissionError('E_IDENTITY_MISMATCH');}
  checkPermission(token:PermissionSession,permission:string):PermissionDecision {
    try {const s=this.session(token,permission);return s.manifest.permissions.includes(permission)?{allowed:true}:deny('E_PERMISSION_DENIED');}catch(e){return deny((e as PermissionError).code);}
  }
  private runtime(s:SessionState,capability:string,target:string,reason?:string):PermissionDecision {
    const key=capability+'\n'+target;
    if(s.once.delete(key))return {allowed:true};
    if(s.denialCount>=3||s.denied.has(key))return deny('E_PERMISSION_DENIED');
    const existing=[...this.prompts.values()].find(p=>p.session===s&&p.key===key);
    const prompt=existing?.prompt??{id:++this.seq,extensionId:s.manifest.id,name:s.manifest.name,capability,target,reason};
    if(!existing)this.prompts.set(prompt.id,{session:s,prompt,key});
    return {allowed:false,code:'E_CONSENT_REQUIRED',prompt:{...prompt}};
  }
  /** Canonical paths MUST come from the host resolver, never the request body. */
  checkFilesystem(token:PermissionSession,operation:'read'|'write',canonicalPath:string,projectRoot:string|null,canonicalPromptFolder:string):PermissionDecision {
    try {
      const s=this.session(token,`fs.${operation}`),scope=securityOf(s.manifest).fs?.[operation]??'none';
      if(scope==='none'||!safeCanonical(canonicalPath)||!safeCanonical(canonicalPromptFolder)||!isPathWithin(canonicalPromptFolder,canonicalPath))return deny('E_PERMISSION_DENIED');
      if(projectRoot&&isPathWithin(projectRoot,canonicalPath))return {allowed:true};
      if(scope!=='ask')return deny('E_PERMISSION_DENIED');
      const folders=[...(s.folders[operation]??[]),...(this.entry(s.manifest.id).folders[operation]??[])];
      if(folders.some(folder=>isPathWithin(folder,canonicalPath)))return {allowed:true};
      return this.runtime(s,`fs.${operation}`,canonicalPromptFolder);
    }catch(e){return deny((e as PermissionError).code);}
  }
  checkClipboard(token:PermissionSession,operation:'read'|'write'):PermissionDecision {
    try {const s=this.session(token,`clipboard.${operation}`),policy=securityOf(s.manifest);
      if(operation==='write')return policy.clipboardWrite?{allowed:true}:deny('E_PERMISSION_DENIED');
      if(!policy.clipboardRead)return deny('E_PERMISSION_DENIED');
      return s.clipboard||this.entry(s.manifest.id).clipboard?{allowed:true}:this.runtime(s,'clipboard.read','clipboard',policy.clipboardRead.reason);
    }catch(e){return deny((e as PermissionError).code);}
  }
  /** foreground=false leaves coalesced prompts queued, never shows modal UI. */
  pendingPrompts(foreground:boolean):RuntimePrompt[] {return foreground?[...this.prompts.values()].map(p=>({...p.prompt})):[];}
  resolvePrompt(id:number,choice:RuntimeChoice):void {
    const p=this.prompts.get(id);if(!p||p.session.closed)throw new PermissionError('E_STALE_PROMPT');this.prompts.delete(id);
    const s=p.session,e=this.entry(s.manifest.id);
    if(!['once','session','always','deny'].includes(choice))throw new PermissionError('E_INVALID_ARGUMENT');
    if(choice==='deny'){s.denied.add(p.key);s.denialCount++;return;}
    if(choice==='once'){s.once.add(p.key);return;}
    if(p.prompt.capability==='clipboard.read') {if(choice==='always')e.clipboard=true;else s.clipboard=true;}
    else {const operation=p.prompt.capability.slice(3),folders=choice==='always'?e.folders:s.folders;(folders[operation]??=[]).push(p.prompt.target);}
    if(choice==='always')this.persist();
  }
  checkNetwork(token:PermissionSession,rawUrl:string):PermissionDecision {
    try {const s=this.session(token,'network'),u=allowedNetworkUrl(rawUrl,securityOf(s.manifest).network??[]);
      return u&&!this.entry(s.manifest.id).revoked.includes(`network.${u.hostname}`)?{allowed:true}:deny('E_PERMISSION_DENIED');
    }catch(e){return deny((e as PermissionError).code);}
  }
  /** Returns injection metadata to the trusted proxy, NEVER secret material or to the guest. */
  secretInjections(token:PermissionSession,rawUrl:string):SecretInjection[] {
    const s=this.session(token,'secrets');if(!this.checkNetwork(token,rawUrl).allowed)throw new PermissionError('E_PERMISSION_DENIED');
    const host=new URL(rawUrl).hostname,e=this.entry(s.manifest.id);
    return (securityOf(s.manifest).inject??[]).filter(i=>i.host===host&&!e.revoked.includes(`secret.${i.secret}`)).map(i=>({...i}));
  }
  checkAgent(token:PermissionSession,model:string):PermissionDecision {
    try {const s=this.session(token,'agent');return model==='host-default'&&securityOf(s.manifest).agent?{allowed:true}:deny('E_PERMISSION_DENIED');}catch(e){return deny((e as PermissionError).code);}
  }
}
