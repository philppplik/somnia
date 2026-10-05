/** One-click update through the Tauri updater plugin (signed releases only). Falls back to the release page when no signed update is available. */
export const canSelfUpdate=():boolean=>typeof window!=='undefined'&&'__TAURI_INTERNALS__' in window;
export type UpdateProgress={phase:'checking'}|{phase:'downloading';percent:number|null}|{phase:'installing'}|{phase:'restarting'};
/** Resolves true when an update was installed (the app restarts), false when no signed update exists for this build. Throws on download or signature errors. */
export async function installSignedUpdate(onProgress:(p:UpdateProgress)=>void):Promise<boolean>{
 onProgress({phase:'checking'});
 const {check}=await import('@tauri-apps/plugin-updater');const update=await check();if(!update)return false;
 let total=0,got=0;
 await update.downloadAndInstall(ev=>{if(ev.event==='Started'){total=ev.data.contentLength??0;onProgress({phase:'downloading',percent:total?0:null});}else if(ev.event==='Progress'){got+=ev.data.chunkLength;onProgress({phase:'downloading',percent:total?Math.min(100,Math.round(got/total*100)):null});}else onProgress({phase:'installing'});});
 onProgress({phase:'restarting'});const {relaunch}=await import('@tauri-apps/plugin-process');await relaunch();return true;}
