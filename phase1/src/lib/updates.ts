import {readUpdatePrefs,channelAllows} from './updatePrefs';
/** Update check against GitHub Releases (public API, no token). Compares major.minor.patch (v9, v9.5, v9.5.4) of the newest published release with this build. One-click install needs the Tauri updater, see ADR-004. */
export interface ReleaseInfo{tag:string;name:string;url:string;prerelease:boolean;publishedAt:string;asset?:{name:string;url:string}}
export const REPO='philppplik/somnia';
export function releaseNumber(tag:string):number|null{const m=/^v?(\d+)(?:\.(\d+))?/.exec(tag.trim());return m?Number(m[1])+Number(m[2]??0)/100:null;}
export function releaseTuple(tag:string):[number,number,number]|null{const m=/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(tag.trim());return m?[Number(m[1]),Number(m[2]??0),Number(m[3]??0)]:null;}
const cmp=(a:number[],b:number[])=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2];
export function newerRelease(current:string,releases:{tag_name:string;draft?:boolean;prerelease?:boolean;html_url:string;name?:string;published_at?:string;assets?:{name:string;browser_download_url:string}[]}[]):ReleaseInfo|null{
 const cur=releaseTuple(current);if(cur===null)return null;let best:ReleaseInfo|null=null,bestN:[number,number,number]=cur;
 for(const r of releases){if(r.draft)continue;const n=releaseTuple(r.tag_name);if(n===null||cmp(n,bestN)<=0)continue;
  const asset=r.assets?.find(a=>/setup\.exe$/i.test(a.name))??r.assets?.find(a=>/\.msi$/i.test(a.name));
  best={tag:r.tag_name,name:r.name||r.tag_name,url:r.html_url,prerelease:!!r.prerelease,publishedAt:r.published_at??'',asset:asset?{name:asset.name,url:asset.browser_download_url}:undefined};bestN=n;}
 return best;}
export async function checkForUpdate(current:string,fetcher:typeof fetch=fetch):Promise<{status:'up-to-date'}|{status:'available';release:ReleaseInfo}>{
 if(await storeManaged)throw Error('Updates for this version come from the Microsoft Store.');
 const res=await fetcher(`https://api.github.com/repos/${REPO}/releases?per_page=15`,{cache:'no-store',headers:{Accept:'application/vnd.github+json'}});
 if(!res.ok)throw Error(`GitHub answered ${res.status}. Try again later.`);
 const prefs=readUpdatePrefs();const releases=await res.json();const found=newerRelease(current,releases.filter((r:{tag_name:string;prerelease?:boolean})=>channelAllows(r.tag_name,!!r.prerelease,prefs.channel)));return found?{status:'available',release:found}:{status:'up-to-date'};}

/** Microsoft Store builds are updated by the Store: no GitHub update check, no in-app updater. main.tsx supplies the answer from the desktop shell (running inside a WindowsApps package). */
let storeManaged:Promise<boolean>=Promise.resolve(false);
export const setStoreManaged=(answer:Promise<boolean>)=>{storeManaged=answer.catch(()=>false);};
export const isStoreManaged=()=>storeManaged;
const PREF='somnia.updateCheck.v1';
export const autoCheckEnabled=()=>{try{return localStorage.getItem(PREF)!=='off';}catch{return true;}};
export const setAutoCheck=(on:boolean)=>{try{localStorage.setItem(PREF,on?'on':'off');}catch{/* storage unavailable */}};

const LAST='somnia.updateCheck.last';
export interface LastCheck{at:number;result:'available'|'up-to-date'|'error';detail:string}
export const lastCheck=():LastCheck|null=>{try{return JSON.parse(localStorage.getItem(LAST)??'null');}catch{return null;}};
export const rememberCheck=(c:LastCheck)=>{try{localStorage.setItem(LAST,JSON.stringify(c));}catch{/* storage unavailable */}};
/** Checks once now, records the outcome for Settings > About and returns the release when a newer one exists. */
export async function autoCheck(current:string):Promise<ReleaseInfo|null>{
 if(await storeManaged)return null;
 try{const r=await checkForUpdate(current);if(r.status==='available'){rememberCheck({at:Date.now(),result:'available',detail:r.release.tag});return r.release;}rememberCheck({at:Date.now(),result:'up-to-date',detail:current});return null;}
 catch(e){rememberCheck({at:Date.now(),result:'error',detail:e instanceof Error?e.message:String(e)});return null;}}
