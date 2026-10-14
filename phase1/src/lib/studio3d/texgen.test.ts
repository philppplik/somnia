import test from 'node:test';
import assert from 'node:assert/strict';
import {generateTexture} from './texgen';

const px=(img:{data:Uint8Array},size:number,x:number,y:number)=>{const i=(y*size+x)*4;return[img.data[i],img.data[i+1],img.data[i+2]];};

test('checker alternates per cell',()=>{
 const img=generateTexture({kind:'checker',size:256,scale:4});
 assert.deepEqual(px(img,256,10,10),[240,240,240],'cell (0,0) is color A');
 assert.deepEqual(px(img,256,100,10),[24,24,28],'cell (1,0) is color B');
 assert.deepEqual(px(img,256,100,100),[240,240,240],'cell (1,1) is color A again');
});

test('grid draws lines on cell borders and stripes alternate columns',()=>{
 const g=generateTexture({kind:'grid',size:256,scale:4});
 assert.deepEqual(px(g,256,128,160),[24,24,28],'on a vertical border line');
 assert.deepEqual(px(g,256,160,160),[240,240,240],'inside a cell');
 const st=generateTexture({kind:'stripes',size:256,scale:4});
 assert.deepEqual(px(st,256,10,200),[240,240,240],'first column is A');
 assert.deepEqual(px(st,256,80,200),[24,24,28],'second column is B at any height');
});

test('noise is deterministic per seed and uses the color range',()=>{
 const a=generateTexture({kind:'noise',size:128,scale:8,seed:7});
 const b=generateTexture({kind:'noise',size:128,scale:8,seed:7});
 const c=generateTexture({kind:'noise',size:128,scale:8,seed:8});
 assert.deepEqual([...a.data],[...b.data],'same seed, same image');
 assert.notDeepEqual([...a.data],[...c.data],'different seed, different image');
 let lo=255,hi=0;
 for(let i=0;i<a.data.length;i+=4){lo=Math.min(lo,a.data[i]);hi=Math.max(hi,a.data[i]);}
 assert.ok(hi-lo>100,`noise covers a real tonal range (${lo}..${hi})`);
 assert.ok(a.data.every((v,i)=>i%4!==3||v===255),'alpha is opaque');
});

test('custom colors, size and validation',()=>{
 const img=generateTexture({kind:'checker',size:16,scale:2,colorA:'#ff0000',colorB:'#00ff00'});
 assert.deepEqual(px(img,16,2,2),[255,0,0]);
 assert.deepEqual(px(img,16,10,2),[0,255,0]);
 assert.equal(img.width,16);
 assert.equal(img.data.length,16*16*4);
 assert.throws(()=>generateTexture({kind:'checker',size:8}),/16 and 1024/);
 assert.throws(()=>generateTexture({kind:'checker',size:2048}),/16 and 1024/);
 assert.throws(()=>generateTexture({kind:'checker',scale:0}),/scale/);
 assert.throws(()=>generateTexture({kind:'checker',colorA:'red'}),/#rrggbb/);
 assert.throws(()=>generateTexture({kind:'noise',seed:0}),/seed/);
});
