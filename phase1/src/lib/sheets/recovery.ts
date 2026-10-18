/**
 * Sheets recovery glue. The workbook engine keeps undo history internally, so snapshots hold the saved workbook
 * bytes and the view only. Pure helpers only. The wiring lives in lib/documents/session.ts and lib/sheets/session.ts; see docs/session-safety.md.
 */
export const sheetsSessionId=(name:string)=>`sheets:${name}`;
export interface SheetsViewState{sheet:number;row:number;col:number;draft:{text:string}|null}
export const readSheetsView=(v:Record<string,unknown>):SheetsViewState|null=>{
 const n=(x:unknown)=>typeof x==='number'&&Number.isInteger(x)&&x>=0;const d=v.draft as {row?:unknown;col?:unknown;text?:unknown}|null|undefined;const draft=d&&typeof d.text==='string'&&d.row===v.row&&d.col===v.col&&d.text.length<=32768?{text:d.text}:null;
 return n(v.sheet)&&n(v.row)&&n(v.col)?{sheet:v.sheet as number,row:v.row as number,col:v.col as number,draft}:null;
};
