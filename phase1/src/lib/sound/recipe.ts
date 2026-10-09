import type {SoundRecipe,SoundRegionMode} from './protocol';
/** User-facing settings. A step that is off adds nothing to the recipe, so "all off" is the untouched original. */
export interface SoundSettings{
 trim:{on:boolean;db:number};reverse:boolean;pitch:number;
 region:{mode:SoundRegionMode;start:number;end:number}|null;effect:{id:string;keepTail:boolean;params:Record<string,number>};fadeInMs:number;fadeOutMs:number;normalize:{on:boolean;db:number};
}
export const LIMITS={trimDb:[-80,-20],pitch:[-12,12],fadeMs:[0,5000],normalizeDb:[-12,0]} as const;
export const DEFAULT_SETTINGS:SoundSettings={trim:{on:false,db:-50},reverse:false,pitch:0,region:null,effect:{id:'',keepTail:true,params:{}},fadeInMs:0,fadeOutMs:0,normalize:{on:false,db:-1}};
const clamp=(n:number,[lo,hi]:readonly [number,number])=>Number.isFinite(n)?Math.min(hi,Math.max(lo,n)):lo;
/** Plugin parameters: finite numbers under string keys, at most 32. The engine clamps each value into its own range. */
function cleanParams(p:unknown):Record<string,number>{
 const out:Record<string,number>={};if(!p||typeof p!=='object')return out;
 for(const [k,v] of Object.entries(p as Record<string,unknown>).slice(0,32))if(typeof v==='number'&&Number.isFinite(v))out[k]=v;
 return out;
}
/** Clamps every number into its UI range; never trusts a stored or typed value. */
export function sanitizeSettings(s:SoundSettings):SoundSettings{
 return{
  trim:{on:!!s.trim.on,db:clamp(s.trim.db,LIMITS.trimDb)},reverse:!!s.reverse,pitch:Math.round(clamp(s.pitch,LIMITS.pitch)),
  region:s.region&&Number.isFinite(s.region.start)&&Number.isFinite(s.region.end)&&s.region.end-s.region.start>=0.01&&['crop','cut','only'].includes(s.region.mode)?{mode:s.region.mode,start:Math.max(0,s.region.start),end:s.region.end}:null,
  effect:{id:typeof s.effect.id==='string'?s.effect.id:'',keepTail:!!s.effect.keepTail,params:cleanParams(s.effect.params)},
  fadeInMs:Math.round(clamp(s.fadeInMs,LIMITS.fadeMs)),fadeOutMs:Math.round(clamp(s.fadeOutMs,LIMITS.fadeMs)),
  normalize:{on:!!s.normalize.on,db:clamp(s.normalize.db,LIMITS.normalizeDb)}
 };
}
export function toRecipe(input:SoundSettings,columns=1200):SoundRecipe{
 const s=sanitizeSettings(input);const r:SoundRecipe={columns};
 if(s.region)r.region={start_s:s.region.start,end_s:s.region.end,mode:s.region.mode};
 if(s.trim.on)r.trim_silence_db=s.trim.db;
 if(s.reverse)r.reverse=true;
 if(s.pitch!==0)r.pitch_semitones=s.pitch;
 if(s.effect.id){r.plugin={id:s.effect.id,keep_tail:s.effect.keepTail};if(Object.keys(s.effect.params).length)r.plugin.params={...s.effect.params};}
 if(s.fadeInMs>0)r.fade_in_ms=s.fadeInMs;
 if(s.fadeOutMs>0)r.fade_out_ms=s.fadeOutMs;
 if(s.normalize.on)r.normalize_db=s.normalize.db;
 return r;
}
export const isNeutral=(s:SoundSettings)=>{const {columns:_c,...rest}=toRecipe(s);return Object.keys(rest).length===0;};
export function exportName(source:string,s:SoundSettings){const base=source.replace(/^.*[\\/]/,'').replace(/\.[^.]+$/,'')||'audio';return `${base}${isNeutral(s)?'':'-edited'}.wav`;}
/** Seconds, 3 decimals, clamped into 0..duration with start before end; null when no usable selection remains. */
export function normalizeSelection(start:number,end:number,duration:number):{start:number;end:number}|null{
 if(!Number.isFinite(start)||!Number.isFinite(end)||!(duration>0))return null;
 const a=Math.min(duration,Math.max(0,Math.min(start,end))),b=Math.min(duration,Math.max(0,Math.max(start,end)));
 const r={start:Math.round(a*1000)/1000,end:Math.round(b*1000)/1000};return r.end-r.start>=0.01?r:null;
}
