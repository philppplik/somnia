import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {EditError,type Edit} from './edit';
import {pruneSelection} from './selection';
import {pruneStyleKeys} from './keyLanes';
import {stretchPlan,MIN_STRETCH,MAX_STRETCH} from './keyStretch';
/** Time-stretch of the selected keys (transform rows and style lanes). Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
const picks=()=>{const s=animationSession(),d=s.document,c=d?findComp(d):undefined,v=s.getState().view;
 return {c,keys:pruneSelection(d,v.selectedKeys),styleKeys:c?pruneStyleKeys(c.layers,v.styleKeys??[]):[],playhead:v.playhead};};
export const keyStretchSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.keys.stretch',title:'Stretch the selected keys in time',category:'Edit',level:'ui',keywords:['animation','keys','stretch','scale','time'],
 params:{type:'object',properties:{percent:{type:'number',minimum:MIN_STRETCH,maximum:MAX_STRETCH},anchor:{enum:['first','playhead']}},required:['percent'],additionalProperties:false},
 enabled:()=>{const p=picks();return !!p.c&&p.keys.length+p.styleKeys.length>0;},
 run:((p:{percent:number;anchor?:'first'|'playhead'})=>{
  const s=animationSession(),{c,keys,styleKeys,playhead}=picks();
  if(!c)return expected('No composition is open.');if(!keys.length&&!styleKeys.length)return expected('Select keys first.');
  if(!(p.percent>=MIN_STRETCH&&p.percent<=MAX_STRETCH))return expected(`Use ${MIN_STRETCH} to ${MAX_STRETCH} percent.`);
  const r=stretchPlan(c,keys,styleKeys,p.percent,p.anchor??'first',playhead);
  if(!r.moves.length&&!r.styleMoves.length)return expected(r.skipped?'Keys would leave the composition or collide.':'The keys would not move.');
  const edits:Edit[]=[...(r.moves.length?[{type:'keys.retime' as const,moves:r.moves}]:[]),...r.styleMoves.map((m):Edit=>({type:'style.key.move',layer:m.layer,lane:m.lane,from:m.from,to:m.to}))];
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  const to=new Map(r.moves.map(m=>[`${m.layer}\0${m.prop}\0${m.from}`,m.to])),sto=new Map(r.styleMoves.map(m=>[`${m.layer}\0${m.lane}\0${m.from}`,m.to]));
  s.selectKeys(keys.map(k=>({...k,t:to.get(`${k.layer}\0${k.prop}\0${k.t}`)??k.t})));
  s.setView({styleKeys:styleKeys.map(k=>({...k,t:sto.get(`${k.layer}\0${k.lane}\0${k.t}`)??k.t}))});
  return {moved:r.moves.length+r.styleMoves.length,skipped:r.skipped};
 }) as (p:unknown)=>unknown}];
