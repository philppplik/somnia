import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,EASE_IN,EASE_OUT,MAX_COUNT,type Layer,type TextCount} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
import {frameToTick} from './time';
/** Counter: the ticked text layers count from one number to another from their in point. `{n}` in the text marks where the number goes (otherwise the number is the whole text). Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_COUNT_LAYERS=30,MAX_COUNT_FRAMES=1200;
export function countOf(from:number,to:number,t0:number,t1:number,decimals:number,grouping:boolean,ease:boolean):TextCount{
 const key=(t:number,v:number)=>({t,v,interp:ease?'bezier' as const:'linear' as const,out:EASE_OUT,in:EASE_IN});
 return {decimals,grouping,value:{type:'scalar',value:from,keys:[key(t0,from),key(t1,to)]} as TextCount['value']};
}
export const countSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.text.count',title:'Count the ticked text layers from one number to another',category:'Edit',level:'ui',keywords:['animation','text','count','counter','number','tally','odometer','score','statistic','percent','count up'],
 params:{type:'object',properties:{from:{type:'number',minimum:-MAX_COUNT,maximum:MAX_COUNT},to:{type:'number',minimum:-MAX_COUNT,maximum:MAX_COUNT},frames:{type:'integer',minimum:1,maximum:MAX_COUNT_FRAMES},decimals:{type:'integer',minimum:0,maximum:4},grouping:{type:'boolean'},ease:{type:'boolean'},remove:{type:'boolean'},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_COUNT_LAYERS}},additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.some(l=>l.kind==='text');},
 run:((p:{from?:number;to?:number;frames?:number;decimals?:number;grouping?:boolean;ease?:boolean;remove?:boolean;layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const from=p.from??0,to=p.to??100,frames=p.frames??60,decimals=p.decimals??0;
  for(const v of [from,to])if(!Number.isFinite(v)||Math.abs(v)>MAX_COUNT)return expected('Numbers stay within a trillion.');
  if(!Number.isInteger(frames)||frames<1||frames>MAX_COUNT_FRAMES)return expected(`The count lasts 1 to ${MAX_COUNT_FRAMES} frames.`);
  if(!Number.isInteger(decimals)||decimals<0||decimals>4)return expected('Decimals are 0 to 4.');
  const ls=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].slice(0,MAX_COUNT_LAYERS).map(id=>findLayer(c,id)).filter((l):l is Layer=>!!l&&!l.locked&&l.kind==='text');
  if(!ls.length)return expected('Tick at least one unlocked text layer.');
  const edits:Edit[]=[];
  if(p.remove){for(const l of ls)if(l.textCount)edits.push({type:'layer.count',layer:l.id,count:undefined});if(!edits.length)return expected('The ticked text layers have no counter.');}
  else for(const l of ls){const t0=l.inT,t1=Math.min(l.outT,t0+frameToTick(frames,c.fps));if(t1<=t0)continue;edits.push({type:'layer.count',layer:l.id,count:countOf(from,to,t0,t1,decimals,p.grouping===true,p.ease!==false)});}
  if(!edits.length)return expected('The ticked text layers are too short.');
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {layers:edits.length};
 }) as (p:unknown)=>unknown}];
