/** Update check against GitHub Releases (public API, no token). Compares the numeric release (v9, v9.5) of the newest published release with this build. One-click install needs the Tauri updater, see ADR-004. */
export interface ReleaseInfo{tag:string;name:string;url:string;prerelease:boolean;publishedAt:string;asset?:{name:string;url:string}}
export const REPO='philppplik/somnia';
export function releaseNumber(tag:string):number|null{const m=/^v?(\d+)(?:\.(\d+))?/.exec(tag.trim());return m?Number(m[1])+Number(m[2]??0)/100:null;}
export function newerRelease(current:string,releases:{tag_name:string;draft?:boolean;prerelease?:boolean;html_url:string;name?:string;published_at?:string;assets?:{name:string;browser_download_url:string}[]}[]):ReleaseInfo|null{
 const cur=releaseNumber(current);if(cur===null)return null;let best:ReleaseInfo|null=null,bestN=cur;
 for(const r of releases){if(r.draft)continue;const n=releaseNumber(r.tag_name);if(n===null||n<=bestN)continue;
  const asset=r.assets?.find(a=>/setup\.exe$/i.test(a.name))??r.assets?.find(a=>/\.msi$/i.test(a.name));
  best={tag:r.tag_name,name:r.name||r.tag_name,url:r.html_url,prerelease:!!r.prerelease,publishedAt:r.published_at??'',asset:asset?{name:asset.name,url:asset.browser_download_url}:undefined};bestN=n;}
 return best;}
export async function checkForUpdate(current:string,fetcher:typeof fetch=fetch):Promise<{status:'up-to-date'}|{status:'available';release:ReleaseInfo}>{
 const res=await fetcher(`https://api.github.com/repos/${REPO}/releases?per_page=15`,{headers:{Accept:'application/vnd.github+json'}});
 if(!res.ok)throw Error(`GitHub answered ${res.status}. Try again later.`);
 const found=newerRelease(current,await res.json());return found?{status:'available',release:found}:{status:'up-to-date'};}
