import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,newId,type Layer} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
import {layerKeyTimes} from './layerShift';
import {sendCopies} from './layerSend';
/** Copy or move layers into another composition. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_SEND_LAYERS=50;
export const layerSendSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.sendTo',title:'Copy or move layers to another composition',category:'Edit',level:'ui',keywords:['animation','layers','composition','copy','move','send','transfer','paste','another'],
 params:{type:'object',properties:{comp:{type:'string',minLength:1,maxLength:200},move:{type:'boolean'},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},maxItems:MAX_SEND_LAYERS}},required:['comp'],additionalProperties:false},
 enabled:()=>{const d=animationSession().document;return !!d&&d.compositions.length>1;},
 run:((p:{comp:string;move?:boolean;layers?:string[]})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c||!d)return expected('No composition is open.');
  const target=d.compositions.find(x=>x.id===p?.comp);if(!target)return expected('Pick another composition.');
  if(target.id===c.id)return expected('Pick a different composition than the current one.');
  const want=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].slice(0,MAX_SEND_LAYERS);
  const picked=c.layers.filter(l=>want.includes(l.id)&&!(p.move&&l.locked));
  if(!picked.length)return expected('Select a layer first.');
  const lo=target.start,hi=target.start+target.duration;
  const fits=(l:Layer)=>l.outT<=target.duration&&l.inT>=0&&l.outT>l.inT&&layerKeyTimes(l).every(t=>t>=lo&&t<=hi)&&!(l.kind==='comp'&&l.source.compId===target.id);
  const ok=picked.filter(fits);const skipped=picked.length-ok.length;
  if(!ok.length)return expected('No layer fits the length of that composition.');
  const ids=ok.map(()=>newId('layer')),copies=sendCopies(c.layers,ok.map(l=>l.id),ids);
  const edits:Edit[]=[{type:'layers.import',comp:target.id,layers:copies}];
  if(p.move)for(const l of ok)if(findLayer(c,l.id))edits.push({type:'layer.remove',layer:l.id});
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {sent:copies.length,skipped,moved:!!p.move};
 }) as (p:unknown)=>unknown}];
