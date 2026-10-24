import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkGrid,gridDelta,gridVisible,snapPointToGrid,snapValue,GRID_LIMITS,DEFAULT_GRID} from './grid';
import {vectorShellCommandSpecs} from './shellCommands';
import {vectorCommandSpecs} from './commands';
import {CommandDispatcher,CommandDispatchError} from '../commandDispatcher';
import * as S from './session';
test('snapping rounds to the nearest grid line, tolerates odd input',()=>{
 assert.equal(snapValue(14,10),10);assert.equal(snapValue(15,10),20);assert.equal(snapValue(-14,10),-10);assert.equal(snapValue(3.3,0.5),3.5);
 assert.ok(Number.isNaN(snapValue(NaN,10)));assert.equal(snapValue(7,0),7);
 assert.deepEqual(snapPointToGrid({x:23,y:-6},10),{x:20,y:-10});
});
test('gridDelta lands the top-left corner on a grid line',()=>{
 const d=gridDelta({minX:3,minY:7},12,5,10);assert.equal(3+d.dx,20);assert.equal(7+d.dy,10);
 const z=gridDelta({minX:20,minY:20},0.4,-0.4,10);assert.deepEqual(z,{dx:0,dy:0});
});
test('grid is hidden when its lines would be under 4 screen pixels apart',()=>{
 assert.equal(gridVisible({...DEFAULT_GRID,show:true,size:10},1),true);assert.equal(gridVisible({...DEFAULT_GRID,show:true,size:10},0.3),false);assert.equal(gridVisible(DEFAULT_GRID,1),false);
});
test('checkGrid rejects bad values',()=>{
 for(const bad of [{size:0},{size:0.5},{size:1001},{size:NaN},{size:'10' as any},{show:'yes' as any},{snap:1 as any}])assert.throws(()=>checkGrid(bad),RangeError,JSON.stringify(bad));
 assert.deepEqual(checkGrid({show:true,snap:false,size:GRID_LIMITS.max}),{show:true,snap:false,size:1000});
});
test('vector.setGrid: merged, no undo step, schema checked, agent blocked',async()=>{
 S.resetVectorSession();S.createBlankVector(400,300);const d=new CommandDispatcher();[...vectorCommandSpecs(()=>true),...vectorShellCommandSpecs(()=>true)].forEach(s=>d.register(s));
 const o={origin:'test'} as const,undo=S.getVectorSession().canUndo;
 await d.runCommand('vector.setGrid',{show:true},o);await d.runCommand('vector.setGrid',{size:25,snap:true},o);
 assert.deepEqual(S.getVectorSession().grid,{show:true,snap:true,size:25});assert.equal(S.getVectorSession().canUndo,undo);
 await assert.rejects(d.runCommand('vector.setGrid',{size:0},o),e=>e instanceof CommandDispatchError&&e.code==='invalid-params');
 await assert.rejects(d.runCommand('vector.setGrid',{bogus:1} as any,o),CommandDispatchError);
 await assert.rejects(d.runCommand('vector.setGrid',{show:false},{origin:'agent'}),e=>e instanceof CommandDispatchError&&e.code==='forbidden-origin');
 assert.equal(S.getVectorSession().grid.show,true);
});
