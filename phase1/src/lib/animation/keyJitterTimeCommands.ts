import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {EditError} from './edit';
import {pruneSelection} from './selection';
import {jitterTimeMoves,MAX_JITTER_FRAMES} from './keyJitterTime';
/** Shift selected keys by seeded random frames. Own file so the big command array keeps cheap type inference. */
export const keyJitterTimeSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.keys.jitterTime',title:'Shift the selected keys by random frames',category:'Edit',level:'ui',keywords:['animation','keys','jitter','random','timing','offset','organic','stagger'],
 params:{type:'object',properties:{frames:{type:'integer',minimum:1,maximum:MAX_JITTER_FRAMES},seed:{type:'integer',minimum:0,maximum:2147483647}},required:['frames'],additionalProperties:false},
 enabled:()=>{const s=animationSession(),d=s.document;return !!d&&pruneSelection(d,s.getState().view.selectedKeys).length>0;},
 run:((p:{frames:number;seed?:number})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)throw Object.assign(new Error('No composition is open.'),{expected:true});
  const sel=pruneSelection(d!,s.getState().view.selectedKeys),r=jitterTimeMoves(c,sel,p.frames,p.seed);
  if(!r.moves.length)throw Object.assign(new Error('No key could move without leaving the composition or hitting another key.'),{expected:true});
  try{s.dispatch({type:'keys.retime',moves:r.moves});}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  const to=new Map(r.moves.map(m=>[`${m.layer}\0${m.prop}\0${m.from}`,m.to]));
  s.selectKeys(sel.map(k=>({...k,t:to.get(`${k.layer}\0${k.prop}\0${k.t}`)??k.t})));
  return {moved:r.moves.length,skipped:r.skipped};
 }) as (p:unknown)=>unknown}];
