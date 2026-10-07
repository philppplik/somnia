import test from 'node:test';
import assert from 'node:assert/strict';
import {targetImageSize,validateImageSize,convertedImageName,rasterImageMime} from './imageConversion';
test('target dimensions default to original, derive either missing axis, or stretch explicitly',()=>{
 assert.deepEqual(targetImageSize({width:200,height:100}),{width:200,height:100});
 assert.deepEqual(targetImageSize({width:200,height:100},50),{width:50,height:25});
 assert.deepEqual(targetImageSize({width:200,height:100},undefined,50),{width:100,height:50});
 assert.deepEqual(targetImageSize({width:200,height:100},33,41),{width:33,height:41});
});
test('invalid or excessive sizes are rejected',()=>{
 for(const value of [0,-1,NaN,Infinity,1.5,8193])assert.throws(()=>validateImageSize({width:value,height:100}));
 assert.throws(()=>validateImageSize({width:8192,height:8192}));
 assert.throws(()=>targetImageSize({width:100,height:100},0));
 assert.deepEqual(validateImageSize({width:8000,height:4000}),{width:8000,height:4000});
});
test('export names do not overwrite sources, leak paths or mislabel JPEG',()=>{
 assert.equal(convertedImageName('C:\\photos\\test.webp','jpeg'),'test.jpg');
 assert.equal(convertedImageName('images/my.logo.svg','png'),'my.logo.png');
 assert.equal(convertedImageName('bad:name.png','webp'),'bad_name.webp');
});
test('raster formats are identified by bytes, not filename',()=>{
 assert.equal(rasterImageMime(Uint8Array.from([137,80,78,71,13,10,26,10])),'image/png');
 assert.equal(rasterImageMime(Uint8Array.from([255,216,255])),'image/jpeg');
 assert.equal(rasterImageMime(new TextEncoder().encode('RIFFxxxxWEBP')),'image/webp');
 assert.equal(rasterImageMime(new TextEncoder().encode('RIFFxxxxWAVE')),null);
 assert.equal(rasterImageMime(new Uint8Array()),null);
});
