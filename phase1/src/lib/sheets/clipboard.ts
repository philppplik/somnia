import {MAX_COLS,MAX_ROWS} from './format';
import {MAX_READ_CELLS} from './protocol';
export interface Rect{r0:number;c0:number;r1:number;c1:number}
/** Normalized rectangle between an anchor and a focus corner. */
export const rectOf=(a:{row:number;col:number},b:{row:number;col:number}):Rect=>({r0:Math.min(a.row,b.row),c0:Math.min(a.col,b.col),r1:Math.max(a.row,b.row),c1:Math.max(a.col,b.col)});
export const rectCells=(r:Rect)=>(r.r1-r.r0+1)*(r.c1-r.c0+1);
export const inRect=(r:Rect,row:number,col:number)=>row>=r.r0&&row<=r.r1&&col>=r.c0&&col<=r.c1;
/** Excel-style TSV: fields with tab, newline or quote are quoted, quotes doubled. */
export function toTsv(rows:string[][]):string{
 return rows.map(r=>r.map(f=>/[\t\r\n"]/.test(f)?'"'+f.replace(/"/g,'""')+'"':f).join('\t')).join('\r\n');}
/** Parses clipboard TSV (quoted fields, CRLF or LF, a single trailing newline ignored). */
export function parseTsv(text:string):string[][]{
 const rows:string[][]=[];let row:string[]=[],field='',quoted=false,i=0;
 const endRow=()=>{row.push(field);field='';rows.push(row);row=[];};
 while(i<text.length){
  const ch=text[i];
  if(quoted){if(ch==='"'){if(text[i+1]==='"'){field+='"';i+=2;continue;}quoted=false;i++;continue;}field+=ch;i++;continue;}
  if(ch==='"'&&field===''){quoted=true;i++;continue;}
  if(ch==='\t'){row.push(field);field='';i++;continue;}
  if(ch==='\r'){if(text[i+1]==='\n')i++;endRow();i++;continue;}
  if(ch==='\n'){endRow();i++;continue;}
  field+=ch;i++;}
 if(field!==''||row.length>0)endRow();
 return rows;}
/** Where a pasted block lands: clipped to the sheet limits and the engine read/write cap, or null when empty or too large. */
export function pasteRect(origin:{row:number;col:number},data:string[][]):Rect|null{
 if(data.length===0)return null;const w=Math.max(...data.map(r=>r.length));if(w===0)return null;
 const r1=Math.min(origin.row+data.length-1,MAX_ROWS-1),c1=Math.min(origin.col+w-1,MAX_COLS-1);
 const rect={r0:origin.row,c0:origin.col,r1,c1};return rectCells(rect)>MAX_READ_CELLS?null:rect;}
