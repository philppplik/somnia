import test from 'node:test';
import assert from 'node:assert/strict';
import {applyHsl,bandWeight,bandNeutral,hslNeutral,hslSignature,neutralHsl,validHsl,rgbToHsl,hslToRgb,HSL_BANDS} from './hslMixer';
import {sanitizePhotoSettings,neutralPhotoSettings,photoSignature} from './studioSettings';

const solid=(r:number,g:number,b:number,w=2,h=2)=>{const px=new Uint8Array(w*h*4);for(let o=0;o<px.length;o+=4){px[o]=r;px[o+1]=g;px[o+2]=b;px[o+3]=255;}return{bytes:px.buffer as ArrayBuffer,width:w,height:h};};
const px=(f:{bytes:ArrayBuffer})=>[...new Uint8Array(f.bytes).slice(0,4)];
const hslWith=(band:(typeof HSL_BANDS)[number],v:{hue?:number;sat?:number;lum?:number})=>({...neutralHsl(),[band]:{hue:v.hue??0,sat:v.sat??0,lum:v.lum??0}});

test('bandWeight partitions the hue circle: weights sum to 1 everywhere and peak at the centers',()=>{
 for(let h=0;h<360;h+=0.25){let sum=0;for(const b of HSL_BANDS)sum+=bandWeight(b,h);assert.ok(Math.abs(sum-1)<1e-9,`sum at ${h}: ${sum}`);}
 for(const b of HSL_BANDS)assert.ok(bandWeight(b,{red:0,orange:30,yellow:60,green:120,aqua:180,blue:240,purple:275,magenta:315}[b])>0.99);
 assert.ok(bandWeight('red',90)===0&&bandWeight('blue',0)===0,'far bands do not reach');
});
test('rgbToHsl/hslToRgb round-trip the primaries and gray',()=>{
 assert.deepEqual(rgbToHsl(255,0,0),[0,1,0.5]);
 assert.deepEqual(hslToRgb(0,1,0.5),[255,0,0]);
 assert.deepEqual(hslToRgb(120,1,0.5),[0,255,0]);
 assert.deepEqual(hslToRgb(240,1,0.5),[0,0,255]);
 const[h,s,l]=rgbToHsl(128,128,128);assert.equal(s,0);assert.ok(Math.abs(l-128/255)<0.01);
});
test('applyHsl: a saturation boost on the red band saturates reds, leaves greens and grays alone',()=>{
 const muted=[...hslToRgb(0,0.5,0.5)] as [number,number,number];
 const src=solid(...muted);const before=px(src);
 const out=applyHsl(src,hslWith('red',{sat:100}));
 assert.deepEqual(px(src),before,'input untouched');
 const[r,g,b]=px(out);
 assert.ok(r===255&&g===0&&b===0,`muted red -> full red, got ${[r,g,b]}`);
 const green=solid(...hslToRgb(120,0.5,0.5));
 assert.deepEqual(px(applyHsl(green,hslWith('red',{sat:100}))),px(green),'green untouched by the red band');
 const gray=solid(120,120,120);
 assert.deepEqual(px(applyHsl(gray,hslWith('red',{sat:100,hue:50,lum:50}))),px(gray),'achromatic pixels pass through unchanged');
});
test('applyHsl: a red hue shift of +100 moves red toward yellow by 60 degrees',()=>{
 const out=applyHsl(solid(255,0,0),hslWith('red',{hue:100}));
 const[h]=rgbToHsl(...px(out).slice(0,3) as [number,number,number]);
 assert.ok(Math.abs(h-60)<2,`red shifted to ~60 deg, got ${h}`);
});
test('applyHsl: neighboring bands blend at the boundary (both apply at half weight)',()=>{
 const mid=[...hslToRgb(15,1,0.5)] as [number,number,number]; // exactly between red and orange
 const out=applyHsl(solid(...mid),{...neutralHsl(),red:{hue:100,sat:0,lum:0},orange:{hue:100,sat:0,lum:0}});
 const[h]=rgbToHsl(...px(out).slice(0,3) as [number,number,number]);
 assert.ok(Math.abs(h-(15+60))<3,`both bands at 0.5 -> full +60 deg, got ${h}`);
});
test('settings: hsl sanitizes, validates and joins the signature; neutral mixer is identity',()=>{
 assert.ok(hslNeutral(neutralHsl())&&bandNeutral(neutralHsl().red));
 const s=sanitizePhotoSettings({...neutralPhotoSettings,hsl:hslWith('blue',{sat:100,lum:-100})});
 assert.deepEqual(s.hsl.blue,{hue:0,sat:100,lum:-100},'band survives sanitize (out-of-range throws, like dabs and curve points)');
 assert.notEqual(photoSignature(s),photoSignature(neutralPhotoSettings));
 assert.equal(hslSignature(s.hsl),hslSignature({...neutralHsl(),blue:{hue:0,sat:100,lum:-100}}));
 assert.throws(()=>sanitizePhotoSettings({...neutralPhotoSettings,hsl:{...neutralHsl(),teal:{hue:0,sat:0,lum:0}}} as never),/Invalid hsl/);
 assert.throws(()=>sanitizePhotoSettings({...neutralPhotoSettings,hsl:{...neutralHsl(),red:{hue:200,sat:0,lum:0}}}),/Invalid hsl/);
 assert.ok(validHsl(neutralHsl()));
});
