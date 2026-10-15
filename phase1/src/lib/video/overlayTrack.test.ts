import test from 'node:test';
import assert from 'node:assert/strict';
import {CENTER_OVERLAY,LOWER_THIRD,newImageOverlay,newTitleOverlay,overlaysAt,overlayTrackEnd,sanitizeOverlay,sanitizeRect} from './overlayTrack';

test('sanitizeRect clamps into the frame and never sticks out',()=>{
 assert.deepEqual(sanitizeRect(null),LOWER_THIRD);
 assert.deepEqual(sanitizeRect({x:0.9,y:0.9,w:0.5,h:0.5}),{x:0.9,y:0.9,w:0.1,h:0.1},'size shrinks to fit');
 assert.deepEqual(sanitizeRect({x:-1,y:2,w:0,h:Number.NaN}).w>0,true,'junk sizes become valid');
 const r=sanitizeRect({x:0.1,y:0.2,w:0.3,h:0.4});
 assert.deepEqual(r,{x:0.1,y:0.2,w:0.3,h:0.4},'valid rects pass through');
});

test('new overlays: title is a lower third, image is centered, both sanitized',()=>{
 const ti=newTitleOverlay({text:'Hello'},5);
 assert.equal(ti.kind,'title');assert.equal(ti.at,5);assert.deepEqual(ti.rect,LOWER_THIRD);assert.equal(ti.title?.text,'Hello');
 const im=newImageOverlay('logo.png');
 assert.equal(im.kind,'image');assert.equal(im.source,'logo.png');assert.deepEqual(im.rect,CENTER_OVERLAY);assert.equal(im.title,undefined);
 const junk=sanitizeOverlay({...im,at:-3,duration:0,opacity:7,rect:{x:0,y:0,w:0,h:0}});
 assert.ok(junk.at>=0&&junk.duration>=0.05&&junk.opacity<=1&&junk.rect.w>=0.01);
});

test('overlaysAt: visible inside [at, at+duration), z-order kept',()=>{
 const a=newTitleOverlay({text:'A'},1,2),b=newImageOverlay('x.png',2,2);
 assert.deepEqual(overlaysAt([a,b],0),[]);
 assert.deepEqual(overlaysAt([a,b],1.5),[a]);
 assert.deepEqual(overlaysAt([a,b],2.5),[a,b],'overlap keeps array order');
 assert.deepEqual(overlaysAt([a,b],3),[b],'end is exclusive');
 assert.equal(overlayTrackEnd([a,b]),4);
});
