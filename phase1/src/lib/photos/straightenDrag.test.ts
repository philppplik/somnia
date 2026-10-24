import test from 'node:test';
import assert from 'node:assert/strict';
import {straightenAngle,STRAIGHTEN_MIN_LEN} from './straightenDrag';

test('a level line keeps zero, a down-right slope levels counter-clockwise, a steep line clamps',()=>{
 assert.equal(straightenAngle(0.1,0.5,0.9,0.5),0);
 const down=straightenAngle(0.1,0.4,0.9,0.6)!; // slopes down to the right
 assert.ok(down<0,'correction turns counter-clockwise');
 assert.ok(Math.abs(Math.abs(down)-Math.atan2(0.2,0.8)*180/Math.PI)<0.1,'magnitude matches the slope');
 const steep=straightenAngle(0.5,0.1,0.55,0.95)!;
 assert.equal(Math.abs(steep),45,'clamped to the setting range');
});
test('short drags are taps: null, no commit',()=>{
 assert.equal(straightenAngle(0.5,0.5,0.5+STRAIGHTEN_MIN_LEN/2,0.5),null);
 assert.equal(straightenAngle(0.5,0.5,0.5,0.5),null);
});
