import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {ExportError} from './exportFrames';
import {exportSpriteSheet} from './exportJob';
import {SHEET_MAX_FRAMES} from './spriteSheet';
/** Export the work area as a sprite sheet. Own file so the big command array keeps cheap type inference. */
export const exportSheetSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.export.spriteSheet',title:'Export work area as sprite sheet',category:'Project',level:'ui',keywords:['animation','export','sprite','sheet','atlas','game','frames','grid'],
 params:{type:'object',properties:{columns:{type:'integer',minimum:1,maximum:SHEET_MAX_FRAMES}},additionalProperties:false},
 enabled:()=>!!animationSession().document,
 run:((p:{columns?:number}={})=>exportSpriteSheet(p.columns).then(()=>undefined,e=>{throw e instanceof ExportError?Object.assign(e,{expected:true}):e;})) as (p:unknown)=>unknown}];
