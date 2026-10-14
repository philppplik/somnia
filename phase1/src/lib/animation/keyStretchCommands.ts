import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {EditError} from './edit';
import {pruneSelection} from './selection';
import {stretchMoves,MIN_STRETCH,MAX_STRETCH} from './keyStretch';
/** Time-stretch of the selected keys. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
const sel=()=>{const s=animationSession();return pruneSelection(s.document,s.getState().view.selectedKeys);};
export const keyStretchSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.keys.stretch',title:'Stretch the selected keys in time',category:'Edit',level:'ui',keywords:['animation','keys','stretch','scale','time'],
 params:{type:'object',properties:{percent:{type:'number',minimum:MIN_STRETCH,maximum:MAX_STRETCH},anchor:{enum:['first','playhead']}},required:['percent'],additionalProperties:false},
 enabled:()=>!!animationSession().document&&sel().length>0,
 run:((p:{percent:number;anchor?:'first'|'playhead'})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined,keys=sel();
  if(!c)return expected('No composition is open.');if(!keys.length)return expected('Select keys first.');
  if(!(p.percent>=MIN_STRETCH&&p.percent<=MAX_STRETCH))return expected(`Use ${MIN_STRETCH} to ${MAX_STRETCH} percent.`);
  const anchor=p.anchor==='playhead'?s.getState().view.playhead:Math.min(...keys.map(k=>k.t));
  const r=stretchMoves(c,keys,p.percent,anchor);
  if(!r.moves.length)return expected(r.skipped?'Keys would leave the composition or collide.':'The keys would not move.');
  try{s.dispatch({type:'keys.retime',moves:r.moves});}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  const to=new Map(r.moves.map(m=>[`${m.layer}\0${m.prop}\0${m.from}`,m.to]));
  s.selectKeys(keys.map(k=>({...k,t:to.get(`${k.layer}\0${k.prop}\0${k.t}`)??k.t})));
  return {moved:r.moves.length,skipped:r.skipped};
 }) as (p:unknown)=>unknown}];
