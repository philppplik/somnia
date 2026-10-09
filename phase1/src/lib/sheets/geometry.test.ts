import test from 'node:test';
import assert from 'node:assert/strict';
import {Geometry} from './geometry';
const layout={sheet:0,defaultColWidth:100,defaultRowHeight:20,cols:[{i:1,w:200,hidden:false},{i:2,w:50,hidden:true}],rows:[{i:1,h:40,hidden:false}],showGridlines:true,freeze:null,merges:[]};
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
test('merges collapse to their anchor box and widen the window to include the anchor',()=>{
 const g=new Geometry({...layout,freeze:{rows:1,cols:2},merges:[{r0:2,c0:0,r1:2,c1:1},{r0:5,c0:2,r1:7,c1:3}]},100,10);
 assert.equal(g.freezeRows,1);assert.equal(g.freezeCols,2);
 assert.deepEqual(g.box(2,0),{left:0,top:g.rowTop(2),width:g.colLeft(2),height:20});assert.equal(g.box(2,1),null);assert.equal(g.box(7,3),null);
 assert.equal(g.mergeCovering(6,2)?.r0,5);assert.equal(g.mergeCovering(0,0),undefined);
 const w=g.window(g.rowTop(6),g.colLeft(3),300,100,0);assert.ok(w.row<=5&&w.col<=2,JSON.stringify(w));
 const bad=new Geometry({...layout,merges:[{r0:9,c0:9,r1:1,c1:1},{r0:500,c0:0,r1:600,c1:0}]},10,5);assert.equal(bad.mergeCovering(1,1),undefined);
});
