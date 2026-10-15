import test from 'node:test';import assert from 'node:assert/strict';
import {fitZoom,parseViewCommand,zoomFactor} from './viewOps';
import {Geometry} from './geometry';
test('view commands',()=>{
 assert.deepEqual(parseViewCommand({zoom:150}),{zoom:150});assert.deepEqual(parseViewCommand({gridlines:false}),{gridlines:false});assert.deepEqual(parseViewCommand({fit:'selection'}),{fit:'selection'});
 for(const bad of [null,[],{},{zoom:9},{zoom:401},{zoom:99.5},{zoom:'100'},{gridlines:1},{fit:'sheet'},{zoom:100,gridlines:true},{headings:1},{zeros:'on'},{power:true}])assert.throws(()=>parseViewCommand(bad),JSON.stringify(bad));
});
test('zoom factor falls back to 100 percent',()=>{
 assert.equal(zoomFactor(150),1.5);for(const bad of [undefined,null,0,9,401,1.5,'100',NaN])assert.equal(zoomFactor(bad),1);
});
test('fit zoom is bounded and stable',()=>{
 assert.equal(fitZoom(200,100,400,200,1),200);assert.equal(fitZoom(400,200,400,200,2),200);assert.equal(fitZoom(400,200,400,200,1),100);assert.equal(fitZoom(1,1,10000,10000,1),400);assert.equal(fitZoom(100000,100000,10,10,1),10);
 for(const bad of [0,-1,NaN,Infinity])assert.equal(fitZoom(bad,100,100,100,1),100);assert.equal(fitZoom(100,100,100,100,0),100);
});
test('geometry scales with the zoom',()=>{
 const layout={sheet:0,defaultColWidth:100,defaultRowHeight:20,cols:[{i:1,w:200,hidden:false}],rows:[{i:0,h:40,hidden:true}],showGridlines:true,zoom:150,freeze:null,merges:[]};
 const g=new Geometry(layout,3,3);assert.equal(g.zoom,1.5);assert.equal(g.colWidth(0),150);assert.equal(g.colWidth(1),300);assert.equal(g.rowHeight(0),0);assert.equal(g.rowHeight(1),30);assert.equal(g.colAt(160),1);
 const plain=new Geometry({...layout,zoom:undefined as unknown as number},3,3);assert.equal(plain.zoom,1);assert.equal(plain.colWidth(0),100);
 assert.equal(new Geometry(null,2,2).zoom,1);
});
