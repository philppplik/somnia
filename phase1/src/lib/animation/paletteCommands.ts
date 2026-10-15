import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {EditError,type Edit} from './edit';
import {recolor,paletteOf,HEX} from './palette';
import {shiftPalette} from './paletteShift';
/** Replace one colour with another across the composition. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const paletteSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.palette.replace',title:'Replace a colour in every layer of the composition',category:'Edit',level:'ui',keywords:['animation','palette','colour','color','replace','recolor','swap','brand','theme','fill','stroke'],
 params:{type:'object',properties:{from:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'},to:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'}},required:['from','to'],additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&paletteOf(c.layers).length>0;},
 run:((p:{from:string;to:string})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  if(!HEX.test(p?.from??'')||!HEX.test(p?.to??''))return expected('Colours must be #rrggbb.');
  if(p.from.toLowerCase()===p.to.toLowerCase())return expected('The new colour is the same as the old one.');
  const ch=recolor(c.layers,p.from,p.to);
  if(!ch.length)return expected(c.layers.some(l=>paletteOf([l]).some(x=>x.color===p.from.toLowerCase()))?'Every layer with that colour is locked.':'No layer uses that colour.');
  const edits:Edit[]=ch.flatMap(e=>[...(e.source?[{type:'layer.update',layer:e.layer,source:e.source} as Edit]:[]),...(e.stroke?[{type:'layer.stroke',layer:e.layer,stroke:e.stroke} as Edit]:[])]);
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {layers:ch.length};
 }) as (p:unknown)=>unknown},
 {id:'animation.palette.shift',title:'Shift every colour of the composition (hue, saturation, lightness)',category:'Edit',level:'ui',keywords:['animation','palette','colour','color','hue','shift','theme','variant','lighter','darker','muted','vivid','saturation','brightness'],
  params:{type:'object',properties:{hue:{type:'integer',minimum:-180,maximum:180},saturation:{type:'integer',minimum:-100,maximum:100},lightness:{type:'integer',minimum:-60,maximum:60}},additionalProperties:false},
  enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&paletteOf(c.layers).length>0;},
  run:((p:{hue?:number;saturation?:number;lightness?:number}={})=>{
   const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
   const {hue=0,saturation=0,lightness=0}=p;
   if(![hue,saturation,lightness].every(Number.isInteger)||Math.abs(hue)>180||Math.abs(saturation)>100||Math.abs(lightness)>60)return expected('Hue is -180 to 180, saturation -100 to 100, lightness -60 to 60.');
   if(!hue&&!saturation&&!lightness)return expected('Pick a hue, saturation or lightness change.');
   const ch=shiftPalette(c.layers,{hue,saturation,lightness});
   if(!ch.length)return expected('No unlocked layer has a colour that this would change.');
   const edits:Edit[]=ch.flatMap(e=>[...(e.source?[{type:'layer.update',layer:e.layer,source:e.source} as Edit]:[]),...(e.stroke?[{type:'layer.stroke',layer:e.layer,stroke:e.stroke} as Edit]:[])]);
   try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
   return {layers:ch.length};
  }) as (p:unknown)=>unknown}];
