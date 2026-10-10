import type {Capability,NetworkDisclosure,Publisher,Release,ReleaseEvidence,ReleaseState,SecurityFeed,StoreCatalog,StoreListing} from './store';
import {REQUIRED_GATES} from './store';
import type {StoreHost,StoreSnapshot} from './storeHost';
import type {PopupExtension} from './popupModel';
import type {ConsentCandidate} from './consentUiHost';
import type {ManifestV2} from './manifestV2';
import example from './contracts/v2/example.json';

/** Test and screenshot fixtures only. Never imported by production code. Every publisher and extension is fictional. */
export const FIXTURE_NOW=Date.parse('2026-10-10T14:00:00.000Z');
const iso=(msAgo:number)=>new Date(FIXTURE_NOW-msAgo).toISOString();
const H=3600000,D=24*H;
export const POLICY='criteria-2026-10-08';
function hex(seed:string,len:number){let h=2166136261;let out='';for(let i=0;out.length<len;i++){h^=(seed.charCodeAt(i%seed.length)+i);h=Math.imul(h,16777619)>>>0;out+=h.toString(16).padStart(8,'0');}return out.slice(0,len);}
const ref=(s:string)=>({sha256:hex(s,64),bytes:4096});
const pub=(id:string,displayName:string,o:Partial<Publisher>={}):Publisher=>({id,displayName,githubOwnerId:1000+hex(id,3).length+id.length,authorizedSubmitterIds:[1000+id.length],repositories:[{githubRepositoryId:5000+id.length,githubOwnerId:1000+hex(id,3).length+id.length,url:`https://github.com/${id}/repo`,challengeCommit:hex(id+'c',40)}],securityContact:`security@${id}.example`,supportUrl:`https://${id}.example/support`,rulesAcceptedAt:iso(90*D),declaredGithub2FA:true,state:'registered',official:false,domain:{name:`${id}.example`,state:'verified',continuousControlSince:iso(200*D),checkedAt:iso(6*D)},...o});
export const FIXTURE_PUBLISHERS:Publisher[]=[
 pub('northfield','Northfield Labs'),pub('brightside','Brightside Studio'),pub('margot-weiss','Margot Weiss',{domain:{name:'margotweiss.dev',state:'verified',continuousControlSince:iso(300*D),checkedAt:iso(6*D)}}),
 pub('hq','Somnia',{official:true,domain:undefined}),pub('pixel-garden','Pixel Garden',{domain:undefined}),pub('open-frames','Open Frames',{domain:undefined}),
 pub('lena-okafor','Lena Okafor',{domain:undefined}),pub('sam-rivera','Sam Rivera',{domain:{name:'samrivera.example',state:'verified',continuousControlSince:iso(400*D),checkedAt:iso(80*D)}}),
];
const cap=(key:string,scope:string,reason:string):Capability=>({key,scope,reason});
const net=(origin:string,purpose:string,sent:string[]):NetworkDisclosure=>({origin,purpose,dataSent:sent,dataReceived:['Responses to the requests above'],accountRequired:false,paymentRequired:false,privacyUrl:`${origin}/privacy`});
export function makeRelease(id:string,version:string,publisherId:string,capabilities:Capability[],network:NetworkDisclosure[]=[],state:ReleaseState='listed',channel:'stable'|'prerelease'='stable'):Release{
 const slug=id.split('.')[1];const sha=hex(`${id}@${version}`,64);const commit=hex(`${id}@${version}:c`,40);const url=`https://github.com/${publisherId}/${slug}`;
 return {id,version,channel,state,packageFormat:2,manifest:'somnia-extension.toml',engine:'sandboxed',apiVersion:2,minSomnia:'11.4.0',source:{repositoryId:5000+publisherId.length,url,commit,extensionPath:'.'},
  artifact:{sha256:sha,bytes:214*1024,githubAssetId:900,url:`${url}/releases/download/v${version}/${slug}.somniax`,filename:`${slug}.somniax`,expandedBytes:600000,fileCount:12,largestFileBytes:90000},
  provenance:{artifactSha256:sha,repositoryId:5000+publisherId.length,commit,workflowIdentity:`${url}/.github/workflows/build.yml@refs/tags/v${version}`,attestation:ref(id+'att')},
  build:{lockfile:'package-lock.json',toolchain:'node 22',command:'npm ci && npm run build',lifecycleScripts:[],sbom:ref(id+'sbom')},
  capabilities,capabilitySha256:hex(id+JSON.stringify(capabilities),64),network,docs:{readme:url,license:url,changelog:url,thirdPartyNotices:url,security:url},
  dataHandling:{localStorage:network.length?'Keeps your connection settings on this computer.':'Nothing is stored.',remoteProcessors:network.map(n=>new URL(n.origin).hostname),retention:network.length?'The server you connect to decides.':'None.',deletion:'Remove the extension to delete its local data.'},
  assets:ref(id+'assets'),evidence:ref(id+version+'evidence')};
}
type Spec={id:string;name:string;summary:string;category:string;publisher:string;versions:string[];caps:Capability[];net?:NetworkDisclosure[];state?:ReleaseState};
const SPECS:Spec[]=[
 {id:'northfield.palette-lint',name:'Palette Lint',summary:'Checks colour contrast against WCAG while you edit.',category:'Accessibility',publisher:'northfield',versions:['1.0.0'],caps:[cap('project.read','project','To check colours in the files you edit.')]},
 {id:'brightside.tailwind-snippets',name:'Tailwind Snippets',summary:'Insert-component library for Tailwind with live preview.',category:'Components',publisher:'brightside',versions:['1.0.0','1.1.0'],caps:[cap('project.write','project','To insert the component you pick.')]},
 {id:'margot-weiss.ftp-deploy',name:'FTP Deploy',summary:'Upload a built site to your own FTP or SFTP server.',category:'Deploy',publisher:'margot-weiss',versions:['1.2.0'],caps:[cap('project.read','project','To upload them.'),cap('network','sftp.example-host.com','Your site files are sent to this server.'),cap('secrets','keyring','So you do not have to type it every time.')],net:[net('https://sftp.example-host.com','Upload the built site to your own server.',['Your site files','Your server password'])]},
 {id:'hq.html-mail-kit',name:'HTML Mail Kit',summary:'Tables, inline CSS and client previews for HTML email.',category:'Email',publisher:'hq',versions:['1.3.0'],caps:[cap('project.write','project','To write the inlined email file.')]},
 {id:'pixel-garden.image-optimizer',name:'Image Optimizer',summary:'Compress PNG, JPEG and WebP before export.',category:'Images',publisher:'pixel-garden',versions:['1.4.0'],caps:[cap('project.read','project','To find the images to compress.')]},
 {id:'open-frames.unsplash-browser',name:'Unsplash Browser',summary:'Search and insert free stock photos in the canvas.',category:'Images',publisher:'open-frames',versions:['1.5.0'],caps:[cap('project.write','project','To save the photo you insert.'),cap('network','images.example.com','To search and download photos.')],net:[net('https://images.example.com','Search and download stock photos.',['Your search words'])]},
 {id:'lena-okafor.css-tidy',name:'CSS Tidy',summary:'Sort and group CSS properties on save.',category:'Components',publisher:'lena-okafor',versions:['1.5.0','1.6.0'],caps:[cap('project.write','project','To rewrite the CSS file you save.')]},
 {id:'northfield.lorem-studio',name:'Lorem Studio',summary:'Placeholder text and images, offline.',category:'Components',publisher:'northfield',versions:['1.6.0','1.7.0'],caps:[cap('project.write','project','To insert placeholder text.')]},
 {id:'sam-rivera.link-checker',name:'Link Checker',summary:'Finds broken links before you export.',category:'Accessibility',publisher:'sam-rivera',versions:['1.8.0'],caps:[cap('project.read','project','To find the links in your pages.'),...['a','b','c','d'].map(x=>cap('network',`${x}.links.example`,'To check that the link answers.'))],net:['a','b','c','d'].map(x=>net(`https://${x}.links.example`,'Check that a link in your project answers.',['The link address']))},
 {id:'brightside.coffee-themes',name:'Coffee Themes',summary:'Two warm code themes.',category:'Themes',publisher:'brightside',versions:['2.0.0'],caps:[],state:'deprecated'},
 {id:'open-frames.quick-fonts',name:'Quick Fonts',summary:'Browse and preview web fonts.',category:'Themes',publisher:'open-frames',versions:['0.9.0'],caps:[cap('project.read','project','To list the fonts you use.')],state:'security-blocked'},
 {id:'pixel-garden.hidden-tool',name:'Hidden Tool',summary:'Suspended by policy, not listed.',category:'Images',publisher:'pixel-garden',versions:['0.1.0'],caps:[],state:'policy-suspended'},
];
export function fixtureCatalog():StoreCatalog{
 const extensions:StoreListing[]=SPECS.map(s=>({id:s.id,name:s.name,summary:s.summary,category:s.category,publisherId:s.publisher,releases:s.versions.map((v,i)=>makeRelease(s.id,v,s.publisher,s.caps,s.net??[],i===s.versions.length-1?(s.state??'listed'):'listed'))}));
 return {catalogSchemaVersion:1,sequence:42,generatedAt:iso(2*H),policyRevision:POLICY,publishers:FIXTURE_PUBLISHERS,extensions,tombstones:[]};
}
export const EMPTY_FEED:SecurityFeed={securitySchemaVersion:1,sequence:7,generatedAt:iso(2*H),incidents:[]};
export function fixtureEvidence(r:Release,over:{dependenciesAgeMs?:number;missing?:boolean}={}):ReleaseEvidence|null{
 if(over.missing)return null;
 const at=(ms:number)=>iso(ms);
 const gates=REQUIRED_GATES.map(g=>({gate:g,status:'pass' as const,packageSha256:r.artifact.sha256,sourceCommit:r.source.commit,prHead:hex('pr'+r.id,40),scannedAt:at(g==='dependencies'?(over.dependenciesAgeMs??2*D):2*D),tool:g==='malware'?'scanner':g,toolVersion:'1.4',rulesVersion:'2026-10-08',databaseVersion:'2026-10-08',databaseUpdatedAt:at(2*D),evidence:ref(r.id+g),findings:[]}));
 const need=r.network.length||r.capabilities.some(c=>/write|secrets/.test(c.key))?2:1;
 const reviews=[...Array(need)].map((_,i)=>({reviewerId:7000+i,securityMaintainer:i===0,packageSha256:r.artifact.sha256,sourceCommit:r.source.commit,prHead:hex('pr'+r.id,40),policyRevision:POLICY,approvedAt:'2026-10-08T09:00:00.000Z'}));
 return {extensionId:r.id,version:r.version,packageSha256:r.artifact.sha256,sourceCommit:r.source.commit,prHead:hex('pr'+r.id,40),policyRevision:POLICY,gates,reviews,exceptions:[]};
}
/** Popup list entries for the installed side of the fixture store. */
function installedEntry(spec:Spec,version:string,update?:string):PopupExtension{
 return {id:spec.id,name:spec.name,version,description:spec.summary,publisher:spec.publisher,badge:null,enabled:true,status:'running',grants:[],contributions:['commands'],lastActivity:null,source:{provider:'Somnia Store',repository:`${spec.publisher}/${spec.id.split('.')[1]}`,release:version,verification:'signed-match'},update:update?{kind:'consent',version:update,added:[],keepsRunning:true}:{kind:'current'}};
}
export const specById=(id:string)=>SPECS.find(s=>s.id===id)!;
export const FIXTURE_INSTALLED:PopupExtension[]=[installedEntry(specById('hq.html-mail-kit'),'1.3.0'),installedEntry(specById('lena-okafor.css-tidy'),'1.5.0','1.6.0'),installedEntry(specById('northfield.lorem-studio'),'1.6.0','1.7.0')];

export function manifestFor(r:Release,name:string,publisher:string):ManifestV2{
 const m=structuredClone(example) as unknown as ManifestV2;m.id=r.id;m.publisher=publisher;m.name=name;m.version=r.version;
 const has=(k:string)=>r.capabilities.some(c=>c.key===k);
 m.security={tier:'A',fs:{read:has('project.read')||has('project.write')?'project':'none',write:has('project.write')?'project':'none'},network:r.network.map(n=>({host:new URL(n.origin).hostname,reason:n.purpose}))};
 m.contributes={};m.activationEvents=[];m.permissions=[...(has('project.read')||has('project.write')?['project.read']:[]),...(has('project.write')?['project.write']:[])];
 return m;
}
export interface FixtureStoreOptions {offline?:boolean; unavailable?:boolean; stale?:boolean; feed?:SecurityFeed; missingEvidence?:string[]; stageResult?:'mismatch'|'blocked'|null; onCommit?:(id:string,version:string)=>void; onReport?:(r:unknown)=>void; reportFails?:boolean; errorLog?:string|null}
export function fixtureStoreHost(opts:FixtureStoreOptions={}):StoreHost{
 const catalog=fixtureCatalog();
 const snapshot:StoreSnapshot={catalog,feed:opts.feed??EMPTY_FEED,fetchedAt:opts.offline?iso(30*H):iso(2*H),offline:!!opts.offline,lastTrustedCheck:opts.stale?FIXTURE_NOW-9*D:FIXTURE_NOW-2*H};
 const findRelease=(id:string,version:string)=>catalog.extensions.find(e=>e.id===id)?.releases.find(r=>r.version===version);
 return {
  now:()=>FIXTURE_NOW,
  load:async()=>opts.unavailable?{status:'unavailable'}:{status:'ready',snapshot},
  evidence:async(id,v)=>{const r=findRelease(id,v);if(!r)return null;return fixtureEvidence(r,{dependenciesAgeMs:id==='margot-weiss.ftp-deploy'?5*D:undefined,missing:opts.missingEvidence?.includes(id)});},
  stage:async(id,v,_sha,mode)=>{
   const l=catalog.extensions.find(e=>e.id===id);const r=findRelease(id,v);if(!l||!r)return {kind:'error',code:'failed'};
   if(opts.stageResult==='blocked')return {kind:'error',code:'blocked'};
   const pubId=l.publisherId;const candidate:ConsentCandidate={manifest:manifestFor(r,l.name,pubId),artifactHash:opts.stageResult==='mismatch'?'f'.repeat(64):r.artifact.sha256,manifestHash:hex(id+v+'m',64),validation:'valid',source:'store',verified:isVerified(pubId)?{label:'Verified publisher',sourceId:'store-record'}:undefined};
   if(mode==='update'){const prev=l.releases.find(x=>x.version!==v);if(prev)candidate.previous=manifestFor(prev,l.name,pubId);}
   return {kind:'staged',request:{candidate,revalidate:async()=>candidate,commit:async(_c,approve)=>{await approve();opts.onCommit?.(id,v);}}};
  },
  errorLog:async()=>opts.errorLog===undefined?'12:01:04 WARN network.request denied unlisted.example.com\n12:01:09 ERROR panel render failed: timeout':opts.errorLog,
  somniaVersion:()=>'11.4.0',
  submitReport:async r=>{opts.onReport?.(r);if(opts.reportFails)throw new Error('offline');return {reference:'SR-2026-1042'};},
  publicIssueUrl:(id,v)=>`https://github.com/somnia-index/issues/new?template=concern.yml&extension=${encodeURIComponent(id)}&version=${encodeURIComponent(v)}`,
 };
}
const isVerified=(pubId:string)=>FIXTURE_PUBLISHERS.find(p=>p.id===pubId)?.domain?.state==='verified';
