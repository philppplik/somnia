/**
 * Versioned `.video-project` files: the edit list of a video project as JSON, so a timeline survives save/open.
 * Honest scope: the file stores clip REFERENCES by media name, not media bytes. Sources that are not open show as missing.
 * Pure - no DOM, no engine.
 */
import {newOverlayClipId,overlayTrackEnd,sanitizeOverlay,sanitizeOverlayClips,type OverlayClip} from './overlayTrack';
import {colorOf,hasColor} from './colorAdjust';
import {sanitizeMarkers,type TimelineMarker} from './markers';
import {CLIP_FLIPS,CLIP_ROTATIONS,CLIP_TRANSITIONS,transitionOf,cropOf,fadeInOf,fadeOutOf,hasCrop,isReversed,MIN_CLIP_SECONDS,newClipId,rotationOf,sanitizeClips,speedOf,type ClipFlip,type ClipRotation,type ClipTransition,type TimelineClip} from './timeline';
import {clampTitleSeconds,isTitleClip,sanitizeTitleSpec,type TitleSpec} from './titles';
import {sanitizeAudioClips,type AudioClip} from './audioTrack';
import {DEFAULT_EXPORT_OPTIONS,DEFAULT_FORMAT,sanitizeExportOptions,type VideoExportOptions,type VideoFormat} from './recipe';

export const VIDEO_PROJECT_EXT='.video-project';
export const VIDEO_PROJECT_MIME='application/x-somnia-video-project';
export const VIDEO_PROJECT_VERSION=3;
/** Versions this build reads: 1 (clips only) and 2 (+ audio track). */
export const VIDEO_PROJECT_READ_VERSIONS=[1,2,3];

interface VideoProjectFile{version:number;app:'somnia-video';format?:VideoFormat;scale?:number;quality?:string;fps?:number|null;aspect?:string;clips:unknown[];audio?:unknown[];overlay?:unknown[]}

/** Stable identity of the edit list for dirty tracking. Ids are included: a split changes them, and that IS an edit. */
export const clipsSignature=(clips:TimelineClip[],audioClips:AudioClip[]=[],overlayClips:OverlayClip[]=[],markers:TimelineMarker[]=[])=>JSON.stringify([
 markers.map(m=>[m.id,m.at,m.label]),
 clips.map(c=>[c.id,c.source,c.in_s,c.out_s,c.gain,c.muted,c.crossfade_s??0,speedOf(c),c.kind??'media',isTitleClip(c)?c.title:null,c.flip??'none',fadeInOf(c),fadeOutOf(c),c.freeze??null,rotationOf(c),transitionOf(c),isReversed(c),hasCrop(c)?cropOf(c):null,c.cropKeys??null,c.gainKeys??null,hasColor(c)?colorOf(c):null,c.picFadeIn??null,c.picFadeOut??null]),
 audioClips.map(c=>[c.id,c.source,c.in_s,c.out_s,c.at,c.gain,c.muted,c.duck,c.fadeIn,c.fadeOut]),
 overlayClips.map(c=>[c.id,c.kind,c.source,c.at,c.duration,c.in_s,c.rect,c.opacity,c.gain,c.title??null,c.rectKeys??null,c.opacityKeys??null]),
]);

/** The project file for one timeline. Deterministic (same timeline → same bytes), so tests and diffs stay readable. */
export function serializeVideoProject(clips:TimelineClip[],audioClips:AudioClip[],format:VideoFormat,exportOptions:VideoExportOptions=DEFAULT_EXPORT_OPTIONS,overlayClips:OverlayClip[]=[],markers:TimelineMarker[]=[]):string{
 const file:VideoProjectFile={version:VIDEO_PROJECT_VERSION,app:'somnia-video',format,scale:exportOptions.scale,quality:exportOptions.quality,fps:exportOptions.fps,...(exportOptions.aspect!=='source'?{aspect:exportOptions.aspect}:{}),clips:clips.map(c=>
  isTitleClip(c)
   ?{id:c.id,kind:'title',out_s:c.out_s,crossfade_s:c.crossfade_s??0,...(transitionOf(c)!=='dissolve'?{transition:transitionOf(c)}:{}),title:c.title}
   :c.kind==='image'
   ?{id:c.id,kind:'image',source:c.source,out_s:c.out_s,crossfade_s:c.crossfade_s??0,...(transitionOf(c)!=='dissolve'?{transition:transitionOf(c)}:{}),...(c.flip?{flip:c.flip}:{}),...(rotationOf(c)!==0?{rotation:rotationOf(c)}:{}),...(hasCrop(c)?{crop:cropOf(c)}:{}),...(c.cropKeys?.length?{cropKeys:c.cropKeys}:{}),...(hasColor(c)?{color:colorOf(c)}:{}),...(c.picFadeIn?{picFadeIn:c.picFadeIn}:{}),...(c.picFadeOut?{picFadeOut:c.picFadeOut}:{})}
   :{id:c.id,kind:'media',source:c.source,in_s:c.in_s,out_s:c.out_s,gain:c.gain,muted:c.muted,speed:speedOf(c),crossfade_s:c.crossfade_s??0,...(transitionOf(c)!=='dissolve'?{transition:transitionOf(c)}:{}),...(c.flip?{flip:c.flip}:{}),...(fadeInOf(c)>0?{fadeIn:fadeInOf(c)}:{}),...(fadeOutOf(c)>0?{fadeOut:fadeOutOf(c)}:{}),...(typeof c.freeze==='number'?{freeze:c.freeze}:{}),...(rotationOf(c)!==0?{rotation:rotationOf(c)}:{}),...(hasCrop(c)?{crop:cropOf(c)}:{}),...(isReversed(c)?{reversed:true}:{}),...(c.gainKeys?.length?{gainKeys:c.gainKeys}:{}),...(hasColor(c)?{color:colorOf(c)}:{}),...(c.picFadeIn?{picFadeIn:c.picFadeIn}:{}),...(c.picFadeOut?{picFadeOut:c.picFadeOut}:{})}),
  audio:audioClips.map(c=>({id:c.id,source:c.source,in_s:c.in_s,out_s:c.out_s,at:c.at,gain:c.gain,muted:c.muted,duck:c.duck,fadeIn:c.fadeIn,fadeOut:c.fadeOut})),...(markers.length?{markers:markers.map(m=>({id:m.id,at:m.at,label:m.label}))}:{}),...(overlayClips.length?{overlay:overlayClips.map(c=>({id:c.id,kind:c.kind,source:c.source,at:c.at,duration:c.duration,rect:c.rect,opacity:c.opacity,...(c.in_s>0?{in_s:c.in_s}:{}),...(c.gain!==1?{gain:c.gain}:{}),...(c.kind==='title'?{title:c.title}:{}),...(c.rectKeys?.length?{rectKeys:c.rectKeys}:{}),...(c.opacityKeys?.length?{opacityKeys:c.opacityKeys}:{})}))}:{})};
 return JSON.stringify(file,null,1)+'\n';
}

const num=(v:unknown,fb=0)=>typeof v==='number'&&Number.isFinite(v)?v:fb;

/** Parses a project file. Throws with a clear message on junk, foreign JSON and unsupported versions; tolerates extra fields. */
export function parseVideoProject(text:string):{clips:TimelineClip[];audioClips:AudioClip[];overlayClips:OverlayClip[];format:VideoFormat;exportOptions:VideoExportOptions;markers:TimelineMarker[]}{
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
   return[{id:id(o.id),kind:'title' as const,source:'',in_s:0,out_s:clampTitleSeconds(num(o.out_s,3)),gain:1,muted:false,crossfade_s:num(o.crossfade_s),...(CLIP_TRANSITIONS.includes(o.transition as ClipTransition)&&o.transition!=='dissolve'?{transition:o.transition as ClipTransition}:{}),title:sanitizeTitleSpec(o.title as Partial<TitleSpec>)}];
  }
  if(typeof o.source!=='string'||!o.source)return[];
  if(o.kind==='image')return[{id:id(o.id),kind:'image' as const,source:o.source,in_s:0,out_s:clampTitleSeconds(num(o.out_s,3)),gain:1,muted:false,crossfade_s:num(o.crossfade_s),...(Array.isArray(o.cropKeys)?{cropKeys:o.cropKeys as TimelineClip['cropKeys']}:{}),...(CLIP_TRANSITIONS.includes(o.transition as ClipTransition)&&o.transition!=='dissolve'?{transition:o.transition as ClipTransition}:{}),...(CLIP_FLIPS.includes(o.flip as ClipFlip)&&o.flip!=='none'?{flip:o.flip as ClipFlip}:{}),...(CLIP_ROTATIONS.includes(o.rotation as ClipRotation)&&o.rotation!==0?{rotation:o.rotation as ClipRotation}:{}),...(()=>{const cr=cropOf({crop:o.crop} as TimelineClip);return cr.left||cr.top||cr.right||cr.bottom?{crop:cr}:{};})(),...(hasColor({color:o.color as never})?{color:colorOf({color:o.color as never})}:{}),...(typeof o.picFadeIn==='number'&&o.picFadeIn>0?{picFadeIn:o.picFadeIn}:{}),...(typeof o.picFadeOut==='number'&&o.picFadeOut>0?{picFadeOut:o.picFadeOut}:{})}];
  const in_s=Math.max(0,num(o.in_s)),out_s=num(o.out_s);
  if(out_s-in_s<MIN_CLIP_SECONDS)return[];
  return[{id:id(o.id),source:o.source,in_s,out_s,gain:num(o.gain,1),muted:o.muted===true,speed:num(o.speed,1),crossfade_s:num(o.crossfade_s),...(CLIP_TRANSITIONS.includes(o.transition as ClipTransition)&&o.transition!=='dissolve'?{transition:o.transition as ClipTransition}:{}),...(CLIP_FLIPS.includes(o.flip as ClipFlip)&&o.flip!=='none'?{flip:o.flip as ClipFlip}:{}),...(num(o.fadeIn)>0?{fadeIn:num(o.fadeIn)}:{}),...(num(o.fadeOut)>0?{fadeOut:num(o.fadeOut)}:{}),...(typeof o.freeze==='number'&&Number.isFinite(o.freeze)?{freeze:o.freeze}:{}),...(o.reversed===true?{reversed:true}:{}),...(Array.isArray(o.gainKeys)?{gainKeys:o.gainKeys as TimelineClip['gainKeys']}:{}),...(CLIP_ROTATIONS.includes(o.rotation as ClipRotation)&&o.rotation!==0?{rotation:o.rotation as ClipRotation}:{}),...(()=>{const cr=cropOf({crop:o.crop} as TimelineClip);return cr.left||cr.top||cr.right||cr.bottom?{crop:cr}:{};})(),...(hasColor({color:o.color as never})?{color:colorOf({color:o.color as never})}:{}),...(typeof o.picFadeIn==='number'&&o.picFadeIn>0?{picFadeIn:o.picFadeIn}:{}),...(typeof o.picFadeOut==='number'&&o.picFadeOut>0?{picFadeOut:o.picFadeOut}:{})}];
 });
 const audioClips=(Array.isArray(f.audio)?f.audio:[]).flatMap((c):AudioClip[]=>{
  if(!c||typeof c!=='object')return[];
  const o=c as Record<string,unknown>;
  if(typeof o.source!=='string'||!o.source)return[];
  return[{id:id(o.id),source:o.source,in_s:num(o.in_s),out_s:num(o.out_s),at:num(o.at),gain:num(o.gain,1),muted:o.muted===true,duck:num(o.duck),fadeIn:num(o.fadeIn),fadeOut:num(o.fadeOut)}];
 });
 const overlayClips=(Array.isArray(f.overlay)?f.overlay:[]).flatMap((c):OverlayClip[]=>{
  if(!c||typeof c!=='object')return[];
  const o=c as Record<string,unknown>;
  if(o.kind!=='title'&&o.kind!=='image'&&o.kind!=='video')return[];
  if(o.kind!=='title'&&(typeof o.source!=='string'||!o.source))return[];
  return[sanitizeOverlay({id:typeof o.id==='string'&&o.id?o.id:newOverlayClipId(),kind:o.kind,source:typeof o.source==='string'?o.source:'',title:o.title as OverlayClip['title'],at:num(o.at),duration:num(o.duration,3),in_s:num(o.in_s),rect:o.rect as OverlayClip['rect'],opacity:num(o.opacity,1),gain:num(o.gain,1),...(Array.isArray(o.rectKeys)?{rectKeys:o.rectKeys as OverlayClip['rectKeys']}:{}),...(Array.isArray(o.opacityKeys)?{opacityKeys:o.opacityKeys as OverlayClip['opacityKeys']}:{}),})];
 });
 // Durations are unknown here (sources may not be open); sanitize still clamps fades and title shapes. Clips re-clamp on the next edit once sources are probed.
 return{markers:sanitizeMarkers(Array.isArray(f.markers)?f.markers as Partial<TimelineMarker>[]:undefined),clips:sanitizeClips(clips,{}),audioClips:sanitizeAudioClips(audioClips,{}),overlayClips:sanitizeOverlayClips(overlayClips),format:f.format==='mp4'||f.format==='webm'?f.format:DEFAULT_FORMAT,exportOptions:sanitizeExportOptions({scale:typeof f.scale==='number'?f.scale:undefined,quality:f.quality as VideoExportOptions['quality'],fps:typeof f.fps==='number'?f.fps:null,aspect:f.aspect as VideoExportOptions['aspect']})};
}

/** The download name for a project's save: keeps `<name>.video-project`, maps a bare video file to `<base>.video-project`. */
export function projectFileName(root:string){
 const base=root.replace(/^.*[\\/]/,'');
 return base.toLowerCase().endsWith(VIDEO_PROJECT_EXT)?base:base.replace(/\.[^.]+$/,'')+VIDEO_PROJECT_EXT;
}
