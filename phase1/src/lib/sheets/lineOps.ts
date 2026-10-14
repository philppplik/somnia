import type {LineAxis,LineOp,SheetLayout} from './protocol';
/** Row/column sizing and freeze panes: validation for untrusted command input. The Rust bridge re-validates every field. */
export const MAX_COL_PX=2400,MAX_ROW_PX=545,MAX_FREEZE=20;
export const LINE_KINDS=['size','autofit','hide','unhide'] as const;
export interface LineCommand{axis:LineAxis;op:LineOp}
export function parseLineCommand(input:unknown):LineCommand{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Resize must be an object.');
 const o=input as Record<string,unknown>;const only=(...allowed:string[])=>{if(Object.keys(o).some(k=>!allowed.includes(k)))throw Error('Unknown resize field.');};
 if(o.axis!=='rows'&&o.axis!=='cols')throw Error('Axis must be rows or cols.');
 const axis=o.axis;
 switch(o.kind){
  case 'size':{only('axis','kind','px');const max=axis==='rows'?MAX_ROW_PX:MAX_COL_PX;if(typeof o.px!=='number'||!Number.isFinite(o.px)||o.px<0||o.px>max)throw Error(`Size must be between 0 and ${max} px.`);return {axis,op:{kind:'size',px:Math.round(o.px)}};}
  case 'autofit':case 'hide':case 'unhide':only('axis','kind');return {axis,op:{kind:o.kind}};
  default:throw Error('Unsupported row or column operation.');}
}
export function parseFreeze(input:unknown):{rows:number;cols:number}{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Freeze must be an object.');
 const o=input as Record<string,unknown>;if(Object.keys(o).some(k=>k!=='rows'&&k!=='cols'))throw Error('Unknown freeze field.');
 const ok=(v:unknown):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=MAX_FREEZE;
 if(!ok(o.rows)||!ok(o.cols))throw Error(`Freeze rows and columns must be whole numbers from 0 to ${MAX_FREEZE}.`);
 return {rows:o.rows,cols:o.cols};
}
/** Current sizes in px from a layout (explicit entry, else the sheet default). */
export const colWidthPx=(l:SheetLayout|null|undefined,i:number)=>l?(l.cols.find(c=>c.i===i)?.w??l.defaultColWidth):null;
export const rowHeightPx=(l:SheetLayout|null|undefined,i:number)=>l?(l.rows.find(r=>r.i===i)?.h??l.defaultRowHeight):null;
