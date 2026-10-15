/** Find cells by what they are (Go To Special). Reads only; the Rust bridge re-validates and the engine does the search. */
export const SPECIAL_KINDS=['blanks','constants','formulas','text','numbers','errors','comments','conditionalFormats','dataValidation'] as const;
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
