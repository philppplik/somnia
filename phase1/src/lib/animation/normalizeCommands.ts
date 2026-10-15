import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
/** Normalise: raise or lower the volume of the audio layers so the loudest peak of the part that plays reaches a target level (default 90% of full scale). Keyed volumes keep their shape and are scaled as a whole. Volume is capped at 200%. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_NORMALIZE_LAYERS=20;
/** Loudest peak (0..1) of the played part, from the stored peak bins. */
export function playedPeak(peaks:readonly number[],durationTicks:number,trimIn:number,length:number):number{
 const n=peaks.length;if(!n||durationTicks<=0)return 0;
 const a=Math.max(0,Math.floor(trimIn/durationTicks*n)),z=Math.min(n,Math.max(a+1,Math.ceil((trimIn+length)/durationTicks*n)));let m=0;
 for(let i=a;i<z;i++)if(peaks[i]>m)m=peaks[i];return m/255;
}
export const normalizeSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.audio.normalize',title:'Normalise the volume of the audio layers to a target peak',category:'Edit',level:'ui',keywords:['animation','audio','normalize','normalise','loudness','gain','level','peak','volume','louder','quiet'],
 params:{type:'object',properties:{target:{type:'number',minimum:10,maximum:100},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_NORMALIZE_LAYERS}},additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.some(l=>l.kind==='audio');},
 run:((p:{target?:number;layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const target=(p.target??90)/100;if(!Number.isFinite(target)||target<0.1||target>1)return expected('The target peak is 10 to 100 percent of full scale.');
  const ids=p.layers??layerSetIds(s.getState().view.selectedLayer);
  const ls=[...new Set(ids)].slice(0,MAX_NORMALIZE_LAYERS).map(id=>findLayer(c,id)).filter(l=>!!l&&l.kind==='audio'&&!!l.audio&&!l.locked);
  if(!ls.length)return expected('Select an unlocked audio layer.');
  const edits:Edit[]=[];let capped=0,done=0;
  for(const l of ls){
   const a=l!.audio!,asset=d!.audioAssets?.find(x=>x.id===a.assetId);if(!asset)continue;
   const peak=playedPeak(asset.peaks,asset.durationTicks,a.trimIn,l!.outT-l!.inT);if(peak<=0.001)continue;
   const vals=a.volume.keys.length?a.volume.keys.map(k=>({t:k.t,v:k.v as number})):[{t:0,v:a.volume.value as number}],top=Math.max(...vals.map(x=>x.v));
   if(top<=0)continue;
   const f=target/(peak*top/100),next=vals.map(x=>({t:x.t,v:Math.round(Math.min(200,x.v*f)*100)/100}));
   if(next.every((x,i)=>Math.abs(x.v-vals[i].v)<0.05))continue;
   if(next.some((x,i)=>x.v<vals[i].v*f-0.05))capped++;
   for(const x of next)edits.push({type:'audio.volume.set',layer:l!.id,value:x.v,t:x.t});done++;
  }
  if(!edits.length)return expected('The selected audio is already at that level, silent, or has no stored waveform.');
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {layers:done,capped};
 }) as (p:unknown)=>unknown}];
