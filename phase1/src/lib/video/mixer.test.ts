import test from 'node:test';
import assert from 'node:assert/strict';
import {WindowMixer} from './mixer';

test('samples land at their timeline position and sum',()=>{
 const m=new WindowMixer(1,4); // 1 s windows at 4 Hz for readable math
 m.add(0.5,0.5,-0.5);
 m.add(0.5,0.25,0.25);
 const flushed=m.flushAll();
 assert.equal(flushed.length,1);
 assert.equal(flushed[0].start,0);
 // 0.5 s at 4 Hz = frame 2, stereo index 4
 assert.deepEqual([...flushed[0].data.slice(4,6)],[0.75,-0.25]);
});

test('windows flush strictly in order and only when complete',()=>{
 const m=new WindowMixer(1,4);
 m.add(2.5,1,1); // window 2
 m.add(0.1,1,1); // window 0
 assert.equal(m.flushThrough(1.5).map(f=>f.start).join(','),'0','window 1 still open');
 assert.equal(m.flushThrough(3).map(f=>f.start).join(','),'2');
 assert.equal(m.flushAll().length,0,'nothing left');
});

test('addSilence materializes empty windows so spans keep explicit silence',()=>{
 const m=new WindowMixer(1,4);
 m.addSilence(0.5,2); // covers windows 0,1,2
 assert.deepEqual(m.flushAll().map(f=>f.start),[0,1,2]);
 assert.ok(m.flushAll.length>=0);
});

test('negative and NaN times are ignored',()=>{
 const m=new WindowMixer(1,4);
 m.add(-1,1,1);m.add(NaN,1,1);
 assert.equal(m.flushAll().length,0);
});
