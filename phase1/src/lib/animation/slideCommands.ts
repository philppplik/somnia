import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,type Layer} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
import {frameToTick} from './time';
/** Slide: the ticked layers fly in from beyond a canvas edge to where they are, or out to beyond it, at their in or out point. Position keys only. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const SLIDE_DIRS=['left','right','up','down'] as const;
export type SlideDir=typeof SLIDE_DIRS[number];
export const MAX_SLIDE_LAYERS=30,MAX_SLIDE_FRAMES=240;
/** The off-canvas position: a whole canvas width or height away, which clears any layer that sits inside the canvas. */
export function offCanvas(pos:readonly number[],dir:SlideDir,w:number,h:number):[number,number]{
 return dir==='left'?[pos[0]-w,pos[1]]:dir==='right'?[pos[0]+w,pos[1]]:dir==='up'?[pos[0],pos[1]-h]:[pos[0],pos[1]+h];
}
export const slideSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.slide',title:'Fly the ticked layers in from or out past a canvas edge',category:'Edit',level:'ui',keywords:['animation','slide','fly','in','out','enter','exit','edge','transition','move','entrance'],
 params:{type:'object',properties:{mode:{type:'string',enum:['in','out']},dir:{type:'string',enum:[...SLIDE_DIRS]},frames:{type:'integer',minimum:1,maximum:MAX_SLIDE_FRAMES},ease:{type:'boolean'},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_SLIDE_LAYERS}},additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>0;},
 run:((p:{mode?:string;dir?:string;frames?:number;ease?:boolean;layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const mode=p.mode??'in',dir=(p.dir??'left') as SlideDir,frames=p.frames??12;
  if(mode!=='in'&&mode!=='out')return expected('Fly in or out.');
  if(!SLIDE_DIRS.includes(dir))return expected('The edge is left, right, up or down.');
  if(!Number.isInteger(frames)||frames<1||frames>MAX_SLIDE_FRAMES)return expected(`The slide lasts 1 to ${MAX_SLIDE_FRAMES} frames.`);
  const ls=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].slice(0,MAX_SLIDE_LAYERS).map(id=>findLayer(c,id)).filter((l):l is Layer=>!!l&&!l.locked&&l.kind!=='audio'&&l.kind!=='null');
  if(!ls.length)return expected('Tick at least one unlocked drawable layer.');
  const edits:Edit[]=[];let done=0,skipped=0;
  for(const l of ls){
   const pr=l.transform.position;
   if(l.parent||pr.keys.length||pr.modifiers?.length){skipped++;continue;}
   const dur=Math.min(frameToTick(frames,c.fps),l.outT-l.inT);if(dur<=0){skipped++;continue;}
   const home=pr.value as readonly number[],away=offCanvas(home,dir,c.width,c.height),t0=mode==='in'?l.inT:l.outT-dur,t1=t0+dur;
   const [a,b]=mode==='in'?[away,home]:[home,away];
   edits.push({type:'prop.animate',layer:l.id,prop:'position',on:true,t:t0},{type:'prop.set',layer:l.id,prop:'position',t:t0,value:[...a] as never},{type:'key.add',layer:l.id,prop:'position',t:t1},{type:'prop.set',layer:l.id,prop:'position',t:t1,value:[...b] as never});
   for(const t of [t0,t1])edits.push({type:'key.interp',layer:l.id,prop:'position',t,interp:p.ease===false?'linear':'bezier'});
   done++;
  }
  if(!done)return expected('No ticked layer can slide (it has a parent, animated position or modifiers, or is too short).');
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {layers:done,skipped,mode,dir};
 }) as (p:unknown)=>unknown}];
