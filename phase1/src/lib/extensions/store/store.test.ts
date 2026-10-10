import {test} from 'node:test';
import assert from 'node:assert/strict';
import {catalog,release,evidence,digest,prHead,time} from './fixtures';
import {parseStoreCatalog,validVersion,validPackagePath,validPublisherId,validOrigin} from './validation';
import {authorizeSubmission,validatePublisherChange,evaluateReview,transitionRelease,assertImmutableRelease,matchingRevocations,parseSecurityFeed,storeFreshness,evidenceCard,installability} from './policy';
import {validateAssetInventory} from './assets';
import type {SecurityFeed} from './types';
const now=Date.parse(time),context={prHead,policyRevision:'criteria-2026-10-10',now};
test('catalog validates every record and rejects malformed identities, package and publisher bindings',()=>{
 assert.equal(parseStoreCatalog(catalog()).extensions.length,1);
 for(const mutate of [
  (c:any)=>c.extensions[0].releases[0].artifact.sha256='bad',
  (c:any)=>c.extensions[0].releases[0].artifact.bytes=2097153,
  (c:any)=>c.extensions[0].releases[0].manifest='somnia-extension.json',
  (c:any)=>c.extensions[0].releases[0].engine='native',
  (c:any)=>c.extensions[0].releases[0].artifact.url='https://evil.example/palette.somniax',
  (c:any)=>c.extensions[0].releases[0].source.repositoryId=666,
  (c:any)=>c.extensions[0].releases[0].provenance.commit='d'.repeat(40),
  (c:any)=>c.publishers[0].declaredGithub2FA=false,
  (c:any)=>c.tombstones=['acme.palette'],
  (c:any)=>c.extensions[0].releases.push(c.extensions[0].releases[0]),
  (c:any)=>c.publishers.push(c.publishers[0]),
  (c:any)=>c.extensions[0].releases[0].network=[{origin:'https://localhost'}],
  (c:any)=>c.extensions[0].releases[0].docs=null
 ]){const c=catalog();mutate(c);assert.throws(()=>parseStoreCatalog(c));}
 assert.throws(()=>parseStoreCatalog({catalogSchemaVersion:2}));
});
test('strict semver, reserved identity, package paths and exact origins',()=>{
 for(const v of ['1.0.0','1.2.3-beta.10'])assert.equal(validVersion(v),true);
 for(const v of ['01.0.0','1.0','1.0.0+build','1.0.0-beta.01'])assert.equal(validVersion(v),false);
 for(const p of ['../x','a/CON.png','a\\b','a/%2e','/a','a//b','a/..','https://x','a.'])assert.equal(validPackagePath(p),false);
 for(const id of ['somnia','official','admin-user','Somnia','somnia-team','a'])assert.equal(validPublisherId(id),false);
 assert.equal(validOrigin('https://api.github.com'),true);
 for(const o of ['https://api.github.com/path','https://localhost','https://127.0.0.1','https://user@api.github.com','https://*.example.com','http://api.github.com'])assert.equal(validOrigin(o),false);
});
test('publisher numeric authorization and transfer control, frozen/tombstoned namespaces',()=>{
 const p=catalog().publishers[0];assert.equal(authorizeSubmission(p,42,123),true);assert.equal(authorizeSubmission(p,43,123),false);assert.equal(authorizeSubmission({...p,state:'frozen'},42,123),false);
 assert.equal(validatePublisherChange(p,{...p,githubOwnerId:43},{oldOwnerId:42,newOwnerId:43,maintainerApproved:true,controlRechecked:true}).length,0);
 assert.ok(validatePublisherChange(p,{...p,githubOwnerId:43},{oldOwnerId:42,newOwnerId:43,maintainerApproved:false,controlRechecked:true}).length);
 assert.ok(validatePublisherChange({...p,state:'tombstoned'},p,{oldOwnerId:42,newOwnerId:42,maintainerApproved:true,controlRechecked:true}).length);
});
test('all required gates, fresh malware database, exact digest/PR and distinct reviewers are required',()=>{
 const r=release(),e=evidence();assert.deepEqual(evaluateReview(r,e,context),[]);
 for(const mutate of [(x:any)=>x.gates.pop(),(x:any)=>x.prHead='e'.repeat(40),(x:any)=>x.gates[0].status='not-run',(x:any)=>x.gates[5].databaseUpdatedAt='2026-10-01T12:00:00Z',(x:any)=>x.reviews=[]]){const bad=evidence();mutate(bad);assert.ok(evaluateReview(r,bad,context).length);}
 r.capabilities=[{key:'project.write',scope:'project',reason:'Insert selected colors into project.'}];assert.ok(evaluateReview(r,e,context).some(x=>x.code==='REVIEWERS'));
 e.reviews.push({...e.reviews[0],reviewerId:2});assert.equal(evaluateReview(r,e,context).length,0);
 e.reviews[1].reviewerId=1;assert.ok(evaluateReview(r,e,context).length);
});
test('review exceptions are finding/digest bound, expire within 30 days and cannot waive hard failures',()=>{
 const r=release(),e=evidence();const g=e.gates.find(x=>x.gate==='static-policy')!;g.status='needs-review';g.findings=[{fingerprint:'rule:42',summary:'Heuristic false positive',withheld:false}];
 e.exceptions=[{gate:g.gate,fingerprint:'rule:42',packageSha256:digest,reviewerId:2,reason:'Reviewed false positive',issuedAt:time,expiresAt:'2026-10-11T12:00:00Z'}];assert.equal(evaluateReview(r,e,context).length,0);
 e.exceptions[0].packageSha256='d'.repeat(64);assert.ok(evaluateReview(r,e,context).length);
 e.exceptions[0].packageSha256=digest;e.exceptions[0].expiresAt='2026-12-10T12:00:00Z';assert.ok(evaluateReview(r,e,context).length);
 const malware=e.gates.find(x=>x.gate==='malware')!;malware.status='needs-review';assert.ok(evaluateReview(r,e,context).length);
});
test('lifecycle cannot skip quarantine/review/signing or silently restore blocked bytes',()=>{
 const ctx={...context,evidence:evidence(),signedPublication:true,actor:'pipeline' as const};let r=release();
 assert.throws(()=>transitionRelease(r,'listed',ctx));r=transitionRelease(r,'quarantined',ctx);r=transitionRelease(r,'review-required',ctx);r=transitionRelease(r,'approved',ctx);
 assert.throws(()=>transitionRelease(r,'listed',{...ctx,signedPublication:false}));r=transitionRelease(r,'listed',ctx);
 assert.throws(()=>transitionRelease(r,'security-blocked',ctx));r=transitionRelease(r,'security-blocked',{...ctx,actor:'maintainer'});assert.throws(()=>transitionRelease(r,'listed',ctx));
 assertImmutableRelease(r,{...r,state:'withdrawn'});assert.throws(()=>assertImmutableRelease(r,{...r,artifact:{...r.artifact,sha256:'f'.repeat(64)}}));
});
const feed=():SecurityFeed=>({securitySchemaVersion:1,sequence:1,generatedAt:time,incidents:[{incidentId:'INC-1',sequence:1,action:'security-blocked',digests:[digest],versions:[],reason:'malware',issuedAt:time,reviewStatus:'investigating',summary:'Blocked during investigation',appealUrl:'https://github.com/acme/palette'}]});
test('digest block follows renamed identities, signed explicit clearance, offline and install fail closed',()=>{
 const f=parseSecurityFeed(feed()),r=release();assert.equal(matchingRevocations({...r,id:'other.renamed'},f).length,1);
 const ctx={metadataVerified:true,metadataExpiresAt:now+1000,now,lastTrustedCheck:now,feed:f,apiVersion:1,appCompatible:true};assert.equal(installability({...r,state:'listed'},ctx).reason,'revoked');
 f.sequence=2;f.incidents.push({...f.incidents[0],sequence:2,reviewStatus:'cleared',supersedes:'INC-1'});assert.equal(matchingRevocations(r,parseSecurityFeed(f)).length,0);
 assert.equal(installability({...r,state:'listed'}, {...ctx,feed:f}).allowed,true);assert.equal(installability({...r,state:'listed'},{...ctx,feed:f,metadataVerified:false}).allowed,false);
 assert.equal(storeFreshness(now,now),'current');assert.equal(storeFreshness(now+6*3600000,now),'refresh-due');assert.equal(storeFreshness(now+8*86400000,now),'pause-third-party');assert.equal(storeFreshness(now-1,now),'clock-rollback');
});
test('evidence card has no safety score and missing/stale findings are explicit',()=>{
 const e=evidence();e.gates=e.gates.filter(x=>x.gate!=='provenance');const card=evidenceCard(e,now+4*86400000);assert.equal(card.find(x=>x.gate==='provenance')!.status,'not-run');assert.equal(card.find(x=>x.gate==='dependencies')!.status,'stale');
});
test('asset inventory is bound to package and uses generated raster digests, not URLs',()=>{
 const r=release();const make=(sha:string)=>({sha256:sha,bytes:100,width:512,height:512,mime:'image/png' as const,sourceSha256:digest,sourceBytes:100,pipelineVersion:'raster-1',key:`sha256-${sha}.png`});
 const a={assetSchemaVersion:1 as const,extensionId:r.id,version:r.version,packageSha256:digest,derivatives:[{...make(digest),role:'icon' as const},{...make('f'.repeat(64)),role:'screenshot' as const,screenshotIndex:0,alt:'Color palette panel'}]};
 assert.equal(validateAssetInventory(a,r).length,0);assert.ok(validateAssetInventory({...a,packageSha256:'d'.repeat(64)},r).length);a.derivatives[0].key='https://evil.example/icon.png';assert.ok(validateAssetInventory(a,r).length);
});

test('publisher registration requires numeric owner and public repository control evidence',async()=>{
 const {registerPublisher}=await import('./policy');const p=catalog().publishers[0];const c={prAuthorId:42,challengeRepositoryId:123,challengeCommit:p.repositories[0].challengeCommit,challengeOwnerId:42,existingIds:[],tombstones:[],maintainerApproved:true};
 assert.equal(registerPublisher(p,c).id,'acme');for(const bad of [{...c,prAuthorId:99},{...c,challengeOwnerId:99},{...c,challengeRepositoryId:99},{...c,tombstones:['acme']},{...c,maintainerApproved:false}])assert.throws(()=>registerPublisher(p,bad));assert.throws(()=>registerPublisher({...p,official:true},c));
});
