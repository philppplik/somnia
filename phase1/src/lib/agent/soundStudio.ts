import type {DocumentAdapter,DocumentSnapshot} from './documentCore';
import {AgentToolRegistry} from './toolRegistry';
import {CommandDispatcher} from '../commandDispatcher';
import type {CommandSpec,CommandSchema} from '../commandSpec';
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
const number=([minimum,maximum]:readonly [number,number])=>({type:'number',minimum,maximum});
/** Partial at the top level; nested settings replace the whole setting and must be complete. */
export const soundSettingsSchema:CommandSchema=object({
 trim:object({on:{type:'boolean'},db:number(LIMITS.trimDb)},['on','db']),
 reverse:{type:'boolean'},pitch:number(LIMITS.pitch),
 region:{anyOf:[{type:'null'},object({mode:{type:'string',enum:['crop','cut','only']},start:{type:'number',minimum:0},end:{type:'number',minimum:0}},['mode','start','end'])]},
 effect:object({id:{type:'string'},keepTail:{type:'boolean'},params:{type:'object',maxProperties:32,additionalProperties:{type:'number'}}},['id','keepTail','params']),
 fadeInMs:number(LIMITS.fadeMs),fadeOutMs:number(LIMITS.fadeMs),
 normalize:object({on:{type:'boolean'},db:number(LIMITS.normalizeDb)},['on','db']),
});
const inspectDescription='Inspect the open audio clip: duration, sample rate, channels, current edit settings, last render stats and the available effects with parameter ranges. Never returns audio data.';
const proposeDescription='Stage new edit settings (a JSON object with any of: trim, reverse, pitch, region, effect, fadeInMs, fadeOutMs, normalize) for the user to review. Keys you omit keep their current value. Never applies or saves; the original file is never changed.';

/**
 * The host is pinned to one document/revision by panelBridge. These specs must not be
 * registered globally: another concurrent agent run has a different host and consent scope.
 * There are no legacy Sound UI command registrations to mirror into the palette.
 */
export function createSoundCommandSpecs(host:SoundToolHost):readonly CommandSpec<Record<string,unknown>,string>[] {
 const snap=()=>{const s=host.snapshot();if(s.ref.studioKind!=='sound'||s.ref.adapter!==soundAdapter.id)throw Error('Unsupported studio.');return s;};
 return [
  {
   id:'sound.inspect',title:'Inspect audio clip',category:'Tools',level:'read',params:object({}),result:{type:'string'},
   run:()=>{
    // History: none. This command only reads the scoped clip metadata and settings.
    const s=snap(),i=host.info();if(!i)throw Error('Audio is still loading.');
    return JSON.stringify({document:s.ref,clip:{name:i.name,duration_s:i.duration_s,sample_rate:i.sample_rate,channels:i.channels},settings:JSON.parse(s.text),render:i.rendered,limits:{pitch_semitones:LIMITS.pitch,fade_ms:LIMITS.fadeMs,trim_db:LIMITS.trimDb,normalize_db:LIMITS.normalizeDb},effects:host.plugins().map(p=>({id:p.id,name:p.name,params:(p.params??[]).map(x=>({id:x.id,name:x.name,min:x.min,max:x.max,default:x.default,unit:x.unit,choices:x.choices}))}))});
   },
  },
  {
   id:'sound.proposeSettings',title:'Propose audio settings',category:'Tools',level:'propose',
   params:object({settings:{...soundSettingsSchema,description:'Partial settings, same shape as sound_inspect settings.'}},['settings']),result:{type:'string'},
   run:a=>{
    // History: none at proposal time. User acceptance owns the Sound workspace's
    // applySound/undoSound transaction stack; never edit session settings here.
    const s=snap(),i=host.info();if(!i)throw Error('Audio is still loading.');
    const after=serializeSound(parseSound(JSON.stringify({...JSON.parse(s.text),...(a.settings as object)}),host.plugins(),i.duration_s));
    if(after===s.text)throw Error('Proposal makes no change.');
    host.propose(after);return 'Staged for review. Nothing is applied until the user accepts.';
   },
  },
 ];
}

export function createSoundStudioRegistry(host:SoundToolHost):AgentToolRegistry{
 const dispatcher=new CommandDispatcher();
 const registry=new AgentToolRegistry();
 const tools=[{name:'sound_inspect',description:inspectDescription},{name:'sound_propose_settings',description:proposeDescription}];
 // Advertised parameters stay simple enough for the conservative local tool lint
 // (no anyOf, shallow nesting) so local models keep the propose tool. Execution
 // still validates the full settings schema through the command dispatcher.
 const advertised:Record<string,CommandSchema>={
  sound_inspect:object({}),
  sound_propose_settings:object({settings:{type:'object',description:'Partial settings, same shape as sound_inspect settings.'}},['settings']),
 };
 createSoundCommandSpecs(host).forEach((command,index)=>{
  dispatcher.register(command);
  registry.register({
   level:command.level as 'read'|'propose',
   definition:{...tools[index],parameters:advertised[tools[index].name]},
   run:async(args,_context,signal)=>{
    // Keep the existing unknown-top-level-key error while dispatcher validation also
    // protects direct command clients and validates all nested settings.
    const properties=command.params!.properties as Record<string,unknown>;
    if(Object.keys(args).some(k=>!Object.hasOwn(properties,k)))throw Error('Unexpected Sound arguments.');
    return dispatcher.runCommand<string>(command.id,args,{origin:'agent',signal});
   },
  });
 });
 return registry;
}
