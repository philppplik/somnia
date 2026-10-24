import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,type Layer,type PropValue} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
/** Snap to grid: rounds the position of the ticked layers (the static value and every position key) to a grid in pixels. Positions are the layer's own, so a child of a parent snaps relative to that parent. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_GRID_LAYERS=100,MAX_GRID=200;
export const snapTo=(v:number,grid:number):number=>{const r=Math.round(v/grid)*grid;return Math.round(r*100)/100+0;};
export const gridSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.grid',title:'Snap the position of the ticked layers to a pixel grid',category:'Edit',level:'ui',keywords:['animation','grid','snap','round','pixel','position','align','tidy','layout'],
 params:{type:'object',properties:{size:{type:'integer',minimum:1,maximum:MAX_GRID},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_GRID_LAYERS}},additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>0;},
 run:((p:{size?:number;layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const size=p.size??10;if(!Number.isInteger(size)||size<1||size>MAX_GRID)return expected(`The grid is 1 to ${MAX_GRID} pixels.`);
  const ls=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].slice(0,MAX_GRID_LAYERS).map(id=>findLayer(c,id)).filter((l):l is Layer=>!!l&&!l.locked&&!l.transform.position.modifiers?.length);
  if(!ls.length)return expected('Tick at least one unlocked layer without a position modifier.');
  const edits:Edit[]=[];let moved=0;
  for(const l of ls){
   const pr=l.transform.position,pts:{t:number;v:readonly number[]}[]=pr.keys.length?pr.keys.map(k=>({t:k.t,v:k.v as readonly number[]})):[{t:0,v:pr.value as readonly number[]}];
   let changed=false;
   for(const q of pts){const n=[snapTo(q.v[0],size),snapTo(q.v[1],size)];if(n[0]!==q.v[0]||n[1]!==q.v[1]){changed=true;edits.push({type:'prop.set',layer:l.id,prop:'position',t:q.t,value:n as unknown as PropValue as never});}}
   if(changed)moved++;
  }
  if(!moved)return expected('Every ticked layer already sits on the grid.');
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {layers:moved,size};
 }) as (p:unknown)=>unknown}];
