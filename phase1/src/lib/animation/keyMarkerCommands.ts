import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {EditError} from './edit';
import {pruneSelection} from './selection';
import {quantizeMoves} from './keyQuantize';
import {frameToTick} from './time';
/** Snap the selected keys to the nearest composition marker (beat sync). Own file so the big command array keeps cheap type inference. */
export const keyMarkerSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.keys.snapToMarkers',title:'Snap the selected keys to the nearest marker',category:'Edit',level:'ui',keywords:['animation','keys','snap','marker','beat','sync','music','align'],
 params:{type:'object',properties:{maxFrames:{type:'integer',minimum:1,maximum:1000}},additionalProperties:false},
 enabled:()=>{const s=animationSession(),d=s.document,c=d?findComp(d):undefined;return !!d&&!!c?.markers?.length&&pruneSelection(d,s.getState().view.selectedKeys).length>0;},
 run:((p:{maxFrames?:number})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)throw Object.assign(new Error('No composition is open.'),{expected:true});
  if(!c.markers?.length)throw Object.assign(new Error('Add markers first.'),{expected:true});
  const sel=pruneSelection(d!,s.getState().view.selectedKeys);
  const max=p?.maxFrames?frameToTick(p.maxFrames,c.fps):Infinity;
  const r=quantizeMoves(c,sel,c.markers.map(m=>m.t),max);
  if(!r.moves.length)throw Object.assign(new Error(p?.maxFrames?'No selected key is that close to a marker.':r.unchanged?'The keys are already on markers.':'No key could snap to a marker.'),{expected:true});
  try{s.dispatch({type:'keys.retime',moves:r.moves});}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  const to=new Map(r.moves.map(m=>[`${m.layer}\0${m.prop}\0${m.from}`,m.to]));
  s.selectKeys(sel.map(k=>({...k,t:to.get(`${k.layer}\0${k.prop}\0${k.t}`)??k.t})));
  return {moved:r.moves.length,skipped:r.skipped};
 }) as (p:unknown)=>unknown}];
