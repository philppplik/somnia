/// <reference lib="webworker" />
import {masterPcm,type MasterTarget} from './mastering';
import {emptyRack} from './rack';
import {basicAnalysis} from './analysis';
import {ARRANGE_LIMITS} from './arrangement';
import {decodeSessionWav} from './sessionWav';
import {renderRackedArrangement} from './rackRender';
import {validateArrangement} from './arrangement';
import {encodeMixWav,type DecodedSource} from './mix';
import type {Arrangement} from './arrangement';
const dspModules=import.meta.glob('../../../sound/pkg/somnia_sound.js');
let dsp:Promise<any>|undefined;
async function rackDsp(){const load=dspModules['../../../sound/pkg/somnia_sound.js'];if(!load)throw Error('Build Sound WASM for effects rack processing');dsp??=load().then(async raw=>{const module=raw as any;await module.default({module_or_path:new URL('../../../sound/pkg/somnia_sound_bg.wasm',import.meta.url).href});return module as any;});try{return await dsp;}catch(e){dsp=undefined;throw e;}}
const sources=new Map<string,DecodedSource>();
self.onmessage=async({data}:{data:{id:number;kind:'source'|'render'|'clear'|'master';sourceId?:string;wav?:ArrayBuffer;session?:Arrangement;target?:MasterTarget;range?:{start:number;end:number}}})=>{
 try{if(data.kind==='clear'){sources.clear();self.postMessage({id:data.id,ok:true});return;}
 if(data.kind==='source'){const source=decodeSessionWav(data.sourceId!,data.wav!);const total=[...sources.values()].filter(s=>s.id!==source.id).reduce((n,s)=>n+s.channels.reduce((m,ch)=>m+ch.length,0),0)+source.channels.reduce((n,ch)=>n+ch.length,0);if(total>ARRANGE_LIMITS.sourceFrames||(!sources.has(source.id)&&sources.size>=ARRANGE_LIMITS.sources))throw Error('Session worker source memory budget reached; save and reopen the session to release unused sources');sources.set(source.id,source);self.postMessage({id:data.id,ok:true,source:{id:source.id,frames:source.channels[0].length,sampleRate:source.sampleRate,channels:source.channels.length}});return;}
 const session=validateArrangement(data.session!);const active=[session.masterRack,...session.tracks.map(t=>t.rack)].some(r=>!r.bypass&&r.slots.some(slot=>slot.enabled));const module=active?await rackDsp():null;
 let mix=renderRackedArrangement(session,[...sources.values()],(channels,rack)=>{if(rack.bypass||!rack.slots.some(slot=>slot.enabled))return channels;if(typeof module?.process_rack_pcm!=='function')throw Error('Sound WASM must be rebuilt for rack support');const planar:Float32Array=module.process_rack_pcm(channels[0],channels[1],JSON.stringify(rack));const n=channels[0].length;if(planar.length!==n*2)throw Error('Unexpected rack output size');return[planar.slice(0,n),planar.slice(n)];},false,data.kind==='render'?data.range:undefined);let analysis=basicAnalysis(mix.channels);try{const m=module??await rackDsp();if(typeof m.analyze_mix_pcm==='function'){Object.assign(analysis,JSON.parse(m.analyze_mix_pcm(mix.channels[0],mix.channels[1])));analysis.loudnessStatus=analysis.integratedLufs===null?'insufficient':'measured-unverified';}}catch{/* Spectrum stays real; missing optional built analysis is labelled unavailable. */}let masterReport=null;if(data.kind==='master'){
 const m=module??await rackDsp();if(typeof m.analyze_mix_pcm!=='function'||typeof m.process_rack_pcm!=='function')throw Error('Build Sound WASM for mastering');
 const measure=(channels:[Float32Array,Float32Array])=>({...basicAnalysis(channels),...JSON.parse(m.analyze_mix_pcm(channels[0],channels[1])),loudnessStatus:'measured-unverified' as const});
 const mastered=masterPcm(mix.channels,analysis,data.target!, (channels,ceiling)=>{const rack=emptyRack();rack.slots=[{id:'master-limit',pluginId:'maximizer',enabled:true,params:{threshold:0,ceiling}}];const planar:Float32Array=m.process_rack_pcm(channels[0],channels[1],JSON.stringify(rack));return[planar.slice(0,channels[0].length),planar.slice(channels[0].length)];},measure);
 analysis=mastered.report.after;masterReport=mastered.report;let peak=0,clippedSamples=0;for(const ch of mastered.channels)for(const v of ch){peak=Math.max(peak,Math.abs(v));if(Math.abs(v)>1)clippedSamples++;}mix={...mix,channels:mastered.channels,peak,clippedSamples};
 }const wav=encodeMixWav(mix);const peaks=new Float32Array(800);for(let col=0;col<400;col++){const from=Math.floor(col*mix.channels[0].length/400),to=Math.floor((col+1)*mix.channels[0].length/400);let lo=0,hi=0;for(let i=from;i<to;i++)for(const ch of mix.channels){lo=Math.min(lo,ch[i]);hi=Math.max(hi,ch[i]);}peaks[col*2]=lo;peaks[col*2+1]=hi;}
 self.postMessage({id:data.id,ok:true,wav,peaks:peaks.buffer,peak:mix.peak,clippedSamples:mix.clippedSamples,analysis,masterReport},[wav,peaks.buffer]);
 }catch(e){self.postMessage({id:data.id,ok:false,error:e instanceof Error?e.message:String(e)});}
};
