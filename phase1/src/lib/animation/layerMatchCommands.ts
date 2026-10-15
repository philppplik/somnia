import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,type PropValue} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
import {evaluate} from './interpolate';
import {worldMatrix,applyMatrix} from './scene';
import {toParentDelta} from './snap';
/** Copy position, scale, rotation or opacity of the first layer onto the other layers at the playhead. Own file so the big command array keeps cheap type inference. */
export const MATCH_MODES=['position','scale','rotation','opacity','all'] as const;
export type MatchMode=typeof MATCH_MODES[number];
export const MAX_MATCH_LAYERS=50;
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
const round=(n:number)=>Math.round(n*100)/100;
const same=(a:PropValue,b:PropValue)=>typeof a==='number'||typeof b==='number'?a===b:a[0]===b[0]&&a[1]===b[1];
export const layerMatchSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.match',title:'Match the other layers to the first layer',category:'Edit',level:'ui',keywords:['animation','layer','match','copy','same','position','scale','rotation','opacity','transform','first'],
 params:{type:'object',properties:{mode:{type:'string',enum:[...MATCH_MODES]},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:2,maxItems:MAX_MATCH_LAYERS}},required:['mode'],additionalProperties:false},
 // The Rig menu passes its own ticked layers (the first one is the reference), so this must not depend on the timeline selection.
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>1;},
 run:((p:{mode:MatchMode;layers?:string[]})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  if(!MATCH_MODES.includes(p?.mode))return expected('Unknown match mode.');
  const ls=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].slice(0,MAX_MATCH_LAYERS).map(id=>findLayer(c,id)).filter(l=>!!l);
  if(ls.length<2)return expected('Select at least two layers. The first one is the reference.');
  const [ref,...rest]=ls as NonNullable<typeof ls[number]>[];const t=s.getState().view.playhead;
  const targets=rest.filter(l=>!l.locked&&l.kind!=='audio');if(!targets.length)return expected('The other layers are locked or cannot move.');
  const props=p.mode==='all'?(['position','scale','rotation','opacity'] as const):[p.mode] as const;
  const edits:Edit[]=[];
  for(const l of targets)for(const k of props){
   if(k==='position'){
    const a=applyMatrix(worldMatrix(c,ref,t),evaluate(ref.transform.anchor,t) as [number,number]),b=applyMatrix(worldMatrix(c,l,t),evaluate(l.transform.anchor,t) as [number,number]);
    const dx=a[0]-b[0],dy=a[1]-b[1];if(Math.abs(dx)<0.005&&Math.abs(dy)<0.005)continue;
    const pd=toParentDelta(c,l,t,[dx,dy]),cur=evaluate(l.transform.position,t) as readonly number[];
    edits.push({type:'prop.set',layer:l.id,prop:'position',t,value:[round(cur[0]+pd[0]),round(cur[1]+pd[1])]});continue;
   }
   const v=evaluate(ref.transform[k],t) as PropValue;if(!same(evaluate(l.transform[k],t),v))edits.push({type:'prop.set',layer:l.id,prop:k,value:v,t});
  }
  if(!edits.length)return expected('The layers already match the first one.');
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {changed:edits.length,skippedLocked:rest.length-targets.length};
 }) as (p:unknown)=>unknown}];
