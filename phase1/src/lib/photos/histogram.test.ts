import test from 'node:test';
import assert from 'node:assert/strict';
import {computeHistogram,histogramColumns,histogramPath,lumaOf,toneZones} from './histogram';
const px=(...p:number[][])=>new Uint8Array(p.flatMap(([r,g,b,a=255])=>[r,g,b,a]));
test('counts per channel and luma, ignores transparent pixels',()=>{
 const h=computeHistogram(px([0,0,0],[255,255,255],[10,20,30],[99,99,99,0]));
 assert.equal(h.count,3);assert.equal(h.r[0],1);assert.equal(h.r[255],1);assert.equal(h.r[10],1);assert.equal(h.g[20],1);assert.equal(h.b[30],1);
 assert.equal(h.luma.reduce((a,b)=>a+b,0),3);
});
test('clipping shares and brightness figures',()=>{
 const h=computeHistogram(px([0,0,0],[0,0,0],[255,255,255],[128,128,128]));
 assert.equal(h.clipShadows,0.5);assert.equal(h.clipHighlights,0.25);
 assert.equal(h.meanLuma,(0+0+255+128)/4);assert.equal(h.medianLuma,0);
 assert.equal(h.clipChannels.r,0.75);
});
test('luma follows Rec. 709 weights and stays inside 0..255',()=>{
 assert.equal(lumaOf(255,255,255),255);assert.equal(lumaOf(0,0,0),0);assert.equal(lumaOf(255,0,0),54);assert.equal(lumaOf(0,255,0),182);assert.equal(lumaOf(0,0,255),18);
});
test('empty and tiny input never throw',()=>{
 assert.equal(computeHistogram(new Uint8Array(0)).count,0);assert.equal(computeHistogram(new Uint8Array(3)).count,0);
 assert.equal(computeHistogram(px([1,1,1,0])).meanLuma,0);
});
test('large frames are sampled with a stride and still add up',()=>{
 const n=100_000,data=new Uint8Array(n*4).fill(200);
 const h=computeHistogram(data,10_000);
 assert.ok(h.count<=10_000&&h.count>=5_000,`sampled ${h.count}`);assert.equal(h.luma[200],h.count);
});
test('accepts an ArrayBuffer and a clamped array view',()=>{
 const bytes=px([5,5,5]);assert.equal(computeHistogram(bytes.buffer as ArrayBuffer).count,1);
 assert.equal(computeHistogram(new Uint8ClampedArray(bytes.buffer)).count,1);
});
test('columns are scaled to the 99.5th percentile and capped at 1',()=>{
 const bins=new Uint32Array(256).fill(10);bins[0]=100000;
 const cols=histogramColumns(bins,64);
 assert.equal(cols.length,64);assert.ok(cols.every(v=>v>=0&&v<=1));assert.equal(cols[0],1);
 assert.equal(histogramColumns(new Uint32Array(256),8).every(v=>v===0),true);
});
test('path is a closed SVG area inside the box',()=>{
 const bins=new Uint32Array(256);bins[128]=5;
 const d=histogramPath(bins,256,64,32);
 assert.match(d,/^M0 64 L/);assert.match(d,/ Z$/);
 const ys=[...d.matchAll(/L[\d.]+ ([\d.]+)/g)].map(m=>Number(m[1]));assert.ok(ys.every(y=>y>=0&&y<=64));
});
test('tone zones sum to one',()=>{
 const h=computeHistogram(px([0,0,0],[80,80,80],[128,128,128],[180,180,180],[255,255,255]));
 const z=toneZones(h);assert.ok(Math.abs(Object.values(z).reduce((a,b)=>a+b,0)-1)<1e-9);assert.equal(z.blacks,0.2);assert.equal(z.whites,0.2);
 assert.equal(toneZones(computeHistogram(new Uint8Array(0))).mids,0);
});
