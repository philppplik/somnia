import test from 'node:test';
import assert from 'node:assert/strict';
import {parseExifDate,getCaptureEntry,putCaptureDate,allCameras,allApertures,allLenses,allShutterSpeeds,duplicateKey,entryFromInfo,entryToInfo,exposureLine} from './captureDates.ts';
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
 assert.deepEqual(getCaptureEntry('cd.png',100),{t:123456,s:100,cam:'Canon EOS R5',w:null,h:null,lens:null,exp:null,ap:null,iso:null,fl:null}); // v4: full daily EXIF set
 putCaptureDate('cd2.png',50,999,'Sony A7 IV');
 assert.deepEqual(allCameras(),['Canon EOS R5','Sony A7 IV']); // sorted, distinct
 assert.equal(getCaptureEntry('cd.png',101),null); // same name, new bytes
 putCaptureDate('cd.png',101,null);
 assert.deepEqual(getCaptureEntry('cd.png',101),{t:null,s:101,cam:null,w:null,h:null,lens:null,exp:null,ap:null,iso:null,fl:null});
 putCaptureDate('cd2.png',50,null); // drain
 putCaptureDate('cd3.png',77,null,null,240,150);
 assert.equal(duplicateKey(getCaptureEntry('cd3.png',77)!),'77:240x150');
 putCaptureDate('cd3.png',77,null);
});

test('captureDates: entryFromInfo maps the full daily EXIF set, exposureLine scans parts',()=>{
 const e=entryFromInfo(2131,{dateTime:'2026:10:14 09:30:00',camera:'Canon EOS R5',width:240,height:150,lens:'RF 35mm F1.8',exposure:'1/125',aperture:'f/2.8',iso:200,focalLength:'35 mm'});
 assert.equal(e.cam,'Canon EOS R5');assert.equal(e.w,240);assert.equal(e.h,150);
 assert.equal(e.lens,'RF 35mm F1.8');assert.equal(e.exp,'1/125');assert.equal(e.ap,'f/2.8');assert.equal(e.iso,200);assert.equal(e.fl,'35 mm');
 assert.equal(typeof e.t,'number');
 assert.equal(exposureLine(e),'1/125 · f/2.8 · ISO 200 · 35 mm');
 const bare=entryFromInfo(50,{}); // nothing readable: every field stays null, nothing invented
 assert.deepEqual(bare,{t:null,s:50,cam:null,w:null,h:null,lens:null,exp:null,ap:null,iso:null,fl:null});
 assert.equal(exposureLine(bare),'');
 assert.equal(exposureLine(entryFromInfo(1,{iso:6400})),'ISO 6400'); // partial sets show their parts only
});
test('captureDates: lens, aperture and shutter options sort photographically',()=>{
 putCaptureDate('o1.png',11,null,null,null,null,{lens:'Zoom 24-70',ap:'f/2.8',exp:'1/125 s'});
 putCaptureDate('o2.png',22,null,null,null,null,{lens:'Prime 35',ap:'f/1.4',exp:'1/30 s'});
 putCaptureDate('o3.png',33,null,null,null,null,{lens:'Prime 35',ap:'f/8',exp:'2 s'});
 assert.deepEqual(allLenses(),['Prime 35','Zoom 24-70']); // distinct, alphabetical
 assert.deepEqual(allApertures(),['f/1.4','f/2.8','f/8']); // fast first
 assert.deepEqual(allShutterSpeeds(),['1/125 s','1/30 s','2 s']); // fast first, text form understood
 for(const n of['o1.png','o2.png','o3.png'])putCaptureDate(n,0,null); // drain: size mismatch removes them from the options
 assert.deepEqual(allApertures(),[]);
});

test('captureDates: entryToInfo inverts entryFromInfo for display',()=>{
 const info={dateTime:'2026:10:14 09:30:05',camera:'Canon EOS R5',width:240,height:150,lens:'RF 35mm F1.8',exposure:'1/125',aperture:'f/2.8',iso:200,focalLength:'35 mm'};
 assert.deepEqual(entryToInfo(entryFromInfo(2131,info)),info); // exact round-trip: the panel can read the cache instead of the file
 const bare=entryToInfo(entryFromInfo(50,{}));
 assert.equal(bare.camera,undefined);assert.equal(bare.dateTime,undefined);assert.equal(bare.width,undefined);assert.equal(bare.iso,undefined); // nulls become absent fields
});
