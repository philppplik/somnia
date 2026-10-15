import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,newId,EASE_IN,EASE_OUT,type Layer,type LayerMask,type Property} from './model';
import {EditError} from './edit';
import {layerSetIds} from './layerSet';
import {frameToTick} from './time';
/** Wipe: a rect mask opens (in) or closes (out) across the layer from one edge. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const WIPE_DIRS=['left','right','up','down'] as const;
export type WipeDir=typeof WIPE_DIRS[number];
export const MAX_WIPE_LAYERS=30,MAX_WIPE_FRAMES=240;
const key=(t:number,v:[number,number],ease:boolean)=>({t,v,interp:ease?'bezier' as const:'linear' as const,out:EASE_OUT,in:EASE_IN});
/** The mask for a wipe. At the closed end it is a 1px sliver just outside the layer, so nothing shows; at the open end it covers the whole layer. */
export function wipeMask(id:string,w:number,h:number,dir:WipeDir,t0:number,t1:number,reverse:boolean,ease:boolean):LayerMask{
 const horiz=dir==='left'||dir==='right';
 const pos0:[number,number]=dir==='left'?[-1,0]:dir==='right'?[w,0]:dir==='up'?[0,-1]:[0,h];
 const size0:[number,number]=horiz?[1,h]:[w,1];
 const a=reverse?[[t0,[0,0] as [number,number],[w,h] as [number,number]],[t1,pos0,size0]] as const:[[t0,pos0,size0],[t1,[0,0] as [number,number],[w,h] as [number,number]]] as const;
 const position:Property={type:'vec2',value:a[0][1],keys:a.map(k=>key(k[0],k[1],ease))} as Property;
 const size:Property={type:'vec2',value:a[0][2],keys:a.map(k=>key(k[0],k[2],ease))} as Property;
 return {id,shape:'rect',mode:'add',x:0,y:0,width:w,height:h,feather:0,invert:false,anim:{position,size}};
}
export const wipeSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.wipe',title:'Wipe the ticked layers in or out with a mask',category:'Edit',level:'ui',keywords:['animation','wipe','reveal','mask','transition','slide','uncover','in','out'],
 params:{type:'object',properties:{mode:{type:'string',enum:['in','out']},dir:{type:'string',enum:[...WIPE_DIRS]},frames:{type:'integer',minimum:1,maximum:MAX_WIPE_FRAMES},ease:{type:'boolean'},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_WIPE_LAYERS}},additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>0;},
 run:((p:{mode?:string;dir?:string;frames?:number;ease?:boolean;layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const mode=p.mode??'in',dir=(p.dir??'left') as WipeDir,frames=p.frames??12;
  if(mode!=='in'&&mode!=='out')return expected('Wipe in or out.');
  if(!WIPE_DIRS.includes(dir))return expected('The wipe starts from left, right, up or down.');
  if(!Number.isInteger(frames)||frames<1||frames>MAX_WIPE_FRAMES)return expected(`The wipe lasts 1 to ${MAX_WIPE_FRAMES} frames.`);
  const ls=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].slice(0,MAX_WIPE_LAYERS).map(id=>findLayer(c,id)).filter((l):l is Layer=>!!l&&!l.locked&&l.kind!=='audio'&&l.kind!=='null');
  if(!ls.length)return expected('Tick at least one unlocked drawable layer.');
  const edits=[];let done=0,skipped=0;
  for(const l of ls){
   if(l.masks?.length){skipped++;continue;}
   const len=l.outT-l.inT,dur=Math.min(frameToTick(frames,c.fps),len);if(dur<=0){skipped++;continue;}
   const t0=mode==='in'?l.inT:l.outT-dur,w=Math.max(1,Math.round(l.source.width??c.width)),h=Math.max(1,Math.round(l.source.height??c.height));
   edits.push({type:'layer.masks' as const,layer:l.id,masks:[wipeMask(newId('mask'),w,h,dir,t0,t0+dur,mode==='out',p.ease!==false)]});done++;
  }
  if(!done)return expected('The ticked layers already have masks.');
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {layers:done,skipped,mode,dir};
 }) as (p:unknown)=>unknown}];
