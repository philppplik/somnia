import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyLumMask,clampLumMask,lumMaskNeutral,lumMaskWeight,neutralLumMask,validLumMask} from './lumMask';
function frameOf(w:number,h:number,paint:(x:number,y:number)=>[number,number,number]){
 const b=new Uint8Array(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const[r,g,bl]=paint(x,y);const i=(y*w+x)*4;b[i]=r;b[i+1]=g;b[i+2]=bl;b[i+3]=255;}
 return{bytes:b.buffer as ArrayBuffer,width:w,height:h};
}
test('neutral adjustments return the same frame; validation and clamping hold',()=>{
 const f=frameOf(4,4,()=>[100,100,100]);
 assert.equal(applyLumMask(f,neutralLumMask()),f);
 assert.equal(lumMaskNeutral({...neutralLumMask(),lumaLo:0.2}),true); // window alone is not an edit
 assert.equal(validLumMask(neutralLumMask()),true);
 assert.equal(validLumMask({...neutralLumMask(),hueCenter:'red'}),false);
 const c=clampLumMask({lumaLo:0.8,lumaHi:0.2,feather:9,hueCenter:725,hueRange:0,ev:9,temp:-999,sat:200});
 assert.equal(c.lumaLo,0.2);assert.equal(c.lumaHi,0.8); // swapped into order
 assert.equal(c.feather,0.5);assert.equal(c.hueCenter,5);assert.equal(c.hueRange,5);
 assert.equal(c.ev,1);assert.equal(c.temp,-100);assert.equal(c.sat,100);
});
test('luma window selects bright pixels only, feather softens the seam',()=>{
 const m={...neutralLumMask(),lumaLo:0.6,lumaHi:1,feather:0.05,ev:1};
 assert.equal(lumMaskWeight(0.2,0,0,m),0);
 assert.ok(lumMaskWeight(0.9,0,0,m)>0.95);
 const edge=lumMaskWeight(0.6,0,0,m);
 assert.ok(edge>0.2&&edge<0.8,`feather seam: ${edge}`);
 const f=frameOf(4,1,(x)=>x<2?[40,40,40]:[230,230,230]);
 const out=applyLumMask(f,m);
 const b=new Uint8Array(out.bytes);
 assert.equal(b[0],40,'shadow untouched');
 assert.ok(b[8]>250,'highlight doubled');
 const orig=new Uint8Array(f.bytes);assert.equal(orig[8],230); // input not mutated
});
test('hue window selects the matching hue and skips achromatic pixels',()=>{
 const m={...neutralLumMask(),hueCenter:0,hueRange:30,sat:-100};
 assert.ok(lumMaskWeight(0.5,10,0.9,m)>0.9,'red inside');
 assert.equal(lumMaskWeight(0.5,120,0.9,m),0,'green outside');
 assert.equal(lumMaskWeight(0.5,10,0.02,m),0,'achromatic never matches a hue window');
 const wrap={...m,hueCenter:350};
 assert.ok(lumMaskWeight(0.5,5,0.9,wrap)>0.9,'window wraps around 360');
 const f=frameOf(3,1,(x)=>x===0?[220,30,30]:x===1?[30,220,30]:[128,128,128]);
 const out=applyLumMask(f,m);
 const b=new Uint8Array(out.bytes);
 assert.ok(Math.abs(b[0]-b[1])<8&&Math.abs(b[1]-b[2])<8,'red desaturated to gray');
 assert.deepEqual([b[4],b[5],b[6]],[30,220,30],'green untouched');
 assert.deepEqual([b[8],b[9],b[10]],[128,128,128],'gray untouched');
});
test('temp shifts through the mask weight only',()=>{
 const m={...neutralLumMask(),lumaLo:0.5,lumaHi:1,temp:100};
 const f=frameOf(2,1,(x)=>x===0?[100,100,100]:[200,200,200]);
 const out=applyLumMask(f,m);
 const b=new Uint8Array(out.bytes);
 assert.deepEqual([b[0],b[1],b[2]],[100,100,100],'dark side untouched');
 assert.ok(b[4]>b[5]&&b[6]<b[5],`warm shift: ${b[4]},${b[5]},${b[6]}`);
});
