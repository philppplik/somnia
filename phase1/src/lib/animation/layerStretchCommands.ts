import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer} from './model';
import {EditError,applyEdit,type Edit} from './edit';
import {layerSetIds} from './layerSet';
/** Speed up or slow down whole layers: every key and the out point scale about the in point. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_STRETCH_LAYERS=50,MIN_STRETCH=10,MAX_STRETCH=1000;
export const layerStretchSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.stretch',title:'Stretch the time of the selected layers',category:'Edit',level:'ui',keywords:['animation','layers','time','stretch','speed','slow','fast','duration','scale','retime'],
 params:{type:'object',properties:{percent:{type:'integer',minimum:MIN_STRETCH,maximum:MAX_STRETCH},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},maxItems:MAX_STRETCH_LAYERS}},required:['percent'],additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>0;},
 run:((p:{percent:number;layers?:string[]})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  if(!Number.isInteger(p?.percent)||p.percent<MIN_STRETCH||p.percent>MAX_STRETCH||p.percent===100)return expected(`Stretch is a whole percent from ${MIN_STRETCH} to ${MAX_STRETCH}, other than 100.`);
  const ids=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].slice(0,MAX_STRETCH_LAYERS);
  if(!ids.length)return expected('Select a layer first.');
  const edits:Edit[]=[];let skipped=0,work=d!;
  for(const id of ids){const l=findLayer(c,id);if(!l||l.locked||l.kind==='audio'){skipped++;continue;}
   const e:Edit={type:'layer.stretch',layer:id,percent:p.percent};
   try{work=applyEdit(work,e);edits.push(e);}catch(x){if(x instanceof EditError){skipped++;continue;}throw x;}}
  if(!edits.length)return expected('No layer can take that stretch (locked, audio, would leave the composition, or two keys would meet).');
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {changed:edits.length,skipped};
 }) as (p:unknown)=>unknown}];
