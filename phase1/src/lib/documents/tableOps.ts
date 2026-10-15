import type {DocBlock} from './edit';
import {CELL_BASE} from './edit';
import type {TableOp} from './protocol';

export interface CellSpot{table:number;row:number;cell:number}
/** Table coordinates of a cell paragraph from the engine block list, or null when the block is not a cell paragraph. */
export function cellOf(blocks:readonly DocBlock[],index:number):CellSpot|null{
 if(index<CELL_BASE)return null;const b=blocks.find(x=>x.index===index);
 return b&&b.kind==='cell'&&b.table!==undefined&&b.row!==undefined&&b.cell!==undefined?{table:b.table,row:b.row,cell:b.cell}:null;
}
/** The cell the caret should stay in after `op`: the original cell, which moves when a row or column is added before it. */
export function wantedCell(op:TableOp,at:CellSpot):{row:number;cell:number}{
 switch(op){
  case 'row_above':return{row:at.row+1,cell:at.cell};
  case 'col_left':return{row:at.row,cell:at.cell+1};
  default:return{row:at.row,cell:at.cell};
 }
}
/** First paragraph of the cell in table `at.table` nearest to the wanted row and cell (after a delete the wanted cell may be gone). */
export function blockAfterTableEdit(op:TableOp,at:CellSpot,blocks:readonly DocBlock[]):number|null{
 if(op==='delete_table'||op==='table_to_text'){
  // The table is gone: the paragraph that now sits where it was, else the one before it.
  const ok=(i:number)=>blocks.find(b=>b.index===i&&b.kind==='para'&&b.editable)?.index??null;
  return ok(at.table)??ok(at.table-1);
 }
 const w=wantedCell(op,at);let best:DocBlock|null=null,bd=Infinity;
 for(const b of blocks){
  if(b.kind!=='cell'||b.table!==at.table||b.row===undefined||b.cell===undefined||!b.editable)continue;
  const d=Math.abs(b.row-w.row)*1000+Math.abs(b.cell-w.cell)*10+(b.para??0);
  if(d<bd){bd=d;best=b;}
 }
 return best?best.index:null;
}
