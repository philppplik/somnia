import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {EditError} from './edit';
import {pruneSelection} from './selection';
import {valueEdits,VALUE_MODES,MAX_OFFSET,MIN_SCALE_PERCENT,MAX_SCALE_PERCENT,type ValueMode} from './keyValues';
/** Offset or scale the values of the selected keys. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const keyValuesSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.keys.values',title:'Offset or scale the values of the selected keys',category:'Edit',level:'ui',keywords:['animation','keys','values','offset','scale','amplitude','add'],
 params:{type:'object',properties:{mode:{enum:[...VALUE_MODES]},amount:{type:'number',minimum:Math.min(-MAX_OFFSET,MIN_SCALE_PERCENT),maximum:Math.max(MAX_OFFSET,MAX_SCALE_PERCENT)},seed:{type:'integer',minimum:0,maximum:2147483647}},required:['mode','amount'],additionalProperties:false},
 enabled:()=>{const s=animationSession(),d=s.document;return !!d&&pruneSelection(d,s.getState().view.selectedKeys).length>0;},
 run:((p:{mode:ValueMode;amount:number;seed?:number})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const edits=valueEdits(c,pruneSelection(d!,s.getState().view.selectedKeys),p.mode,p.amount,p.seed);
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {keys:edits.length};
 }) as (p:unknown)=>unknown}];
