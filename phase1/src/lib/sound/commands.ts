import {commandRegistry} from '../commandRegistry';
import {registerCommandSpec} from '../commandBridge';
import type {CommandSpec} from '../commandSpec';
import {getMedia,setActiveMedia} from '../media';
import {getSoundSession,updateSoundSettings,resetSoundSettings,setSoundSelection,applySoundRegion,clearSoundRegion,setSoundListen,saveSound,isSoundExportReady} from './session';
import type {SoundSettings} from './recipe';
import type {SoundRegionMode} from './protocol';
export interface SoundTransport {name:string;toggle():void;seek(seconds:number):void}
let transport:SoundTransport|null=null;
export function registerSoundTransport(next:SoundTransport){transport=next;return()=>{if(transport===next)transport=null;};}
export const activeSoundName=()=>{const m=getMedia();return m.items.find(i=>i.name===m.active&&i.kind==='audio')?.name??null;};
const session=()=>getSoundSession(activeSoundName());
const ready=()=>!!session()?.original;
const requireName=()=>{const n=activeSoundName();if(!n||!getSoundSession(n)?.original)throw Object.assign(new Error('Audio is not ready.'),{expected:true});return n;};
const object=(properties:Record<string,unknown>,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const num={type:'number'};
const bool={type:'boolean'};
const params={type:'object',additionalProperties:{type:'number'},maxProperties:32};
export const SOUND_SETTINGS_SCHEMA=object({trim:object({on:bool,db:num}),reverse:bool,pitch:num,region:{anyOf:[{type:'null'},object({mode:{enum:['crop','cut','only']},start:num,end:num})]},effect:object({id:{type:'string'},keepTail:bool,params}),fadeInMs:num,fadeOutMs:num,normalize:object({on:bool,db:num})});
/** Local interactive commands. They reuse the non-destructive Sound session and never alter source bytes. */
export function soundCommandSpecs():CommandSpec<unknown,unknown>[] {
 const add=<P,>(id:string,title:string,category:CommandSpec['category'],run:(p:P)=>unknown,schema:Record<string,unknown>=object({},[]),enabled=ready):CommandSpec<P,unknown>=>({id,title,category,level:'ui',keywords:['sound','audio'],params:schema,enabled,run});
 return [
  add<{name:string}>('sound.clip.activate','Activate audio clip','View',p=>{if(!getMedia().items.some(i=>i.name===p.name&&i.kind==='audio'))throw new Error('Unknown audio clip.');setActiveMedia(p.name);},object({name:{type:'string'}}),()=>getMedia().items.some(i=>i.kind==='audio')),
  add<{settings:SoundSettings}>('sound.settings.set','Change audio processing settings','Tools',p=>updateSoundSettings(requireName(),()=>p.settings),object({settings:SOUND_SETTINGS_SCHEMA})),
  add('sound.settings.reset','Reset audio processing','Edit',()=>resetSoundSettings(requireName())),
  add<{start:number;end:number}>('sound.selection.set','Set audio selection','Edit',p=>setSoundSelection(requireName(),p),object({start:num,end:num})),
  add('sound.selection.all','Select entire audio clip','Edit',()=>setSoundSelection(requireName(),{start:0,end:session()!.original!.report.input.duration_s})),
  add('sound.selection.clear','Clear audio selection','Edit',()=>setSoundSelection(requireName(),null)),
  add<{mode:SoundRegionMode}>('sound.region.apply','Apply selection region','Edit',p=>applySoundRegion(requireName(),p.mode),object({mode:{enum:['crop','cut','only']}}),()=>ready()&&!!session()?.selection),
  add('sound.region.clear','Remove region edit','Edit',()=>clearSoundRegion(requireName()),undefined,()=>ready()&&!!session()?.settings.region),
  add<{version:'original'|'processed'}>('sound.listen','Listen to original or edited audio','View',p=>setSoundListen(requireName(),p.version),object({version:{enum:['original','processed']}})),
  add('sound.transport.toggle','Play or pause audio','View',()=>transport!.toggle(),undefined,()=>ready()&&transport?.name===activeSoundName()),
  add<{seconds:number}>('sound.transport.seek','Seek in audio','View',p=>transport!.seek(Math.max(0,p.seconds)),object({seconds:num}),()=>ready()&&transport?.name===activeSoundName()),
  add('sound.export','Export audio WAV copy','Project',()=>saveSound(requireName()),undefined,()=>isSoundExportReady(activeSoundName())),
 ] as CommandSpec<unknown,unknown>[];
}
export const SOUND_COMMANDS=soundCommandSpecs().map(s=>s.id);
let mounts=0,disposeCommands:(()=>void)|null=null;
/** Reference-counted because Sound also has an inline media preview in the Code studio. */
export function registerSoundCommands(){if(mounts++===0){const offs=soundCommandSpecs().map(s=>{const off=registerCommandSpec(s);const mirrored=commandRegistry.get(s.id)!;mirrored.argsSchema=s.params;mirrored.risk=s.category==='Edit'||s.id==='sound.settings.set'?'content':'none';return off;});disposeCommands=()=>offs.forEach(f=>f());}let live=true;return()=>{if(!live)return;live=false;if(--mounts===0){disposeCommands?.();disposeCommands=null;}};}
