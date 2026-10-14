import test from 'node:test';
import assert from 'node:assert/strict';
import {applyRadialFilters,clampRad,radSignature,validRad,RAD_MIN_R,MAX_RADS} from './localAdjust';
import {sanitizePhotoSettings,neutralPhotoSettings,photoSignature} from './studioSettings';

const gray=(v:number,w=16,h=16)=>{const b=new Uint8Array(w*h*4);for(let i=0;i<w*h;i++){b[i*4]=v;b[i*4+1]=v;b[i*4+2]=v;b[i*4+3]=255;}return{bytes:b.buffer as ArrayBuffer,width:w,height:h};};
const px=(f:{bytes:ArrayBuffer;width:number},x:number,y:number)=>new Uint8Array(f.bytes)[(y*f.width+x)*4];

test('clampRad clamps the center and bounds the radii',()=>{
 const r=clampRad({x:-0.2,y:1.3,rx:0,ry:99});
 assert.equal(r.x,0);assert.equal(r.y,1);assert.equal(r.rx,RAD_MIN_R);assert.equal(r.ry,1.5);
});
test('validRad rejects out-of-range, non-finite and zero radii',()=>{
 assert.equal(validRad({x:0.5,y:0.5,rx:0.2,ry:0.1}),true);
 assert.equal(validRad({x:1.1,y:0.5,rx:0.2,ry:0.1}),false);
 assert.equal(validRad({x:0.5,y:0.5,rx:0,ry:0.1}),false);
 assert.equal(validRad({x:0.5,y:0.5,rx:Number.NaN,ry:0.1}),false);
 assert.equal(validRad(null),false);
});
test('a radial filter brightens the inside fully and leaves the outside untouched',()=>{
 const f=gray(100);
 const out=applyRadialFilters(f,[{x:0.5,y:0.5,rx:0.25,ry:0.25}],1,0); // ellipse r=4px around (8,8)
 assert.equal(px(out,8,8),200); // center: full 2^1
 assert.equal(px(out,8,10),200); // still inside the 0.7 plateau (dist 0.5)
 assert.equal(px(out,1,1),100); // far outside: untouched
 const edge=px(out,11,8); // dist 0.75: inside the falloff, strictly between
 assert.ok(edge>100&&edge<200,`edge ${edge}`);
 assert.equal(px(f,8,8),100,'input frame never mutated');
});
test('an ellipse respects independent x/y radii and identity cases return the input',()=>{
 const f=gray(100);
 assert.equal(applyRadialFilters(f,[],1,50),f);
 assert.equal(applyRadialFilters(f,[{x:0.5,y:0.5,rx:0.25,ry:0.25}],0,0),f);
 const out=applyRadialFilters(f,[{x:0.5,y:0.5,rx:0.4,ry:0.1}],1,0); // wide flat ellipse
 assert.equal(px(out,11,8),200); // dist x 0.1875: inside
 assert.equal(px(out,8,10),100); // dist y 1.25: outside the flat ellipse
});
test('settings sanitize validates rads and the signature covers them',()=>{
 const s=sanitizePhotoSettings({...neutralPhotoSettings,rads:[{x:0.5,y:0.5,rx:0.2,ry:0.1}]});
 assert.equal(s.rads.length,1);
 assert.throws(()=>sanitizePhotoSettings({...neutralPhotoSettings,rads:[{x:0.5,y:0.5,rx:0,ry:0.1}]}),/Invalid rad/);
 assert.throws(()=>sanitizePhotoSettings({...neutralPhotoSettings,rads:Array.from({length:MAX_RADS+1},()=>({x:0.5,y:0.5,rx:0.2,ry:0.1}))}),/Invalid rads/);
 assert.notEqual(photoSignature({...neutralPhotoSettings,rads:[{x:0.5,y:0.5,rx:0.2,ry:0.1}]}),photoSignature(neutralPhotoSettings));
 assert.ok(radSignature([{x:0.5,y:0.5,rx:0.2,ry:0.1}]).length>2);
});
