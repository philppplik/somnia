import test from 'node:test';
import assert from 'node:assert/strict';
import {applyLocalAdjust,clampDab,dabSignature,validDab} from './localAdjust';

const frame=(w:number,h:number,fill:[number,number,number])=>{
 const b=new Uint8Array(w*h*4);
 for(let i=0;i<w*h;i++){b[i*4]=fill[0];b[i*4+1]=fill[1];b[i*4+2]=fill[2];b[i*4+3]=255;}
 return{bytes:b.buffer as ArrayBuffer,width:w,height:h};
};
const px=(f:{bytes:ArrayBuffer;width:number},x:number,y:number)=>{const d=new Uint8Array(f.bytes),i=(y*f.width+x)*4;return[d[i],d[i+1],d[i+2]];};

test('clampDab and validDab guard the shape',()=>{
 assert.deepEqual(clampDab({x:-1,y:2,r:9}),{x:0,y:1,r:0.5});
 assert.ok(validDab({x:0.5,y:0.5,r:0.05}));
 assert.ok(!validDab({x:0.5,y:0.5,r:9}));
 assert.ok(!validDab({x:0.5,y:0.5}));
});

test('dabSignature is stable and order-sensitive',()=>{
 const a={x:0.1,y:0.2,r:0.05},b={x:0.3,y:0.4,r:0.06};
 assert.equal(dabSignature([a,b]),dabSignature([{...a},{...b}]));
 assert.notEqual(dabSignature([a,b]),dabSignature([b,a]));
});

test('empty mask or neutral strengths return the input frame',()=>{
 const f=frame(8,8,[120,120,120]);
 assert.equal(applyLocalAdjust(f,[],0.7,-50),f);
 assert.equal(applyLocalAdjust(f,[{x:0.5,y:0.5,r:0.2}],0,0),f);
});

test('positive ev brightens inside the dab and leaves the outside untouched',()=>{
 const f=frame(64,64,[100,100,100]);
 const out=applyLocalAdjust(f,[{x:0.5,y:0.5,r:0.1}],0.7,0);
 assert.notEqual(out,f);
 const[c]=px(out,32,32); // centre: full coverage, 100*2^0.7
 assert.ok(Math.abs(c-100*Math.pow(2,0.7))<3,`centre ${c}`);
 assert.deepEqual(px(out,4,4),[100,100,100]);
 const before=px(out,32,32),edge=px(out,32,32-Math.round(0.1*64*0.85)); // feather zone is dimmer than the core
 assert.ok(edge[0]<before[0]&&edge[0]>=100);
});

test('negative sat desaturates toward luma, positive saturates away from it',()=>{
 const f=frame(64,64,[40,140,80]);
 const grey=applyLocalAdjust(f,[{x:0.5,y:0.5,r:0.1}],0,-100);
 const[gr,gg,gb]=px(grey,32,32);
 assert.ok(Math.abs(gr-gg)<=2&&Math.abs(gg-gb)<=2,`desaturated ${gr},${gg},${gb}`);
 const vivid=applyLocalAdjust(f,[{x:0.5,y:0.5,r:0.1}],0,80);
 const[vr,vg,vb]=px(vivid,32,32);
 const l=0.2126*40+0.7152*140+0.0722*80;
 assert.ok(Math.abs(vg-l)>Math.abs(140-l),`green pushes away from luma: ${vg}`);
 assert.ok(vr<40&&vb<80);
});
