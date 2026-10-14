import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {EditError} from './edit';
import {pruneSelection} from './selection';
import {matchPreviousEdits,MATCH_SIDES,type MatchSide} from './keyMatch';
/** Copy the previous key's value onto the selected keys. Own file so the big command array keeps cheap type inference. */
export const keyMatchSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.keys.matchPrevious',title:'Give the selected keys the value of the key before them',category:'Edit',level:'ui',keywords:['animation','keys','match','previous','copy','value','hold','plateau'],
 params:{type:'object',properties:{side:{enum:[...MATCH_SIDES]}},additionalProperties:false},
 enabled:()=>{const s=animationSession(),d=s.document;return !!d&&pruneSelection(d,s.getState().view.selectedKeys).length>0;},
 run:((p:{side?:MatchSide})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)throw Object.assign(new Error('No composition is open.'),{expected:true});
  const edits=matchPreviousEdits(c,pruneSelection(d!,s.getState().view.selectedKeys),p.side??'previous');
  if(!edits.length)throw Object.assign(new Error('The keys already match their neighbour.'),{expected:true});
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {keys:edits.length};
 }) as (p:unknown)=>unknown}];
