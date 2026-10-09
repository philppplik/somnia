import test from 'node:test';
import assert from 'node:assert/strict';
import {isNeutralPhoto,neutralPhotoSettings,PHOTO_CONTROLS,photoSettingsToEngine,photoSignature,sanitizePhotoSettings,type PhotoSettings} from './studioSettings';
const s=(p:Partial<PhotoSettings>):PhotoSettings=>({...neutralPhotoSettings,...p});
test('neutral settings are neutral, complete and have a stable signature',()=>{
 assert.ok(isNeutralPhoto(neutralPhotoSettings));
 assert.ok(!isNeutralPhoto(s({exposure:1})));
 assert.equal(photoSignature(s({})),photoSignature(neutralPhotoSettings));
 // every engine control the inspector offers exists exactly once and inside its range
 const keys=new Set(PHOTO_CONTROLS.map(c=>c.key));
 assert.equal(keys.size,PHOTO_CONTROLS.length);
 for(const c of PHOTO_CONTROLS){const v=neutralPhotoSettings[c.key];assert.ok(typeof v==='number'&&c.min<=c.max&&c.step>0&&v>=c.min&&v<=c.max,c.key);}
});
test('sanitizer rejects unknown keys, non-finite values, bad orientation, flips and crops',()=>{
 assert.throws(()=>sanitizePhotoSettings(s({unknown:1} as never)),/Unexpected/);
 assert.throws(()=>sanitizePhotoSettings(s({exposure:NaN})),/Invalid exposure/);
 assert.throws(()=>sanitizePhotoSettings(s({temp:Infinity})),/Invalid temp/);
 assert.throws(()=>sanitizePhotoSettings(s({orientation:4 as never})),/orientation/);
 assert.throws(()=>sanitizePhotoSettings(s({flipH:1 as never})),/flip/);
 assert.throws(()=>sanitizePhotoSettings(s({crop:{x0:-0.1,y0:0,x1:1,y1:1}})),/crop/);
 assert.throws(()=>sanitizePhotoSettings(s({crop:{x0:0.5,y0:0,x1:0.4,y1:1}})),/crop/);
 assert.throws(()=>sanitizePhotoSettings(s({crop:{x0:0,y0:0,x1:2,y1:1}})),/crop/);
});
test('sanitizer clamps into the engine ranges instead of faking wider ones',()=>{
 const out=sanitizePhotoSettings(s({exposure:99,contrast:-200,temp:10,tint:999,sharpen:999,noiseColor:-5,straighten:120}));
 assert.equal(out.exposure,5);assert.equal(out.contrast,-100);assert.equal(out.temp,2000);assert.equal(out.tint,150);
 assert.equal(out.sharpen,150);assert.equal(out.noiseColor,0);assert.equal(out.straighten,45);
});
test('engine JSON maps onto the LightCraft DevelopSettings shape',()=>{
 const j=photoSettingsToEngine(s({exposure:1.5,temp:3200,tint:-10,sharpen:40,orientation:1,flipH:true,crop:{x0:0.1,y0:0.2,x1:0.9,y1:0.8},straighten:2.5}));
 assert.deepEqual(j.light,{exposure:1.5,contrast:0,highlights:0,shadows:0,whites:0,blacks:0});
 assert.deepEqual(j.wb,{temp:3200,tint:-10});
 assert.deepEqual(j.color,{vibrance:0,saturation:0});
 assert.deepEqual(j.effects,{texture:0,clarity:0,dehaze:0});
 assert.deepEqual(j.detail,{sharpen_amount:40,nr_luminance:0,nr_color:0});
 assert.deepEqual(j.crop,{geometry:{rect:{x0:0.1,y0:0.2,x1:0.9,y1:0.8},angle:2.5},flip_h:true,flip_v:false});
 assert.equal(j.orientation,'Rotate90');
 assert.equal(photoSettingsToEngine(s({})).orientation,'Normal');
 assert.deepEqual(photoSettingsToEngine(s({})).crop.geometry.rect,{x0:0,y0:0,x1:1,y1:1});
});
