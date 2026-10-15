import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,type Layer} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
import {shiftColor} from './paletteShift';
import {frameToTick,tickToFrame} from './time';
/** Colour cycle: the fill (or stroke) colour of each ticked layer runs once or more round the hue wheel over the layer's life, ending on its start colour so it loops. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_HUE_LAYERS=30,MAX_HUE_CYCLES=8,HUE_STEPS=8;
/** Hue offsets (degrees) of the keys of one cycle set: 8 steps per cycle, the last one a full turn. */
export function hueSteps(cycles:number):number[]{const n=HUE_STEPS*cycles,out:number[]=[];for(let i=0;i<=n;i++)out.push(i===n?360*cycles:(360*i)/HUE_STEPS);return out;}
export const hueSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.hue',title:'Cycle the colour of the ticked layers round the hue wheel',category:'Edit',level:'ui',keywords:['animation','colour','color','hue','cycle','rainbow','loop','fill','stroke','shift'],
 params:{type:'object',properties:{target:{type:'string',enum:['fill','stroke']},cycles:{type:'integer',minimum:1,maximum:MAX_HUE_CYCLES},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_HUE_LAYERS}},additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.some(l=>l.kind==='solid'||l.kind==='shape'||l.kind==='text');},
 run:((p:{target?:string;cycles?:number;layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const target=(p.target??'fill') as 'fill'|'stroke',cycles=p.cycles??1;
  if(target!=='fill'&&target!=='stroke')return expected('Cycle the fill or the stroke.');
  if(!Number.isInteger(cycles)||cycles<1||cycles>MAX_HUE_CYCLES)return expected(`1 to ${MAX_HUE_CYCLES} cycles.`);
  const all=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].slice(0,MAX_HUE_LAYERS).map(id=>findLayer(c,id)).filter((l):l is Layer=>!!l&&!l.locked);
  const colour=(l:Layer):string|undefined=>target==='fill'?((l.kind==='solid'||l.kind==='shape'||l.kind==='text')&&!l.source.gradient?l.source.color??(l.kind==='text'?'#ffffff':undefined):undefined):(l.kind==='shape'&&l.stroke&&!l.stroke.gradient?l.stroke.color:undefined);
  const ls=all.filter(l=>colour(l)!==undefined&&!l.colorKeys?.[target]?.length);
  if(!ls.length)return expected(`Tick an unlocked layer with a plain ${target} colour that has no colour keys yet.`);
  const edits:Edit[]=[];
  for(const l of ls){
   const base=colour(l)!,steps=hueSteps(cycles),n=steps.length-1,a=tickToFrame(l.inT,c.fps),b=tickToFrame(l.outT,c.fps);
   if(b-a<n)return expected(`${l.name} is too short for ${cycles} colour cycle${cycles>1?'s':''}.`);
   steps.forEach((deg,i)=>{const t=frameToTick(Math.round(a+((b-a)*i)/n),c.fps);
    edits.push({type:'color.prop',layer:l.id,prop:target,op:'animate',on:true,t} as Edit,{type:'color.prop',layer:l.id,prop:target,op:'set',color:shiftColor(base,{hue:deg%360}),t} as Edit);});
  }
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {layers:ls.length,skipped:all.length-ls.length,target,cycles};
 }) as (p:unknown)=>unknown}];
