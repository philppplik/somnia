/** Find cells by what they are (Go To Special). Reads only; the Rust bridge re-validates and the engine does the search. */
export const SPECIAL_KINDS=['blanks','constants','formulas','text','numbers','errors','comments','conditionalFormats','dataValidation','invalidData'] as const;
export type SpecialKind=typeof SPECIAL_KINDS[number];
export const MAX_SPECIAL_RANGES=500;
export interface SpecialResult{count:number;ranges:string[];truncated:boolean}
export function parseSpecialCommand(input:unknown):{kind:SpecialKind}{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Find must be an object.');
 const o=input as Record<string,unknown>;if(Object.keys(o).some(k=>k!=='kind'))throw Error('Unknown find field.');
 if(typeof o.kind!=='string'||!(SPECIAL_KINDS as readonly string[]).includes(o.kind))throw Error('Unsupported kind of cells.');
 return {kind:o.kind as SpecialKind};
}
/** The bridge answer as a bounded, typed result: counts are whole numbers, ranges are plain A1 spans. */
export function parseSpecialResult(raw:unknown):SpecialResult{
 const o=(raw&&typeof raw==='object'?raw:{}) as Record<string,unknown>;
 const count=typeof o.count==='number'&&Number.isInteger(o.count)&&o.count>0?o.count:0;
 const ranges=(Array.isArray(o.ranges)?o.ranges:[]).filter((r):r is string=>typeof r==='string'&&/^[A-Z]{1,3}[0-9]{1,7}(:[A-Z]{1,3}[0-9]{1,7})?$/.test(r)).slice(0,MAX_SPECIAL_RANGES);
 return {count,ranges,truncated:count>0&&o.truncated===true};
}

/** Insert or delete cells and move the neighbours. Whole rows and columns have their own operation. */
export const SHIFT_KINDS=['insertDown','insertRight','deleteUp','deleteLeft'] as const;
export type ShiftKind=typeof SHIFT_KINDS[number];
export interface ShiftOp{kind:'insert'|'delete';shift:'down'|'right'|'up'|'left'}
export function parseShiftCommand(input:unknown):ShiftOp{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Shift must be an object.');
 const o=input as Record<string,unknown>;if(Object.keys(o).some(k=>k!=='kind'&&k!=='shift'))throw Error('Unknown shift field.');
 const ok=(o.kind==='insert'&&(o.shift==='down'||o.shift==='right'))||(o.kind==='delete'&&(o.shift==='up'||o.shift==='left'));
 if(!ok)throw Error('Insert shifts down or right, delete shifts up or left.');
 return {kind:o.kind as ShiftOp['kind'],shift:o.shift as ShiftOp['shift']};
}
/** Why the selection cannot be shifted: too many cells, or an insert that would run past the last row or column. */
export function shiftBlockProblem(op:ShiftOp,range:{r0:number;c0:number;r1:number;c1:number},totalRows:number,totalCols:number):'large'|'edge'|null{
 const rows=range.r1-range.r0+1,cols=range.c1-range.c0+1;if(rows*cols>1_000_000)return 'large';
 if(op.kind==='insert'&&op.shift==='down'&&range.r1+rows>=totalRows)return 'edge';
 if(op.kind==='insert'&&op.shift==='right'&&range.c1+cols>=totalCols)return 'edge';
 return null;
}
