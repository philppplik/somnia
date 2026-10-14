import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {EditError} from './edit';
import {pruneSelection} from './selection';
import {randomEaseEdits} from './keyEaseRandom';
/** Give every selected key a random preset ease. Own file so the big command array keeps cheap type inference. */
export const keyEaseRandomSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.keys.easeRandom',title:'Give the selected keys random eases',category:'Edit',level:'ui',keywords:['animation','keys','ease','random','easing','organic'],
 params:{type:'object',properties:{seed:{type:'integer',minimum:0,maximum:2147483647}},additionalProperties:false},
 enabled:()=>{const s=animationSession(),d=s.document;return !!d&&pruneSelection(d,s.getState().view.selectedKeys).length>0;},
 run:((p:{seed?:number})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)throw Object.assign(new Error('No composition is open.'),{expected:true});
  const edits=randomEaseEdits(pruneSelection(d!,s.getState().view.selectedKeys),p.seed);
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {keys:edits.length};
 }) as (p:unknown)=>unknown}];
