import React from 'react';import {createRoot} from 'react-dom/client';
import '../styles/global.css';import '../styles/bento.css';
import {SoundArrange} from '../components/sound/SoundArrange';
import {setSoundEngineFactory} from '../lib/sound/session';
import {addMediaFile} from '../lib/media';
import {addArrangementMedia,getArrangementState,editArrangement,loadArrangement} from '../lib/sound/arrangeStore';
import {renderArrangement,encodeMixWav} from '../lib/sound/mix';
import {emptyArrangement,newTrack,newClip} from '../lib/sound/arrangement';
import {setLocale} from '../lib/i18n';
setLocale('en');
function tone(name:string,freq:number,amplitude:number){const s=emptyArrangement();const source={id:name,name,frames:48000*4,sampleRate:48000,channels:1 as const};s.sources.push(source);s.tracks.push({...newTrack('t','t'),clips:[newClip('c',source)]});const samples=Float32Array.from({length:source.frames},(_,i)=>Math.sin(i*freq*Math.PI*2/48000)*amplitude*(0.3+0.7*Math.abs(Math.sin(i/14000))));return encodeMixWav(renderArrangement(s,[{id:name,sampleRate:48000,channels:[samples]}]));}
const pcm=new Map<string,ArrayBuffer>([['Narration.wav',tone('Narration.wav',220,0.6)],['Music bed.wav',tone('Music bed.wav',110,0.25)]]);
// Harness decoder stub only: it returns real deterministic fixture WAV; production imports use WASM.
setSoundEngineFactory(()=>({init:async()=>[],dispose(){},process:async(bytes)=>{const view=new DataView(bytes);const frames=(bytes.byteLength-44)/8;const peaks=new Float32Array(800);for(let col=0;col<400;col++){let p=0;for(let i=Math.floor(col*frames/400);i<Math.floor((col+1)*frames/400);i++)p=Math.max(p,Math.abs(view.getFloat32(44+i*8,true)));peaks[col*2]=-p;peaks[col*2+1]=p;}const stats={frames,sample_rate:48000,channels:2,duration_s:frames/48000,peak_db:-3,rms_db:-12};return{wav:bytes,peaks,ms:1,report:{format:'wav',input:stats,output:stats,trimmed_range:null,steps:[],wav_bytes:bytes.byteLength}};}}));
for(const [name,bytes] of pcm){await addMediaFile(new Blob([bytes],{type:'audio/wav'}),name);await addArrangementMedia(name);}
editArrangement(s=>{s.name='Voiceover + music';s.tracks[0].name='Voiceover';s.tracks[1].name='Music';s.tracks[1].gainDb=-12;s.tracks[1].clips[0].start=48000;s.tracks[1].clips[0].fadeIn=24000;s.tracks[1].clips[0].fadeOut=48000;s.markers.push({id:'intro',name:'Intro',frame:48000});});
document.documentElement.dataset.theme='light';
createRoot(document.getElementById('root')!).render(<div className="flex min-h-screen flex-col gap-3 bg-canvas p-4"><header className="flex justify-between rounded-2xl bg-panel px-5 py-3 text-ink"><strong>Somnia Sound</strong><span>Arrange & Mix</span></header><div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-subtle"><SoundArrange/></div><footer className="text-xs text-ink-3">Isolated integration harness · deterministic audio fixtures · real mix worker · no microphone or uploads</footer></div>);
(window as any).arrangeHarness={getArrangementState,loadArrangement};
