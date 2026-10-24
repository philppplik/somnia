import test from 'node:test';
import assert from 'node:assert/strict';
import {applyGradFilters,clampGrad,gradSignature,validGrad,GRAD_MIN_LEN,MAX_GRADS} from './localAdjust';
import {sanitizePhotoSettings,neutralPhotoSettings,photoSignature} from './studioSettings';

const gray=(v:number,w=8,h=8)=>{const b=new Uint8Array(w*h*4);for(let i=0;i<w*h;i++){b[i*4]=v;b[i*4+1]=v;b[i*4+2]=v;b[i*4+3]=255;}return{bytes:b.buffer as ArrayBuffer,width:w,height:h};};
const px=(f:{bytes:ArrayBuffer;width:number},x:number,y:number)=>new Uint8Array(f.bytes)[(y*f.width+x)*4];

test('clampGrad clamps coords and enforces the minimum length on degenerate drags',()=>{
 const g=clampGrad({x0:-0.5,y0:1.4,x1:1.2,y1:0.5});
 assert.deepEqual(g,{x0:0,y0:1,x1:1,y1:0.5});
 const d=clampGrad({x0:0.5,y0:0.5,x1:0.5,y1:0.5}); // zero-length click extends downward
 assert.ok(Math.hypot(d.x1-d.x0,d.y1-d.y0)>=GRAD_MIN_LEN-1e-9);
 assert.equal(d.x0,0.5);assert.equal(d.y0,0.5);
});
test('validGrad rejects out-of-range, non-finite and too-short filters',()=>{
 assert.equal(validGrad({x0:0,y0:0,x1:0.5,y1:0.5}),true);
 assert.equal(validGrad({x0:-0.1,y0:0,x1:0.5,y1:0.5}),false);
 assert.equal(validGrad({x0:0,y0:0,x1:0.5,y1:Number.NaN}),false);
 assert.equal(validGrad({x0:0.5,y0:0.5,x1:0.5,y1:0.5}),false);
 assert.equal(validGrad('x'),false);
});
test('a vertical gradient darkens the top fully, the bottom not at all, with a smooth ramp between',()=>{
 const f=gray(100,4,8);
 const out=applyGradFilters(f,[{x0:0.5,y0:0,x1:0.5,y1:0.75}],-1,0); // ramp over rows 0..6
 assert.equal(px(out,2,0),50); // before/at the start plane: full 2^-1
 assert.equal(px(out,2,3),50); // the plateau holds full strength up to t=0.7
 assert.equal(px(out,2,7),100); // beyond the end plane: untouched
 const mid=px(out,2,5); // t=5/6 inside the smooth falloff: strictly between
 assert.ok(mid>50&&mid<100,`mid ${mid}`);
 assert.equal(px(f,2,0),100,'input frame never mutated');
});
test('gradient saturation lerps toward luma and empty filters return the input unchanged',()=>{
 const w=4,h=8,b=new Uint8Array(w*h*4);
 for(let i=0;i<w*h;i++){b[i*4]=200;b[i*4+1]=50;b[i*4+2]=50;b[i*4+3]=255;}
 const f={bytes:b.buffer as ArrayBuffer,width:w,height:h};
 assert.equal(applyGradFilters(f,[],1,50),f,'no filters: identity');
 assert.equal(applyGradFilters(f,[{x0:0,y0:0,x1:0,y1:1}],0,0),f,'neutral strengths: identity');
 const out=applyGradFilters(f,[{x0:0,y0:0,x1:0,y1:0.5}],0,-100); // ramp over rows 0..4 of 8
 assert.equal(px(out,0,0),Math.round(0.2126*200+0.7152*50+0.0722*50)); // fully desaturated at the start plane
 const part=px(out,0,4); // t=1 boundary: untouched
 assert.equal(part,200);
 assert.equal(px(out,0,7),200); // beyond the end plane untouched
});
test('settings sanitize validates grads and clamps strengths; the signature covers them',()=>{
 const s=sanitizePhotoSettings({...neutralPhotoSettings,grads:[{x0:0,y0:0,x1:0.5,y1:0.5}],gradEV:3,gradSat:-400});
 assert.equal(s.grads.length,1);assert.equal(s.gradEV,1);assert.equal(s.gradSat,-100);
 assert.throws(()=>sanitizePhotoSettings({...neutralPhotoSettings,grads:[{x0:0.5,y0:0.5,x1:0.5,y1:0.5}]}),/Invalid grad/);
 assert.throws(()=>sanitizePhotoSettings({...neutralPhotoSettings,grads:Array.from({length:MAX_GRADS+1},()=>({x0:0,y0:0,x1:0.5,y1:0.5}))}),/Invalid grads/);
 assert.notEqual(photoSignature({...neutralPhotoSettings,grads:[{x0:0,y0:0,x1:0.5,y1:0.5}]}),photoSignature(neutralPhotoSettings));
 assert.ok(gradSignature([{x0:0,y0:0,x1:0.5,y1:0.5}]).length>2);
});
