import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {EditError} from './edit';
import {pruneSelection} from './selection';
import {thinKeys,MAX_THIN_TOLERANCE} from './keyThin';
/** Remove redundant selected keys. Own file so the big command array keeps cheap type inference. */
export const keyThinSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.keys.thin',title:'Remove selected keys that are close to a straight line between their neighbours',category:'Edit',level:'ui',keywords:['animation','keys','thin','reduce','simplify','optimize','tolerance','remove'],
 params:{type:'object',properties:{tolerance:{type:'number',exclusiveMinimum:0,maximum:MAX_THIN_TOLERANCE}},required:['tolerance'],additionalProperties:false},
 enabled:()=>{const s=animationSession(),d=s.document;return !!d&&pruneSelection(d,s.getState().view.selectedKeys).length>0;},
 run:((p:{tolerance:number})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)throw Object.assign(new Error('No composition is open.'),{expected:true});
  const gone=thinKeys(c,pruneSelection(d!,s.getState().view.selectedKeys),p.tolerance);
  if(!gone.length)throw Object.assign(new Error('No selected key is close enough to a straight line.'),{expected:true});
  try{s.dispatch({type:'keys.remove',keys:gone});}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  s.selectKeys([]);return {removed:gone.length};
 }) as (p:unknown)=>unknown}];
