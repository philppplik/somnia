/** Spreadsheet clock: the engine's wasm build has no clock of its own, so NOW()/TODAY() read the host's local time through this serial. */
const EXCEL_EPOCH_OFFSET=25569; // days from 1899-12-30 to 1970-01-01
const MS_PER_DAY=86_400_000;
/** Local wall-clock date-time as a 1900-system serial (what Excel shows as the local NOW()). Null for an invalid Date. */
export function localSerial(d:Date=new Date()):number|null{
 const t=Date.UTC(d.getFullYear(),d.getMonth(),d.getDate(),d.getHours(),d.getMinutes(),d.getSeconds(),d.getMilliseconds());
 if(!Number.isFinite(t))return null;const serial=EXCEL_EPOCH_OFFSET+t/MS_PER_DAY;
 return serial>=1&&serial<2_958_465.999_999?serial:null;}
/** Minute resolution: the worker only re-sends the clock when this key changes, so a burst of edits costs at most one recalculation per minute. */
export const clockKey=(serial:number)=>Math.floor(serial*1440);
