import test from 'node:test';import assert from 'node:assert/strict';
import {defaultOnion,normalizeOnion,ghostFrames,MAX_GHOSTS,MAX_STEP} from './onion';
import {frameToTick} from './time';
const fps={num:24,den:1},dur=frameToTick(48,fps);
test('is off by default and gives no ghosts',()=>{assert.equal(defaultOnion().on,false);assert.deepEqual(ghostFrames(defaultOnion(),frameToTick(10,fps),fps,dur),[]);});
test('normalizes junk and clamps',()=>{
  assert.deepEqual(normalizeOnion(null),defaultOnion());
  const o=normalizeOnion({on:true,before:99,after:-3,step:1000});
  assert.deepEqual(o,{on:true,before:MAX_GHOSTS,after:0,step:MAX_STEP});
  assert.equal(normalizeOnion({on:'yes',before:NaN}).on,false);
 });
test('lists nearest-first ghosts with fading opacity',()=>{
  const g=ghostFrames({on:true,before:2,after:1,step:2},frameToTick(10,fps),fps,dur);
  assert.deepEqual(g.map(x=>[x.side,x.n,x.tick]),[['before',1,frameToTick(8,fps)],['before',2,frameToTick(6,fps)],['after',1,frameToTick(12,fps)]]);
  assert.ok(g[0].opacity>g[1].opacity);
 });
test('skips frames outside the composition',()=>{
  const g=ghostFrames({on:true,before:3,after:3,step:1},frameToTick(1,fps),fps,dur);
  assert.equal(g.filter(x=>x.side==='before').length,1);
  assert.deepEqual(ghostFrames({on:true,before:0,after:2,step:1},frameToTick(47,fps),fps,dur),[]);
 });
