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
