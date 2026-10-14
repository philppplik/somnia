import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {EditError} from './edit';
import {pruneSelection} from './selection';
import {gridMoves,MAX_GRID_FRAMES} from './keyGrid';
/** Snap the selected keys to an every-N-frames grid. Own file so the big command array keeps cheap type inference. */
export const keyGridSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.keys.snapToGrid',title:'Snap the selected keys to every Nth frame',category:'Edit',level:'ui',keywords:['animation','keys','snap','grid','quantize','frames','step','round','twos','fours'],
 params:{type:'object',properties:{frames:{type:'integer',minimum:2,maximum:MAX_GRID_FRAMES}},required:['frames'],additionalProperties:false},
 enabled:()=>{const s=animationSession(),d=s.document;return !!d&&pruneSelection(d,s.getState().view.selectedKeys).length>0;},
 run:((p:{frames:number})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)throw Object.assign(new Error('No composition is open.'),{expected:true});
  const sel=pruneSelection(d!,s.getState().view.selectedKeys),r=gridMoves(c,sel,p.frames);
  if(!r.moves.length)throw Object.assign(new Error(r.unchanged?'The keys are already on that grid.':'No key could snap without hitting another key.'),{expected:true});
  try{s.dispatch({type:'keys.retime',moves:r.moves});}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  const to=new Map(r.moves.map(m=>[`${m.layer}\0${m.prop}\0${m.from}`,m.to]));
  s.selectKeys(sel.map(k=>({...k,t:to.get(`${k.layer}\0${k.prop}\0${k.t}`)??k.t})));
  return {moved:r.moves.length,skipped:r.skipped};
 }) as (p:unknown)=>unknown}];
