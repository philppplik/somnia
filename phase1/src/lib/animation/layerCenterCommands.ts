import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,type Composition,type Layer} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
import {localMatrix,applyMatrix} from './scene';
/** Move the anchor point of the selected layers to the centre of their content without moving them on screen. Own file so the big command array keeps cheap type inference. */
export const MAX_CENTER_LAYERS=50;
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
const round=(n:number)=>Math.round(n*100)/100;
/** Edits that put the anchor of `l` at its content centre and shift the position so the picture stays put; null when the layer cannot be centred. */
export function centerAnchorEdits(c:Composition,l:Layer,t:number):Edit[]|null{
 const w=l.source.width,h=l.source.height;
 if(l.locked||l.kind==='audio'||!(w&&h&&w>0&&h>0)||l.transform.anchor.keys.length||l.transform.position.keys.length)return null;
 const a:[number,number]=[w/2,h/2],old=l.transform.anchor.value as readonly number[];
 if(Math.abs((old[0]??0)-a[0])<0.005&&Math.abs((old[1]??0)-a[1])<0.005)return null;
 const p=applyMatrix(localMatrix(l,t,c),a);
 return [{type:'prop.set',layer:l.id,prop:'anchor',value:a,t},{type:'prop.set',layer:l.id,prop:'position',value:[round(p[0]),round(p[1])],t}];
}
export const layerCenterSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.centerAnchor',title:'Center the anchor point of the selected layers',category:'Edit',level:'ui',keywords:['animation','layer','anchor','pivot','center','centre','origin','rotation'],
 params:{type:'object',properties:{layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_CENTER_LAYERS}},additionalProperties:false},
 // The Rig menu passes its own ticked layers, so this must not depend on the timeline selection.
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>0;},
 run:((p?:{layers?:string[]})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const ls=(p?.layers??layerSetIds(s.getState().view.selectedLayer)).slice(0,MAX_CENTER_LAYERS).map(id=>findLayer(c,id)).filter(l=>!!l);
  if(!ls.length)return expected('Select a layer first.');
  const t=s.getState().view.playhead,edits:Edit[]=[];let layers=0;
  for(const l of ls){const e=centerAnchorEdits(c,l!,t);if(e){edits.push(...e);layers++;}}
  if(!edits.length)return expected('No selected layer can be centred (animated anchor or position, no size, locked, or already centred).');
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {centred:layers,skipped:ls.length-layers};
 }) as (p?:unknown)=>unknown}];
