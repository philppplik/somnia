/** Skills tab logic (package A6): data model, scan/diff presentation, read-only index parsing.
 * Hard limits mirrored from the Rust side: install never executes, `allowed-tools` is only "requested",
 * scripts are not runnable in this release, Verified is first-party only. */
export type SkillScope='space'|'user';
export type SkillTrust='unreviewed'|'scanned'|'verified';
export type SkillSource='local'|'github'|'index'|'builtin';
export interface SkillSummary{id:string;scope:SkillScope;spaceId:string|null;name:string;description:string;source:SkillSource;sourceRef:string|null;pinnedCommit:string|null;trust:SkillTrust;activeVersion:number;latestVersion:number;updatePending:boolean;scriptsRunnable:false;updatedAt:string}
export interface SkillFile{path:string;content:string}
export interface ScanFinding{rule:string;severity:'high'|'medium'|'info';file:string;line:number;excerpt:string}
export interface ScanReport{findings:ScanFinding[];passed:boolean;scannerVersion:number}
export interface SkillVersion{version:number;contentHash:string;skillMd:string;files:SkillFile[];scan:ScanReport;requestedTools:string[]}
export interface SkillsTransport{
 list(spaceId:string):Promise<SkillSummary[]>;
 /** Parses + scans on the native side; stores data only. Never executes. */
 install(req:{scope:SkillScope;spaceId:string|null;source:SkillSource;sourceRef:string|null;skillMd:string;files:SkillFile[]}):Promise<SkillSummary>;
 getVersion(id:string,version:number):Promise<SkillVersion|null>;
 acceptUpdate(id:string):Promise<SkillSummary>;
 rejectUpdate(id:string):Promise<SkillSummary>;
 uninstall(id:string):Promise<boolean>;
 /** Read-only skills.sh-compatible discovery. Absent when the build has no verified endpoint. Needs explicit consent. */
 fetchIndex?(consent:true):Promise<IndexEntry[]>;
}
export function trustBadge(t:SkillTrust):{label:string;tone:'warn'|'ok'|'verified';scripts:string}{
 return t==='verified'?{label:'Verified',tone:'verified',scripts:'Scripts still need a safety runner and your consent each run'}
  :t==='scanned'?{label:'Scanned',tone:'ok',scripts:'Scripts would need your consent on every run'}
  :{label:'Unreviewed',tone:'warn',scripts:'Instructions only. Scripts are disabled'};
}
export function scanSummary(r:ScanReport):{high:number;medium:number;info:number;headline:string;caveat:string}{
 const c=(s:string)=>r.findings.filter(f=>f.severity===s).length;const high=c('high'),medium=c('medium'),info=c('info');
 const headline=high?`${high} serious finding${high>1?'s':''}`:medium?`${medium} note${medium>1?'s':''} to check`:'No findings';
 return {high,medium,info,headline,caveat:'A clean scan is not a safety guarantee.'};
}
export interface DiffLine{kind:'same'|'add'|'del';text:string}
/** Line diff (LCS). Inputs are capped so a hostile skill cannot freeze the UI. */
export function lineDiff(a:string,b:string,cap=4000):DiffLine[]{
 const x=a.split('\n').slice(0,cap),y=b.split('\n').slice(0,cap);
 const n=x.length,m=y.length;const dp:number[][]=Array.from({length:n+1},()=>new Array(m+1).fill(0));
 for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)dp[i][j]=x[i]===y[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
 const out:DiffLine[]=[];let i=0,j=0;
 while(i<n&&j<m){if(x[i]===y[j]){out.push({kind:'same',text:x[i]});i++;j++;}else if(dp[i+1][j]>=dp[i][j+1]){out.push({kind:'del',text:x[i++]});}else{out.push({kind:'add',text:y[j++]});}}
 while(i<n)out.push({kind:'del',text:x[i++]});while(j<m)out.push({kind:'add',text:y[j++]});
 return out;
}
export interface BundleDiff{changedFiles:{path:string;status:'added'|'removed'|'changed';lines:DiffLine[]}[];skillMd:DiffLine[];newFindings:ScanFinding[];toolsAdded:string[]}
/** What the user must see before accepting an update: SKILL.md diff, every changed/new script, new scan findings, newly requested tools. */
export function bundleDiff(oldV:SkillVersion,newV:SkillVersion):BundleDiff{
 const om=new Map(oldV.files.map(f=>[f.path,f.content])),nm=new Map(newV.files.map(f=>[f.path,f.content]));
 const changedFiles:BundleDiff['changedFiles']=[];
 for(const [p,c] of nm){if(!om.has(p))changedFiles.push({path:p,status:'added',lines:lineDiff('',c)});else if(om.get(p)!==c)changedFiles.push({path:p,status:'changed',lines:lineDiff(om.get(p)!,c)});}
 for(const [p,c] of om)if(!nm.has(p))changedFiles.push({path:p,status:'removed',lines:lineDiff(c,'')});
 changedFiles.sort((a,b)=>a.path.localeCompare(b.path));
 const key=(f:ScanFinding)=>`${f.rule}|${f.file}|${f.excerpt}`;const old=new Set(oldV.scan.findings.map(key));
 return {changedFiles,skillMd:lineDiff(oldV.skillMd,newV.skillMd),newFindings:newV.scan.findings.filter(f=>!old.has(key(f))),toolsAdded:newV.requestedTools.filter(t=>!oldV.requestedTools.includes(t))};
}
export interface IndexEntry{name:string;description:string;repo:string;installs:number|null}
const REPO=/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
/** Strict parser for a skills.sh-compatible index: `[{name,description,repo,installs?}]`. Anything else is dropped. */
export function parseSkillsIndex(data:unknown):IndexEntry[]{
 const arr=Array.isArray(data)?data:(data&&typeof data==='object'&&Array.isArray((data as {skills?:unknown}).skills)?(data as {skills:unknown[]}).skills:null);
 if(!arr)throw new Error('Unrecognised skills index format.');
 const out:IndexEntry[]=[];
 for(const v of arr.slice(0,1000)){
  if(!v||typeof v!=='object')continue;const r=v as Record<string,unknown>;
  if(typeof r.name!=='string'||!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(r.name)||r.name.length>64)continue;
  if(typeof r.repo!=='string'||!REPO.test(r.repo))continue;
  out.push({name:r.name,description:typeof r.description==='string'?r.description.slice(0,1024):'',repo:r.repo,installs:typeof r.installs==='number'&&Number.isFinite(r.installs)&&r.installs>=0?Math.floor(r.installs):null});
 }
 return out;
}
export const githubRef=(e:IndexEntry)=>`github:${e.repo}`;
