/** Workbook statistics and the accessibility check: validation of untrusted command input and of the bridge answer. The Rust bridge re-validates. */
export const REVIEW_KINDS=['stats','accessibility','clear'] as const;
export type ReviewKind=typeof REVIEW_KINDS[number];
export const MAX_REVIEW_ISSUES=200;
export const ISSUE_CODES=['altText','merged','defaultName','other'] as const;
export interface SheetStats{name:string;endOfSheet:string|null;cellsWithData:number;formulas:number;tables:number;charts:number;comments:number}
export interface BookStats{sheets:number;cellsWithData:number;formulas:number;tables:number;charts:number;names:number}
export interface ReviewIssue{sheet:number;sheetName:string;code:typeof ISSUE_CODES[number];object:string|null;count:number|null}
export interface ReviewResult{stats?:{sheet:SheetStats;workbook:BookStats};issues?:{issues:ReviewIssue[];total:number}}
export function parseReviewCommand(input:unknown):{kind:ReviewKind}{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Review must be an object.');
 const o=input as Record<string,unknown>;if(Object.keys(o).some(k=>k!=='kind'))throw Error('Unknown review field.');
 if(!(REVIEW_KINDS as readonly unknown[]).includes(o.kind))throw Error('Unsupported review.');return {kind:o.kind as ReviewKind};
}
const obj=(v:unknown)=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Invalid review answer.');return v as Record<string,unknown>;};
const num=(v:unknown,max=1e10)=>{if(typeof v!=='number'||!Number.isInteger(v)||v<0||v>max)throw Error('Invalid review count.');return v;};
const str=(v:unknown,max:number)=>{if(typeof v!=='string'||v.length>max||/[\u0000-\u001f\u007f]/.test(v))throw Error('Invalid review text.');return v;};
export function parseReviewResult(input:unknown):ReviewResult{
 const o=obj(input),out:ReviewResult={};
 if(o.stats!==undefined){const s=obj(o.stats),a=obj(s.sheet),b=obj(s.workbook);
  out.stats={sheet:{name:str(a.name,64),endOfSheet:a.endOfSheet==null?null:str(a.endOfSheet,16),cellsWithData:num(a.cellsWithData),formulas:num(a.formulas),tables:num(a.tables),charts:num(a.charts),comments:num(a.comments)},workbook:{sheets:num(b.sheets,1e4),cellsWithData:num(b.cellsWithData),formulas:num(b.formulas),tables:num(b.tables),charts:num(b.charts),names:num(b.names)}};}
 if(o.issues!==undefined){if(!Array.isArray(o.issues)||o.issues.length>MAX_REVIEW_ISSUES)throw Error('Invalid review list.');
  out.issues={issues:o.issues.map(p=>{const x=obj(p);if(!(ISSUE_CODES as readonly unknown[]).includes(x.code))throw Error('Invalid review code.');return {sheet:num(x.sheet,1e4),sheetName:str(x.sheetName,64),code:x.code as ReviewIssue['code'],object:x.object==null?null:str(x.object,40),count:x.count==null?null:num(x.count)};}),total:num(o.total)};}
 return out;
}
