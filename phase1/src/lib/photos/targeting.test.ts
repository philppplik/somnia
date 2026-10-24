import test from 'node:test';
import assert from 'node:assert/strict';
import {bandForHue,nearestCurvePoint,targetSliderDelta,targetCurveDelta,TARGET_GRAB_X} from './targeting';

test('bandForHue picks the window owner at centers, boundaries and wrap-around',()=>{
 assert.equal(bandForHue(0),'red');assert.equal(bandForHue(359),'red');
 assert.equal(bandForHue(30),'orange');assert.equal(bandForHue(120),'green');
 assert.equal(bandForHue(180),'aqua');assert.equal(bandForHue(240),'blue');
 assert.equal(bandForHue(315),'magenta');assert.equal(bandForHue(275),'purple');
 assert.equal(bandForHue(15),'red'); // exact boundary: tie breaks toward the lower index
 assert.equal(bandForHue(16),'orange');
 assert.equal(bandForHue(337.5),'red');
});
test('nearestCurvePoint grabs within the tolerance and adds otherwise',()=>{
 const pts=[{x:0.3,y:0.4},{x:0.7,y:0.6}];
 assert.equal(nearestCurvePoint(pts,0.32),0);
 assert.equal(nearestCurvePoint(pts,0.66),1);
 assert.equal(nearestCurvePoint(pts,0.5),-1);
 assert.equal(nearestCurvePoint([],0.5),-1);
 assert.equal(nearestCurvePoint(pts,0.3+TARGET_GRAB_X-0.001),0);
 assert.equal(nearestCurvePoint(pts,0.3+TARGET_GRAB_X+0.001),-1);
});
test('drag deltas: a full image height covers the whole range, up is positive, zero height is safe',()=>{
 assert.equal(targetSliderDelta(-100,200),100);
 assert.equal(targetSliderDelta(100,200),-100);
 assert.equal(targetSliderDelta(-50,200),50);
 assert.equal(targetCurveDelta(-200,200),1);
 assert.equal(targetCurveDelta(50,200),-0.25);
 assert.equal(targetSliderDelta(-100,0),0);
 assert.equal(targetCurveDelta(-100,0),0);
});
