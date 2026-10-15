/**
 * Versioned `.video-project` files: the edit list of a video project as JSON, so a timeline survives save/open.
 * Honest scope: the file stores clip REFERENCES by media name, not media bytes. Sources that are not open show as missing.
 * Pure - no DOM, no engine.
 */
import {MIN_CLIP_SECONDS,newClipId,sanitizeClips,speedOf,type TimelineClip} from './timeline';
import {clampTitleSeconds,isTitleClip,sanitizeTitleSpec,type TitleSpec} from './titles';
import {sanitizeAudioClips,type AudioClip} from './audioTrack';
import {DEFAULT_FORMAT,type VideoFormat} from './recipe';

export const VIDEO_PROJECT_EXT='.video-project';
export const VIDEO_PROJECT_MIME='application/x-somnia-video-project';
export const VIDEO_PROJECT_VERSION=2;
/** Versions this build reads: 1 (clips only) and 2 (+ audio track). */
export const VIDEO_PROJECT_READ_VERSIONS=[1,2];

interface VideoProjectFile{version:number;app:'somnia-video';format?:VideoFormat;clips:unknown[];audio?:unknown[]}

/** Stable identity of the edit list for dirty tracking. Ids are included: a split changes them, and that IS an edit. */
export const clipsSignature=(clips:TimelineClip[],audioClips:AudioClip[]=[])=>JSON.stringify([
 clips.map(c=>[c.id,c.source,c.in_s,c.out_s,c.gain,c.muted,c.crossfade_s??0,speedOf(c),c.kind??'media',isTitleClip(c)?c.title:null]),
 audioClips.map(c=>[c.id,c.source,c.in_s,c.out_s,c.at,c.gain,c.muted,c.duck,c.fadeIn,c.fadeOut]),
]);

/** The project file for one timeline. Deterministic (same timeline → same bytes), so tests and diffs stay readable. */
export function serializeVideoProject(clips:TimelineClip[],audioClips:AudioClip[],format:VideoFormat):string{
 const file:VideoProjectFile={version:VIDEO_PROJECT_VERSION,app:'somnia-video',format,clips:clips.map(c=>
  isTitleClip(c)
   ?{id:c.id,kind:'title',out_s:c.out_s,crossfade_s:c.crossfade_s??0,title:c.title}
   :c.kind==='image'
   ?{id:c.id,kind:'image',source:c.source,out_s:c.out_s,crossfade_s:c.crossfade_s??0}
   :{id:c.id,kind:'media',source:c.source,in_s:c.in_s,out_s:c.out_s,gain:c.gain,muted:c.muted,speed:speedOf(c),crossfade_s:c.crossfade_s??0}),
  audio:audioClips.map(c=>({id:c.id,source:c.source,in_s:c.in_s,out_s:c.out_s,at:c.at,gain:c.gain,muted:c.muted,duck:c.duck,fadeIn:c.fadeIn,fadeOut:c.fadeOut}))};
 return JSON.stringify(file,null,1)+'\n';
}

const num=(v:unknown,fb=0)=>typeof v==='number'&&Number.isFinite(v)?v:fb;

/** Parses a project file. Throws with a clear message on junk, foreign JSON and unsupported versions; tolerates extra fields. */
export function parseVideoProject(text:string):{clips:TimelineClip[];audioClips:AudioClip[];format:VideoFormat}{
 let raw:unknown;
 try{raw=JSON.parse(text);}catch{throw new Error('This is not a JSON file.');}
 const f=raw as Partial<VideoProjectFile>|null;
 if(!f||typeof f!=='object'||f.app!=='somnia-video')throw new Error('This is not a Somnia video project.');
 if(typeof f.version!=='number'||!VIDEO_PROJECT_READ_VERSIONS.includes(f.version))throw new Error(`Project version ${String(f.version)} is not supported (this build reads ${VIDEO_PROJECT_READ_VERSIONS.join(' and ')}).`);
 if(!Array.isArray(f.clips))throw new Error('The project has no clip list.');
 const seen=new Set<string>();
 const id=(v:unknown)=>{if(typeof v==='string'&&v&&!seen.has(v)){seen.add(v);return v;}const n=newClipId();seen.add(n);return n;};
 const clips=f.clips.flatMap((c):TimelineClip[]=>{
  if(!c||typeof c!=='object')return[];
  const o=c as Record<string,unknown>;
  if(o.kind==='title'){
   return[{id:id(o.id),kind:'title' as const,source:'',in_s:0,out_s:clampTitleSeconds(num(o.out_s,3)),gain:1,muted:false,crossfade_s:num(o.crossfade_s),title:sanitizeTitleSpec(o.title as Partial<TitleSpec>)}];
  }
  if(typeof o.source!=='string'||!o.source)return[];
  if(o.kind==='image')return[{id:id(o.id),kind:'image' as const,source:o.source,in_s:0,out_s:clampTitleSeconds(num(o.out_s,3)),gain:1,muted:false,crossfade_s:num(o.crossfade_s)}];
  const in_s=Math.max(0,num(o.in_s)),out_s=num(o.out_s);
  if(out_s-in_s<MIN_CLIP_SECONDS)return[];
  return[{id:id(o.id),source:o.source,in_s,out_s,gain:num(o.gain,1),muted:o.muted===true,speed:num(o.speed,1),crossfade_s:num(o.crossfade_s)}];
 });
 const audioClips=(Array.isArray(f.audio)?f.audio:[]).flatMap((c):AudioClip[]=>{
  if(!c||typeof c!=='object')return[];
  const o=c as Record<string,unknown>;
  if(typeof o.source!=='string'||!o.source)return[];
  return[{id:id(o.id),source:o.source,in_s:num(o.in_s),out_s:num(o.out_s),at:num(o.at),gain:num(o.gain,1),muted:o.muted===true,duck:num(o.duck),fadeIn:num(o.fadeIn),fadeOut:num(o.fadeOut)}];
 });
 // Durations are unknown here (sources may not be open); sanitize still clamps fades and title shapes. Clips re-clamp on the next edit once sources are probed.
 return{clips:sanitizeClips(clips,{}),audioClips:sanitizeAudioClips(audioClips,{}),format:f.format==='mp4'||f.format==='webm'?f.format:DEFAULT_FORMAT};
}

/** The download name for a project's save: keeps `<name>.video-project`, maps a bare video file to `<base>.video-project`. */
export function projectFileName(root:string){
 const base=root.replace(/^.*[\\/]/,'');
 return base.toLowerCase().endsWith(VIDEO_PROJECT_EXT)?base:base.replace(/\.[^.]+$/,'')+VIDEO_PROJECT_EXT;
}
