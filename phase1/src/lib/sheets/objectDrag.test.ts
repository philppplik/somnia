import {test} from 'node:test';import assert from 'node:assert/strict';
import {dropPlacement} from './objectDrag';
import {parseObjectCommand} from './objectOps';
const geo={zoom:1,colLeft:(c:number)=>c*64,rowTop:(r:number)=>r*20,colAt:(x:number)=>Math.floor(x/64),rowAt:(y:number)=>Math.floor(y/20)};
const o={id:3,row:2,col:1,dx:10,dy:5,width:100,height:50};
test('a move lands in the cell under the new corner',()=>{
 const p=dropPlacement('image',o,{key:'image:3',mode:'move',x0:0,y0:0,mx:100,my:30},geo);
 assert.deepEqual(p,{kind:'place',object:'image',id:3,row:3,col:2,dx:46,dy:15});assert.deepEqual(parseObjectCommand(p),p);
 const back=dropPlacement('image',o,{key:'image:3',mode:'move',x0:0,y0:0,mx:-5000,my:-5000},geo);assert.equal(back.row,0);assert.equal(back.col,0);assert.equal(back.dx,0);
 assert.equal(dropPlacement('shape',o,{key:'shape:3',mode:'move',x0:0,y0:0,mx:0,my:0},{...geo,zoom:2},).dx,10);
});
test('a resize keeps the position and bounds the size',()=>{
 const p=dropPlacement('shape',o,{key:'shape:3',mode:'resize',x0:0,y0:0,mx:40,my:-500},{...geo,zoom:2});assert.equal(p.width,120);assert.equal(p.height,8);assert.equal(p.row,2);assert.equal(p.dx,10);
 assert.equal(dropPlacement('image',o,{key:'image:3',mode:'resize',x0:0,y0:0,mx:1e9,my:0},geo).width,4000);
 assert.doesNotThrow(()=>parseObjectCommand(p));
});
