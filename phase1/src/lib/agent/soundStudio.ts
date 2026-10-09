import type {DocumentAdapter,DocumentSnapshot} from './documentCore';
import {AgentToolRegistry,type AgentToolSpec} from './toolRegistry';
import {DEFAULT_SETTINGS,LIMITS,sanitizeSettings,type SoundSettings} from '../sound/recipe';
import type {SoundPlugin} from '../sound/protocol';
/** Native AI for the Sound Studio. The "document" is the edit settings as JSON: the model never sees or writes audio bytes. */
const MAX_TEXT=16*1024;
const KEYS=['trim','reverse','pitch','region','effect','fadeInMs','fadeOutMs','normalize'];
export function serializeSound(s:SoundSettings):string{return JSON.stringify(sanitizeSettings(s),null,1);}
/** Parses and checks proposed settings text. Unknown keys, out-of-range numbers and malformed shapes are rejected, not silently fixed. */
export function parseSound(text:string,plugins:readonly SoundPlugin[]=[],duration=Infinity):SoundSettings{
 if(text.length>MAX_TEXT)throw Error('Sound settings exceed the size limit.');
 let raw:unknown;try{raw=JSON.parse(text);}catch{throw Error('Sound settings are not valid JSON.');}
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Sound settings must be an object.');
 const o=raw as Record<string,unknown>;
 for(const k of Object.keys(o))if(!KEYS.includes(k))throw Error(`Unknown sound setting: ${k}`);
 const merged={...DEFAULT_SETTINGS,...o} as SoundSettings;
 const num=(n:unknown,lo:number,hi:number,what:string)=>{if(typeof n!=='number'||!Number.isFinite(n)||n<lo||n>hi)throw Error(`${what} must be a number within ${lo}..${hi}.`);};
 num(merged.pitch,LIMITS.pitch[0],LIMITS.pitch[1],'pitch');num(merged.fadeInMs,LIMITS.fadeMs[0],LIMITS.fadeMs[1],'fadeInMs');num(merged.fadeOutMs,LIMITS.fadeMs[0],LIMITS.fadeMs[1],'fadeOutMs');
 if(merged.trim)num(merged.trim.db,LIMITS.trimDb[0],LIMITS.trimDb[1],'trim.db');
 if(merged.normalize)num(merged.normalize.db,LIMITS.normalizeDb[0],LIMITS.normalizeDb[1],'normalize.db');
 if(merged.region){const r=merged.region;if(!['crop','cut','only'].includes(r.mode))throw Error('region.mode must be crop, cut or only.');num(r.start,0,duration,'region.start');num(r.end,0,duration,'region.end');if(r.end-r.start<0.01)throw Error('region must be at least 10 ms long.');}
 const e=merged.effect;
 if(e.id){
  const p=plugins.find(x=>x.id===e.id);if(plugins.length&&!p)throw Error(`Unknown effect: ${e.id}`);
  for(const [k,v] of Object.entries(e.params??{})){
   const info=p?.params?.find(x=>x.id===k);if(p&&!info)throw Error(`Effect ${e.id} has no parameter ${k}.`);
   if(typeof v!=='number'||!Number.isFinite(v)||(info&&(v<info.min||v>info.max)))throw Error(`Effect parameter ${k} is out of range.`);
  }
 } else if(Object.keys(e.params??{}).length)throw Error('Effect parameters need an effect.');
 return sanitizeSettings(merged);
}
export const soundAdapter:DocumentAdapter={id:'sound-settings-v1',kind:'sound',validate(text){parseSound(text);}};
export interface SoundToolHost{
 snapshot():DocumentSnapshot;
 /** What the engine reported for the clip and the current render. No audio data. */
 info():{name:string;duration_s:number;sample_rate:number;channels:number;rendered:{duration_s:number;peak_db:number;rms_db:number;steps:string[]}|null}|null;
 plugins():readonly SoundPlugin[];
 /** Stages a full settings text for review. */
 propose(after:string):void;
}
const object=(properties:Record<string,unknown>,required:string[]=[])=>({type:'object',properties,required,additionalProperties:false});
export function createSoundStudioRegistry(host:SoundToolHost):AgentToolRegistry{
 const snap=()=>{const s=host.snapshot();if(s.ref.studioKind!=='sound'||!s.ref.adapter)throw Error('Unsupported studio.');return s;};
 const spec=(name:string,level:'read'|'propose',description:string,properties:Record<string,unknown>,required:string[],run:AgentToolSpec['run']):AgentToolSpec=>({level,definition:{name,description,parameters:object(properties,required)},run:async(a,c,sig)=>{sig.throwIfAborted();if(Object.keys(a).some(k=>!Object.hasOwn(properties,k)))throw Error('Unexpected Sound arguments.');return run(a,c,sig);}});
 return new AgentToolRegistry()
  .register(spec('sound_inspect','read','Inspect the open audio clip: duration, sample rate, channels, current edit settings, last render stats and the available effects with parameter ranges. Never returns audio data.',{},[],async()=>{
   const s=snap(),i=host.info();if(!i)throw Error('Audio is still loading.');
   return JSON.stringify({document:s.ref,clip:{name:i.name,duration_s:i.duration_s,sample_rate:i.sample_rate,channels:i.channels},settings:JSON.parse(s.text),render:i.rendered,limits:{pitch_semitones:LIMITS.pitch,fade_ms:LIMITS.fadeMs,trim_db:LIMITS.trimDb,normalize_db:LIMITS.normalizeDb},effects:host.plugins().map(p=>({id:p.id,name:p.name,params:(p.params??[]).map(x=>({id:x.id,name:x.name,min:x.min,max:x.max,default:x.default,unit:x.unit,choices:x.choices}))}))});
  }))
  .register(spec('sound_propose_settings','propose','Stage new edit settings (a JSON object with any of: trim, reverse, pitch, region, effect, fadeInMs, fadeOutMs, normalize) for the user to review. Keys you omit keep their current value. Never applies or saves; the original file is never changed.',{settings:{type:'object',description:'Partial settings, same shape as sound_inspect settings.'}},['settings'],async a=>{
   const s=snap(),i=host.info();if(!i)throw Error('Audio is still loading.');
   if(!a.settings||typeof a.settings!=='object'||Array.isArray(a.settings))throw Error('settings must be an object.');
   const after=serializeSound(parseSound(JSON.stringify({...JSON.parse(s.text),...(a.settings as object)}),host.plugins(),i.duration_s));
   if(after===s.text)throw Error('Proposal makes no change.');
   host.propose(after);return 'Staged for review. Nothing is applied until the user accepts.';
  }));
}
