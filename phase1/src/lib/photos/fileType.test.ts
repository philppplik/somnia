import test from 'node:test';
import assert from 'node:assert/strict';
import {photoFileType} from './fileType.ts';
test('fileType: sniffed MIME maps to the coarse type',()=>{
 assert.equal(photoFileType('image/jpeg'),'jpeg');
 assert.equal(photoFileType('image/png'),'png');
 assert.equal(photoFileType('image/webp'),'webp');
 assert.equal(photoFileType('image/vnd.adobe.photoshop'),'psd');
 assert.equal(photoFileType('image/tiff'),'other');
 assert.equal(photoFileType('image/gif'),'other');
});
