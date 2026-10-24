/** Formula auditing: trace precedents and dependents, find errors, Watch Window. Validation of untrusted command input and of the bridge answer. The Rust bridge re-validates. */
export const AUDIT_KINDS=['trace','errors','watchAdd','watchRemove','clear'] as const;
export const MAX_WATCH_REF=100,MAX_AUDIT_ITEMS=200,MAX_WATCHED=50,MAX_TRACE_ITEMS=100;
export type AuditOp={kind:'trace'|'errors'|'watchAdd'|'clear'}|{kind:'watchRemove';ref:string};
export type AuditBridgeOp={kind:'trace'|'errors'|'watchList'|'watchAdd'}|{kind:'watchRemove';ref:string};
export interface TraceInfo{cell:string;formula:string|null;precedents:{sheet:string;range:string}[];dependents:{sheet:string;cell:string}[];precedentsTotal:number;dependentsTotal:number}
export interface ErrorsInfo{errors:{sheet:number;sheetName:string;cell:string;error:string;formula:string|null}[];total:number;circular:string[]}
export interface WatchRow{ref:string;value:string;formula:string|null}
export interface AuditAnswer{trace?:TraceInfo;errors?:ErrorsInfo;watch?:WatchRow[]}
const clean=(t:unknown,max:number)=>typeof t==='string'&&t.length<=max&&!/[\u0000-\u001f\u007f]/.test(t);
export function parseAuditCommand(input:unknown):AuditOp{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Audit must be an object.');
 const o=input as Record<string,unknown>,only=(...k:string[])=>{if(Object.keys(o).some(x=>!k.includes(x)))throw Error('Unknown audit field.');};
 if(o.kind==='watchRemove'){only('kind','ref');if(!clean(o.ref,MAX_WATCH_REF)||(o.ref as string).length===0)throw Error('Name the watched cell.');return {kind:'watchRemove',ref:o.ref as string};}
 if(o.kind==='trace'||o.kind==='errors'||o.kind==='watchAdd'||o.kind==='clear'){only('kind');return {kind:o.kind};}
 throw Error('Unsupported audit.');
}
const num=(v:unknown,max:number)=>{if(typeof v!=='number'||!Number.isInteger(v)||v<0||v>max)throw Error('Invalid audit count.');return v;};
const str=(v:unknown,max:number)=>{if(!clean(v,max))throw Error('Invalid audit text.');return v as string;};
const obj=(v:unknown)=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Invalid audit item.');return v as Record<string,unknown>;};
const list=(v:unknown,max:number)=>{if(!Array.isArray(v)||v.length>max)throw Error('Invalid audit list.');return v;};
/** The bridge answer: closed shapes, bounded lists and texts. */
export function parseAuditAnswer(input:unknown):AuditAnswer{
 const o=obj(input),out:AuditAnswer={};
 if(o.trace!==undefined){const t=obj(o.trace);out.trace={cell:str(t.cell,16),formula:t.formula==null?null:str(t.formula,500),precedents:list(t.precedents,MAX_TRACE_ITEMS).map(p=>{const x=obj(p);return {sheet:str(x.sheet,64),range:str(x.range,40)};}),dependents:list(t.dependents,MAX_TRACE_ITEMS).map(p=>{const x=obj(p);return {sheet:str(x.sheet,64),cell:str(x.cell,16)};}),precedentsTotal:num(t.precedentsTotal,1e9),dependentsTotal:num(t.dependentsTotal,1e9)};}
 if(o.errors!==undefined){const e=obj(o.errors);out.errors={errors:list(e.errors,MAX_AUDIT_ITEMS).map(p=>{const x=obj(p);return {sheet:num(x.sheet,1e4),sheetName:str(x.sheetName,64),cell:str(x.cell,16),error:str(x.error,16),formula:x.formula==null?null:str(x.formula,200)};}),total:num(e.total,1e9),circular:list(e.circular,50).map(c=>str(c,100))};}
 if(o.watch!==undefined)out.watch=list(o.watch,MAX_WATCHED).map(p=>{const x=obj(p);return {ref:str(x.ref,MAX_WATCH_REF),value:str(x.value,100),formula:x.formula==null?null:str(x.formula,200)};});
 return out;
}
