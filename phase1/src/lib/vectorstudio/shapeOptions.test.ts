import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildShape,checkShapeOptions,polygonPath,starPath,SHAPE_LIMITS,DEFAULT_SHAPE_OPTIONS} from './shapes';
import {vectorShellCommandSpecs} from './shellCommands';
import {vectorCommandSpecs} from './commands';
import {CommandDispatcher,CommandDispatchError} from '../commandDispatcher';
import * as S from './session';
const o={origin:'test'} as const;
const setup=()=>{S.resetVectorSession();S.createBlankVector(400,300);const d=new CommandDispatcher();[...vectorCommandSpecs(()=>true),...vectorShellCommandSpecs(()=>true)].forEach(s=>d.register(s));return d;};
const A={x:0,y:0},B={x:100,y:80};
test('shape options change what the tools build',()=>{
 assert.equal(buildShape('polygon',A,B,{sides:8}).nodes.length,8);assert.equal(buildShape('polygon',A,B).nodes.length,6);
 assert.equal(buildShape('star',A,B,{points:7}).nodes.length,14);
 const deep=buildShape('star',A,B,{inner:0.2}).nodes[1],shallow=buildShape('star',A,B,{inner:0.9}).nodes[1];
 assert.ok(Math.hypot(deep.x-50,deep.y-40)<Math.hypot(shallow.x-50,shallow.y-40));
 assert.equal(buildShape('rect',A,B,{radius:10}).nodes.length,8);assert.equal(buildShape('rect',A,B,{radius:0}).nodes.length,4);
});
test('direct builders are bounded even with absurd input',()=>{
 assert.equal(polygonPath({x:0,y:0,w:10,h:10},1e9).nodes.length,SHAPE_LIMITS.maxSides);assert.equal(starPath({x:0,y:0,w:10,h:10},1e9).nodes.length,SHAPE_LIMITS.maxSides*2);
 assert.equal(polygonPath({x:0,y:0,w:10,h:10},NaN).nodes.length>=3,true);
});
test('checkShapeOptions rejects out of range, non-integer and non-numeric values',()=>{
 for(const bad of [{sides:2},{sides:65},{sides:4.5},{points:1e9},{inner:0.05},{inner:1},{radius:-1},{radius:1001},{sides:NaN},{sides:'6' as any},{radius:Infinity}])assert.throws(()=>checkShapeOptions(bad),RangeError,JSON.stringify(bad));
 assert.deepEqual(checkShapeOptions({sides:3,points:64,inner:0.1,radius:1000}),{sides:3,points:64,inner:0.1,radius:1000});
});
test('vector.setShapeOptions: no undo step, validated by the command schema, agent blocked, merges',async()=>{
 const d=setup();assert.deepEqual(S.getVectorSession().shapeOpts,DEFAULT_SHAPE_OPTIONS);
 const before=S.getVectorSession().canUndo;
 await d.runCommand('vector.setShapeOptions',{sides:8},o);await d.runCommand('vector.setShapeOptions',{inner:0.3},o);
 assert.deepEqual(S.getVectorSession().shapeOpts,{...DEFAULT_SHAPE_OPTIONS,sides:8,inner:0.3});assert.equal(S.getVectorSession().canUndo,before);
 await assert.rejects(d.runCommand('vector.setShapeOptions',{sides:2},o),e=>e instanceof CommandDispatchError&&e.code==='invalid-params');
 await assert.rejects(d.runCommand('vector.setShapeOptions',{sides:4.5},o),CommandDispatchError);
 await assert.rejects(d.runCommand('vector.setShapeOptions',{bogus:1} as any,o),CommandDispatchError);
 await assert.rejects(d.runCommand('vector.setShapeOptions',{sides:5},{origin:'agent'}),e=>e instanceof CommandDispatchError&&e.code==='forbidden-origin');
 assert.equal(S.getVectorSession().shapeOpts.sides,8);
});
