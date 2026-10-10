import type {Capability,EvidenceStatus,Publisher,Release,ReleaseEvidence,SecurityFeed,StoreCatalog,StoreListing} from './store';
import {highRisk,matchingRevocations,storeFreshness} from './store';

/** Pure Store view model. Statuses stay separate facts; there is no score and missing evidence is never green. */
const DAY=86400000;
export const DOMAIN_CHECK_MAX_AGE_MS=35*DAY;

const SEMVER=/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
export function compareVersions(a:string,b:string):number{
 const x=SEMVER.exec(a),y=SEMVER.exec(b);if(!x||!y)return a<b?-1:a>b?1:0;
 for(let i=1;i<=3;i++){const d=Number(x[i])-Number(y[i]);if(d)return d<0?-1:1;}
 if(x[4]===y[4])return 0;if(!x[4])return 1;if(!y[4])return -1;
 const p=x[4].split('.'),q=y[4].split('.');
 for(let i=0;i<Math.max(p.length,q.length);i++){
  if(p[i]===undefined)return -1;if(q[i]===undefined)return 1;
  const n=/^\d+$/.test(p[i]),m=/^\d+$/.test(q[i]);
  if(n&&m){const d=Number(p[i])-Number(q[i]);if(d)return d<0?-1:1;}else if(n)return -1;else if(m)return 1;else if(p[i]!==q[i])return p[i]<q[i]?-1:1;
 }
 return 0;
}

/** Verified mark = domain verification that is current. It says who published, never that the code is safe. */
export function isVerifiedPublisher(p:Publisher|undefined,now:number):boolean{
 const d=p?.domain;if(!p||p.state!=='registered'||!d||d.state!=='verified')return false;
 const t=Date.parse(d.checkedAt);return Number.isFinite(t)&&now-t<=DOMAIN_CHECK_MAX_AGE_MS&&now>=t-DAY;
}
export function publisherIndicators(p:Publisher,now:number):{githubLinked:boolean;domainVerified:boolean;declaresTwoFactor:boolean;official:boolean}{
 return {githubLinked:p.githubOwnerId>0&&p.repositories.some(r=>r.githubOwnerId===p.githubOwnerId),domainVerified:isVerifiedPublisher(p,now),declaresTwoFactor:p.declaredGithub2FA===true,official:p.official===true};
}

export type CardState='install'|'installed'|'update'|'blocked';
export type NetworkTag={kind:'none'}|{kind:'hosts';count:number}|{kind:'many'};
export type FilesTag='none'|'read'|'write';
export interface StoreCard {
 id:string; name:string; summary:string; category:string; publisher:Publisher|null; publisherName:string; verified:boolean; official:boolean;
 release:Release; listing:StoreListing; files:FilesTag; network:NetworkTag; unknownPermission:boolean; deprecated:boolean; state:CardState; installedVersion:string|null;
}
export const MANY_HOSTS=4;
const FILE_WRITE=['project.write','fs.write'],FILE_READ=['project.read','fs.read'];
const KNOWN_KEYS=['fs.read','fs.write','project.read','project.write','network','clipboard.read','clipboard.write','agent','secrets','commands','selection','ui.notify','storage'];
export const isKnownCapability=(c:Capability)=>KNOWN_KEYS.includes(c.key);
export function networkHosts(r:Release):string[]{
 const out=new Set<string>();
 for(const n of r.network){try{out.add(new URL(n.origin).hostname);}catch{out.add(n.origin);}}
 for(const c of r.capabilities)if(c.key==='network'&&c.scope)out.add(c.scope);
 return [...out];
}
export function filesTag(r:Release):FilesTag{
 const on=(k:string)=>r.capabilities.some(c=>c.key===k&&(!k.startsWith('fs.')||c.scope!=='none'));
 return FILE_WRITE.some(on)?'write':FILE_READ.some(on)?'read':'none';
}
export function networkTag(r:Release):NetworkTag{const n=networkHosts(r).length;return n===0?{kind:'none'}:n>=MANY_HOSTS?{kind:'many'}:{kind:'hosts',count:n};}

export function isBlocked(r:Release,feed:SecurityFeed):boolean{
 return r.state==='security-blocked'||matchingRevocations(r,feed).some(i=>i.action==='security-blocked');
}
function isSuspended(r:Release,feed:SecurityFeed):boolean{return r.state==='policy-suspended'||matchingRevocations(r,feed).some(i=>i.action==='policy-suspended');}
const VISIBLE=new Set(['listed','deprecated','security-blocked']);
/** Latest stable release that may appear in the Store. Suspended releases and unlisted states are hidden, not shown greyed. */
export function storeRelease(l:StoreListing,feed:SecurityFeed):Release|null{
 const c=l.releases.filter(r=>r.channel==='stable'&&VISIBLE.has(r.state)&&!isSuspended(r,feed)).sort((a,b)=>compareVersions(b.version,a.version));
 return c[0]??null;
}
export function buildCards(catalog:StoreCatalog,feed:SecurityFeed,installed:ReadonlyMap<string,string>,now:number):StoreCard[]{
 const tomb=new Set(catalog.tombstones);const pubs=new Map(catalog.publishers.map(p=>[p.id,p]));const out:StoreCard[]=[];
 for(const l of catalog.extensions){
  if(tomb.has(l.id))continue;const p=pubs.get(l.publisherId)??null;if(p&&p.state!=='registered')continue;
  const r=storeRelease(l,feed);if(!r)continue;
  const inst=installed.get(l.id)??null;const blocked=isBlocked(r,feed);
  const state:CardState=blocked?'blocked':inst===null?'install':compareVersions(r.version,inst)>0?'update':'installed';
  out.push({id:l.id,name:l.name,summary:l.summary,category:l.category,publisher:p,publisherName:p?.displayName??l.publisherId,verified:isVerifiedPublisher(p??undefined,now),official:p?.official===true,release:r,listing:l,files:filesTag(r),network:networkTag(r),unknownPermission:r.capabilities.some(c=>!isKnownCapability(c)),deprecated:r.state==='deprecated',state,installedVersion:inst});
 }
 return out.sort((a,b)=>a.name.localeCompare(b.name));
}
export function categoriesOf(cards:StoreCard[]):string[]{return [...new Set(cards.map(c=>c.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b));}
export type Translate=(key:string,params?:Record<string,string|number>)=>string;
/** Search covers name, publisher and the plain-language permission text the user sees on the card and Access tab. */
export function permissionText(card:StoreCard,t:Translate):string{
 const parts:string[]=[card.files==='write'?t('store.tag.write'):card.files==='read'?t('store.tag.read'):t('store.tag.noFiles')];
 parts.push(card.network.kind==='none'?t('store.tag.noNetwork'):card.network.kind==='many'?t('store.tag.manyHosts'):t('store.tag.host',{count:card.network.count}));
 for(const r of accessRows(card.release))parts.push(t(r.titleKey,r.params));
 for(const h of networkHosts(card.release))parts.push(h);
 return parts.join(' ');
}
export function filterCards(cards:StoreCard[],q:string,category:string,t:Translate):StoreCard[]{
 const needle=q.trim().toLocaleLowerCase();
 return cards.filter(c=>(category==='all'||c.category===category)&&(!needle||`${c.name} ${c.publisherName} ${permissionText(c,t)}`.toLocaleLowerCase().includes(needle)));
}

export interface AccessRow {id:string; icon:'folder'|'globe'|'key'|'clipboard'|'agent'|'bolt'|'bell'|'database'|'other'; titleKey:string; params?:Record<string,string>; reason:string; amber:boolean}
const ICONS:Record<string,AccessRow['icon']>={'project.read':'folder','project.write':'folder','fs.read':'folder','fs.write':'folder',network:'globe',secrets:'key','clipboard.read':'clipboard','clipboard.write':'clipboard',agent:'agent',commands:'bolt',selection:'bolt','ui.notify':'bell',storage:'database'};
/** One row per capability from the closed vocabulary, with a reviewed sentence per key. Unknown keys never show a raw id. */
export function accessRows(r:Release):AccessRow[]{
 const rows:AccessRow[]=[];const seenNet=new Set<string>();
 const netRows:AccessRow[]=[];
 for(const n of r.network){let host=n.origin;try{host=new URL(n.origin).hostname;}catch{/* keep origin */}seenNet.add(host);netRows.push({id:`network.${host}`,icon:'globe',titleKey:'store.perm.network',params:{host},reason:n.purpose,amber:true});}
 for(const c of r.capabilities){
  if(!isKnownCapability(c)){rows.push({id:`unknown.${rows.length}`,icon:'other',titleKey:'store.perm.unknown',reason:'',amber:true});continue;}
  if(c.key==='network'){if(!seenNet.has(c.scope)){seenNet.add(c.scope);netRows.push({id:`network.${c.scope}`,icon:'globe',titleKey:'store.perm.network',params:{host:c.scope},reason:c.reason,amber:true});}continue;}
  const scoped=c.key==='fs.read'||c.key==='fs.write';
  if(scoped&&c.scope==='none')continue;
  const titleKey=scoped?`store.perm.${c.key}.${c.scope==='ask'?'ask':'project'}`:`store.perm.${c.key}`;
  rows.push({id:`${c.key}.${rows.length}`,icon:ICONS[c.key]??'other',titleKey,reason:c.reason,amber:c.key==='clipboard.read'||c.key==='secrets'});
 }
 return [...rows.filter(x=>!x.id.startsWith('secrets')),...netRows,...rows.filter(x=>x.id.startsWith('secrets'))];
}

export type ChipTone='ok'|'warn'|'bad'|'neutral';
export interface EvidenceRow {id:'review'|'provenance'|'scan'|'dependencies'|'permission'|'revocation'; status:EvidenceStatus; tone:ChipTone; chipKey:string; detailKey:string; params:Record<string,string|number>; date:string|null}
const RANK:Record<EvidenceStatus,number>={fail:5,stale:4,'needs-review':3,'not-run':2,'not-applicable':1,pass:0};
export function worst(list:EvidenceStatus[]):EvidenceStatus{return list.length?list.reduce((a,b)=>RANK[b]>RANK[a]?b:a):'not-run';}
export function chipFor(s:EvidenceStatus,id:EvidenceRow['id']):{tone:ChipTone;key:string}{
 if(s==='pass')return {tone:'ok',key:id==='provenance'?'store.chip.verified':id==='revocation'?'store.chip.current':'store.chip.passed'};
 if(s==='fail')return {tone:'bad',key:'store.chip.failed'};
 if(s==='stale')return {tone:'warn',key:'store.chip.overdue'};
 if(s==='needs-review')return {tone:'warn',key:'store.chip.needsReview'};
 if(s==='not-applicable')return {tone:'neutral',key:'store.chip.notApplicable'};
 return {tone:'neutral',key:'store.chip.notRun'};
}
const DEP_STALE_MS=3*DAY;
export function shortCommit(c:string){return c.slice(0,7);}
export function repoPath(url:string){try{const u=new URL(url);return `${u.hostname}${u.pathname}`.replace(/\/$/,'');}catch{return url;}}
export function shortDigest(d:string){return `sha256:${d.slice(0,4)}…${d.slice(-4)}`;}
/** Six rows per criteria section 11. Every row binds to the exact artifact, source commit and policy revision. */
export function evidenceRows(release:Release,ev:ReleaseEvidence|null,policyRevision:string,now:number,lastTrustedCheck:number|null):EvidenceRow[]{
 const bound=ev&&ev.packageSha256===release.artifact.sha256&&ev.sourceCommit===release.source.commit&&ev.extensionId===release.id&&ev.version===release.version?ev:null;
 const gate=(name:string)=>bound?.gates.find(g=>g.gate===name&&g.packageSha256===release.artifact.sha256&&g.sourceCommit===release.source.commit);
 const status=(names:string[]):EvidenceStatus=>worst(names.map(n=>{const g=gate(n);if(!g)return 'not-run' as const;if(n==='dependencies'&&g.status==='pass'&&now-Date.parse(g.scannedAt)>DEP_STALE_MS)return 'stale' as const;return g.status;}));
 const latest=(names:string[])=>names.map(n=>gate(n)?.scannedAt).filter((x):x is string=>!!x).sort().pop()??null;
 const rows:EvidenceRow[]=[];const push=(id:EvidenceRow['id'],s:EvidenceStatus,detailKey:string,params:Record<string,string|number>,date:string|null)=>{const c=chipFor(s,id);rows.push({id,status:s,tone:c.tone,chipKey:c.key,detailKey,params,date});};
 // Review
 const need=highRisk(release)?2:1;const reviews=(bound?.reviews??[]).filter(r=>r.packageSha256===release.artifact.sha256&&r.sourceCommit===release.source.commit&&r.policyRevision===policyRevision);
 const reviewers=new Set(reviews.map(r=>r.reviewerId)).size;const secMaint=reviews.some(r=>r.securityMaintainer);
 const reviewOk=bound!==null&&reviewers>=need&&(need<2||secMaint);
 const reviewDate=reviews.map(r=>r.approvedAt).sort().pop()??null;
 push('review',!bound?'not-run':reviewOk?'pass':'needs-review','store.ev.review',{count:reviewers,policy:policyRevision},reviewDate);
 // Provenance
 push('provenance',status(['provenance','build-correspondence']),'store.ev.provenance',{repo:repoPath(release.source.url),commit:shortCommit(release.source.commit)},latest(['provenance','build-correspondence']));
 push('scan',status(['secrets','static-policy','malware']),'store.ev.scan',{},latest(['secrets','static-policy','malware']));
 push('dependencies',status(['dependencies']),'store.ev.dependencies',{},latest(['dependencies']));
 push('permission',status(['runtime']),'store.ev.permission',{},latest(['runtime']));
 const fresh=lastTrustedCheck===null?'pause-third-party':storeFreshness(now,lastTrustedCheck);
 const rs:EvidenceStatus=fresh==='current'?'pass':fresh==='refresh-due'?'stale':'needs-review';
 push('revocation',rs,'store.ev.revocation',{},lastTrustedCheck===null?null:new Date(lastTrustedCheck).toISOString());
 return rows;
}
/** Policy advice only: installing and updating third-party extensions pauses when the verified catalog is too old or the clock is wrong. */
export function installPaused(lastTrustedCheck:number|null,now:number):boolean{
 if(lastTrustedCheck===null)return true;const f=storeFreshness(now,lastTrustedCheck);return f==='pause-third-party'||f==='clock-rollback';
}
export function relativeAge(ts:number,now:number):{unit:'minutes'|'hours'|'days';n:number}{
 const m=Math.max(0,Math.round((now-ts)/60000));if(m<60)return {unit:'minutes',n:Math.max(1,m)};if(m<2880)return {unit:'hours',n:Math.round(m/60)};return {unit:'days',n:Math.round(m/1440)};
}

export const chipTone=(s:EvidenceStatus,id:EvidenceRow['id'])=>chipFor(s,id).tone;
/** The staged candidate must be exactly the reviewed catalog release: same extension, version and package digest, store-sourced and not invalid. */
export function candidateBound(c:{manifest:{id:string;version:string};artifactHash:string;source:string;validation:string},release:Release):boolean{
 return c.source==='store'&&c.validation!=='invalid'&&c.manifest.id===release.id&&c.manifest.version===release.version&&c.artifactHash===release.artifact.sha256;
}
