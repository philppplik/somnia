import type {Marker} from './model';
/** Beat finder for imported audio. Works on the stored peak envelope only (no decoding), so its time resolution is the clip length divided by the number of peak bins. Pure and bounded. */
export const BEAT_LABEL=/^Beat \d{1,3}$/;
export const MAX_BEATS=200,DEFAULT_SENSITIVITY=5;
export interface BeatOptions{/** 1 (only strong hits) to 10 (many soft hits). */sensitivity?:number;/** Smallest distance between two beats, in seconds. */minGapSeconds?:number}
/**
 * File positions (ticks) of onsets: rises of the envelope above its recent level that stand clear of the clip's own variation.
 * Returns at most MAX_BEATS, strongest kept when there are more.
 */
export function detectBeats(peaks:readonly number[],durationTicks:number,o:BeatOptions={}):number[]{
 const n=peaks.length;if(n<8||!(durationTicks>0))return [];
 const s=Math.min(10,Math.max(1,Math.round(o.sensitivity??DEFAULT_SENSITIVITY)));
 const env=peaks.map(p=>Math.min(255,Math.max(0,p))/255);
const avg=env.reduce((a,b)=>a+b,0)/n;
 const flux=env.map((v,i)=>{let m=0,c=0;for(let j=Math.max(0,i-4);j<i;j++){m+=env[j];c++;}return Math.max(0,v-(c?m/c:avg));});
 const mean=flux.reduce((a,b)=>a+b,0)/n;const sd=Math.sqrt(flux.reduce((a,b)=>a+(b-mean)*(b-mean),0)/n);
 const thr=mean+sd*(3.25-s*0.3)+0.02;
 const gapBins=Math.max(1,Math.ceil(((o.minGapSeconds??0.2)*240000)/durationTicks*n));
 const hits:{i:number;f:number}[]=[];
 for(let i=0;i<n;i++){if(flux[i]<=thr||flux[i]<(flux[i-1]??0)||flux[i]<=(flux[i+1]??0))continue;
  const last=hits[hits.length-1];if(last&&i-last.i<gapBins){if(flux[i]>last.f)hits[hits.length-1]={i,f:flux[i]};continue;}hits.push({i,f:flux[i]});}
 const kept=hits.length>MAX_BEATS?[...hits].sort((a,b)=>b.f-a.f).slice(0,MAX_BEATS).sort((a,b)=>a.i-b.i):hits;
 return kept.map(h=>Math.round(h.i/n*durationTicks));
}
/** Markers for beats that fall inside the clip, in composition ticks, skipping ticks that already hold a marker. */
export function beatMarkers(beats:readonly number[],clip:{trimIn:number;length:number;start:number},existing:readonly Marker[],compStart:number,compEnd:number,snap:(t:number)=>number,id:()=>string):Marker[]{
 const taken=new Set(existing.map(m=>m.t));const out:Marker[]=[];let k=existing.filter(m=>BEAT_LABEL.test(m.label)).length;
 for(const b of beats){if(b<clip.trimIn||b>=clip.trimIn+clip.length)continue;const t=snap(clip.start+(b-clip.trimIn));
  if(t<compStart||t>=compEnd||taken.has(t)||existing.length+out.length>=200)continue;taken.add(t);out.push({id:id(),t,label:`Beat ${++k}`});}
 return out;
}
/**
 * Tempo in BPM from beat positions (ticks), or null when there are fewer than 3 beats or no steady pulse.
 * Votes with every gap and its double and half inside 60-180 BPM, so a missed or extra beat does not change the answer.
 */
export function estimateBpm(beats:readonly number[]):number|null{
 if(beats.length<3)return null;const votes=new Float64Array(241);const gaps:number[]=[];
 for(let i=1;i<beats.length;i++){const g=(beats[i]-beats[i-1])/240000;if(g<=0)continue;gaps.push(g);
  for(const f of [0.5,1,2]){const bpm=60/(g*f);if(bpm>=60&&bpm<=180){const b=Math.round(bpm);votes[b]+=f===1?1:0.6;votes[b-1]+=0.5;votes[b+1]+=0.5;}}}
 let best=0;for(let b=60;b<=180;b++)if(votes[b]>votes[best])best=b;if(!best||votes[best]<1.5)return null;
 const near=gaps.flatMap(g=>[g*0.5,g,g*2]).map(g=>60/g).filter(b=>Math.abs(b-best)<=2.5);
 return Math.round(near.reduce((a,b)=>a+b,0)/Math.max(1,near.length)*10)/10;
}
/** File positions (ticks) of a steady grid at `bpm` that passes through `anchor`, covering [from, to). */
export function gridTicks(anchor:number,bpm:number,from:number,to:number):number[]{
 if(!(bpm>=30&&bpm<=300))return [];const iv=240000*60/bpm;const out:number[]=[];
 for(let k=Math.ceil((from-anchor)/iv);anchor+k*iv<to&&out.length<MAX_BEATS;k++)out.push(Math.round(anchor+k*iv));
 return out;
}
