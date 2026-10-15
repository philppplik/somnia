import {arrangementEnd,curveDbAt,curvePanAt,validateArrangement,type Arrangement} from './arrangement';
import {renderArrangement,type DecodedSource,type MixResult} from './mix';
import {emptyRack,type EffectRack} from './rack';
export type RackProcessor=(channels:[Float32Array,Float32Array],rack:EffectRack)=>[Float32Array,Float32Array];
/** One order: clip edits -> track rack -> track gain/balance -> sum -> master rack. */
/** Renders the session or one explicit output range. Ranges never get the effect tail: the output is exactly the requested frames. */
export function renderRackedArrangement(raw:Arrangement,sources:DecodedSource[],process:RackProcessor,bypass=false,range?:{start:number;end:number}):MixResult{
 const s=validateArrangement(raw),sessionFrames=arrangementEnd(s);if(sessionFrames<1)throw Error('Empty session');
 if(range&&(!Number.isSafeInteger(range.start)||!Number.isSafeInteger(range.end)||range.start<0||range.end<=range.start||range.end>sessionFrames))throw Error('Invalid output range');
 const frames=range?range.end-range.start:sessionFrames;
 // The explicit tail extends a full render past the last clip: sources contribute silence there and the racks may ring into it.
 const total=range?frames:frames+s.tailFrames;
 // Validate missing/invalid media before considering mute/solo.
 renderArrangement({...s,masterRack:emptyRack(),masterCurve:[],tracks:s.tracks.map(t=>({...t,mute:true,rack:emptyRack()}))},sources,range);
 const output:[Float32Array,Float32Array]=[new Float32Array(total),new Float32Array(total)],solo=s.tracks.some(t=>t.solo);
 for(const track of s.tracks){if(track.mute||solo&&!track.solo||!track.clips.length)continue;
  const neutral={...track,gainDb:0,pan:0,rack:emptyRack()};
  const rendered=renderArrangement({...s,masterRack:emptyRack(),masterCurve:[],tracks:[neutral]},sources,range).channels;const clips:[Float32Array,Float32Array]=[new Float32Array(total),new Float32Array(total)];clips[0].set(rendered[0]);clips[1].set(rendered[1]);
  const processed=bypass?clips:process(clips,track.rack);if(processed.length!==2||processed.some(ch=>ch.length!==clips[0].length))throw Error('Rack must preserve the rendered length (session plus tail)');
  const gain=10**(track.gainDb/20),base=range?range.start:0;
  if(!track.gainCurve.length&&!track.panCurve.length){const left=Math.min(1,1-track.pan),right=Math.min(1,1+track.pan);for(let i=0;i<processed[0].length;i++){output[0][i]+=processed[0][i]*gain*left;output[1][i]+=processed[1][i]*gain*right;}}
  else for(let i=0;i<processed[0].length;i++){const g=10**((track.gainDb+curveDbAt(track.gainCurve,base+i))/20),p=Math.max(-1,Math.min(1,track.pan+curvePanAt(track.panCurve,base+i)));output[0][i]+=processed[0][i]*g*Math.min(1,1-p);output[1][i]+=processed[1][i]*g*Math.min(1,1+p);}
 }
 const channels=bypass?output:process(output,s.masterRack);
 if(s.masterCurve.length){const base=range?range.start:0;for(let i=0;i<channels[0].length;i++){const g=10**(curveDbAt(s.masterCurve,base+i)/20);channels[0][i]*=g;channels[1][i]*=g;}}
 let peak=0,clippedSamples=0;for(const ch of channels){if(ch.length!==total)throw Error('Master rack changed duration');for(const v of ch){if(!Number.isFinite(v))throw Error('Rack produced invalid samples');peak=Math.max(peak,Math.abs(v));if(Math.abs(v)>1)clippedSamples++;}}
 return{channels,sampleRate:48000,peak,clippedSamples};
}
