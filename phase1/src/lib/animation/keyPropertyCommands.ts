import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {pruneSelection} from './selection';
import {wholeProperties} from './keyProperty';
/** Expand the selection to whole properties. Own file so the big command array keeps cheap type inference. */
export const keyPropertySpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.keys.selectProperty',title:'Select every key of the selected keys\u2019 properties',category:'View',level:'ui',keywords:['animation','keys','select','property','whole','all','row','lane'],
 params:{type:'object',properties:{},additionalProperties:false},
 enabled:()=>{const s=animationSession(),d=s.document;return !!d&&pruneSelection(d,s.getState().view.selectedKeys).length>0;},
 run:(()=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)throw Object.assign(new Error('No composition is open.'),{expected:true});
  const refs=wholeProperties(c,pruneSelection(d!,s.getState().view.selectedKeys));
  if(!refs.length)throw Object.assign(new Error('Select a key first.'),{expected:true});
  s.selectKeys(refs);return {keys:refs.length};
 }) as (p:unknown)=>unknown}];
