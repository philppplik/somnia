import test from 'node:test';
import assert from 'node:assert/strict';
import {aspectRatio,fitAspect,isCropAspect,orientedSize,outputSize,ratioLabel,swapAspect} from './cropAspect';
const full={x0:0,y0:0,x1:1,y1:1};
const pxRatio=(r:{x0:number;y0:number;x1:number;y1:1|number},w:number,h:number)=>((r.x1-r.x0)*w)/((r.y1-r.y0)*h);
test('quarter turns swap the frame',()=>{
 assert.deepEqual(orientedSize(400,300,0),{width:400,height:300});assert.deepEqual(orientedSize(400,300,1),{width:300,height:400});
 assert.deepEqual(orientedSize(400,300,2),{width:400,height:300});assert.deepEqual(orientedSize(400,300,3),{width:300,height:400});
});
test('ratios: free is null, original follows the frame',()=>{
 assert.equal(aspectRatio('free',400,300),null);assert.equal(aspectRatio('original',400,300),4/3);assert.equal(aspectRatio('16:9',1,1),16/9);assert.equal(aspectRatio('original',0,0),null);
});
test('fitAspect gives the largest centred rect of the ratio',()=>{
 const r=fitAspect(full,1,400,300);
 assert.ok(Math.abs(pxRatio(r,400,300)-1)<1e-9);assert.ok(Math.abs((r.y1-r.y0)-1)<1e-9,'height is the limit');assert.ok(Math.abs(r.x0-(1-(r.x1-r.x0))/2)<1e-9);
 const wide=fitAspect(full,16/9,400,300);assert.ok(Math.abs(pxRatio(wide,400,300)-16/9)<1e-9);assert.ok(Math.abs((wide.x1-wide.x0)-1)<1e-9,'width is the limit');
});
test('fitAspect stays inside the base rect and the frame',()=>{
 const base={x0:0.1,y0:0.2,x1:0.6,y1:0.9};const r=fitAspect(base,3/2,1000,800);
 for(const v of [r.x0,r.y0,r.x1,r.y1])assert.ok(v>=0&&v<=1);
 assert.ok(r.x0>=base.x0-1e-9&&r.x1<=base.x1+1e-9&&r.y0>=base.y0-1e-9&&r.y1<=base.y1+1e-9);
 assert.ok(Math.abs(pxRatio(r,1000,800)-1.5)<1e-9);
 assert.deepEqual(fitAspect(base,0,1000,800),base);assert.deepEqual(fitAspect(base,NaN,1000,800),base);
});
test('swapAspect turns landscape into portrait without leaving the frame',()=>{
 const land=fitAspect(full,16/9,1600,900);const port=swapAspect(land,1600,900);
 for(const v of [port.x0,port.y0,port.x1,port.y1])assert.ok(v>=-1e-9&&v<=1+1e-9);
 assert.ok(pxRatio(port,1600,900)<1);
});
test('output size follows orientation and crop; straighten marks it as an estimate',()=>{
 assert.deepEqual(outputSize(400,300,{orientation:0,crop:null,straighten:0}),{width:400,height:300,estimated:false});
 assert.deepEqual(outputSize(400,300,{orientation:1,crop:null,straighten:0}),{width:300,height:400,estimated:false});
 assert.deepEqual(outputSize(400,300,{orientation:0,crop:{x0:0,y0:0,x1:0.5,y1:0.5},straighten:2}),{width:200,height:150,estimated:true});
 assert.equal(outputSize(0,0,{orientation:0,crop:null,straighten:0}).width,1);
});
test('ratio labels reduce and guard odd sizes',()=>{
 assert.equal(ratioLabel(1920,1080),'16:9');assert.equal(ratioLabel(300,300),'1:1');assert.equal(ratioLabel(0,5),'');assert.match(ratioLabel(1999,1000),/:1$/);
});
test('isCropAspect only accepts the listed values',()=>{assert.ok(isCropAspect('4:3'));assert.ok(!isCropAspect('7:5'));assert.ok(!isCropAspect(3));});
