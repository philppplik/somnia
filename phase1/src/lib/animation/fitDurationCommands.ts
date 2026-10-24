import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,type Composition} from './model';
import {EditError} from './edit';
import {frameToTick,tickToFrame} from './time';
/** Set the composition length to where the last layer ends (audio clips count with their placement), rounded up to a whole frame. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
/** End of the last layer in ticks, or 0 for an empty composition. */
export function contentEnd(c:Composition):number{
 let end=0;for(const l of c.layers)end=Math.max(end,l.outT+(l.kind==='audio'?l.offset:0));return end;
}
/** The content end rounded up to the next whole frame, at least one frame. */
export function fittedDuration(c:Composition):number{
 const e=contentEnd(c);if(e<=0)return 0;let n=tickToFrame(e,c.fps);if(frameToTick(n,c.fps)<e)n++;return frameToTick(Math.max(1,n),c.fps);
}
export const fitDurationSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.comp.fitDuration',title:'Set the composition length to the end of the last layer',category:'Edit',level:'ui',keywords:['animation','composition','duration','length','fit','end','content','shorten','trim','last layer'],
 params:{type:'object',properties:{},additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>0;},
 run:(()=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const to=fittedDuration(c);if(!to)return expected('The composition has no layers.');
  if(to===c.duration)return expected('The composition already ends with its last layer.');
  try{s.dispatch({type:'comp.update',comp:c.id,settings:{duration:to}});}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {from:c.duration,to};
 }) as (p:unknown)=>unknown}];
