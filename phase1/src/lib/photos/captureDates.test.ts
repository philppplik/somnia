import test from 'node:test';
import assert from 'node:assert/strict';
import {parseExifDate,getCaptureEntry,putCaptureDate,allCameras,duplicateKey} from './captureDates.ts';
test('captureDates: EXIF date parsing',()=>{
 const t=parseExifDate('2026:10:14 09:30:00');
 assert.equal(typeof t,'number');
 const d=new Date(t!);
 assert.equal(d.getFullYear(),2026);assert.equal(d.getMonth(),9);assert.equal(d.getDate(),14);assert.equal(d.getHours(),9);assert.equal(d.getMinutes(),30);
 assert.equal(parseExifDate(undefined),null);
 assert.equal(parseExifDate(''),null);
 assert.equal(parseExifDate('14.10.2026'),null);
});
test('captureDates: cache entries invalidate on size change',()=>{
 putCaptureDate('cd.png',100,123456,'Canon EOS R5');
 assert.deepEqual(getCaptureEntry('cd.png',100),{t:123456,s:100,cam:'Canon EOS R5',w:null,h:null});
 putCaptureDate('cd2.png',50,999,'Sony A7 IV');
 assert.deepEqual(allCameras(),['Canon EOS R5','Sony A7 IV']); // sorted, distinct
 assert.equal(getCaptureEntry('cd.png',101),null); // same name, new bytes
 putCaptureDate('cd.png',101,null);
 assert.deepEqual(getCaptureEntry('cd.png',101),{t:null,s:101,cam:null,w:null,h:null});
 putCaptureDate('cd2.png',50,null); // drain
 putCaptureDate('cd3.png',77,null,null,240,150);
 assert.equal(duplicateKey(getCaptureEntry('cd3.png',77)!),'77:240x150');
 putCaptureDate('cd3.png',77,null);
});
