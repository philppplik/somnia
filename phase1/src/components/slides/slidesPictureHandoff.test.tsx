import test from 'node:test';
import assert from 'node:assert/strict';
import {handoffReplaceImageParams} from './SlidesPictureHandoff';
import {decodeBase64,MAX_IMAGE_BASE64} from '../../lib/slides/imageSniff';

test('handback bytes reach slides.replaceImage as a base64 string, lossless',()=>{
 const bytes=new Uint8Array([137,80,78,71,13,10,26,10,0,1,2,3,255]);
 const p=handoffReplaceImageParams('deck.pptx',256,5,bytes);
 assert.equal(typeof p.data,'string','the command schema takes a string, not bytes');
 assert.ok(p.data.length>=4&&p.data.length<=MAX_IMAGE_BASE64);
 assert.deepEqual([...decodeBase64(p.data)],[...bytes]);
 assert.deepEqual({source:p.source,slideId:p.slideId,shapeId:p.shapeId},{source:'deck.pptx',slideId:256,shapeId:5});
});
