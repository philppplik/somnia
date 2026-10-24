import test from 'node:test';
import assert from 'node:assert/strict';
import {curveLut,applyCurves,sanitizeCurvePoints,validCurves,curvesNeutral,curvesSignature,emptyCurves,MAX_CURVE_POINTS} from './curves';
import {sanitizePhotoSettings,neutralPhotoSettings,photoSignature} from './studioSettings';

const gray=(v:number,w=2,h=2)=>{const b=new Uint8Array(w*h*4);for(let o=0;o<b.length;o+=4){b[o]=v;b[o+1]=v;b[o+2]=v;b[o+3]=255;}return{bytes:b.buffer as ArrayBuffer,width:w,height:h};};
const px=(f:{bytes:ArrayBuffer},o=0)=>[...new Uint8Array(f.bytes).slice(o,o+4)];

test('curveLut: empty is identity, endpoints are pinned, a raised mid point lifts the middle and stays monotone',()=>{
 const id=curveLut([]);
 for(let v=0;v<256;v++)assert.equal(id[v],v);
 const lut=curveLut([{x:0.5,y:0.72}]);
 assert.equal(lut[0],0);assert.equal(lut[255],255);
 assert.ok(lut[128]>170&&lut[128]<200,`mid ~184, got ${lut[128]}`);
 for(let v=1;v<256;v++)assert.ok(lut[v]>=lut[v-1],`monotone at ${v}`);
});
test('curveLut: an S curve stays monotone (no overshoot between points)',()=>{
 const lut=curveLut(sanitizeCurvePoints([{x:0.25,y:0.12},{x:0.75,y:0.9}]));
 for(let v=1;v<256;v++)assert.ok(lut[v]>=lut[v-1],`monotone at ${v}`);
 assert.ok(lut[64]<64,'shadows pulled down');
 assert.ok(lut[192]>192,'highlights pushed up');
});
test('sanitizeCurvePoints sorts, collapses near-duplicate x (later wins), clamps and caps',()=>{
 const pts=sanitizeCurvePoints([{x:0.8,y:0.2},{x:0.2,y:0.6},{x:0.20005,y:0.9}]);
 assert.deepEqual(pts,[{x:0.20005,y:0.9},{x:0.8,y:0.2}]);
 const many=sanitizeCurvePoints(Array.from({length:MAX_CURVE_POINTS+10},(_,i)=>({x:(i+1)/(MAX_CURVE_POINTS+12),y:0.5})));
 assert.equal(many.length,MAX_CURVE_POINTS);
 assert.deepEqual(sanitizeCurvePoints([{x:-1,y:2},{x:2,y:-1}]),[]); // off-range x filtered, y clamped before that
});
test('applyCurves: master lifts all channels, channel curves compose after it, input is not mutated',()=>{
 const src=gray(128);const before=px(src);
 const out=applyCurves(src,{master:[{x:0.5,y:0.72}],red:[{x:0.5,y:0.3}],green:[],blue:[]});
 assert.deepEqual(px(src),before,'input untouched');
 const[r,g,b,a]=px(out);
 assert.ok(g>170&&g<200,`green via master, got ${g}`);
 assert.ok(b>170&&b<200,'blue via master');
 assert.ok(r<160&&r<g-25,`red pulled down after master, got ${r} vs ${g}`);
 assert.equal(a,255);
});
test('applyCurves: neutral curves return the same frame object',()=>{
 const src=gray(128);
 assert.equal(applyCurves(src,emptyCurves()),src);
 assert.ok(curvesNeutral(emptyCurves()));
 assert.ok(!curvesNeutral({...emptyCurves(),master:[{x:0.5,y:0.5}]}));
});
test('settings: curves sanitize, validate, and join the photo signature',()=>{
 const s=sanitizePhotoSettings({...neutralPhotoSettings,curves:{master:[{x:0.7,y:0.4},{x:0.3,y:0.6}],red:[],green:[],blue:[]}});
 assert.deepEqual(s.curves.master,[{x:0.3,y:0.6},{x:0.7,y:0.4}],'sorted on sanitize');
 assert.notEqual(photoSignature(s),photoSignature(neutralPhotoSettings));
 assert.throws(()=>sanitizePhotoSettings({...neutralPhotoSettings,curves:{master:[{x:1.5,y:0.5}],red:[],green:[],blue:[]}}),/Invalid curves/);
 assert.throws(()=>sanitizePhotoSettings({...neutralPhotoSettings,curves:{master:[{x:0.5,y:0.5}],red:[],green:[],blue:[],extra:[]}} as never),/Invalid curves/);
 assert.ok(validCurves(emptyCurves()));
 assert.equal(curvesSignature(s.curves),curvesSignature({master:[{x:0.3,y:0.6},{x:0.7,y:0.4}],red:[],green:[],blue:[]}));
});
