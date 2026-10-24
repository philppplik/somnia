/**
 * The overlay track: titles and images placed ON TOP of the running video (lower thirds, watermarks), each at an
 * explicit `at` time with its own duration and frame rect. Unlike the gap-free edit list, overlays may overlap;
 * array order is the z-order (later = on top). Pure model - no DOM, no engine. Video overlays (PiP) play a source
 * video inside their rect starting at `in_s`; the export mixes their source audio at full volume over the visible span.
 */
import {MAX_GAIN,MIN_CLIP_SECONDS} from './timeline';
import {clampTitleSeconds,DEFAULT_TITLE,sanitizeTitleSpec,type TitleSpec} from './titles';
import {sanitizeKeys,valueAt,lerpNumber,type Key} from './keyframes';

/** Placement inside the output frame as fractions (0..1); x+w and y+h never exceed 1 after sanitation. */
export interface OverlayRect{x:number;y:number;w:number;h:number}

export interface OverlayClip{
 id:string;
 kind:'title'|'image'|'video';
 /** Media file name; '' for titles. Required for image and video overlays. */
 source:string;
 /** Title overlays carry their spec; image overlays leave it undefined. */
 title?:TitleSpec;
 /** Timeline seconds where the overlay appears. Free placement, overlaps allowed. */
 at:number;
 /** Seconds the overlay stays visible. */
 duration:number;
 /** Video overlays: source second the visible span starts at. Unused by titles and images (always 0). */
 in_s:number;
 rect:OverlayRect;
 /** 0..1, multiplied over the frame. */
 opacity:number;
 /** Animated frame rect: keys in overlay-local seconds (0 = appearance). Absent = static rect. */
 rectKeys?:Key<OverlayRect>[];
 /** Animated opacity 0..1: keys in overlay-local seconds. Absent = static opacity. */
 opacityKeys?:Key<number>[];
 /** Video overlays: audio gain 0..MAX_GAIN (0 mutes the PiP sound). Unused by titles and images (always 1). */
 gain:number;
}

export const DEFAULT_OVERLAY_SECONDS=3;
/** Lower third: the default placement for a new title overlay. */
export const LOWER_THIRD:OverlayRect={x:0.05,y:0.72,w:0.6,h:0.23};
/** Centered half-frame: the default placement for a new image overlay. */
export const CENTER_OVERLAY:OverlayRect={x:0.25,y:0.25,w:0.5,h:0.5};
/** Bottom-right corner, about a third of the frame: the classic picture-in-picture placement. */
export const PIP_OVERLAY:OverlayRect={x:0.66,y:0.66,w:0.32,h:0.32};

const frac=(v:unknown,fb:number)=>typeof v==='number'&&Number.isFinite(v)?Math.min(1,Math.max(0,v)):fb;

/** Clamps a rect into the frame: position 0..1, size 0.01..1, and never sticking out past the right/bottom edge. */
export const sanitizeRect=(r:Partial<OverlayRect>|null|undefined,fb:OverlayRect=LOWER_THIRD):OverlayRect=>{
 const x=frac(r?.x,fb.x),y=frac(r?.y,fb.y);
 const w=Math.min(1-x,Math.max(0.01,frac(r?.w,fb.w))),h=Math.min(1-y,Math.max(0.01,frac(r?.h,fb.h)));
 return{x:Number(x.toFixed(3)),y:Number(y.toFixed(3)),w:Number(w.toFixed(3)),h:Number(h.toFixed(3))};
};

let nextId=1;
export const newOverlayClipId=()=>`ovl-${nextId++}-${Math.random().toString(36).slice(2,7)}`;

export const newTitleOverlay=(spec:Partial<TitleSpec>={},at=0,duration=DEFAULT_OVERLAY_SECONDS):OverlayClip=>({id:newOverlayClipId(),kind:'title',source:'',title:sanitizeTitleSpec(spec),at:Math.max(0,at),duration:clampTitleSeconds(duration),in_s:0,rect:{...LOWER_THIRD},opacity:1,gain:1});
export const newImageOverlay=(source:string,at=0,duration=DEFAULT_OVERLAY_SECONDS):OverlayClip=>({id:newOverlayClipId(),kind:'image',source,at:Math.max(0,at),duration:clampTitleSeconds(duration),in_s:0,rect:{...CENTER_OVERLAY},opacity:1,gain:1});
export const newVideoOverlay=(source:string,at=0,duration=DEFAULT_OVERLAY_SECONDS):OverlayClip=>({id:newOverlayClipId(),kind:'video',source,at:Math.max(0,at),duration:clampTitleSeconds(duration),in_s:0,rect:{...PIP_OVERLAY},opacity:1,gain:1});

/** Normalizes one overlay: title specs sanitized, image overlays never carry one; rect and opacity clamped. */
export function sanitizeOverlay(c:OverlayClip):OverlayClip{
 const base:OverlayClip={...c,at:Math.max(0,Number.isFinite(c.at)?c.at:0),duration:clampTitleSeconds(c.duration),in_s:Math.max(0,typeof c.in_s==='number'&&Number.isFinite(c.in_s)?c.in_s:0),rect:sanitizeRect(c.rect),opacity:Math.min(1,Math.max(0,typeof c.opacity==='number'&&Number.isFinite(c.opacity)?c.opacity:1)),gain:Math.min(MAX_GAIN,Math.max(0,typeof c.gain==='number'&&Number.isFinite(c.gain)?c.gain:1))};
 const rectKeys=sanitizeKeys(c.rectKeys,base.duration,v=>v&&typeof v==='object'?sanitizeRect(v as Partial<OverlayRect>):null);
 const opacityKeys=sanitizeKeys(c.opacityKeys,base.duration,v=>typeof v==='number'&&Number.isFinite(v)?Math.min(1,Math.max(0,v)):null);
 if(rectKeys&&rectKeys.length>1)base.rectKeys=rectKeys;else delete base.rectKeys;
 if(opacityKeys&&opacityKeys.length>1)base.opacityKeys=opacityKeys;else delete base.opacityKeys;
 if(base.kind==='title')base.title=sanitizeTitleSpec(base.title??DEFAULT_TITLE);
 else delete base.title;
 return base;
}

export const sanitizeOverlayClips=(clips:OverlayClip[]):OverlayClip[]=>clips.map(sanitizeOverlay);

/** The timeline second where the last overlay disappears; 0 when empty. */
export const overlayTrackEnd=(clips:OverlayClip[])=>clips.reduce((end,c)=>Math.max(end,c.at+c.duration),0);

/** Overlays visible at timeline second `t`, in z-order (array order). */
export const overlaysAt=(clips:OverlayClip[],t:number)=>clips.filter(c=>t>=c.at&&t<c.at+c.duration);

export const overlayTitleOf=(c:OverlayClip):Required<TitleSpec>|null=>c.kind==='title'?sanitizeTitleSpec(c.title??DEFAULT_TITLE):null;

/** Source second a video overlay shows at timeline second `t`. */
export const overlaySourceTime=(c:OverlayClip,t:number)=>c.in_s+Math.max(0,t-c.at);

/** The overlay's frame rect at timeline second `t`: animated when rect keys exist, else the static rect. */
export const overlayRectAt=(c:OverlayClip,t:number)=>valueAt(c.rectKeys,t-c.at,(a,b,p)=>({x:lerpNumber(a.x,b.x,p),y:lerpNumber(a.y,b.y,p),w:lerpNumber(a.w,b.w,p),h:lerpNumber(a.h,b.h,p)}),c.rect);
/** The overlay's opacity at timeline second `t`: animated when opacity keys exist, else the static value. */
export const overlayOpacityAt=(c:OverlayClip,t:number)=>valueAt(c.opacityKeys,t-c.at,lerpNumber,c.opacity);
