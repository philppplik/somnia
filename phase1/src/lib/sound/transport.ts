import {jobScheduler,type JobLease} from '../jobs/scheduler';
import {closeSound,getSoundSession,registerSoundSuspendHook,subscribeSound} from './session';
import {registerMediaCloseCleanup} from '../media';
/** Audio elements belong to the application, not the visible waveform. */
export interface SoundPlayback {time:number;playing:boolean;duration:number;}
interface Entry {audio:HTMLAudioElement;url:string;state:SoundPlayback;lease?:JobLease;starting:boolean;generation:number;dispose:()=>void;}
const entries=new Map<string,Entry>();const listeners=new Set<()=>void>();
const empty:SoundPlayback={time:0,playing:false,duration:0};
const emit=()=>{for(const f of listeners)f();};
export const subscribeSoundPlayback=(f:()=>void)=>{listeners.add(f);return()=>{listeners.delete(f);};};
export const getSoundPlayback=(name:string)=>entries.get(name)?.state??empty;
function ensure(name:string){
 let entry=entries.get(name);if(entry)return entry;
 const audio=new Audio();audio.preload='metadata';
 entry={audio,url:'',state:{...empty},starting:false,generation:0,dispose:()=>{}};
 const e=entry;
 const release=()=>{e.lease?.release();e.lease=undefined;};
 const update=()=>{e.state={time:audio.currentTime||0,duration:Number.isFinite(audio.duration)?audio.duration:0,playing:!audio.paused};emit();};
 const pause=()=>{release();update();};
 const events:[string,()=>void][]=[['timeupdate',update],['loadedmetadata',update],['play',update],['pause',pause],['ended',pause],['error',pause]];
 for(const [event,fn]of events)audio.addEventListener(event,fn);
 e.dispose=()=>{e.generation++;audio.pause();release();for(const [event,fn]of events)audio.removeEventListener(event,fn);audio.removeAttribute('src');audio.load();};
 entries.set(name,e);return e;
}
function sync(name:string,e:Entry){
 const session=getSoundSession(name);const shown=session?.listen==='original'?session.original:session?.processed;
 if(!shown||shown.url===e.url)return;
 const time=e.audio.currentTime,playing=!e.audio.paused;e.url=shown.url;
 e.audio.src=shown.url;e.audio.load();
 e.audio.addEventListener('loadedmetadata',()=>{if(entries.get(name)!==e)return;e.audio.currentTime=Math.min(time,e.audio.duration||time);if(playing)void playSound(name).catch(()=>{});},{once:true});
}
subscribeSound(()=>{for(const [name,e]of entries)sync(name,e);});
export async function playSound(name:string){
 const e=ensure(name);sync(name,e);if(!e.url||e.starting)return;
 e.starting=true;const generation=++e.generation;
 try{
  const lease=e.lease??await jobScheduler.acquire({kind:'playback',priority:0,documentId:name,resources:['sound.playback:'+name]});
  if(entries.get(name)!==e||e.generation!==generation){lease.release('cancelled');return;}
  e.lease=lease;const stop=()=>pauseSound(name);lease.signal.addEventListener('abort',stop,{once:true});
  try{lease.signal.throwIfAborted();await e.audio.play();}catch(error){lease.release('failed');e.lease=undefined;throw error;}
 }finally{e.starting=false;}
}
export function pauseSound(name:string){const e=entries.get(name);if(!e)return;e.generation++;e.audio.pause();e.lease?.release();e.lease=undefined;e.state={...e.state,playing:false};emit();}
export function toggleSoundPlayback(name:string){const e=entries.get(name);if(e&&!e.audio.paused){pauseSound(name);return Promise.resolve();}return playSound(name);}
export function seekSound(name:string,seconds:number){const e=ensure(name);sync(name,e);e.audio.currentTime=Math.max(0,Math.min(seconds,Number.isFinite(e.audio.duration)?e.audio.duration:seconds));e.state={...e.state,time:e.audio.currentTime};emit();}
export function closeSoundPlayback(name:string){const e=entries.get(name);if(!e)return;e.dispose();entries.delete(name);emit();}
registerMediaCloseCleanup(name=>{closeSoundPlayback(name);closeSound(name);});
registerSoundSuspendHook(()=>{for(const n of [...entries.keys()])closeSoundPlayback(n);});
