import type {LayoutOp} from './protocol';
/** Merge, justify, rotate, double underline and clear formats: validation of untrusted command input. The Rust bridge re-validates. */
export const MERGE_HOWS=['cells','center','across','unmerge'] as const;
export const ROTATE_MODES=['none','up','down','stacked'] as const;
export const LAYOUT_MAX_CELLS=1_000_000;
export function parseLayoutCommand(input:unknown):LayoutOp{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Layout operation must be an object.');
 const o=input as Record<string,unknown>,only=(...k:string[])=>{if(Object.keys(o).some(x=>!k.includes(x)))throw Error('Unknown layout field.');};
 switch(o.kind){
  case 'merge':only('kind','how');if(!(MERGE_HOWS as readonly unknown[]).includes(o.how))throw Error('Unsupported merge.');return {kind:'merge',how:o.how as typeof MERGE_HOWS[number]};
  case 'rotate':only('kind','mode');if(!(ROTATE_MODES as readonly unknown[]).includes(o.mode))throw Error('Rotation must be none, up, down or stacked.');return {kind:'rotate',mode:o.mode as typeof ROTATE_MODES[number]};
  case 'doubleUnderline':only('kind','on');if(typeof o.on!=='boolean')throw Error('`on` must be true or false.');return {kind:'doubleUnderline',on:o.on};
  case 'justify':case 'clearFormats':only('kind');return {kind:o.kind};
  default:throw Error('Unsupported layout operation.');
 }
}
/** Why a block cannot take the operation (null when it can), so the panel can explain before sending. */
export function layoutBlockProblem(op:LayoutOp,rows:number,cols:number):'cells'|'two'|null{
 if(rows<1||cols<1||rows*cols>LAYOUT_MAX_CELLS)return 'cells';
 if(op.kind==='merge'&&op.how!=='unmerge'&&(rows*cols<2||(op.how==='across'&&cols<2)))return 'two';
 return null;
}
