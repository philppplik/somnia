import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,type Composition,type Layer,type Property,type Vec2} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
import {worldMatrix} from './scene';
import {evaluateMod} from './modifiers';
/** Mirror the placement and motion of the ticked layers across the vertical or horizontal line through the first ticked layer's anchor: positions (every key and its curve tangents) are reflected and rotations reverse. The artwork itself is not flipped (the model has no negative scale). Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_MIRROR_LAYERS=30;
const r2=(n:number)=>Math.round(n*100)/100;
export const reflect=(v:Vec2,axis:'x'|'y',c:number):Vec2=>axis==='x'?[r2(2*c-v[0]),v[1]]:[v[0],r2(2*c-v[1])];
/** Edits that mirror one layer; null when the layer has a parent (its position lives in the parent's space). */
export function mirrorEdits(l:Layer,axis:'x'|'y',c:number,t0:number):Edit[]|null{
 if(l.parent)return null;
 const out:Edit[]=[],pos:Property=l.transform.position,rot:Property=l.transform.rotation;
 if(!pos.keys.length)out.push({type:'prop.set',layer:l.id,prop:'position',t:t0,value:reflect(pos.value as Vec2,axis,c) as never});
 for(const k of pos.keys){out.push({type:'prop.set',layer:l.id,prop:'position',t:k.t,value:reflect(k.v as Vec2,axis,c) as never});
  if(k.sIn||k.sOut){const f=(v?:Vec2):Vec2|undefined=>v?(axis==='x'?[-v[0],v[1]]:[v[0],-v[1]]):undefined;out.push({type:'key.spatial',layer:l.id,prop:'position',t:k.t,sIn:f(k.sIn),sOut:f(k.sOut)});}}
 if(!rot.keys.length){if(rot.value as number!==0)out.push({type:'prop.set',layer:l.id,prop:'rotation',t:t0,value:-(rot.value as number) as never});}
 for(const k of rot.keys)out.push({type:'prop.set',layer:l.id,prop:'rotation',t:k.t,value:-(k.v as number) as never});
 return out;
}
export const mirrorSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.mirror',title:'Mirror the ticked layers across the first ticked layer',category:'Edit',level:'ui',keywords:['animation','mirror','symmetry','reflect','flip','opposite','left right','copy','duplicate'],
 params:{type:'object',properties:{axis:{enum:['x','y']},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:2,maxItems:MAX_MIRROR_LAYERS+1}},required:['axis'],additionalProperties:false},
 // The Rig menu passes its ticked layers: the first sets the mirror line, the others are mirrored.
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>1;},
 run:((p:{axis?:'x'|'y';layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c:Composition|undefined=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  if(p.axis!=='x'&&p.axis!=='y')return expected('Choose the left-right or the top-bottom mirror.');
  const ids=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].slice(0,MAX_MIRROR_LAYERS+1).map(id=>findLayer(c,id)).filter((l):l is Layer=>!!l);
  if(ids.length<2)return expected('Tick the mirror layer first, then the layers to mirror.');
  const ref=ids[0],t0=c.workArea.in,m=worldMatrix(c,ref,t0),an=evaluateMod(ref.transform.anchor,t0) as Vec2;
  const line=p.axis==='x'?m[0]*an[0]+m[2]*an[1]+m[4]:m[1]*an[0]+m[3]*an[1]+m[5];
  const edits:Edit[]=[];let mirrored=0,skipped=0;
  for(const l of ids.slice(1)){if(l.locked||l.kind==='audio'){skipped++;continue;}const e=mirrorEdits(l,p.axis,line,t0);if(!e){skipped++;continue;}if(e.length)mirrored++;edits.push(...e);}
  if(!edits.length)return expected('Nothing to mirror: the layers are locked or hang from a parent layer. Mirroring needs layers without a parent.');
  try{s.dispatch(edits);}catch(err){if(err instanceof EditError)throw Object.assign(err,{expected:true});throw err;}
  return {mirrored,skipped,axis:p.axis};
 }) as (p:unknown)=>unknown}];
