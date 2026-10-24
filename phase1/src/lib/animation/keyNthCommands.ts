import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {pruneSelection} from './selection';
import {nthKeys,MIN_NTH,MAX_NTH} from './keyNth';
/** Narrow the key selection to every n-th key. Own file so the big command array keeps cheap type inference. */
export const keyNthSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.keys.selectNth',title:'Select every n-th selected key',category:'View',level:'ui',keywords:['animation','keys','select','every','nth','alternate','odd','even'],
 params:{type:'object',properties:{n:{type:'integer',minimum:MIN_NTH,maximum:MAX_NTH},offset:{type:'integer',minimum:0,maximum:MAX_NTH-1}},required:['n'],additionalProperties:false},
 enabled:()=>{const s=animationSession(),d=s.document;return !!d&&pruneSelection(d,s.getState().view.selectedKeys).length>1;},
 run:((p:{n:number;offset?:number})=>{
  const s=animationSession(),d=s.document;if(!d)throw Object.assign(new Error('No composition is open.'),{expected:true});
  const refs=nthKeys(pruneSelection(d,s.getState().view.selectedKeys),p.n,p.offset??0);
  if(!refs.length)throw Object.assign(new Error('No keys match that step.'),{expected:true});
  s.selectKeys(refs);return {keys:refs.length};
 }) as (p:unknown)=>unknown}];
