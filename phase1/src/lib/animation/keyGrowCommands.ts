import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {pruneSelection} from './selection';
import {growSelection} from './keyGrow';
/** Grow the key selection by one neighbour each side. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const keyGrowSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.keys.growSelection',title:'Grow the key selection by one neighbour',category:'View',level:'ui',keywords:['animation','keys','select','grow','expand','neighbour','neighbor','more','extend'],
 params:{type:'object',properties:{},additionalProperties:false},
 enabled:()=>{const s=animationSession(),d=s.document;return !!d&&pruneSelection(d,s.getState().view.selectedKeys).length>0;},
 run:(()=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const sel=pruneSelection(d!,s.getState().view.selectedKeys);if(!sel.length)return expected('Select keys first.');
  const refs=growSelection(c,sel);if(refs.length===sel.length)return expected('No neighbouring keys to add.');
  s.selectKeys(refs);return {keys:refs.length};
 }) as (p:unknown)=>unknown}];
