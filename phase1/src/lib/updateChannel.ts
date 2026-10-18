import {parse,compare} from 'semver';
import type {UpdatePrefs} from './updatePrefs';
/** Signed auto-update channel logic. The Tauri updater only reads fixed endpoints and ignores prerelease ordering of the native (numeric) app version, so the channel manifest URL and the "is this strictly newer" decision live here and in `update_channel.rs`. Release-side contract: docs/BUILD-AND-RELEASE.md. */
export type UpdateChannel=UpdatePrefs['channel'];
export const REPO_RELEASES='https://github.com/philppplik/somnia/releases';
/** Fixed release that only carries the rolling `latest-beta.json` and `latest-alpha.json` manifests. `releases/latest` ignores prereleases, so those cannot live on a normal tag. */
export const CHANNEL_MANIFEST_TAG='updater-channels';
export function manifestUrl(channel:UpdateChannel):string{
 return channel==='stable'?`${REPO_RELEASES}/latest/download/latest.json`:`${REPO_RELEASES}/download/${CHANNEL_MANIFEST_TAG}/latest-${channel}.json`;}
/** Channel a version string belongs to; same rule as `channelAllows` and `channel_of` in make-latest-json.py. */
export function channelOfVersion(version:string):UpdateChannel{
 const core=version.replace(/^v/,'').split('+',1)[0];const i=core.indexOf('-');
 if(i<0)return 'stable';return /alpha|nightly|canary|dev/i.test(core.slice(i+1))?'alpha':'beta';}
/** True when `remote` is strictly newer than the running build (`current`, the full somniaRelease with prerelease id) and the user's channel allows it. Full SemVer ordering: 12.2.0-beta.10 > 12.2.0-beta.3 > 12.2.0-alpha.7, 12.2.0 > 12.2.0-beta.3. Build metadata is ignored. */
export function shouldInstall(current:string,remote:string,channel:UpdateChannel):boolean{
 const c=parse(current.replace(/^v/,'')),r=parse(remote.replace(/^v/,''));
 if(!c||!r)return false;
 const rc=channelOfVersion(r.version);
 if(rc==='alpha'&&channel!=='alpha')return false;
 if(rc==='beta'&&channel==='stable')return false;
 return compare(r,c)>0;}
