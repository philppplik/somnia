import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
import {TICKS_PER_SECOND} from './time';
/** Trim silence: cut quiet stretches off the start and end of the played part of an audio clip. What is left stays where it was on the timeline (the clip start moves in by the same amount), so nothing else shifts. Uses the stored peak bins, so the cut is only as exact as one bin. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_SILENCE_LAYERS=20,DEFAULT_THRESHOLD=4,DEFAULT_PAD=0.05;
/** First and last file tick (within the played part) that holds a bin louder than `thr` percent, widened by `pad` ticks and kept inside the played part. Null when it is all quiet. */
export function soundBounds(peaks:readonly number[],durationTicks:number,trimIn:number,length:number,thr:number,pad:number):{start:number;end:number}|null{
 const n=peaks.length;if(!n||durationTicks<=0||length<=0)return null;const bin=durationTicks/n,lim=(thr/100)*255;
 const a=Math.max(0,Math.floor(trimIn/bin)),z=Math.min(n,Math.ceil((trimIn+length)/bin));let first=-1,last=-1;
 for(let i=a;i<z;i++)if(peaks[i]>lim){if(first<0)first=i;last=i;}
 if(first<0)return null;
 return {start:Math.round(Math.max(trimIn,first*bin-pad)),end:Math.round(Math.min(trimIn+length,(last+1)*bin+pad))};
}
export const silenceSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.audio.trimSilence',title:'Trim silence off the start and end of the audio layers',category:'Edit',level:'ui',keywords:['animation','audio','trim','silence','quiet','cut','head','tail','dead air','clean'],
 params:{type:'object',properties:{threshold:{type:'number',minimum:0.5,maximum:50},padding:{type:'number',minimum:0,maximum:2},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_SILENCE_LAYERS}},additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.some(l=>l.kind==='audio');},
 run:((p:{threshold?:number;padding?:number;layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const thr=p.threshold??DEFAULT_THRESHOLD,pad=p.padding??DEFAULT_PAD;
  if(!Number.isFinite(thr)||thr<0.5||thr>50)return expected('The silence threshold is 0.5 to 50 percent of full scale.');
  if(!Number.isFinite(pad)||pad<0||pad>2)return expected('The padding is 0 to 2 seconds.');
  const ls=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].slice(0,MAX_SILENCE_LAYERS).map(id=>findLayer(c,id)).filter(l=>!!l&&l.kind==='audio'&&!!l.audio&&!l.locked);
  if(!ls.length)return expected('Select an unlocked audio layer.');
  const edits:Edit[]=[];let silent=0;
  for(const l of ls){
   const a=l!.audio!,asset=d!.audioAssets?.find(x=>x.id===a.assetId);if(!asset)continue;
   const len=l!.outT-l!.inT,b=soundBounds(asset.peaks,asset.durationTicks,a.trimIn,len,thr,Math.round(pad*TICKS_PER_SECOND));
   if(!b){silent++;continue;}
   const cutHead=b.start-a.trimIn,newLen=b.end-b.start;if(cutHead<=0&&newLen>=len)continue;if(newLen<1)continue;
   edits.push({type:'audio.update',layer:l!.id,trimIn:b.start,length:newLen,offset:l!.offset+cutHead});
  }
  if(!edits.length)return expected(silent?'The clip is quiet all the way through, so nothing is cut.':'There is no silence to trim at the start or end.');
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {layers:edits.length,silent};
 }) as (p:unknown)=>unknown}];
