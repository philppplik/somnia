import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveAutoTone,deriveAutoWhiteBalance,deriveSpotWhiteBalance} from './autoTone';

const frame=(w:number,h:number,fill:(p:number)=>[number,number,number])=>{
 const b=new Uint8Array(w*h*4);
 for(let p=0;p<w*h;p++){const[r,g,bl]=fill(p);b[p*4]=r;b[p*4+1]=g;b[p*4+2]=bl;b[p*4+3]=255;}
 return b;
};
test('a dark image clamps exposure at +1.5 and deepens the raised black floor',()=>{
 const b=frame(64,64,()=>[20,20,20]); // all dark: lo=hi=20, mid 20 -> exposure ~ +2.67 clamped +1.5
 const a=deriveAutoTone(b,64,64);
 assert.equal(a.exposure,1.5);
 assert.ok(a.blacks<=-3&&a.blacks>=-6,'floor at 20 is raised above true black: reclaim it');
});
test('a washed-out image (raised black, low white) reclaims both points and centers exposure',()=>{
 const b=frame(64,64,p=>p%2?[60,60,60]:[180,180,180]); // lo=60, hi=180
 const a=deriveAutoTone(b,64,64);
 assert.ok(a.blacks<0,'deepens blacks for a raised floor');
 assert.ok(a.whites>0,'lifts whites for a low ceiling');
 assert.ok(Math.abs(a.exposure)<0.3,'midpoint 120 is already near mid gray');
});
test('a full-range gradient is already well toned: no point moves and near-zero balance nudges',()=>{
 const b=frame(256,64,p=>{const x=(p%256);return[x,x,x];}); // lo~1, hi~254
 const a=deriveAutoTone(b,256,64);
 assert.equal(a.blacks,0);assert.equal(a.whites,0);
 assert.ok(Math.abs(a.exposure)<=0.05,'midpoint already at mid gray');
 assert.ok(Math.abs(a.shadows)<=2&&Math.abs(a.highlights)<=2,'half-window means sit on their targets');
});
test('a flat mid-gray frame keeps exposure neutral and expands the degenerate point window',()=>{
 const b=frame(64,64,()=>[128,128,128]);
 const a=deriveAutoTone(b,64,64);
 assert.equal(a.exposure,0);
 assert.ok(a.blacks<0&&a.whites>0,'flat frame: both points stretch to reclaim range');
});
test('a warm cast cools (temp above neutral), a cool cast warms, and tint compensates green',()=>{
 const warm=deriveAutoWhiteBalance(frame(64,64,()=>[200,150,100]),64,64);
 assert.ok(warm.temp>6500,'warm image raises temp');
 const cool=deriveAutoWhiteBalance(frame(64,64,()=>[100,150,200]),64,64);
 assert.ok(cool.temp<6500,'cool image lowers temp');
 const green=deriveAutoWhiteBalance(frame(64,64,()=>[120,180,120]),64,64);
 assert.ok(green.tint>0,'green cast compensates toward magenta');
 const neutral=deriveAutoWhiteBalance(frame(64,64,()=>[140,140,140]),64,64);
 assert.equal(neutral.temp,6500);assert.equal(neutral.tint,0);
});
test('degenerate inputs return neutral picks and never mutate the frame',()=>{
 const b=frame(8,8,()=>[10,10,10]);const copy=b.slice();
 assert.deepEqual(deriveAutoTone(b,0,8),{exposure:0,highlights:0,shadows:0,whites:0,blacks:0});
 assert.deepEqual(deriveAutoWhiteBalance(b,8,0),{temp:6500,tint:0});
 assert.deepEqual(b,copy);
});
test('spot white balance reads a warm patch as a cooler temp and a green patch as magenta tint',()=>{
 const warm=frame(8,8,()=>[200,150,110]);
 const pick=deriveSpotWhiteBalance(warm,8,8,4,4);
 assert.ok(pick&&pick.temp>6500,`warm patch should raise temp, got ${pick?.temp}`);
 const green=frame(8,8,()=>[120,180,110]);
 const gp=deriveSpotWhiteBalance(green,8,8,4,4);
 assert.ok(gp&&gp.tint>0,`green patch should push tint toward magenta, got ${gp?.tint}`);
});
test('spot white balance stays neutral on a neutral patch and respects the disc radius',()=>{
 const flat=frame(16,16,()=>[128,128,128]);
 const pick=deriveSpotWhiteBalance(flat,16,16,8,8);
 assert.deepEqual(pick,{temp:6500,tint:0});
 const mixed=frame(32,32,p=>p%32>=24?[220,140,100]:[128,128,128]); // warm strip on the right
 const mp=deriveSpotWhiteBalance(mixed,32,32,8,16,7);
 assert.deepEqual(mp,{temp:6500,tint:0}); // the warm strip stays outside the disc
});
test('spot white balance returns null on clipped or tiny usable patches and bad input',()=>{
 const clipped=frame(8,8,()=>[255,250,245]); // everything near-clipped
 assert.equal(deriveSpotWhiteBalance(clipped,8,8,4,4),null);
 assert.equal(deriveSpotWhiteBalance(new Uint8Array(4),1,1,0,0),null);
});
