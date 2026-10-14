import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {EditError} from './edit';
import {pruneSelection} from './selection';
import {influenceEdits,MIN_INFLUENCE,MAX_INFLUENCE} from './keyInfluence';
/** Set ease handle length. Own file so the big command array keeps cheap type inference. */
export const keyInfluenceSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.keys.influence',title:'Set the ease influence of the selected keys',category:'Edit',level:'ui',keywords:['animation','keys','ease','influence','handle','length','speed','bezier'],
 params:{type:'object',properties:{percent:{type:'number',minimum:MIN_INFLUENCE,maximum:MAX_INFLUENCE}},required:['percent'],additionalProperties:false},
 enabled:()=>{const s=animationSession(),d=s.document;return !!d&&pruneSelection(d,s.getState().view.selectedKeys).length>0;},
 run:((p:{percent:number})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)throw Object.assign(new Error('No composition is open.'),{expected:true});
  const edits=influenceEdits(c,pruneSelection(d!,s.getState().view.selectedKeys),p.percent);
  if(!edits.length)throw Object.assign(new Error('No selected eased key would change.'),{expected:true});
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {keys:edits.length};
 }) as (p:unknown)=>unknown}];
