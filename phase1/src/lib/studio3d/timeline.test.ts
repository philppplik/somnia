import test from 'node:test';import assert from 'node:assert/strict';
import {timeFromX,percentOf,nudgeTime} from './timeline';
test('timeFromX maps, clamps and snaps to 10 ms',()=>{
 assert.equal(timeFromX(150,100,200,4),1);assert.equal(timeFromX(50,100,200,4),0);assert.equal(timeFromX(999,100,200,4),4);assert.equal(timeFromX(103,100,200,4),0.06);
 assert.equal(timeFromX(Number.NaN,0,100,1),0);assert.equal(timeFromX(5,0,0,1),0);assert.equal(timeFromX(5,0,100,0),0);
});
test('percentOf clamps',()=>{assert.equal(percentOf(1,4),25);assert.equal(percentOf(9,4),100);assert.equal(percentOf(-1,4),0);assert.equal(percentOf(1,0),0);});
test('nudgeTime moves by 50 ms or 500 ms and stays inside the clip unless extending',()=>{
 assert.equal(nudgeTime(1,1,false,2),1.05);assert.equal(nudgeTime(1,-1,true,2),0.5);assert.equal(nudgeTime(0,-1,false,2),0);assert.equal(nudgeTime(1.98,1,true,2),2);assert.equal(nudgeTime(1.98,1,true,2,true),2.48);
});
import {fitView,clampView,zoomView,panView,timeInView,viewPercent,viewTicks} from './timeline';
test('fitView and clampView keep the window inside the clip',()=>{
 assert.deepEqual(fitView(4),{start:0,span:4});assert.deepEqual(fitView(0),{start:0,span:0.1});
 assert.deepEqual(clampView({start:3,span:4},4),{start:0,span:4});
 assert.deepEqual(clampView({start:1,span:0.01},4),{start:1,span:0.1});
 assert.deepEqual(clampView({start:Number.NaN,span:Number.NaN},2),{start:0,span:2});
});
test('zoomView zooms around the anchor and stops at the clip length',()=>{
 const z=zoomView({start:0,span:4},4,2,1);assert.deepEqual(z,{start:0.5,span:2});
 assert.deepEqual(zoomView({start:0,span:4},4,100,1),{start:0.95,span:0.2});
 assert.deepEqual(zoomView({start:0,span:4},4,0.5,3),{start:0,span:4});
});
test('zoomView keeps the anchor fixed',()=>{
 const v={start:1,span:2};const z=zoomView(v,10,2,2);
 assert.ok(Math.abs(viewPercent(2,z)-viewPercent(2,v))<1e-9);
 assert.deepEqual(panView({start:0,span:2},4,1),{start:1,span:2});
 assert.deepEqual(panView({start:3,span:2},4,5),{start:2,span:2});
 assert.deepEqual(panView({start:1,span:2},4,-5),{start:0,span:2});
});
test('timeInView maps through the window and viewPercent can leave 0..100',()=>{
 const v={start:1,span:2};assert.equal(timeInView(150,100,200,v),1.5);assert.equal(timeInView(100,100,200,v),1);
 assert.equal(viewPercent(2,v),50);assert.equal(viewPercent(0.5,v),-25);assert.equal(viewPercent(4,v),150);
});
test('viewTicks picks round steps inside the window',()=>{
 assert.deepEqual(viewTicks({start:0,span:4},4),[0,1,2,3,4]);
 assert.deepEqual(viewTicks({start:0.5,span:1},4),[0.6,0.8,1,1.2,1.4]);
 assert.deepEqual(viewTicks({start:0,span:0}),[]);
});
