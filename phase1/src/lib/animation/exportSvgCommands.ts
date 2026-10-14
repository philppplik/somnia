import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {ExportError} from './exportFrames';
import {exportCurrentFrameSvg,copyCurrentFrame} from './exportJob';
/** Export the playhead frame as SVG. Own file so the big command array keeps cheap type inference. */
export const exportSvgSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.export.frameSvg',title:'Export current frame as SVG',category:'Project',level:'ui',keywords:['animation','export','frame','svg','vector','still','image','save'],
 params:{type:'object',properties:{},additionalProperties:false},
 enabled:()=>!!animationSession().document,
 run:(()=>exportCurrentFrameSvg().then(()=>undefined,e=>{throw e instanceof ExportError?Object.assign(e,{expected:true}):e;})) as (p:unknown)=>unknown},{
 id:'animation.export.frameCopy',title:'Copy current frame to the clipboard',category:'Project',level:'ui',keywords:['animation','export','frame','copy','clipboard','png','image','paste'],
 params:{type:'object',properties:{},additionalProperties:false},
 enabled:()=>!!animationSession().document,
 run:(()=>copyCurrentFrame().then(()=>undefined,e=>{throw e instanceof ExportError?Object.assign(e,{expected:true}):e;})) as (p:unknown)=>unknown}];
