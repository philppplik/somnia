import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {EditError} from './edit';
import {pruneSelection} from './selection';
import {echoEdits,MAX_ECHO_FRAMES} from './keyEcho';
import {repeatedRefs} from './keyRepeat';
/** Echo the selected keys some frames later or earlier. Own file so the big command array keeps cheap type inference. */
export const keyEchoSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.keys.echo',title:'Copy the selected keys some frames later or earlier',category:'Edit',level:'ui',keywords:['animation','keys','echo','duplicate','copy','offset','delay','shift'],
 params:{type:'object',properties:{frames:{type:'integer',minimum:-MAX_ECHO_FRAMES,maximum:MAX_ECHO_FRAMES}},required:['frames'],additionalProperties:false},
 enabled:()=>{const s=animationSession(),d=s.document;return !!d&&pruneSelection(d,s.getState().view.selectedKeys).length>0;},
 run:((p:{frames:number})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)throw Object.assign(new Error('No composition is open.'),{expected:true});
  const keys=pruneSelection(d!,s.getState().view.selectedKeys),edits=echoEdits(c,keys,p.frames);
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  s.selectKeys([...keys,...repeatedRefs(c,edits)]);
  return {layers:edits.length};
 }) as (p:unknown)=>unknown}];
