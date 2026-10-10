import {STORE_LIMITS} from './types';
import type {Diagnostic, StoreCatalog} from './types';
const slug = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
export function validVersion(s: string): boolean {const m=semver.exec(s);return !!m && (!m[4] || m[4].split('.').every(x=>!/^\d+$/.test(x)||x==='0'||!x.startsWith('0')));}
export function validPublisherId(s: string): boolean {return s.length>=3 && s.length<=40 && slug.test(s) && !/^(somnia|official|admin|support)(?:-|$)/.test(s);}
export function validExtensionId(s: string): boolean {const a=s.split('.');return a.length===2 && validPublisherId(a[0]) && a[1].length<=60 && slug.test(a[1]);}
export function validDigest(s: string): boolean {return /^[a-f0-9]{64}$/.test(s);}
export function validHttps(s: string): boolean {try {const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&!u.port;}catch{return false;}}
export function validOrigin(s: string): boolean {try {const u=new URL(s);return validHttps(s)&&u.origin===s&&!u.search&&!/^(localhost|.*\.localhost|.*\.local)$/.test(u.hostname)&&!/^\d+\./.test(u.hostname)&&!u.hostname.includes(':')&&!u.hostname.includes('*');}catch{return false;}}
export function validPackagePath(s: string): boolean {return s.length>0&&s.length<=180&&s.split('/').every(p=>p.length<=64&&/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(p)&&!p.endsWith('.')&&!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p));}
const object=(v: unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
/** Validates all serialized records at the untrusted boundary, including hidden releases. */
export function validateStoreCatalog(value: unknown): Diagnostic[] {
 const errors: Diagnostic[]=[];
 const fail=(path:string,message:string)=>errors.push({code:'STORE_SCHEMA',path,message});
 const str=(v:unknown,p:string,max=500):v is string=>{if(typeof v!=='string'||!v.trim()||v.length>max||/[\u0000-\u001f<>]/.test(v)){fail(p,'Expected bounded plain text.');return false;}return true;};
 const num=(v:unknown,p:string,max=Number.MAX_SAFE_INTEGER):v is number=>{if(!Number.isSafeInteger(v)||Number(v)<1||Number(v)>max){fail(p,'Expected positive bounded integer.');return false;}return true;};
 const date=(v:unknown,p:string)=>{if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT/.test(v)||!Number.isFinite(Date.parse(v)))fail(p,'Expected ISO timestamp.');};
 const url=(v:unknown,p:string)=>{if(!str(v,p)||!validHttps(v))fail(p,'Expected credential-free HTTPS URL.');};
 const ref=(v:unknown,p:string)=>{if(!object(v)){fail(p,'Expected digest reference.');return;}if(typeof v.sha256!=='string'||!validDigest(v.sha256))fail(p+'.sha256','Expected SHA-256.');num(v.bytes,p+'.bytes');};
 const array=(v:unknown,p:string,max=10000):unknown[]=>{if(!Array.isArray(v)||v.length>max){fail(p,'Expected bounded array.');return [];}return v;};
 if(!object(value)||value.catalogSchemaVersion!==1){fail('$','Unsupported catalog schema.');return errors;}
 num(value.sequence,'sequence');date(value.generatedAt,'generatedAt');str(value.policyRevision,'policyRevision');
 const publishers=new Map<string, Record<string,unknown>>();
 for(const [i,p] of array(value.publishers,'publishers',2000).entries()){
  const at=`publishers[${i}]`;if(!object(p)){fail(at,'Expected publisher.');continue;}
  if(typeof p.id!=='string'||!validPublisherId(p.id)||publishers.has(p.id)){fail(at+'.id','Invalid, reserved or duplicate publisher ID.');}else publishers.set(p.id,p);
  str(p.displayName,at+'.displayName',80);num(p.githubOwnerId,at+'.githubOwnerId');date(p.rulesAcceptedAt,at+'.rulesAcceptedAt');url(p.supportUrl,at+'.supportUrl');
  if(typeof p.securityContact!=='string'||!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.securityContact)||validHttps(p.securityContact)))fail(at+'.securityContact','Expected security contact.');
  if(p.declaredGithub2FA!==true)fail(at+'.declaredGithub2FA','2FA declaration is required, not proof.');
  if(!['registered','frozen','tombstoned'].includes(String(p.state))||typeof p.official!=='boolean')fail(at,'Invalid publisher state/indicator.');
  const ids=array(p.authorizedSubmitterIds,at+'.authorizedSubmitterIds',100);ids.forEach(x=>num(x,at+'.authorizedSubmitterIds'));if(new Set(ids).size!==ids.length||ids.length===0)fail(at,'Submitter IDs must be unique and nonempty.');
  for(const r of array(p.repositories,at+'.repositories',100)){if(!object(r)){fail(at,'Invalid repository.');continue;}num(r.githubRepositoryId,at+'.repositoryId');num(r.githubOwnerId,at+'.ownerId');url(r.url,at+'.repo.url');if(typeof r.challengeCommit!=='string'||!/^[a-f0-9]{40}$/.test(r.challengeCommit))fail(at,'Missing full challenge commit.');}
  if(p.domain!==undefined){if(!object(p.domain))fail(at+'.domain','Invalid domain record.');else {str(p.domain.name,at+'.domain.name',253);date(p.domain.checkedAt,at+'.domain.checkedAt');date(p.domain.continuousControlSince,at+'.domain.continuousControlSince');if(!['pending','verified','suspended'].includes(String(p.domain.state)))fail(at+'.domain','Invalid domain state.');}}
 }
 const tombstones=array(value.tombstones,'tombstones');const dead=new Set(tombstones);if(dead.size!==tombstones.length)fail('tombstones','Duplicate tombstones.');tombstones.forEach(t=>{if(typeof t!=='string'||!(validExtensionId(t)||validPublisherId(t)))fail('tombstones','Invalid tombstone.');});
 const listingIds=new Set<string>();
 for(const [i,e] of array(value.extensions,'extensions',10000).entries()){
  const at=`extensions[${i}]`;if(!object(e)){fail(at,'Expected listing.');continue;}
  if(typeof e.id!=='string'||!validExtensionId(e.id)||listingIds.has(e.id)||dead.has(e.id))fail(at+'.id','Invalid, duplicate or tombstoned ID.');else listingIds.add(e.id);
  if(typeof e.publisherId!=='string'||!publishers.has(e.publisherId)||!String(e.id).startsWith(e.publisherId+'.')||dead.has(e.publisherId))fail(at+'.publisherId','Publisher binding failed.');
  str(e.name,at+'.name',80);str(e.summary,at+'.summary',400);str(e.category,at+'.category',40);
  const versions=new Set<string>();
  for(const r of array(e.releases,at+'.releases',500)){
   if(!object(r)){fail(at,'Expected release.');continue;}const p=at+'.releases.'+String(r.version);
   if(r.id!==e.id||typeof r.version!=='string'||!validVersion(r.version)||versions.has(r.version))fail(p,'Invalid or reused release identity.');else versions.add(r.version);
   if(!['submitted','quarantined','review-required','approved','listed','rejected','withdrawn','deprecated','unpublished','policy-suspended','security-blocked'].includes(String(r.state)))fail(p+'.state','Invalid lifecycle state.');
   if(r.channel!==(String(r.version).includes('-')?'prerelease':'stable'))fail(p+'.channel','Version/channel mismatch.');
   if(r.packageFormat!==2||r.manifest!=='somnia-extension.toml'||r.engine!=='sandboxed')fail(p,'Store only accepts sandboxed TOML .somniax packages.');num(r.apiVersion,p+'.apiVersion');if(typeof r.minSomnia!=='string'||!validVersion(r.minSomnia))fail(p+'.minSomnia','Invalid minimum app version.');
   if(!object(r.source)){fail(p+'.source','Source required.');continue;}num(r.source.repositoryId,p+'.source.repositoryId');url(r.source.url,p+'.source.url');if(typeof r.source.commit!=='string'||!/^[a-f0-9]{40}$/.test(r.source.commit))fail(p+'.source.commit','Full commit required.');if(typeof r.source.extensionPath!=='string'||(r.source.extensionPath!=='.'&&!validPackagePath(r.source.extensionPath)))fail(p+'.source.extensionPath','Invalid path.');
   const source=r.source;const owner=publishers.get(String(e.publisherId));if(!Array.isArray(owner?.repositories)||!owner.repositories.some(x=>object(x)&&x.githubRepositoryId===source.repositoryId&&x.url===source.url))fail(p+'.source','Source is not registered to publisher.');
   if(!object(r.artifact)){fail(p+'.artifact','Artifact required.');continue;}ref(r.artifact,p+'.artifact');num(r.artifact.bytes,p+'.artifact.bytes',STORE_LIMITS.compressedBytes);num(r.artifact.githubAssetId,p+'.artifact.githubAssetId');num(r.artifact.expandedBytes,p+'.artifact.expandedBytes',STORE_LIMITS.expandedBytes);num(r.artifact.fileCount,p+'.artifact.fileCount',STORE_LIMITS.files);num(r.artifact.largestFileBytes,p+'.artifact.largestFileBytes',STORE_LIMITS.fileBytes);
   if(typeof r.artifact.filename!=='string'||!validPackagePath(r.artifact.filename)||r.artifact.filename.includes('/')||!r.artifact.filename.endsWith('.somniax'))fail(p+'.artifact.filename','Expected .somniax filename.');
   url(r.artifact.url,p+'.artifact.url');if(typeof r.artifact.url!=='string'||!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/releases\/download\/[^/?#]+\/[^/?#]+\.somniax$/.test(r.artifact.url)||!String(r.artifact.url).startsWith(String(r.source.url)+'/releases/download/'))fail(p+'.artifact.url','Only bound GitHub release asset routes allowed.');
   if(!object(r.provenance)){fail(p+'.provenance','Provenance required.');}else {if(r.provenance.artifactSha256!==r.artifact.sha256||r.provenance.repositoryId!==r.source.repositoryId||r.provenance.commit!==r.source.commit)fail(p+'.provenance','Provenance binding mismatch.');str(r.provenance.workflowIdentity,p+'.provenance.workflowIdentity');ref(r.provenance.attestation,p+'.provenance.attestation');}
   if(!object(r.build))fail(p+'.build','Build evidence required.');else {for(const k of ['lockfile','toolchain','command'])str(r.build[k],p+'.build.'+k);array(r.build.lifecycleScripts,p+'.build.lifecycleScripts',100).forEach(x=>str(x,p+'.build.script'));ref(r.build.sbom,p+'.build.sbom');}
   if(typeof r.capabilitySha256!=='string'||!validDigest(r.capabilitySha256))fail(p+'.capabilitySha256','Capability digest required.');
   const caps=new Set<string>();for(const c of array(r.capabilities,p+'.capabilities',100)){if(!object(c)){fail(p,'Invalid capability.');continue;}str(c.key,p+'.capability.key',80);str(c.scope,p+'.capability.scope',200);if(typeof c.key!=='string'||!['fs.read','fs.write','project.read','project.write','network','clipboard.read','clipboard.write','agent','secrets','commands','selection','ui.notify','storage'].includes(c.key))fail(p,'Unknown or prohibited Store capability.');if(['fs.read','fs.write'].includes(String(c.key))&&!['none','project','ask'].includes(String(c.scope)))fail(p,'Unknown filesystem scope.');if(c.key==='network'&&(typeof c.scope!=='string'||!validOrigin(c.scope)))fail(p,'Network capability needs exact HTTPS origin.');str(c.reason,p+'.capability.reason',280);if(String(c.reason).length<20)fail(p,'Permission reasons need 20-280 characters.');const key=c.key+':'+c.scope;if(caps.has(key))fail(p,'Duplicate capability.');caps.add(key);}
   for(const n of array(r.network,p+'.network',50)){if(!object(n)){fail(p,'Invalid network disclosure.');continue;}if(typeof n.origin!=='string'||!validOrigin(n.origin))fail(p+'.network.origin','Exact public HTTPS origin required.');str(n.purpose,p+'.network.purpose',280);url(n.privacyUrl,p+'.network.privacyUrl');array(n.dataSent,p+'.network.dataSent',50).forEach(x=>str(x,p+'.network.dataSent'));array(n.dataReceived,p+'.network.dataReceived',50).forEach(x=>str(x,p+'.network.dataReceived'));if(typeof n.accountRequired!=='boolean'||typeof n.paymentRequired!=='boolean')fail(p,'Service requirements required.');}
   if(!object(r.docs))fail(p+'.docs','Documentation required.');else for(const k of ['readme','license','changelog','thirdPartyNotices','security'])url(r.docs[k],p+'.docs.'+k);
   if(!object(r.dataHandling))fail(p+'.dataHandling','Data handling required.');else {for(const k of ['localStorage','retention','deletion'])str(r.dataHandling[k],p+'.dataHandling.'+k);array(r.dataHandling.remoteProcessors,p+'.remoteProcessors',100).forEach(x=>str(x,p+'.remoteProcessor'));}
   ref(r.assets,p+'.assets');ref(r.evidence,p+'.evidence');
  }
 }
 return errors;
}
export function parseStoreCatalog(value: unknown): StoreCatalog {const errors=validateStoreCatalog(value);if(errors.length)throw new Error(errors.map(e=>`${e.path}: ${e.message}`).join('\n'));return value as StoreCatalog;}
