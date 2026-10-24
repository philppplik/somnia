import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeSettingsPayload,decodeSettingsPayload,settingsPayloadToText,settingsPayloadFromText} from './settingsClipboard';
import {neutralPhotoSettings} from './studioSettings';
const edited={...neutralPhotoSettings,exposure:1.25,contrast:20,straighten:2.5,orientation:1 as const,flipH:true,crop:{x0:0.1,y0:0.1,x1:0.9,y1:0.8}};
test('roundtrip preserves tonal, colour and geometry settings',()=>{
 const p=encodeSettingsPayload(edited);
 const out=decodeSettingsPayload(p);
 assert.deepEqual(out,edited);
});
test('text roundtrip carries the kind marker',()=>{
 const text=settingsPayloadToText(encodeSettingsPayload(edited));
 assert.ok(text.includes('somnia/photo-settings'));
 assert.deepEqual(settingsPayloadFromText(text),edited);
});
test('decode rejects garbage, wrong version and unknown keys',()=>{
 assert.equal(decodeSettingsPayload(null),null);
 assert.equal(decodeSettingsPayload('x'),null);
 assert.equal(decodeSettingsPayload({v:2,settings:edited}),null);
 assert.equal(decodeSettingsPayload({v:1,settings:{...edited,hack:1}}),null);
 assert.equal(settingsPayloadFromText('not json'),null);
 assert.equal(settingsPayloadFromText('{"kind":"other","v":1,"settings":{}}'),null);
});
test('out-of-range numbers clamp into engine ranges',()=>{
 const out=decodeSettingsPayload({v:1,settings:{...edited,exposure:99,saturation:-999}});
 assert.equal(out!.exposure,5);
 assert.equal(out!.saturation,-100);
});
test('invalid crop or orientation is rejected, not repaired',()=>{
 assert.equal(decodeSettingsPayload({v:1,settings:{...edited,crop:{x0:0.9,y0:0,x1:0.1,y1:1}}}),null);
 assert.equal(decodeSettingsPayload({v:1,settings:{...edited,orientation:7}}),null);
});
