import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CELL_BASE,type DocBlock} from './edit';
import {blockAfterTableEdit,cellOf,wantedCell} from './tableOps';

const grid=(rows:number,cols:number,table=1):DocBlock[]=>{const out:DocBlock[]=[{index:0,kind:'para',editable:true,text:'top'},{index:table,kind:'table',editable:false}];let n=0;for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)out.push({index:CELL_BASE+n++,kind:'cell',editable:true,text:`${r}${c}`,table,row:r,cell:c,para:0});return out;};

test('cellOf reads table coordinates and refuses paragraphs, tables and unknown ids',()=>{
 const b=grid(2,2);assert.deepEqual(cellOf(b,CELL_BASE+3),{table:1,row:1,cell:1});
 assert.equal(cellOf(b,0),null);assert.equal(cellOf(b,1),null);assert.equal(cellOf(b,CELL_BASE+99),null);assert.equal(cellOf([{index:CELL_BASE,kind:'cell',editable:true}],CELL_BASE),null);
});
test('the caret stays in its original cell when a row or column is added before it',()=>{
 const at={table:1,row:1,cell:1};
 assert.deepEqual(wantedCell('row_above',at),{row:2,cell:1});assert.deepEqual(wantedCell('row_below',at),{row:1,cell:1});
 assert.deepEqual(wantedCell('col_left',at),{row:1,cell:2});assert.deepEqual(wantedCell('col_right',at),{row:1,cell:1});
 // after row_above in a 2x2 table the list is 3x2 and the original cell is row 2
 assert.equal(blockAfterTableEdit('row_above',at,grid(3,2)),CELL_BASE+2*2+1);
});
test('after a delete the nearest remaining cell takes the caret',()=>{
 assert.equal(blockAfterTableEdit('delete_row',{table:1,row:2,cell:1},grid(2,2)),CELL_BASE+3);
 assert.equal(blockAfterTableEdit('delete_col',{table:1,row:0,cell:2},grid(2,2)),CELL_BASE+1);
 assert.equal(blockAfterTableEdit('delete_row',{table:1,row:0,cell:0},[]),null);
 assert.equal(blockAfterTableEdit('delete_row',{table:7,row:0,cell:0},grid(2,2)),null);
});

test('merge and split keep the caret in the same cell',()=>{
 const at={table:1,row:0,cell:1};
 assert.deepEqual(wantedCell('merge_right',at),{row:0,cell:1});assert.deepEqual(wantedCell('split_cell',at),{row:0,cell:1});
 assert.equal(blockAfterTableEdit('merge_right',at,grid(2,2)),CELL_BASE+1);
 assert.equal(blockAfterTableEdit('merge_right',{table:1,row:0,cell:2},grid(2,2)),CELL_BASE+1);
});

test('vertical merge keeps the caret in the same cell and the hidden cell is simply absent from the list',()=>{
 const at={table:1,row:0,cell:0};
 assert.deepEqual(wantedCell('merge_down',at),{row:0,cell:0});assert.deepEqual(wantedCell('split_down',at),{row:0,cell:0});
 // after merge_down in a 2x2 table the lower-left cell has no entry: ids 0, 1 and 3 remain
 const b=grid(2,2).filter(x=>!(x.row===1&&x.cell===0));
 assert.equal(blockAfterTableEdit('merge_down',at,b),CELL_BASE);
 assert.equal(blockAfterTableEdit('merge_down',{table:1,row:1,cell:1},b),CELL_BASE+3);
});
