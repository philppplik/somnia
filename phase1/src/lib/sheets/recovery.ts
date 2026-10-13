import {registerMediaCloseCleanup} from '../media';
import {discardSession} from '../sessionSafety/flush';
/** Sheets recovery glue. The workbook engine keeps undo history internally, so snapshots hold the saved workbook bytes and the view only. */
export const sheetsSessionId=(name:string)=>`sheets:${name}`;
export interface SheetsViewState{sheet:number;row:number;col:number}
export const readSheetsView=(v:Record<string,unknown>):SheetsViewState|null=>{
 const n=(x:unknown)=>typeof x==='number'&&Number.isInteger(x)&&x>=0;return n(v.sheet)&&n(v.row)&&n(v.col)?{sheet:v.sheet as number,row:v.row as number,col:v.col as number}:null;
};
registerMediaCloseCleanup(name=>{void discardSession(sheetsSessionId(name));});
