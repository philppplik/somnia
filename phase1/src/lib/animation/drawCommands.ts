import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,EASE_IN,EASE_OUT,type Layer,type Property} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
import {frameToTick} from './time';
/** Draw on / draw off: the stroke trim of each ticked shape runs 0 to 100 (or back), one layer after the other in tick order. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_DRAW_LAYERS=30,MAX_DRAW_FRAMES=240;
export function drawTrim(t0:number,t1:number,off:boolean,ease:boolean):Property{
 const a=off?[100,0]:[0,100];
 return {type:'scalar',value:a[0],keys:[t0,t1].map((t,i)=>({t,v:a[i],interp:ease?'bezier' as const:'linear' as const,out:EASE_OUT,in:EASE_IN}))} as Property;
}
/** Start tick of layer i: staggered by `gap` ticks, squeezed so the last one still ends inside the layer. */
export function drawStart(i:number,n:number,gap:number,dur:number,len:number):number{
 const room=Math.max(0,len-dur),step=n>1?Math.min(gap,room/(n-1)):0;return Math.round(i*step);
}
export const drawSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.draw',title:'Draw the ticked stroked shapes on or off, one after the other',category:'Edit',level:'ui',keywords:['animation','draw','draw on','trace','stroke','trim','line','reveal','write'],
 params:{type:'object',properties:{mode:{type:'string',enum:['on','off']},frames:{type:'integer',minimum:1,maximum:MAX_DRAW_FRAMES},gap:{type:'integer',minimum:0,maximum:MAX_DRAW_FRAMES},ease:{type:'boolean'},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_DRAW_LAYERS}},additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.some(l=>l.kind==='shape'&&!!l.stroke);},
 run:((p:{mode?:string;frames?:number;gap?:number;ease?:boolean;layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const mode=p.mode??'on',frames=p.frames??24,gap=p.gap??6;
  if(mode!=='on'&&mode!=='off')return expected('Draw on or off.');
  if(!Number.isInteger(frames)||frames<1||frames>MAX_DRAW_FRAMES)return expected(`Drawing lasts 1 to ${MAX_DRAW_FRAMES} frames.`);
  if(!Number.isInteger(gap)||gap<0||gap>MAX_DRAW_FRAMES)return expected(`The delay between layers is 0 to ${MAX_DRAW_FRAMES} frames.`);
  const ids=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].slice(0,MAX_DRAW_LAYERS);
  const all=ids.map(id=>findLayer(c,id)).filter((l):l is Layer=>!!l);
  const ls=all.filter(l=>!l.locked&&l.kind==='shape'&&!!l.stroke);
  if(!ls.length)return expected('Tick at least one unlocked shape that has a stroke.');
  const edits:Edit[]=[];let skipped=all.length-ls.length;const run=ls.filter(l=>{const ok=!l.stroke!.trim?.modifiers?.length;if(!ok)skipped++;return ok;});
  if(!run.length)return expected('The ticked strokes already use a modifier on their trim.');
  run.forEach((l,i)=>{
   const len=l.outT-l.inT,dur=Math.min(frameToTick(frames,c.fps),len),g=frameToTick(gap,c.fps);
   const st=drawStart(i,run.length,g,dur,len),t0=mode==='on'?l.inT+st:l.outT-dur-(run.length-1-i>=0?drawStart(run.length-1-i,run.length,g,dur,len):0);
   edits.push({type:'layer.stroke' as const,layer:l.id,stroke:{...l.stroke!,trim:drawTrim(t0,t0+dur,mode==='off',p.ease!==false)}});
  });
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {layers:run.length,skipped,mode};
 }) as (p:unknown)=>unknown}];
