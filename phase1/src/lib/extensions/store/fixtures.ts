// Synthetic fixtures only. No official publisher, real evidence or approved release is implied.
import type {StoreCatalog, Release, ReleaseEvidence} from './types';
import {REQUIRED_GATES} from './types';
export const digest='a'.repeat(64),commit='b'.repeat(40),prHead='c'.repeat(40),time='2026-10-10T12:00:00.000Z';
export const ref={sha256:digest,bytes:100};
export function release():Release {return {
 id:'acme.palette',version:'1.0.0',channel:'stable',state:'submitted',packageFormat:2,manifest:'somnia-extension.toml',engine:'sandboxed',apiVersion:1,minSomnia:'11.4.0',
 source:{repositoryId:123,url:'https://github.com/acme/palette',commit,extensionPath:'.'},
 artifact:{...ref,githubAssetId:123,url:'https://github.com/acme/palette/releases/download/v1.0.0/palette.somniax',filename:'palette.somniax',expandedBytes:1000,fileCount:4,largestFileBytes:500},
 provenance:{artifactSha256:digest,repositoryId:123,commit,workflowIdentity:'https://github.com/acme/palette/.github/workflows/build.yml@refs/tags/v1.0.0',attestation:ref},
 build:{lockfile:'package-lock.json',toolchain:'node 22.23.3',command:'npm ci && npm run build',lifecycleScripts:[],sbom:ref},
 capabilities:[],capabilitySha256:digest,network:[],docs:{readme:'https://github.com/acme/palette',license:'https://github.com/acme/palette',changelog:'https://github.com/acme/palette',thirdPartyNotices:'https://github.com/acme/palette',security:'https://github.com/acme/palette'},dataHandling:{localStorage:'none',remoteProcessors:[],retention:'none',deletion:'none'},assets:ref,evidence:ref
 };}
export function catalog():StoreCatalog {return {catalogSchemaVersion:1,sequence:1,generatedAt:time,policyRevision:'criteria-2026-10-10',publishers:[{id:'acme',displayName:'Acme',githubOwnerId:42,authorizedSubmitterIds:[42],repositories:[{githubRepositoryId:123,githubOwnerId:42,url:'https://github.com/acme/palette',challengeCommit:commit}],securityContact:'security@acme.example',supportUrl:'https://github.com/acme/palette',rulesAcceptedAt:time,declaredGithub2FA:true,state:'registered',official:false}],extensions:[{id:'acme.palette',name:'Palette',summary:'Synthetic fixture',category:'Design',publisherId:'acme',releases:[release()]}],tombstones:[]};}
export function evidence():ReleaseEvidence {return {extensionId:'acme.palette',version:'1.0.0',packageSha256:digest,sourceCommit:commit,prHead,policyRevision:'criteria-2026-10-10',gates:REQUIRED_GATES.map(gate=>({gate,status:'pass',packageSha256:digest,sourceCommit:commit,prHead,scannedAt:time,tool:gate,toolVersion:'1',rulesVersion:'1',databaseVersion:'1',databaseUpdatedAt:time,evidence:ref,findings:[]})),reviews:[{reviewerId:1,securityMaintainer:true,packageSha256:digest,sourceCommit:commit,prHead,policyRevision:'criteria-2026-10-10',approvedAt:time}],exceptions:[]};}
