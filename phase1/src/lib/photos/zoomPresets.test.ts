import test from 'node:test';
import assert from 'node:assert/strict';
import {ZOOM_PRESETS,isZoomPresetActive,zoomPresetLabel} from './zoomPresets';
test('preset stops are ascending, inside the workspace zoom range and include 100%',()=>{
 assert.ok(ZOOM_PRESETS.length>=2);
 for(let i=1;i<ZOOM_PRESETS.length;i++)assert.ok(ZOOM_PRESETS[i]>ZOOM_PRESETS[i-1]);
 for(const p of ZOOM_PRESETS){assert.ok(p>=0.02);assert.ok(p<=16);}
 assert.ok(ZOOM_PRESETS.includes(1));
});
test('a stop is active only when an explicit zoom matches it',()=>{
 assert.equal(isZoomPresetActive(1,1),true);
 assert.equal(isZoomPresetActive(0.5,0.5),true);
 assert.equal(isZoomPresetActive(1.0000004,1),true);
 assert.equal(isZoomPresetActive(1.01,1),false);
 assert.equal(isZoomPresetActive(2,1),false);
});
test('fit-to-window (null zoom) never marks a stop active',()=>{
 for(const p of ZOOM_PRESETS)assert.equal(isZoomPresetActive(null,p),false);
});
test('labels render as rounded percents',()=>{
 assert.deepEqual(ZOOM_PRESETS.map(zoomPresetLabel),['50%','100%','200%','400%']);
});
