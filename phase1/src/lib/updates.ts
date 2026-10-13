import {readUpdatePrefs,channelAllows} from './updatePrefs';
import {parse,compare} from 'semver';
/** Update check against GitHub Releases (public API, no token). Compares full SemVer, including numeric alpha/beta identifiers of the newest published release with this build. One-click install needs the Tauri updater, see ADR-004. */
export interface ReleaseInfo{tag:string;name:string;url:string;prerelease:boolean;publishedAt:string;asset?:{name:string;url:string}}
export const REPO='philppplik/somnia';
export function releaseNumber(tag:string):number|null{const m=/^v?(\d+)(?:\.(\d+))?/.exec(tag.trim());return m?Number(m[1])+Number(m[2]??0)/100:null;}
export function releaseTuple(tag:string):[number,number,number]|null{const m=/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(tag.trim());return m?[Number(m[1]),Number(m[2]??0),Number(m[3]??0)]:null;}
/** Keep historical v9/v9.5 tags, but reject malformed tags instead of parsing just their numeric prefix. */
export function releaseVersion(tag:string):string|null{
 const m=/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?((?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/.exec(tag.trim());
 return m?parse(`${m[1]}.${m[2]??0}.${m[3]??0}${m[4]}`)?.version??null:null;
}
export function newerRelease(current:string,releases:{tag_name:string;draft?:boolean;prerelease?:boolean;html_url:string;name?:string;published_at?:string;assets?:{name:string;browser_download_url:string}[]}[]):ReleaseInfo|null{
 const cur=releaseVersion(current);if(cur===null)return null;let best:ReleaseInfo|null=null,bestN=cur;
 for(const r of releases){if(r.draft)continue;const n=releaseVersion(r.tag_name);if(n===null||compare(n,bestN)<=0)continue;
  const asset=r.assets?.find(a=>/setup\.exe$/i.test(a.name))??r.assets?.find(a=>/\.msi$/i.test(a.name));
  best={tag:r.tag_name,name:r.name||r.tag_name,url:r.html_url,prerelease:!!r.prerelease||!!parse(n)?.prerelease.length,publishedAt:r.published_at??'',asset:asset?{name:asset.name,url:asset.browser_download_url}:undefined};bestN=n;}
 return best;}
export async function checkForUpdate(current:string,fetcher:typeof fetch=fetch):Promise<{status:'up-to-date'}|{status:'available';release:ReleaseInfo}>{
 if(await storeManaged)throw Error('Updates for this version come from the Microsoft Store.');
 const res=await fetcher(`https://api.github.com/repos/${REPO}/releases?per_page=100`,{cache:'no-store',headers:{Accept:'application/vnd.github+json'}});
 if(!res.ok)throw Error(`GitHub answered ${res.status}. Try again later.`);
 const prefs=readUpdatePrefs();const releases=await res.json();const found=newerRelease(current,releases.filter((r:{tag_name:string;prerelease?:boolean})=>channelAllows(r.tag_name,!!r.prerelease,prefs.channel)));return found?{status:'available',release:found}:{status:'up-to-date'};}

/** Microsoft Store builds are updated by the Store: no GitHub update check, no in-app updater. main.tsx supplies the answer from the desktop shell (running inside a WindowsApps package). */
let storeManaged:Promise<boolean>=Promise.resolve(false);
export const setStoreManaged=(answer:Promise<boolean>)=>{storeManaged=answer.catch(()=>false);};
export const isStoreManaged=()=>storeManaged;
/** First-start update checks wait for the installer preference. */
let seedReady:Promise<unknown>=Promise.resolve();
export const setSeedReady=(p:Promise<unknown>)=>{seedReady=p.catch(()=>undefined);};
const PREF='somnia.updateCheck.v1';
export const autoCheckEnabled=()=>{try{return localStorage.getItem(PREF)!=='off';}catch{return true;}};
export const UPDATE_CHECK_CHANGED='somnia:update-check-changed';
export const setAutoCheck=(on:boolean)=>{try{localStorage.setItem(PREF,on?'on':'off');}catch{/* storage unavailable */}if(typeof window!=='undefined')window.dispatchEvent(new Event(UPDATE_CHECK_CHANGED));};

const LAST='somnia.updateCheck.last';
export interface LastCheck{at:number;result:'available'|'up-to-date'|'error';detail:string}
export const lastCheck=():LastCheck|null=>{try{return JSON.parse(localStorage.getItem(LAST)??'null');}catch{return null;}};
export const rememberCheck=(c:LastCheck)=>{try{localStorage.setItem(LAST,JSON.stringify(c));}catch{/* storage unavailable */}};
/** Checks once now, records the outcome for Settings > About and returns the release when a newer one exists. */
export async function autoCheck(current:string):Promise<ReleaseInfo|null>{
 if(await storeManaged)return null;
 await seedReady;if(!autoCheckEnabled())return null;
 try{const r=await checkForUpdate(current);if(r.status==='available'){rememberCheck({at:Date.now(),result:'available',detail:r.release.tag});return r.release;}rememberCheck({at:Date.now(),result:'up-to-date',detail:current});return null;}
 catch(e){rememberCheck({at:Date.now(),result:'error',detail:e instanceof Error?e.message:String(e)});return null;}}
