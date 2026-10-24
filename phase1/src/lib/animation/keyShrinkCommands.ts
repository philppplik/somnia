import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {pruneSelection} from './selection';
import {shrinkSelection} from './keyShrink';
/** Shrink the key selection by one key at each end. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const keyShrinkSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.keys.shrinkSelection',title:'Shrink the key selection by one key at each end',category:'View',level:'ui',keywords:['animation','keys','select','shrink','reduce','inner','fewer','narrow'],
 params:{type:'object',properties:{},additionalProperties:false},
 enabled:()=>{const s=animationSession(),d=s.document;return !!d&&pruneSelection(d,s.getState().view.selectedKeys).length>2;},
 run:(()=>{
  const s=animationSession(),d=s.document;if(!d)return expected('No composition is open.');
  const sel=pruneSelection(d,s.getState().view.selectedKeys);if(!sel.length)return expected('Select keys first.');
  const refs=shrinkSelection(sel);if(!refs.length)return expected('Select at least three keys on one property.');
  s.selectKeys(refs);return {keys:refs.length};
 }) as (p:unknown)=>unknown}];
