import {animationSession} from '../animation/session';
import {ticksToSeconds} from '../animation/time';
import {AgentProjectTools} from './projectTools';
import {createAnimationKeyPort} from './animationKeyPort';
import type {AnimationKeyTransactions} from './animationKeyTransactions';
import type {AgentEvent} from './coreTypes';
import type {AgentStudioContext} from './studioContextAdapter';

const formatValue=(value:unknown)=>Array.isArray(value)?value.join(', '):String(value);
export interface AnimationRunTools{tools:AgentProjectTools;documentId:string;label:string}
/**
 * Tool-enabled local run on the open Animation document, or null when plain chat applies
 * (other studios, cloud providers or no open animation). Local Ollama only, no cloud fallback:
 * the selected key never leaves the device and the port stays inspect/propose with host review.
 */
export function createAnimationRunTools(options:{
 studio:AgentStudioContext|undefined;
 provider:string;
 projectId:string;
 /** Throws when this run was superseded by a newer panel run. */
 assertRun:()=>void;
 transactions:AnimationKeyTransactions;
 send:((event:AgentEvent)=>void)|null;
 onReview:(proposalId:string)=>void;
}):AnimationRunTools|null{
 if(options.studio?.studioId!=='animation'||options.provider!=='ollama')return null;
 const session=animationSession(),doc=session.document;
 if(!doc)return null;
 const port=createAnimationKeyPort({
  session,
  permission:()=>{options.assertRun();if(session.document!==doc)throw Error('Animation document changed. Start a new chat.');},
  stage:proposal=>{
   const id=crypto.randomUUID();
   options.transactions.stage(id,{proposal,port,origin:`ai:animation-key-${options.projectId}`});
   const label=`Layer ${proposal.target.layer} · ${proposal.target.prop} key at ${ticksToSeconds(proposal.target.t).toFixed(2)}s`;
   options.send?.({type:'proposal',proposal:{id,file:doc.name,lines:[{kind:'del',text:formatValue(proposal.before)},{kind:'add',text:formatValue(proposal.after)}],added:1,removed:1,animation:{label,before:formatValue(proposal.before),after:formatValue(proposal.after)}}});
   options.onReview(id);
  },
  execution:{permission:()=>{options.assertRun();if(animationSession()!==session)throw Error('Animation session changed. Start a new chat.');}},
 });
 return {tools:new AgentProjectTools({projectId:options.projectId,files:()=>({}),allowed:()=>false},undefined,undefined,{registry:port,nativeOnly:true}),documentId:doc.id,label:doc.name};
}
