import test from 'node:test';
import assert from 'node:assert/strict';
import {Geometry} from './geometry';
const layout={sheet:0,defaultColWidth:100,defaultRowHeight:20,cols:[{i:1,w:200,hidden:false},{i:2,w:50,hidden:true}],rows:[{i:1,h:40,hidden:false}],showGridlines:true,merges:[]};
test('positions follow per-line sizes and hidden lines collapse',()=>{
 const g=new Geometry(layout,10,5);
 assert.equal(g.colLeft(1),100);assert.equal(g.colWidth(1),200);assert.equal(g.colWidth(2),0);assert.equal(g.colLeft(3),300);assert.equal(g.width,500-0);
 assert.equal(g.rowTop(2),60);assert.equal(g.rowHeight(1),40);assert.equal(g.height,20*9+40);
});
test('position lookup and windows',()=>{
 const g=new Geometry(layout,1000,100);
 assert.equal(g.colAt(0),0);assert.equal(g.colAt(150),1);assert.equal(g.colAt(310),3);assert.equal(g.rowAt(45),1);assert.equal(g.rowAt(-5),0);assert.equal(g.rowAt(1e9),999);
 const w=g.window(0,0,500,300);assert.equal(w.row,0);assert.ok(w.rows*w.cols<=10000);
 const huge=g.window(0,0,1e6,1e6);assert.ok(huge.rows*huge.cols<=10000);
 const none=new Geometry(null,1,1);assert.deepEqual(none.window(0,0,0,0),{row:0,col:0,rows:1,cols:1});
});
