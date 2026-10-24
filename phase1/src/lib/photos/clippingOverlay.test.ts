import test from 'node:test';
import assert from 'node:assert/strict';
import {clippingOverlayImage,CLIPPING_SHADOW,CLIPPING_HIGHLIGHT} from './clippingOverlay';
import {CLIP_LOW,CLIP_HIGH} from './histogram';
const frame=(pixels:number[][],width=pixels.length,height=1)=>({bytes:new Uint8Array(pixels.flatMap(([r,g,b,a=255])=>[r,g,b,a])).buffer as ArrayBuffer,width,height});
const px=(out:{bytes:ArrayBuffer},i:number)=>Array.from(new Uint8Array(out.bytes).slice(i*4,i*4+4));
test('black pixels become shadow blue, white pixels highlight red',()=>{
 const out=clippingOverlayImage(frame([[0,0,0],[255,255,255]]));
 assert.deepEqual(px(out,0),[...CLIPPING_SHADOW,255]);
 assert.deepEqual(px(out,1),[...CLIPPING_HIGHLIGHT,255]);
});
test('mid-tone pixels stay transparent',()=>{
 const out=clippingOverlayImage(frame([[128,128,128],[10,200,30]]));
 assert.deepEqual(px(out,0),[0,0,0,0]);
 assert.deepEqual(px(out,1),[0,0,0,0]);
});
test('fully transparent pixels are skipped',()=>{
 const out=clippingOverlayImage(frame([[0,0,0,0]]));
 assert.deepEqual(px(out,0),[0,0,0,0]);
});
test('thresholds match the histogram clipping bands',()=>{
 const below=clippingOverlayImage(frame([[CLIP_LOW+1,CLIP_LOW+1,CLIP_LOW+1]]));
 assert.deepEqual(px(below,0),[0,0,0,0]);
 const at=clippingOverlayImage(frame([[CLIP_LOW,CLIP_LOW,CLIP_LOW],[CLIP_HIGH,CLIP_HIGH,CLIP_HIGH]]));
 assert.deepEqual(px(at,0),[...CLIPPING_SHADOW,255]);
 assert.deepEqual(px(at,1),[...CLIPPING_HIGHLIGHT,255]);
});
test('one saturated channel alone does not count as clipped (luma-based)',()=>{
 const out=clippingOverlayImage(frame([[255,0,0]]));
 assert.deepEqual(px(out,0),[0,0,0,0]);
});
test('output frame keeps dimensions',()=>{
 const f=frame([[0,0,0],[255,255,255],[128,128,128],[0,0,0]],2,2);
 const out=clippingOverlayImage(f);
 assert.equal(out.width,2);assert.equal(out.height,2);
 assert.equal(new Uint8Array(out.bytes).length,2*2*4);
});
