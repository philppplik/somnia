import {addressOf,parseAddress} from './format';
import {rectCells,rectOf,type Rect} from './clipboard';
import {MAX_READ_CELLS,type RangeCell} from './protocol';
export function parsePanelRange(input:string):Rect|null {
 const parts=input.trim().split(':');if(parts.length>2)return null;
 const a=parseAddress(parts[0]),b=parseAddress(parts[1]??parts[0]);
 if(!a||!b)return null;const range=rectOf(a,b);return rectCells(range)<=MAX_READ_CELLS?range:null;
}
export const rangeAddress=(r:Rect)=>`${addressOf(r.r0,r.c0)}:${addressOf(r.r1,r.c1)}`;
export function summarizeCells(cells:readonly RangeCell[],total:number){
 let numbers=0,filled=0,errors=0,formulas=0,sum=0,min=Infinity,max=-Infinity;
 for(const cell of cells){if(cell.formula)formulas++;if(cell.value.t!=='Empty')filled++;if(cell.value.t==='Error')errors++;
  if(cell.value.t==='Number'&&Number.isFinite(cell.value.v)){numbers++;sum+=cell.value.v;min=Math.min(min,cell.value.v);max=Math.max(max,cell.value.v);}}
 return {total,filled,empty:Math.max(0,total-filled),numbers,errors,formulas,sum,average:numbers?sum/numbers:null,min:numbers?min:null,max:numbers?max:null};
}
export const FORMULA_FUNCTIONS=['SUM','AVERAGE','MIN','MAX','COUNT','COUNTA'] as const;
export function aggregateFormula(fn:string,input:string){
 if(!FORMULA_FUNCTIONS.includes(fn as typeof FORMULA_FUNCTIONS[number]))throw Error('Unsupported aggregate function.');
 const range=parsePanelRange(input);if(!range)throw Error('Invalid or oversized range.');
 return `=${fn}(${rangeAddress(range)})`;
}
