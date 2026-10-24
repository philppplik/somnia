import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer} from './model';
import {EditError,type Edit} from './edit';
import {evaluate} from './interpolate';
import {frameToTick} from './time';
/** Duck: lower the volume of one audio layer (music) while another audio layer (voice) plays. The music fades down just before the voice starts and back up just after it ends. Keys the music already has inside that stretch are replaced; others stay. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_RAMP_FRAMES=60;
export const duckSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.audio.duck',title:'Duck the volume of an audio layer while another audio layer plays',category:'Edit',level:'ui',keywords:['animation','audio','duck','ducking','voice','music','lower','dip','sidechain','volume','narration'],
 params:{type:'object',properties:{layer:{type:'string',minLength:1,maxLength:200},under:{type:'string',minLength:1,maxLength:200},level:{type:'number',minimum:0,maximum:100},frames:{type:'integer',minimum:1,maximum:MAX_RAMP_FRAMES}},required:['layer','under'],additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.filter(l=>l.kind==='audio').length>1;},
 run:((p:{layer:string;under:string;level?:number;frames?:number})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const m=findLayer(c,p?.layer),v=findLayer(c,p?.under);
  if(!m?.audio||!v?.audio)return expected('Both layers must be audio layers.');if(m.id===v.id)return expected('Pick a different layer to duck under.');
  if(m.locked)return expected('The music layer is locked.');
  const level=p.level??25,frames=p.frames??8;
  if(!Number.isFinite(level)||level<0||level>100)return expected('The ducked level is 0 to 100 percent of the current volume.');
  if(!Number.isInteger(frames)||frames<1||frames>MAX_RAMP_FRAMES)return expected(`The fade takes 1 to ${MAX_RAMP_FRAMES} frames.`);
  const ramp=frameToTick(frames,c.fps),vs=Math.max(0,v.inT+v.offset),ve=Math.min(c.duration,v.outT+v.offset),ms=Math.max(0,m.inT+m.offset),me=Math.min(c.duration,m.outT+m.offset);
  const a=Math.max(vs,ms),b=Math.min(ve,me);if(b-a<=0)return expected('The two clips do not overlap in time.');
  const t0=Math.max(ms,a-ramp),t3=Math.min(me,b+ramp),vol=m.audio.volume;
  if(t3-t0<=0||(a-t0)+(t3-b)>=b-a+2*ramp+1)return expected('No room to fade.');
  const full0=evaluate(vol,t0) as number,full3=evaluate(vol,t3) as number,low=Math.round(((evaluate(vol,a) as number)*level)/100*100)/100,lowB=Math.round(((evaluate(vol,b) as number)*level)/100*100)/100;
  const edits:Edit[]=[];for(const k of vol.keys)if(k.t>=t0&&k.t<=t3)edits.push({type:'audio.volume.key.remove',layer:m.id,t:k.t});
  const put=(t:number,val:number)=>edits.push({type:'audio.volume.animate',layer:m.id,on:true,t},{type:'audio.volume.set',layer:m.id,value:val,t});
  put(t0,full0);if(a>t0)put(a,low);else edits.push({type:'audio.volume.set',layer:m.id,value:low,t:a});
  if(b>a)put(b,lowB);put(t3,full3);
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {layer:m.id,under:v.id,level,frames};
 }) as (p:unknown)=>unknown}];
