import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {normalizeOnion,MAX_GHOSTS,MAX_STEP,MIN_OPACITY,MAX_OPACITY} from './onion';
/** Onion skin settings (view only). Own file so the big command array keeps cheap type inference. */
export const onionSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.onion.set',title:'Set onion skin',category:'View',level:'ui',keywords:['animation','onion','ghost','frames'],
 params:{type:'object',properties:{on:{type:'boolean'},before:{type:'integer',minimum:0,maximum:MAX_GHOSTS},after:{type:'integer',minimum:0,maximum:MAX_GHOSTS},step:{type:'integer',minimum:1,maximum:MAX_STEP},selectedOnly:{type:'boolean'},opacity:{type:'integer',minimum:MIN_OPACITY,maximum:MAX_OPACITY},tint:{type:'boolean'}},required:[],additionalProperties:false},
 enabled:()=>!!animationSession().document,
 run:((p:{on?:boolean;before?:number;after?:number;step?:number}={})=>{
  const cur=normalizeOnion(animationSession().getState().view.onion);
  animationSession().setView({onion:normalizeOnion({...cur,...p,on:p.on??(Object.keys(p).length?cur.on:!cur.on)})});
 }) as (p:unknown)=>unknown}];
