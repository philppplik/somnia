import test from 'node:test';
import assert from 'node:assert/strict';
import {applySpots,autoSource,clampSpot,spotCoverage,spotSignature,validSpot,type HealSpot} from './healSpots';
const frame=(w:number,h:number,fill:(x:number,y:number)=>[number,number,number,number])=>{
 const b=new Uint8Array(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;const p=fill(x,y);b[i]=p[0];b[i+1]=p[1];b[i+2]=p[2];b[i+3]=p[3];}
 return{bytes:b.buffer as ArrayBuffer,width:w,height:h};
};
const px=(f:{bytes:ArrayBuffer;width:number},x:number,y:number)=>{const b=new Uint8Array(f.bytes),i=(y*f.width+x)*4;return[b[i],b[i+1],b[i+2],b[i+3]];};
test('no spots returns the input frame unchanged (same reference)',()=>{
 const f=frame(4,4,()=>[10,20,30,255]);
 assert.equal(applySpots(f,[]),f);
});
test('the disc centre is cloned from the offset source',()=>{
 const f=frame(32,32,(x,y)=>[x>=24?200:0,0,y>=24?160:0,255]);
 const spot:HealSpot={x:8/32,y:8/32,r:0.15,dx:20/32,dy:20/32};
 const out=applySpots(f,[spot]);
 assert.notEqual(out,f);
 assert.deepEqual(px(out,8,8),[200,0,160,255]);
 assert.deepEqual(px(out,0,0),[0,0,0,255]); // outside the disc untouched
});
test('the feather blends source and destination at the edge',()=>{
 const f=frame(64,64,x=>[x>=40?255:0,0,0,255]);
 const spot:HealSpot={x:16/64,y:32/64,r:0.25,dx:24/64,dy:0};
 const out=applySpots(f,[spot]);
 const rad=0.25*64;
 const mid=px(out,Math.round(16+rad*0.85),32);
 assert.ok(mid[0]>0&&mid[0]<255,`edge should blend, got ${mid[0]}`);
});
test('offset source clamps at the border instead of throwing',()=>{
 const f=frame(8,8,()=>[7,7,7,255]);
 const out=applySpots(f,[{x:0.9,y:0.9,r:0.2,dx:0.5,dy:0.5}]);
 assert.equal(out.width,8);
});
test('validSpot accepts only in-range finite spots',()=>{
 assert.equal(validSpot({x:0.5,y:0.5,r:0.1,dx:0.2,dy:-0.2}),true);
 assert.equal(validSpot({x:1.2,y:0.5,r:0.1,dx:0,dy:0}),false);
 assert.equal(validSpot({x:0.5,y:0.5,r:0,dx:0,dy:0}),false);
 assert.equal(validSpot({x:0.5,y:0.5,r:0.6,dx:0,dy:0}),false);
 assert.equal(validSpot({x:0.5,y:0.5,r:0.1,dx:Number.NaN,dy:0}),false);
 assert.equal(validSpot('nope'),false);
});
test('clampSpot keeps coordinates inside their bounds',()=>{
 const s=clampSpot({x:1.4,y:-0.2,r:9,dx:3,dy:-3});
 assert.deepEqual(s,{x:1,y:0,r:0.5,dx:1,dy:-1});
});
test('spotSignature is stable and order-sensitive',()=>{
 const a:HealSpot={x:0.1,y:0.2,r:0.05,dx:0.3,dy:0.1};
 const b:HealSpot={x:0.5,y:0.6,r:0.02,dx:-0.1,dy:0.2};
 assert.equal(spotSignature([a,b]),spotSignature([a,b]));
 assert.notEqual(spotSignature([a,b]),spotSignature([b,a]));
});
test('coverage is 1 inside, 0 outside, smooth between',()=>{
 assert.equal(spotCoverage(0),1);
 assert.equal(spotCoverage(0.7),1);
 assert.equal(spotCoverage(1),0);
 assert.equal(spotCoverage(1.2),0);
 const m=spotCoverage(0.85);
 assert.ok(m>0&&m<1);
});

test('autoSource picks the flattest direction and stays deterministic',()=>{
 const w=64,h=64,b=new Uint8Array(w*h*4);
 for(let i=0;i<w*h;i++){b[i*4]=40;b[i*4+1]=140;b[i*4+2]=80;b[i*4+3]=255;}
 // high-contrast checkerboard noise to the right of the target
 for(let y=24;y<40;y++)for(let x=40;x<56;x++){const v=(x+y)%2?255:0;const i=(y*w+x)*4;b[i]=v;b[i+1]=v;b[i+2]=v;}
 const frame={bytes:b.buffer as ArrayBuffer,width:w,height:h};
 const sp=autoSource(frame,0.5,0.5,0.08);
 assert.ok(sp&&validSpot(sp));
 assert.ok(sp!.dx<=0,'must not pick the noisy right-hand direction');
 const again=autoSource(frame,0.5,0.5,0.08);
 assert.equal(spotSignature([sp!]),spotSignature([again!]));
});

test('autoSource returns null when no candidate disc fits the frame',()=>{
 const w=64,h=64,b=new Uint8Array(w*h*4).fill(120);
 const frame={bytes:b.buffer as ArrayBuffer,width:w,height:h};
 assert.equal(autoSource(frame,0.5,0.5,0.6),null); // disc plus offset fits nowhere
 const edge=autoSource(frame,0.02,0.02,0.05); // corner: only down-right-ish candidates fit
 assert.ok(edge===null||validSpot(edge));
});
