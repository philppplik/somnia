import {REQUIRED_GATES} from './types';
import type {Diagnostic, Publisher, Release, ReleaseEvidence, ReleaseState, Revocation, SecurityFeed} from './types';
import {validDigest, validExtensionId, validPublisherId, validVersion} from './validation';
const DAY=86_400_000;
export const SECURITY_REFRESH_MS=6*60*60*1000;
export const SECURITY_OFFLINE_GRACE_MS=7*DAY;
const at=(s:string)=>Date.parse(s);
const fullSha=(s:unknown)=>typeof s==='string'&&/^[a-f0-9]{40}$/.test(s);
export function authorizeSubmission(publisher:Publisher, actorId:number, repositoryId:number):boolean {
 return publisher.state==='registered'&&publisher.authorizedSubmitterIds.includes(actorId)&&publisher.repositories.some(r=>r.githubRepositoryId===repositoryId);
}
/** Numeric account IDs are the principal. This compares records, not claimed usernames. */
export function validatePublisherChange(previous:Publisher,next:Publisher,approval:{oldOwnerId:number;newOwnerId:number;maintainerApproved:boolean;controlRechecked:boolean;submitterChangesOwnerApproved?:boolean}):Diagnostic[] {
 const out:Diagnostic[]=[];const fail=(message:string)=>out.push({code:'PUBLISHER_CHANGE',path:previous.id,message});
 if(previous.id!==next.id)fail('Publisher ID is immutable.');
 if(previous.state==='tombstoned'&&next.state!=='tombstoned')fail('Tombstoned namespaces cannot be reused.');
 if(JSON.stringify(previous.authorizedSubmitterIds)!==JSON.stringify(next.authorizedSubmitterIds)&&!approval.submitterChangesOwnerApproved)fail('Submitter changes require owner approval.');
 if(previous.githubOwnerId!==next.githubOwnerId){
  if(approval.oldOwnerId!==previous.githubOwnerId||approval.newOwnerId!==next.githubOwnerId||!approval.maintainerApproved||!approval.controlRechecked)fail('Transfer requires both numeric owners, maintainer approval and fresh repository control.');
  if(next.domain?.state==='verified')fail('Domain verification must be suspended on transfer.');
 }
 return out;
}
export function highRisk(release:Release):boolean {
 return release.network.length>0||release.capabilities.some(c=>/write|network|credential|secret|clipboard.read|wasm/.test(c.key));
}
/** Fail closed: the presence of a record is never itself a successful check. */
export function evaluateReview(release:Release,evidence:ReleaseEvidence,context:{prHead:string;policyRevision:string;now:number}):Diagnostic[] {
 const out:Diagnostic[]=[];const fail=(code:string,path:string,message:string)=>out.push({code,path,message});
 const digest=release.artifact.sha256;
 if(!fullSha(context.prHead)||!validDigest(digest))fail('REVIEW_BINDING','release','Invalid review context.');
 if(evidence.extensionId!==release.id||evidence.version!==release.version||evidence.packageSha256!==digest||evidence.sourceCommit!==release.source.commit||evidence.prHead!==context.prHead||evidence.policyRevision!==context.policyRevision)fail('REVIEW_BINDING','evidence','Evidence must bind current PR, policy, source and exact package bytes.');
 for(const name of REQUIRED_GATES){
  const matching=evidence.gates.filter(g=>g.gate===name);if(matching.length!==1){fail('GATE_MISSING',name,'Exactly one required gate result is needed.');continue;}
  const g=matching[0];
  if(g.packageSha256!==digest||g.sourceCommit!==release.source.commit||g.prHead!==context.prHead)fail('GATE_BINDING',name,'Gate belongs to different source, PR or bytes.');
  if(!Number.isFinite(at(g.scannedAt))||at(g.scannedAt)>context.now||!g.tool||!g.toolVersion||!g.rulesVersion||!g.databaseVersion||!validDigest(g.evidence.sha256)||!Number.isSafeInteger(g.evidence.bytes)||g.evidence.bytes<1)fail('GATE_EVIDENCE',name,'Tool/rules/database versions, date and evidence digest are required.');
  if(name==='malware'&&(!g.databaseUpdatedAt||!Number.isFinite(at(g.databaseUpdatedAt))||at(g.databaseUpdatedAt)>context.now||context.now-at(g.databaseUpdatedAt)>2*DAY))fail('GATE_STALE',name,'Malware database must be no more than 48 hours old.');
  if(g.status!=='pass'){
   const nonWaivable=['schema-archive','provenance','secrets','malware','build-correspondence','runtime'];
   const waived=g.status==='needs-review'&&!nonWaivable.includes(name)&&g.findings.length>0&&g.findings.every(f=>evidence.exceptions.some(x=>x.gate===name&&x.fingerprint===f.fingerprint&&x.packageSha256===digest&&x.reviewerId>0&&x.reason.trim().length>0&&Number.isFinite(at(x.issuedAt))&&at(x.issuedAt)<=context.now&&at(x.expiresAt)>context.now&&at(x.expiresAt)-at(x.issuedAt)<=30*DAY));
   if(!waived)fail('GATE_NOT_PASS',name,`Required gate is ${g.status}, not pass.`);
  }
 }
 const reviews=evidence.reviews.filter(r=>r.packageSha256===digest&&r.sourceCommit===release.source.commit&&r.prHead===context.prHead&&r.policyRevision===context.policyRevision&&Number.isSafeInteger(r.reviewerId)&&r.reviewerId>0&&Number.isFinite(at(r.approvedAt))&&at(r.approvedAt)<=context.now);
 const ids=new Set(reviews.map(r=>r.reviewerId));
 if(ids.size<(highRisk(release)?2:1)||highRisk(release)&&!reviews.some(r=>r.securityMaintainer))fail('REVIEWERS','reviews','High-risk releases need two distinct reviewers including a security maintainer; all releases need review.');
 return out;
}
const transitions:Record<ReleaseState,readonly ReleaseState[]>={
 submitted:['quarantined','rejected','withdrawn'],quarantined:['review-required','rejected','withdrawn'],
 'review-required':['approved','rejected','withdrawn'],approved:['listed','review-required','withdrawn'],
 listed:['deprecated','unpublished','policy-suspended','security-blocked'],deprecated:['unpublished','policy-suspended','security-blocked'],
 unpublished:['policy-suspended','security-blocked'],'policy-suspended':['security-blocked'],
 'security-blocked':[],rejected:[],withdrawn:[]
};
export function transitionRelease(release:Release,next:ReleaseState,context:{evidence?:ReleaseEvidence;prHead:string;policyRevision:string;now:number;signedPublication:boolean;actor:'publisher'|'maintainer'|'pipeline'}):Release {
 if(!transitions[release.state].includes(next))throw new Error(`Forbidden lifecycle transition ${release.state} -> ${next}.`);
 if(['policy-suspended','security-blocked'].includes(next)&&context.actor!=='maintainer')throw new Error('Only maintainers may revoke.');
 if(['deprecated','unpublished','withdrawn'].includes(next)&&!['publisher','maintainer'].includes(context.actor))throw new Error('Publisher authorization required.');
 if(next==='approved'||next==='listed'){
  if(!context.evidence||context.actor!=='pipeline')throw new Error('Pipeline review evidence required.');
  const errors=evaluateReview(release,context.evidence,context);if(errors.length)throw new Error(errors.map(e=>e.message).join(' '));
  if(next==='listed'&&!context.signedPublication)throw new Error('Merge is not publication: signed target publication required.');
 }
 return {...release,state:next};
}
export function assertImmutableRelease(old:Release,next:Release):void {
 const a={...old,state:undefined},b={...next,state:undefined};
 if(JSON.stringify(a)!==JSON.stringify(b))throw new Error('Published ID/version records cannot be overwritten, including digest, access or evidence. Submit a new version.');
}
export function parseSecurityFeed(value:unknown):SecurityFeed {
 const f=value as SecurityFeed;
 if(!f||f.securitySchemaVersion!==1||!Number.isSafeInteger(f.sequence)||f.sequence<1||!Number.isFinite(at(f.generatedAt))||!Array.isArray(f.incidents)||f.incidents.length>10000)throw new Error('Invalid security feed.');
 const decisions=new Set<string>();
 for(const r of f.incidents){
  if(!r||typeof r.incidentId!=='string'||!r.incidentId||!Number.isSafeInteger(r.sequence)||r.sequence<1||r.sequence>f.sequence||decisions.has(r.incidentId+':'+r.sequence)||!['policy-suspended','security-blocked'].includes(r.action)||!['investigating','confirmed','cleared'].includes(r.reviewStatus)||!Number.isFinite(at(r.issuedAt))||!Array.isArray(r.versions)||!r.versions.every(validVersion)||!Array.isArray(r.digests)||!r.digests.every(validDigest)||r.publisherId!==undefined&&!validPublisherId(r.publisherId)||r.extensionId!==undefined&&!validExtensionId(r.extensionId)||!r.publisherId&&!r.extensionId&&!r.digests.length||!['malware','account-compromise','exploitable-vulnerability','impersonation','policy-breach'].includes(r.reason)||typeof r.summary!=='string'||!r.summary.trim()||r.summary.length>500)throw new Error('Invalid incident decision.');
  if(r.reviewStatus==='cleared'&&!r.supersedes)throw new Error('Clearance must explicitly supersede a decision.');
  decisions.add(r.incidentId+':'+r.sequence);
 }
 return f;
}
/** Cached blocks never expire. Only explicit signed, superseding clearance removes one. */
export function matchingRevocations(release:Release,feed:SecurityFeed):Revocation[] {
 const ordered=[...feed.incidents].sort((a,b)=>a.sequence-b.sequence);const active=new Map<string,Revocation>();
 for(const r of ordered){if(r.reviewStatus==='cleared'){if(r.supersedes===r.incidentId)active.delete(r.incidentId);else if(r.supersedes)active.delete(r.supersedes);continue;}active.set(r.incidentId,r);}
 return [...active.values()].filter(r=>r.digests.includes(release.artifact.sha256)||((r.extensionId===release.id||r.publisherId===release.id.split('.')[0])&&(r.versions.length===0||r.versions.includes(release.version))));
}
export function installability(release:Release,context:{metadataVerified:boolean;metadataExpiresAt:number;now:number;lastTrustedCheck:number;feed:SecurityFeed;apiVersion:number;appCompatible:boolean}):{allowed:boolean;reason:string} {
 if(matchingRevocations(release,context.feed).length)return{allowed:false,reason:'revoked'};
 if(!context.metadataVerified||context.now>=context.metadataExpiresAt)return{allowed:false,reason:'metadata-unverified-or-expired'};
 if(context.now<context.lastTrustedCheck)return{allowed:false,reason:'clock-rollback'};
 if(!['listed','deprecated'].includes(release.state))return{allowed:false,reason:release.state};
 if(!context.appCompatible||release.apiVersion!==context.apiVersion)return{allowed:false,reason:'incompatible'};
 return{allowed:true,reason:release.state==='deprecated'?'deprecated':'reviewed'};
}
/** Store policy hint only. Runtime owner decides how to enact offline behavior. */
export function storeFreshness(now:number,lastTrustedCheck:number):'current'|'refresh-due'|'pause-third-party'|'clock-rollback' {
 if(!Number.isFinite(lastTrustedCheck)||lastTrustedCheck<=0)return 'pause-third-party';
 if(now<lastTrustedCheck)return 'clock-rollback';
 if(now-lastTrustedCheck>SECURITY_OFFLINE_GRACE_MS)return 'pause-third-party';
 return now-lastTrustedCheck>=SECURITY_REFRESH_MS?'refresh-due':'current';
}
export function evidenceCard(evidence:ReleaseEvidence,now:number):{gate:string;status:string;scannedAt:string;tool:string;withheld:boolean}[] {
 return REQUIRED_GATES.map(gate=>{const g=evidence.gates.find(x=>x.gate===gate);return {gate,status:!g?'not-run':gate==='dependencies'&&now-at(g.scannedAt)>3*DAY?'stale':g.status,scannedAt:g?.scannedAt??'',tool:g?`${g.tool} ${g.toolVersion}`:'',withheld:g?.findings.some(f=>f.withheld)??false};});
}
/** Registration receives verified GitHub challenge facts from a read-only review worker. */
export function registerPublisher(candidate:Publisher,context:{prAuthorId:number;challengeRepositoryId:number;challengeCommit:string;challengeOwnerId:number;existingIds:readonly string[];tombstones:readonly string[];maintainerApproved:boolean}):Publisher {
 if(!validPublisherId(candidate.id)||context.existingIds.includes(candidate.id)||context.tombstones.includes(candidate.id))throw new Error('Invalid, reserved or permanently allocated publisher namespace.');
 if(!context.maintainerApproved||candidate.githubOwnerId!==context.prAuthorId||candidate.githubOwnerId!==context.challengeOwnerId||!candidate.declaredGithub2FA||candidate.state!=='registered'||candidate.official||candidate.domain?.state==='verified')throw new Error('Registration must verify numeric owner control and cannot self-assign badges.');
 if(!candidate.repositories.some(r=>r.githubRepositoryId===context.challengeRepositoryId&&r.githubOwnerId===context.challengeOwnerId&&r.challengeCommit===context.challengeCommit&&fullSha(r.challengeCommit)))throw new Error('Challenge commit does not bind the claimed repository/owner.');
 if(!candidate.authorizedSubmitterIds.includes(candidate.githubOwnerId))throw new Error('Owner must be an authorized submitter.');
 return candidate;
}
