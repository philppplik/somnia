import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addVersion,isCurrentVersion,MAX_VERSIONS_PER_PHOTO,parseVersionBook,removeVersion,versionSettings,type VersionBook} from './versions';
import {encodeSettingsPayload} from './settingsClipboard';
import {neutralPhotoSettings} from './studioSettings';
let n=0;const id=()=>`v${++n}`;
test('version round-trips full settings including geometry',()=>{
 const s={...neutralPhotoSettings,exposure:0.4,crop:{x0:0.1,y0:0.1,x1:0.6,y1:0.7},flipH:true};
 const book=addVersion({},'a.png','Warm crop',s,id);
 const v=parseVersionBook(book)['a.png'][0];
 const back=versionSettings(v)!;
 assert.equal(back.exposure,0.4);
 assert.deepEqual(back.crop,{x0:0.1,y0:0.1,x1:0.6,y1:0.7});
 assert.equal(back.flipH,true);
 assert.equal(isCurrentVersion(v,s),true);
 assert.equal(isCurrentVersion(v,neutralPhotoSettings),false);
});
test('same name replaces case-insensitively and keeps the id',()=>{
 let book=addVersion({},'a.png','Look',{...neutralPhotoSettings,exposure:0.1},id);
 const first=parseVersionBook(book)['a.png'][0];
 book=addVersion(book,'a.png',' look ',{...neutralPhotoSettings,exposure:0.9},id);
 const vs=parseVersionBook(book)['a.png'];
 assert.equal(vs.length,1);
 assert.equal(vs[0].id,first.id);
 assert.equal(vs[0].name,'look');
 assert.equal(versionSettings(vs[0])!.exposure,0.9);
});
test('cap drops the oldest version; remove drops the empty photo key',()=>{
 let book:VersionBook={};
 for(let i=0;i<MAX_VERSIONS_PER_PHOTO+3;i++)book=addVersion(book,'a.png',`v${i}`,{...neutralPhotoSettings,exposure:i/100},id);
 const parsed=parseVersionBook(book);
 assert.equal(parsed['a.png'].length,MAX_VERSIONS_PER_PHOTO);
 assert.equal(parsed['a.png'][0].name,'v3'); // v0..v2 aged out
 const empty=removeVersion(removeVersion(parsed,'a.png',parsed['a.png'][0].id),'a.png','missing');
 assert.equal(empty['a.png'].length,MAX_VERSIONS_PER_PHOTO-1);
 let single=addVersion({},'b.png','only',neutralPhotoSettings,id);
 single=removeVersion(single,'b.png',parseVersionBook(single)['b.png'][0].id);
 assert.deepEqual(single,{});
});
test('parseVersionBook drops malformed entries and caps per photo',()=>{
 const good={id:'x',name:'ok',payload:encodeSettingsPayload(neutralPhotoSettings)};
 const raw={'a.png':[good,{id:'x',name:'dupe',payload:good.payload},{id:'y',name:'  ',payload:good.payload},{id:'z',name:'bad',payload:{v:2}},null,'junk'],'':[good],'b.png':'nope','c.png':[]};
 const book=parseVersionBook(raw);
 assert.deepEqual(Object.keys(book),['a.png']);
 assert.equal(book['a.png'].length,1);
 assert.equal(book['a.png'][0].name,'ok');
 assert.equal(parseVersionBook(null)['a.png'],undefined);
 assert.equal(parseVersionBook([1,2])['a.png'],undefined);
});
