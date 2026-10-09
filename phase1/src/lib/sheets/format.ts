import type {CellValue} from './protocol';
export const MAX_ROWS=1_048_576;
export const MAX_COLS=16_384;
export function colName(index:number):string{let s='';for(let n=index+1;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;}
export const addressOf=(row:number,col:number)=>`${colName(col)}${row+1}`;
export function parseAddress(address:string):{row:number;col:number}|null{
 const m=/^([A-Za-z]{1,3})([1-9]\d{0,6})$/.exec(address.trim());if(!m)return null;
 let col=0;for(const ch of m[1].toUpperCase())col=col*26+ch.charCodeAt(0)-64;col-=1;const row=Number(m[2])-1;
 return col<MAX_COLS&&row<MAX_ROWS?{row,col}:null;}
/** Plain display text. Number formats from the file are not applied in this first package. */
const ERRORS:Record<string,string>={Null:'#NULL!',Div0:'#DIV/0!',Value:'#VALUE!',Ref:'#REF!',Name:'#NAME?',Num:'#NUM!',NA:'#N/A',GettingData:'#GETTING_DATA',Spill:'#SPILL!',Calc:'#CALC!',Circ:'#CIRC!'};
export function displayValue(value:CellValue|undefined):string{
 if(!value||value.t==='Empty')return '';
 switch(value.t){
  case 'Number':return Number.isFinite(value.v)?String(Number(value.v.toPrecision(12))):'#NUM!';
  case 'Text':return value.v;
  case 'Bool':return value.v?'TRUE':'FALSE';
  case 'Error':return typeof value.v==='string'?(ERRORS[value.v]??(value.v.startsWith('#')?value.v:'#ERROR!')):'#ERROR!';
  default:return '';}
}
/** Text the cell editor starts with: the formula with its "=", otherwise the raw value. */
export function editText(value:CellValue|undefined,formula:string|null|undefined):string{
 if(formula)return formula.startsWith('=')?formula:'='+formula;
 return displayValue(value);}
export const isNumeric=(value:CellValue|undefined)=>value?.t==='Number';
export const isErrorValue=(value:CellValue|undefined)=>value?.t==='Error';
/** Window of rows/cols to fetch for a scroll position, clamped and bounded below the engine read cap. */
export function visibleWindow(scrollTop:number,scrollLeft:number,width:number,height:number,rowH:number,colW:number,totalRows:number,totalCols:number,overscan=3){
 const row=Math.max(0,Math.floor(scrollTop/rowH)-overscan),col=Math.max(0,Math.floor(scrollLeft/colW)-overscan);
 const rows=Math.min(totalRows-row,Math.ceil(height/rowH)+overscan*2+1,100),cols=Math.min(totalCols-col,Math.ceil(width/colW)+overscan*2+1,60);
 return{row,col,rows:Math.max(1,rows),cols:Math.max(1,cols)};}
