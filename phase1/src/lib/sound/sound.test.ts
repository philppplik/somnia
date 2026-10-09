import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {sniffAudio,AUDIO_FILE} from './format';
import {DEFAULT_SETTINGS,exportName,isNeutral,sanitizeSettings,toRecipe} from './recipe';
import {closeSound,exportSound,getSoundSession,openSound,resetSoundSettings,setSoundEngineFactory,updateSoundSettings} from './session';
import type {SoundEngineLike,SoundResult} from './engine';
import type {SoundPlugin,SoundRecipe,SoundReport} from './protocol';
import {addMediaFile,clearMedia,getMedia,MEDIA_FILE,sniffMedia} from '../media';
const MP3=new URL('../../../sound/tests/fixtures/arpeggio.mp3',import.meta.url);
const WASM=new URL('../../../sound/pkg/somnia_sound_bg.wasm',import.meta.url);
const built=existsSync(WASM);
const bytes=()=>new Uint8Array(readFileSync(MP3));
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));

test('format sniffing recognises the five containers and rejects text and images',()=>{
 const pad=(...v:number[])=>{const b=new Uint8Array(16);b.set(v);return b;};
 const ascii=(s:string,at=0)=>{const b=new Uint8Array(16);[...s].forEach((c,i)=>b[at+i]=c.charCodeAt(0));return b;};
 assert.equal(sniffAudio(bytes())?.ext,'mp3');assert.equal(sniffAudio(ascii('ID3'))?.mime,'audio/mpeg');
 const wav=ascii('RIFF');[...'WAVE'].forEach((c,i)=>wav[8+i]=c.charCodeAt(0));assert.equal(sniffAudio(wav)?.ext,'wav');
 const webp=ascii('RIFF');[...'WEBP'].forEach((c,i)=>webp[8+i]=c.charCodeAt(0));assert.equal(sniffAudio(webp),null);
 assert.equal(sniffAudio(ascii('fLaC'))?.ext,'flac');assert.equal(sniffAudio(ascii('OggS'))?.ext,'ogg');
 const aiff=ascii('FORM');[...'AIFF'].forEach((c,i)=>aiff[8+i]=c.charCodeAt(0));assert.equal(sniffAudio(aiff)?.ext,'aiff');
 assert.equal(sniffAudio(pad(0xff,0xf1,0x50,0x80)),null,'ADTS AAC is not MPEG audio layer 1-3');
 assert.equal(sniffAudio(pad(0x89,0x50,0x4e,0x47)),null);assert.equal(sniffAudio(new TextEncoder().encode('hello, not audio at all')),null);
 assert.ok(AUDIO_FILE.test('Song.MP3')&&AUDIO_FILE.test('a.aif')&&!AUDIO_FILE.test('a.mp4'));assert.ok(MEDIA_FILE.test('x.flac')&&MEDIA_FILE.test('x.png'));
 assert.equal(sniffMedia(bytes())?.kind,'audio');
});

test('settings map to the engine recipe; off steps add nothing; values are clamped',()=>{
 assert.deepEqual(toRecipe(DEFAULT_SETTINGS,64),{columns:64});assert.ok(isNeutral(DEFAULT_SETTINGS));
 const s=sanitizeSettings({...DEFAULT_SETTINGS,trim:{on:true,db:-500},pitch:99.4,fadeInMs:-5,fadeOutMs:1e9,reverse:true,effect:{id:'plate_reverb',keepTail:true},normalize:{on:true,db:5}});
 assert.deepEqual(toRecipe(s,10),{columns:10,trim_silence_db:-80,reverse:true,pitch_semitones:12,plugin:{id:'plate_reverb',keep_tail:true},fade_out_ms:5000,normalize_db:0});
 assert.equal(sanitizeSettings({...DEFAULT_SETTINGS,pitch:Number.NaN}).pitch,-12);
 assert.equal(exportName('dir/My Song.mp3',DEFAULT_SETTINGS),'My Song.wav');assert.equal(exportName('a.flac',{...DEFAULT_SETTINGS,reverse:true}),'a-edited.wav');
});

type Wasm=typeof import('../../../sound/pkg/somnia_sound.js');
async function realEngine():Promise<SoundEngineLike&{calls:SoundRecipe[]}>{
 const wasm:Wasm=await import('../../../sound/pkg/somnia_sound.js');wasm.initSync({module:readFileSync(WASM)});
 const calls:SoundRecipe[]=[];
 return{calls,async init(){return JSON.parse(wasm.list_plugins()) as SoundPlugin[];},
  async process(buf,ext,recipe):Promise<SoundResult>{calls.push(recipe);const r=wasm.process(new Uint8Array(buf),ext,JSON.stringify(recipe));try{const wav=r.wav,peaks=r.peaks;return{wav:wav.buffer.slice(wav.byteOffset,wav.byteOffset+wav.byteLength) as ArrayBuffer,peaks:new Float32Array(peaks),report:JSON.parse(r.report) as SoundReport,ms:0};}finally{r.free();}},
  dispose(){}};
}
test('real WASM core: decode, trim, pitch, reverb tail and WAV render on a real MP3',{skip:!built&&'sound/pkg not built (npm run sound:build)'},async()=>{
 const e=await realEngine();const input=readFileSync(MP3);const ab=()=>input.buffer.slice(input.byteOffset,input.byteOffset+input.byteLength) as ArrayBuffer;
 const dry=await e.process(ab(),'mp3',{columns:64});
 assert.equal(dry.report.input.sample_rate,44100);assert.equal(dry.report.input.channels,2);assert.ok(Math.abs(dry.report.input.duration_s-3.5)<0.06);
 assert.equal(dry.peaks.length,128);assert.equal(new TextDecoder().decode(new Uint8Array(dry.wav,0,4)),'RIFF');
 const trimmed=await e.process(ab(),'mp3',{trim_silence_db:-50,normalize_db:-1});
 assert.ok(trimmed.report.output.duration_s<dry.report.output.duration_s-0.4);assert.ok(Math.abs(trimmed.report.output.peak_db+1)<0.1);
 const wet=await e.process(ab(),'mp3',{plugin:{id:'plate_reverb',keep_tail:true}});assert.ok(wet.report.output.frames>dry.report.output.frames);
 const plugins=await e.init();assert.ok(plugins.some(p=>p.id==='plate_reverb'&&!p.instrument));
 await assert.rejects(e.process(new TextEncoder().encode('not audio at all').buffer as ArrayBuffer,'mp3',{}),/decode/);
 await assert.rejects(e.process(ab(),'mp3',{plugin:{id:'nope'}}),/unknown plugin/);
});

test('session: opens a media item, re-renders on edits, keeps the original, exports the edited WAV',{skip:!built&&'sound/pkg not built (npm run sound:build)'},async()=>{
 const e=await realEngine();setSoundEngineFactory(()=>e);
 const file=new File([bytes()],'arpeggio.mp3',{type:'audio/mpeg'});
 const added=await addMediaFile(file,'arpeggio.mp3');assert.deepEqual(added,{name:'arpeggio.mp3'});
 const item=getMedia().items[0];assert.equal(item.kind,'audio');assert.equal(item.mime,'audio/mpeg');
 await openSound(item);const s0=getSoundSession('arpeggio.mp3')!;
 assert.equal(s0.status,'ready',s0.error);assert.equal(s0.processed,s0.original,'untouched settings reuse the original render');assert.ok(!s0.plugins.some(p=>p.instrument));
 assert.equal(exportSound('arpeggio.mp3')?.fileName,'arpeggio.wav');
 // burst of edits renders once (debounced) with the last value
 updateSoundSettings('arpeggio.mp3',x=>({...x,pitch:3}));updateSoundSettings('arpeggio.mp3',x=>({...x,pitch:7,trim:{on:true,db:-50},normalize:{on:true,db:-1}}));
 const before=e.calls.length;await wait(600);
 const s1=getSoundSession('arpeggio.mp3')!;assert.equal(s1.status,'ready',s1.error);assert.equal(e.calls.length-before,1);
 assert.deepEqual(e.calls.at(-1),{columns:1200,trim_silence_db:-50,pitch_semitones:7,normalize_db:-1});
 assert.notEqual(s1.processed,s1.original);assert.equal(s1.original,s0.original,'original render is kept for A/B');
 assert.ok(s1.processed!.report.output.duration_s<s1.original!.report.input.duration_s-0.4);
 const out=exportSound('arpeggio.mp3')!;assert.equal(out.fileName,'arpeggio-edited.wav');assert.equal(out.blob.size,s1.processed!.report.wav_bytes);
 // a recipe the engine rejects is reported, and the last good render stays
 updateSoundSettings('arpeggio.mp3',x=>({...x,effect:{id:'not_a_plugin',keepTail:false}}));await wait(600);
 const s2=getSoundSession('arpeggio.mp3')!;assert.equal(s2.status,'error');assert.match(s2.error,/unknown plugin/);assert.equal(s2.processed,s1.processed);
 resetSoundSettings('arpeggio.mp3');await wait(400);
 const s3=getSoundSession('arpeggio.mp3')!;assert.equal(s3.status,'ready');assert.equal(s3.processed,s3.original);
 // closing the media tab drops the session and its object URLs
 const {closeMedia}=await import('../media');closeMedia('arpeggio.mp3');assert.equal(getSoundSession('arpeggio.mp3'),null);
 clearMedia();closeSound('arpeggio.mp3');
});

test('session: a file that is not audio fails with a message instead of hanging',async()=>{
 setSoundEngineFactory(()=>({async init(){return [];},async process(){throw new Error('decode: unsupported format');},dispose(){}}));
 const url=URL.createObjectURL(new Blob([new Uint8Array(64)]));
 await openSound({name:'broken.mp3',url});const s=getSoundSession('broken.mp3')!;
 assert.equal(s.status,'error');assert.match(s.error,/decode/);closeSound('broken.mp3');URL.revokeObjectURL(url);
});
