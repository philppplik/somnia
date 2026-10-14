import {shouldInstall,type UpdateChannel} from './updateChannel';
/** One-click update through signed channel manifests (stable, beta, alpha). Falls back to the release page when no signed update is available. Rust side: src-tauri/src/update_channel.rs. */
export const canSelfUpdate=():boolean=>typeof window!=='undefined'&&'__TAURI_INTERNALS__' in window;
export type UpdateProgress={phase:'checking'}|{phase:'downloading';percent:number|null}|{phase:'installing'}|{phase:'restarting'};
export interface UpdaterBackend{
 /** Version the channel manifest offers for this platform, or null when it has no signed build for it. */
 check(channel:UpdateChannel):Promise<string|null>;
 /** Downloads and installs exactly `version`; reports bytes while downloading. */
 install(channel:UpdateChannel,version:string,onBytes:(downloaded:number,total:number|null)=>void,onInstalling:()=>void):Promise<boolean>;
 relaunch():Promise<void>;}
/** Resolves true when an update was installed (the app restarts), false when the channel offers nothing newer or nothing signed for this build. Throws on download or signature errors. `current` is the full release string with prerelease id (__APP_RELEASE__), not the numeric native version. */
export async function runSignedUpdate(be:UpdaterBackend,channel:UpdateChannel,current:string,onProgress:(p:UpdateProgress)=>void):Promise<boolean>{
 onProgress({phase:'checking'});
 const offered=await be.check(channel);
 if(!offered||!shouldInstall(current,offered,channel))return false;
 const ok=await be.install(channel,offered,(got,total)=>onProgress({phase:'downloading',percent:total?Math.min(100,Math.round(got/total*100)):null}),()=>onProgress({phase:'installing'}));
 if(!ok)return false;
 onProgress({phase:'restarting'});await be.relaunch();return true;}
const tauriBackend=():UpdaterBackend=>({
 async check(channel){const {invoke}=await import('@tauri-apps/api/core');return invoke<string|null>('check_channel_update',{channel});},
 async install(channel,version,onBytes,onInstalling){
  const {invoke}=await import('@tauri-apps/api/core');const {listen}=await import('@tauri-apps/api/event');
  const off=await listen<{phase:string;downloaded?:number;total?:number|null}>('update-progress',e=>{if(e.payload.phase==='downloading')onBytes(e.payload.downloaded??0,e.payload.total??null);else if(e.payload.phase==='installing')onInstalling();});
  try{return await invoke<boolean>('install_channel_update',{channel,expectedVersion:version});}finally{off();}},
 async relaunch(){const {relaunch}=await import('@tauri-apps/plugin-process');await relaunch();}});
export const installSignedUpdate=(onProgress:(p:UpdateProgress)=>void,channel:UpdateChannel,current:string)=>runSignedUpdate(tauriBackend(),channel,current,onProgress);
