/**
 * Sheets recovery glue. The workbook engine keeps undo history internally, so snapshots hold the saved workbook
 * bytes and the view only. Pure helpers only. TODO(session-safety wiring): in beta.4 this module also registered the
 * media-close cleanup (discardSession) and the lifecycle adapter. On beta.5 those hooks belong in
 * lib/sheets/session.ts (acquireSheetsSession/releaseSheetsSession); see docs/session-safety.md, "beta.5 wiring status".
 */
export const sheetsSessionId=(name:string)=>`sheets:${name}`;
export interface SheetsViewState{sheet:number;row:number;col:number;draft:{text:string}|null}
export const readSheetsView=(v:Record<string,unknown>):SheetsViewState|null=>{
 const n=(x:unknown)=>typeof x==='number'&&Number.isInteger(x)&&x>=0;const d=v.draft as {row?:unknown;col?:unknown;text?:unknown}|null|undefined;const draft=d&&typeof d.text==='string'&&d.row===v.row&&d.col===v.col&&d.text.length<=32768?{text:d.text}:null;
 return n(v.sheet)&&n(v.row)&&n(v.col)?{sheet:v.sheet as number,row:v.row as number,col:v.col as number,draft}:null;
};
