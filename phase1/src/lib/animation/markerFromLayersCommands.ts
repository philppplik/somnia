import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,newId,type Marker} from './model';
import {EditError} from './edit';
import {layerSetIds} from './layerSet';
import {MAX_DUPLICATE_LAYERS} from './layerDuplicate';
import {snapToFrame} from './time';
/** Drop a timing marker on the in point of each selected layer, named after it. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_MARKERS=200;
export const markerFromLayersSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.marker.fromLayers',title:'Add markers at the in points of the selected layers',category:'Edit',level:'ui',keywords:['animation','marker','layer','in point','cue','sync','timing'],
 params:{type:'object',properties:{layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_DUPLICATE_LAYERS}},additionalProperties:false},
 enabled:()=>{const s=animationSession(),d=s.document,c=d?findComp(d):undefined;return !!c&&layerSetIds(s.getState().view.selectedLayer).some(id=>!!findLayer(c,id));},
 run:((p:{layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const want=new Set(p.layers??layerSetIds(s.getState().view.selectedLayer)),ls=c.layers.filter(l=>want.has(l.id));
  if(!ls.length)return expected('Select a layer first.');
  const ms=[...(c.markers??[])],have=new Set(ms.map(m=>m.t)),added:Marker[]=[];
  for(const l of ls){const t=snapToFrame(Math.max(l.inT,c.start),c.fps);if(t<c.start||t>=c.start+c.duration||have.has(t))continue;have.add(t);added.push({id:newId('marker'),t,label:l.name.slice(0,100)});}
  if(!added.length)return expected('Those in points already have markers.');
  if(ms.length+added.length>MAX_MARKERS)return expected(`A composition holds at most ${MAX_MARKERS} markers.`);
  try{s.dispatch({type:'markers.set',markers:[...ms,...added]});}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {added:added.length};
 }) as (p:unknown)=>unknown}];
