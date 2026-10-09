import type {SoundRecipe} from './protocol';
/** User-facing settings. A step that is off adds nothing to the recipe, so "all off" is the untouched original. */
export interface SoundSettings{
 trim:{on:boolean;db:number};reverse:boolean;pitch:number;
 effect:{id:string;keepTail:boolean};fadeInMs:number;fadeOutMs:number;normalize:{on:boolean;db:number};
}
export const LIMITS={trimDb:[-80,-20],pitch:[-12,12],fadeMs:[0,5000],normalizeDb:[-12,0]} as const;
export const DEFAULT_SETTINGS:SoundSettings={trim:{on:false,db:-50},reverse:false,pitch:0,effect:{id:'',keepTail:true},fadeInMs:0,fadeOutMs:0,normalize:{on:false,db:-1}};
const clamp=(n:number,[lo,hi]:readonly [number,number])=>Number.isFinite(n)?Math.min(hi,Math.max(lo,n)):lo;
/** Clamps every number into its UI range; never trusts a stored or typed value. */
export function sanitizeSettings(s:SoundSettings):SoundSettings{
 return{
  trim:{on:!!s.trim.on,db:clamp(s.trim.db,LIMITS.trimDb)},reverse:!!s.reverse,pitch:Math.round(clamp(s.pitch,LIMITS.pitch)),
  effect:{id:typeof s.effect.id==='string'?s.effect.id:'',keepTail:!!s.effect.keepTail},
  fadeInMs:Math.round(clamp(s.fadeInMs,LIMITS.fadeMs)),fadeOutMs:Math.round(clamp(s.fadeOutMs,LIMITS.fadeMs)),
  normalize:{on:!!s.normalize.on,db:clamp(s.normalize.db,LIMITS.normalizeDb)}
 };
}
export function toRecipe(input:SoundSettings,columns=1200):SoundRecipe{
 const s=sanitizeSettings(input);const r:SoundRecipe={columns};
 if(s.trim.on)r.trim_silence_db=s.trim.db;
 if(s.reverse)r.reverse=true;
 if(s.pitch!==0)r.pitch_semitones=s.pitch;
 if(s.effect.id)r.plugin={id:s.effect.id,keep_tail:s.effect.keepTail};
 if(s.fadeInMs>0)r.fade_in_ms=s.fadeInMs;
 if(s.fadeOutMs>0)r.fade_out_ms=s.fadeOutMs;
 if(s.normalize.on)r.normalize_db=s.normalize.db;
 return r;
}
export const isNeutral=(s:SoundSettings)=>{const {columns:_c,...rest}=toRecipe(s);return Object.keys(rest).length===0;};
export function exportName(source:string,s:SoundSettings){const base=source.replace(/^.*[\\/]/,'').replace(/\.[^.]+$/,'')||'audio';return `${base}${isNeutral(s)?'':'-edited'}.wav`;}
