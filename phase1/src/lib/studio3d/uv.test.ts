import test from 'node:test';import assert from 'node:assert/strict';
import {mergeTransform,isDefaultTransform,DEFAULT_TRANSFORM,UvError} from './uv';
test('mergeTransform applies a partial change and keeps the rest',()=>{
 const t=mergeTransform(DEFAULT_TRANSFORM,{offsetX:0.25,rotation:90});
 assert.deepEqual(t,{offsetX:0.25,offsetY:0,scaleX:1,scaleY:1,rotation:90});assert.equal(isDefaultTransform(t),false);assert.equal(isDefaultTransform(DEFAULT_TRANSFORM),true);
});
test('mergeTransform allows a mirrored scale but refuses zero and out of range values',()=>{
 assert.equal(mergeTransform(DEFAULT_TRANSFORM,{scaleX:-1}).scaleX,-1);
 assert.throws(()=>mergeTransform(DEFAULT_TRANSFORM,{scaleX:0}),UvError);
 assert.throws(()=>mergeTransform(DEFAULT_TRANSFORM,{scaleY:5000}),UvError);
 assert.throws(()=>mergeTransform(DEFAULT_TRANSFORM,{offsetX:101}),UvError);
 assert.throws(()=>mergeTransform(DEFAULT_TRANSFORM,{rotation:Number.NaN}),UvError);
 assert.throws(()=>mergeTransform(DEFAULT_TRANSFORM,{offsetY:'1' as unknown as number}),UvError);
});
test('mergeTransform does not change its input',()=>{const b={...DEFAULT_TRANSFORM};mergeTransform(b,{offsetX:2});assert.deepEqual(b,DEFAULT_TRANSFORM);});
