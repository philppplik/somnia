import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SHUTTLE_RATES,shuttleFaster,shuttleSlower} from './shuttle';

test('shuttle rate ladder is ascending from 1x',()=>{
 assert.deepEqual([...SHUTTLE_RATES],[1,1.5,2,4]);
});

test('L from pause plays at 1x',()=>{
 assert.deepEqual(shuttleFaster({rate:4,playing:false}),{rate:1,playing:true});
});

test('L while playing climbs the ladder and caps at 4x',()=>{
 let s={rate:1,playing:true};
 s=shuttleFaster(s);assert.equal(s.rate,1.5);
 s=shuttleFaster(s);assert.equal(s.rate,2);
 s=shuttleFaster(s);assert.equal(s.rate,4);
 s=shuttleFaster(s);assert.equal(s.rate,4);
 assert.equal(s.playing,true);
});

test('J while playing steps down to 1x, then pauses',()=>{
 let s={rate:4,playing:true};
 s=shuttleSlower(s);assert.deepEqual(s,{rate:2,playing:true});
 s=shuttleSlower(s);assert.deepEqual(s,{rate:1.5,playing:true});
 s=shuttleSlower(s);assert.deepEqual(s,{rate:1,playing:true});
 s=shuttleSlower(s);assert.deepEqual(s,{rate:1,playing:false});
 s=shuttleSlower(s);assert.deepEqual(s,{rate:1,playing:false});
});

test('J while paused keeps the paused state (caller frame-steps)',()=>{
 assert.deepEqual(shuttleSlower({rate:2,playing:false}),{rate:2,playing:false});
});

test('unknown rates normalise to 1x',()=>{
 assert.deepEqual(shuttleFaster({rate:3,playing:true}),{rate:1.5,playing:true});
 assert.deepEqual(shuttleSlower({rate:0.5,playing:false}),{rate:1,playing:false});
});
