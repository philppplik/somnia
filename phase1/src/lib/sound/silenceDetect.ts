/** Silence-based speech editing (Stage C2): deterministic detection of cuttable silence ranges in rendered 48 kHz PCM. Pure module - no DOM, no worker assumption, no new dependencies. */

export interface SilenceCut{
 /** Start of the raw silence span, in frames. */
 silenceStart:number;
 /** End of the raw silence span (exclusive), in frames. */
 silenceEnd:number;
 /** Start of the proposed cut range: silenceStart plus padding when speech precedes it. */
 cutStart:number;
 /** End of the proposed cut range: silenceEnd minus padding when speech follows it. */
 cutEnd:number;
 /** Raw pause length in frames (what the review UI shows). */
 durationFrames:number;
}

export interface SilenceDetectOptions{
 /** Windows with peak below this level count as silent. Default -45 dB. */
 thresholdDb?:number;
 /** Pauses shorter than this are ignored. Default 400 ms. */
 minSilenceMs?:number;
 /** Audio kept around speech on each side of a cut. Default 120 ms. Not applied at buffer edges without speech. */
 paddingMs?:number;
 /** Analysis window. Default 20 ms (960 frames at 48 kHz). */
 windowMs?:number;
}

const SAMPLE_RATE=48000;
const dbToAmp=(db:number)=>Math.pow(10,db/20);

/** Peak over both channels inside [start,end). */
function windowPeak(left:Float32Array,right:Float32Array,start:number,end:number):number{
 let peak=0;
 for(let i=start;i<end;i++){
  const a=Math.abs(left[i]);if(a>peak)peak=a;
  const b=Math.abs(right[i]);if(b>peak)peak=b;
 }
 return peak;
}

/**
 * Find cuttable silence ranges in a rendered stereo buffer. Deterministic: same input, same output.
 * A fully silent buffer yields one segment spanning the whole buffer (cutting it empties the track - the user decides).
 */
export function detectSilenceCuts(channels:readonly[Float32Array,Float32Array],options:SilenceDetectOptions={}):SilenceCut[]{
 const[left,right]=channels;
 if(!left||!right||left.length!==right.length||left.length<1)throw Error('Invalid analysis channels');
 const threshold=dbToAmp(options.thresholdDb??-45);
 const windowFrames=Math.max(1,Math.round((options.windowMs??20)*SAMPLE_RATE/1000));
 const minFrames=Math.max(1,Math.round((options.minSilenceMs??400)*SAMPLE_RATE/1000));
 const padFrames=Math.max(0,Math.round((options.paddingMs??120)*SAMPLE_RATE/1000));
 const frames=left.length;
 // 1. classify windows
 const windowCount=Math.ceil(frames/windowFrames);
 const silent:boolean[]=[];
 for(let w=0;w<windowCount;w++){
  const start=w*windowFrames,end=Math.min(frames,start+windowFrames);
  silent.push(windowPeak(left,right,start,end)<threshold);
 }
 // 2. merge consecutive silent windows into raw spans
 const spans:[number,number][]=[];
 let runStart=-1;
 for(let w=0;w<=windowCount;w++){
  const isSilent=w<windowCount&&silent[w];
  if(isSilent&&runStart<0)runStart=w;
  if(!isSilent&&runStart>=0){spans.push([runStart*windowFrames,Math.min(frames,w*windowFrames)]);runStart=-1;}
 }
 // 3. filter by minimum duration, apply padding, drop ranges that vanish
 const cuts:SilenceCut[]=[];
 for(const[rawStart,rawEnd]of spans){
  if(rawEnd-rawStart<minFrames)continue;
  const speechBefore=rawStart>0;
  const speechAfter=rawEnd<frames;
  const cutStart=speechBefore?rawStart+padFrames:rawStart;
  const cutEnd=speechAfter?rawEnd-padFrames:rawEnd;
  if(cutEnd<=cutStart)continue;
  cuts.push({silenceStart:rawStart,silenceEnd:rawEnd,cutStart,cutEnd,durationFrames:rawEnd-rawStart});
 }
 return cuts;
}

import {cutSessionRange,type Arrangement} from './arrangement';

/**
 * Apply accepted pause cuts as one arrangement mutation. Cuts must be ascending and non-overlapping (the shape
 * detectSilenceCuts returns); they are applied back-to-front so earlier cuts never shift later coordinates.
 * The caller wraps this in ONE history change, so the whole cleanup is a single undo step.
 * Returns the total frames removed.
 */
export function applySilenceCuts(s:Arrangement,cuts:readonly SilenceCut[],nextId:()=>string):number{
 for(let i=0;i<cuts.length;i++){
  const c=cuts[i];
  if(!Number.isSafeInteger(c.cutStart)||!Number.isSafeInteger(c.cutEnd)||c.cutStart<0||c.cutEnd<=c.cutStart)throw Error('Invalid silence cut');
  if(i>0&&c.cutStart<cuts[i-1].cutEnd)throw Error('Overlapping silence cuts');
 }
 let removed=0;
 for(let i=cuts.length-1;i>=0;i--){cutSessionRange(s,cuts[i].cutStart,cuts[i].cutEnd,nextId);removed+=cuts[i].cutEnd-cuts[i].cutStart;}
 return removed;
}
