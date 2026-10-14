import {arrangementEnd,validateArrangement,type Arrangement} from './arrangement';
export interface DecodedSource{id:string;sampleRate:number;channels:Float32Array[]}
export interface MixResult{channels:[Float32Array,Float32Array];sampleRate:48000;peak:number;clippedSamples:number}
/** Offline deterministic stereo mix. Linear sample-rate interpolation is explicit, not mastering quality. */
export function renderArrangement(raw:Arrangement,sources:DecodedSource[],range?:{start:number;end:number}):MixResult{
 const s=validateArrangement(raw),end=arrangementEnd(s);const start=range?.start??0,stop=range?.end??end;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(stop)||start<0||stop<=start||stop>end)throw Error('Invalid mix range or empty session');
 const decoded=new Map<string,DecodedSource>();for(const source of sources){if(decoded.has(source.id))throw Error('Duplicate decoded source');decoded.set(source.id,source);}
 // Missing media never silently produces a partial export, even on muted tracks.
 for(const ref of s.sources){const d=decoded.get(ref.id);if(!d||d.sampleRate!==ref.sampleRate||d.channels.length!==ref.channels||d.channels.some(c=>!(c instanceof Float32Array)||c.length!==ref.frames||c.some(v=>!Number.isFinite(v))))throw Error(`Missing or invalid audio: ${ref.name}`);}
 const channels:[Float32Array,Float32Array]=[new Float32Array(stop-start),new Float32Array(stop-start)];const solo=s.tracks.some(t=>t.solo);
 for(const track of s.tracks){if(track.mute||(solo&&!track.solo))continue;const trackGain=10**(track.gainDb/20);
  for(const clip of track.clips){const d=decoded.get(clip.sourceId)!;const from=Math.max(start,clip.start),to=Math.min(stop,clip.start+clip.length);const gain=trackGain*10**(clip.gainDb/20);const mono=d.channels.length===1;
   // Mono uses equal-power pan. Stereo uses balance, preserving both channels at centre.
   const left=mono?Math.cos((track.pan+1)*Math.PI/4):Math.min(1,1-track.pan),right=mono?Math.sin((track.pan+1)*Math.PI/4):Math.min(1,1+track.pan);
   for(let frame=from;frame<to;frame++){const local=frame-clip.start,pos=(clip.offset+local)*d.sampleRate/48000;const a=Math.floor(pos),b=Math.min(a+1,d.channels[0].length-1),f=pos-a;const envelope=Math.min(clip.fadeIn?local/clip.fadeIn:1,clip.fadeOut?(clip.length-1-local)/clip.fadeOut:1,1);const sample=(ch:number)=>{const c=d.channels[ch];return c[a]+(c[b]-c[a])*f;};const i=frame-start;channels[0][i]+=sample(0)*gain*envelope*left;channels[1][i]+=sample(mono?0:1)*gain*envelope*right;}
  }
 }
 let peak=0,clippedSamples=0;for(const ch of channels)for(const value of ch){peak=Math.max(peak,Math.abs(value));if(Math.abs(value)>1)clippedSamples++;}
 return{channels,sampleRate:48000,peak,clippedSamples};
}
/** Float WAV retains headroom. Player and export receive the exact same buffer. */
export function encodeMixWav(mix:MixResult):ArrayBuffer{
 const frames=mix.channels[0].length;if(mix.channels[1].length!==frames)throw Error('Channel length mismatch');const out=new ArrayBuffer(44+frames*8),v=new DataView(out);const text=(at:number,s:string)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};text(0,'RIFF');v.setUint32(4,out.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,3,true);v.setUint16(22,2,true);v.setUint32(24,48000,true);v.setUint32(28,48000*8,true);v.setUint16(32,8,true);v.setUint16(34,32,true);text(36,'data');v.setUint32(40,frames*8,true);for(let i=0;i<frames;i++)for(let ch=0;ch<2;ch++)v.setFloat32(44+(i*2+ch)*4,mix.channels[ch][i],true);return out;
}
