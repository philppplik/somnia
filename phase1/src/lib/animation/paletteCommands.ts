import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {EditError,type Edit} from './edit';
import {recolor,paletteOf,HEX} from './palette';
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
 }) as (p:unknown)=>unknown}];
