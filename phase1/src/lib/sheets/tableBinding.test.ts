import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sameRange,tableFilterRange,tablesHere} from './tableBinding';
import type {TableInfo} from './protocol';

const table=(name:string,range:string,header=true,totals=false):TableInfo=>({name,range,header,totals,banded:false,bandedCols:false,firstCol:false,lastCol:false,style:''});

test('tablesHere finds header tables overlapping the range and skips headerless and disjoint ones',()=>{
 const tables=[table('A','A1:C10'),table('B','E5:F9'),table('NoHead','A1:B5',false),table('Far','A100:B110')];
 const hits=tablesHere(tables,{r0:4,c0:0,r1:8,c1:1});
 assert.deepEqual(hits.map(h=>h.table.name),['A'],'only the overlapping header table');
 assert.equal(tablesHere(tables,{r0:0,c0:4,r1:10,c1:5}).length,1,'B overlaps');
 assert.equal(tablesHere(tables,{r0:50,c0:0,r1:60,c1:1}).length,0,'disjoint');
 assert.equal(tablesHere(undefined,{r0:0,c0:0,r1:1,c1:1}).length,0,'no tables info');
 assert.equal(tablesHere([table('Bad','not-a-range')],{r0:0,c0:0,r1:1,c1:1}).length,0,'unparsable range skipped');
});

test('tableFilterRange keeps the header first and drops a totals row',()=>{
 const plain=tablesHere([table('A','B2:D10')],{r0:0,c0:0,r1:20,c1:5})[0];
 assert.deepEqual(tableFilterRange(plain),{r0:1,c0:1,r1:9,c1:3});
 const withTotals=tablesHere([table('T','A1:C11',true,true)],{r0:0,c0:0,r1:20,c1:5})[0];
 assert.deepEqual(tableFilterRange(withTotals),{r0:0,c0:0,r1:9,c1:2},'row 11 is the totals row, not filter data');
});

test('sameRange compares exact rectangles',()=>{
 assert.equal(sameRange({r0:0,c0:0,r1:9,c1:2},{r0:0,c0:0,r1:9,c1:2}),true);
 assert.equal(sameRange({r0:0,c0:0,r1:9,c1:2},{r0:0,c0:0,r1:10,c1:2}),false);
});
