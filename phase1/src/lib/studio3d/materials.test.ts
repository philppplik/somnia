import test from 'node:test';
import assert from 'node:assert/strict';
import {checkPbr,alphaState,alphaModeOf,inspectImage,MaterialError,MAX_TEXTURE_DIM,MAX_TEXTURE_FILE_BYTES,SLOT_CONFIG,TEXTURE_SLOTS} from './materials';
import {VIEW_PRESETS,viewDirection,RENDER_SIZES} from './viewPresets';
const png=(w:number,h:number)=>{const b=new Uint8Array(33);b.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a],0);b.set([0,0,0,13,0x49,0x48,0x44,0x52],8);new DataView(b.buffer).setUint32(16,w);new DataView(b.buffer).setUint32(20,h);return b;};
const jpeg=(w:number,h:number)=>{const b=new Uint8Array(30);b.set([0xff,0xd8,0xff,0xe0,0,4,0,0,0xff,0xc0,0,11,8],0);new DataView(b.buffer).setUint16(13,h);new DataView(b.buffer).setUint16(15,w);return b;};
const riff=(fourcc:string)=>{const b=new Uint8Array(40);[...'RIFF'].forEach((c,i)=>b[i]=c.charCodeAt(0));[...'WEBP'].forEach((c,i)=>b[8+i]=c.charCodeAt(0));[...fourcc].forEach((c,i)=>b[12+i]=c.charCodeAt(0));return b;};
test('PBR extras accept in-range values and refuse the rest',()=>{
 assert.deepEqual(checkPbr({emissive:'#ff8800',emissiveIntensity:3,opacity:0.5,alphaMode:'blend',alphaCutoff:0.4,doubleSided:true}).opacity,0.5);
 for(const bad of [{emissive:'red'},{emissiveIntensity:-1},{emissiveIntensity:21},{opacity:1.1},{opacity:NaN},{alphaCutoff:2},{alphaMode:'add'},{doubleSided:'yes'}])assert.throws(()=>checkPbr(bad as never),MaterialError,JSON.stringify(bad));
});
test('alpha mode maps to material fields and back',()=>{
 assert.deepEqual(alphaState('opaque',0.3,0.5),{transparent:false,opacity:1,alphaTest:0,depthWrite:true});
 assert.deepEqual(alphaState('blend',0.4,0.5),{transparent:true,opacity:0.4,alphaTest:0,depthWrite:false});
 assert.equal(alphaState('blend',1,0.5).depthWrite,true);
 const m=alphaState('mask',1,0.25);assert.equal(m.alphaTest,0.25);assert.equal(m.transparent,false);
 assert.ok(alphaState('mask',1,0).alphaTest>0,'a zero cutoff still cuts');
 assert.equal(alphaModeOf(false,0),'opaque');assert.equal(alphaModeOf(true,0),'blend');assert.equal(alphaModeOf(false,0.5),'mask');
});
test('image headers give type and size for PNG, JPEG and WebP',()=>{
 assert.deepEqual(inspectImage('a.png',png(640,480)),{mime:'image/png',width:640,height:480});
 assert.deepEqual(inspectImage('a.jpg',jpeg(800,600)),{mime:'image/jpeg',width:800,height:600});
 const x=riff('VP8X');x[24]=99;x[27]=49;assert.deepEqual(inspectImage('a.webp',x),{mime:'image/webp',width:100,height:50});
 const l=riff('VP8L');l[20]=0x2f;const bits=(255)|(127<<14);l[21]=bits&255;l[22]=(bits>>8)&255;l[23]=(bits>>16)&255;l[24]=(bits>>24)&255;assert.deepEqual(inspectImage('a.webp',l),{mime:'image/webp',width:256,height:128});
 const v=riff('VP8 ');v[23]=0x9d;v[24]=1;v[25]=0x2a;v[26]=32;v[28]=16;assert.deepEqual(inspectImage('a.webp',v),{mime:'image/webp',width:32,height:16});
});
test('images are refused by content, not by name, and by size limits',()=>{
 assert.throws(()=>inspectImage('evil.png',new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')),MaterialError);
 assert.throws(()=>inspectImage('a.png',new Uint8Array(10)),MaterialError);
 assert.throws(()=>inspectImage('a.png',png(MAX_TEXTURE_DIM+1,10)),/limit/);
 assert.throws(()=>inspectImage('a.png',png(7000,7000)),/limit/);
 assert.throws(()=>inspectImage('a.png',png(0,10)),MaterialError);
 assert.throws(()=>inspectImage('a.png',new Uint8Array(MAX_TEXTURE_FILE_BYTES+1)),MaterialError);
 assert.doesNotThrow(()=>inspectImage('a.png',png(MAX_TEXTURE_DIM,4096)));
});
test('a truncated JPEG does not loop or read past the end',()=>{
 const b=new Uint8Array([0xff,0xd8,0xff,0xe0,0xff,0xff,0,0,0,0,0,0,0,0]);assert.throws(()=>inspectImage('a.jpg',b),MaterialError);
});
test('every texture slot knows its property and colour space',()=>{
 assert.deepEqual(TEXTURE_SLOTS.map(s=>SLOT_CONFIG[s].prop),['map','normalMap','roughnessMap','metalnessMap','emissiveMap']);
 assert.equal(SLOT_CONFIG.normal.srgb,false);assert.equal(SLOT_CONFIG.color.srgb,true);assert.equal(SLOT_CONFIG.metal.srgb,false);
});
test('view presets are unit vectors with distinct directions, and render sizes are sane',()=>{
 const seen=new Set<string>();for(const p of VIEW_PRESETS){const d=viewDirection(p);assert.ok(Math.abs(Math.hypot(...d)-1)<1e-9,p);seen.add(d.map(n=>n.toFixed(3)).join());}
 assert.equal(seen.size,VIEW_PRESETS.length);assert.deepEqual(viewDirection('front'),[0,0,1]);assert.ok(viewDirection('top')[1]>0.999);assert.ok(viewDirection('bottom')[1]<-0.999);
 for(const r of RENDER_SIZES){assert.ok(r.width>0&&r.height>0&&r.width<=8192&&r.height<=8192);}
});
