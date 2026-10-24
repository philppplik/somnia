import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {EditError} from './edit';
import {pruneSelection} from './selection';
import {distributeMoves} from './keyDistribute';
/** Space the selected keys evenly in time. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const keyDistributeSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.keys.distribute',title:'Space the selected keys evenly in time',category:'Edit',level:'ui',keywords:['animation','keys','distribute','even','space','spacing','time'],
 params:{type:'object',properties:{},additionalProperties:false},
 enabled:()=>{const s=animationSession(),d=s.document;return !!d&&pruneSelection(d,s.getState().view.selectedKeys).length>2;},
 run:(()=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const sel=pruneSelection(d!,s.getState().view.selectedKeys),r=distributeMoves(c,sel);
  if(!r.moves.length)return expected(r.unchanged?'The keys are already evenly spaced.':'Pick three or more keys of one property.');
  try{s.dispatch({type:'keys.retime',moves:r.moves});}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  const to=new Map(r.moves.map(m=>[`${m.layer}\0${m.prop}\0${m.from}`,m.to]));
  s.selectKeys(sel.map(k=>({...k,t:to.get(`${k.layer}\0${k.prop}\0${k.t}`)??k.t})));
  return {moved:r.moves.length,skipped:r.skipped};
 }) as (p:unknown)=>unknown}];
