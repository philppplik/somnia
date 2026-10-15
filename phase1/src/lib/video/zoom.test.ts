import test from 'node:test';
import assert from 'node:assert/strict';
import {scrollLeftForTime,snapPointsFor,snapThresholdSeconds,snapTime,zoomInStep,zoomOutStep,ZOOM_MAX,ZOOM_MIN} from './zoom';
import type {TimelineClip} from './timeline';
const clips:TimelineClip[]=[{id:'a',source:'s',in_s:0,out_s:4,gain:1,muted:false},{id:'b',source:'s',in_s:2,out_s:6,gain:1,muted:false}];

test('snap points cover the bounds and every clip edge',()=>{
 assert.deepEqual(snapPointsFor(clips),[0,8,0,4,4,8]);
 assert.deepEqual(snapPointsFor(clips,[2.5]).at(-1),2.5,'caller extras (playhead) join the set');
 assert.deepEqual(snapPointsFor([]),[0,0]);
});

test('snapTime snaps to the nearest point inside the threshold only',()=>{
 const pts=[0,4,8];
 assert.equal(snapTime(3.9,pts,0.2),4);
 assert.equal(snapTime(3.7,pts,0.2),3.7,'outside the threshold passes through');
 assert.equal(snapTime(0.1,pts,0.2),0);
 assert.equal(snapTime(4,pts,0.2),4,'already on a point stays');
 assert.equal(snapTime(7.95,pts,0.2),8);
 assert.equal(snapTime(5,[],0.2),5,'no points, no snap');
});

test('the pixel threshold converts with the zoomed track width',()=>{
 assert.equal(snapThresholdSeconds(8,1000,10),0.08);
 assert.equal(snapThresholdSeconds(8,4000,10),0.02,'zoomed in, the same pixels are fewer seconds');
 assert.equal(snapThresholdSeconds(8,0,10),0,'zero width is safe');
});

test('zoom steps grow and shrink within bounds',()=>{
 assert.equal(zoomInStep(1),1.5);
 assert.equal(zoomOutStep(1.5),1);
 assert.equal(zoomInStep(ZOOM_MAX),ZOOM_MAX);
 assert.equal(zoomOutStep(ZOOM_MIN),ZOOM_MIN);
 assert.ok(zoomOutStep(zoomInStep(3))<=3&&zoomInStep(2)>2);
});

test('scrollLeftForTime keeps a time at a viewport offset and never goes negative',()=>{
 assert.equal(scrollLeftForTime(5,10,2000,100),900);
 assert.equal(scrollLeftForTime(0.1,10,2000,100),0,'left edge clamps at 0');
 assert.equal(scrollLeftForTime(5,0,2000,100),0,'empty timeline is safe');
});
