export interface UpdatePrefs{intervalMinutes:60|1440|10080;channel:'stable'|'beta'|'alpha'}
export const DEFAULT_UPDATE_PREFS:UpdatePrefs={intervalMinutes:1440,channel:'stable'};
export function sanitizeUpdatePrefs(x:any):UpdatePrefs{return {intervalMinutes:x?.intervalMinutes===60||x?.intervalMinutes===10080?x.intervalMinutes:1440,channel:x?.channel==='beta'||x?.channel==='alpha'?x.channel:'stable'};}
export function readUpdatePrefs():UpdatePrefs{try{return sanitizeUpdatePrefs(JSON.parse(localStorage.getItem('somnia.updatePrefs.v1')||'{}'));}catch{return {...DEFAULT_UPDATE_PREFS};}}
export function saveUpdatePrefs(p:UpdatePrefs){try{localStorage.setItem('somnia.updatePrefs.v1',JSON.stringify(p));}catch{/* session only */}}
export function channelAllows(tag:string,prerelease:boolean,channel:UpdatePrefs['channel']){if(!prerelease)return true;if(channel==='alpha')return true;return channel==='beta'&&!/alpha|nightly|canary|dev/i.test(tag);}
