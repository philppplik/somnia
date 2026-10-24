import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import type {AnimationDocument} from './model';
import {EditError,type Edit} from './edit';
/** Remove compositions nothing uses: not the open one and not reachable from it through comp layers. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
/** Ids of the unused compositions, ordered so that a composition comes before the ones it uses (removal refuses a composition that is still used). */
export function unusedComps(d:AnimationDocument):string[]{
 const by=new Map(d.compositions.map(c=>[c.id,c]));const keep=new Set<string>();const stack=[d.activeComp];
 while(stack.length){const id=stack.pop()!;if(keep.has(id))continue;keep.add(id);for(const l of by.get(id)?.layers??[])if(l.kind==='comp'&&l.source.compId)stack.push(l.source.compId);}
 const dead=d.compositions.filter(c=>!keep.has(c.id)).map(c=>c.id),left=new Set(dead),out:string[]=[];
 while(left.size){
  const free=[...left].filter(id=>![...left].some(o=>o!==id&&by.get(o)!.layers.some(l=>l.kind==='comp'&&l.source.compId===id)));
  if(!free.length)break;for(const id of free){out.push(id);left.delete(id);}
 }
 return out;
}
export const compPurgeSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.comp.purgeUnused',title:'Remove compositions that nothing uses',category:'Edit',level:'ui',keywords:['animation','composition','remove','unused','purge','clean','delete','precomp','file size'],
 params:{type:'object',properties:{},additionalProperties:false},
 enabled:()=>{const d=animationSession().document;return !!d&&d.compositions.length>1;},
 run:(()=>{
  const s=animationSession(),d=s.document;if(!d)return expected('No document is open.');
  const ids=unusedComps(d);if(!ids.length)return expected('Every composition is in use.');
  const edits:Edit[]=ids.map(comp=>({type:'comp.remove',comp}));
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {removed:ids.length};
 }) as (p:unknown)=>unknown}];
