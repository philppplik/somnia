import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyBrushStrokes,brushTotalDabs,clampStroke,validStroke,MAX_BRUSH_TOTAL_DABS} from './brushStrokes';
function grayFrame(w:number,h:number,v:number){const b=new Uint8Array(w*h*4);for(let i=0;i<w*h;i++){b[i*4]=v;b[i*4+1]=v;b[i*4+2]=v;b[i*4+3]=255;}return{bytes:b.buffer as ArrayBuffer,width:w,height:h};}
test('empty and all-neutral strokes are a no-op returning the same frame',()=>{
 const f=grayFrame(8,8,100);
 assert.equal(applyBrushStrokes(f,[]),f);
 assert.equal(applyBrushStrokes(f,[{dabs:[{x:0.5,y:0.5,r:0.3}],ev:0,temp:0,sat:0}]),f);
 assert.equal(applyBrushStrokes(f,[{dabs:[],ev:1,temp:50,sat:50}]),f);
});
test('ev brightens only inside the mask; temp shifts r up and b down; sat pulls toward luma',()=>{
 const f=grayFrame(20,20,100);
 const out=applyBrushStrokes(f,[{dabs:[{x:0.25,y:0.5,r:0.25}],ev:1,temp:20,sat:0}]);
 const px=new Uint8Array(out.bytes);
 const inside=(10*20+5)*4,outside=(2*20+18)*4;
 assert.ok(px[inside]>140,`inside brightened: ${px[inside]}`);
 assert.ok(px[inside]>px[inside+1]&&px[inside+2]<px[inside+1],`warm shift: ${px[inside]},${px[inside+1]},${px[inside+2]}`);
 assert.equal(px[outside],100); // untouched outside
 const orig=new Uint8Array(f.bytes);assert.equal(orig[inside],100); // input not mutated
 const sat=applyBrushStrokes(grayFrame(20,20,0),[{dabs:[{x:0.5,y:0.5,r:0.4}],ev:0,temp:0,sat:-100}]);
 const sp=new Uint8Array(sat.bytes);assert.deepEqual([sp[0],sp[1],sp[2]],[0,0,0]);
});
test('strokes apply in order and clamping bounds values and dabs',()=>{
 const f=grayFrame(10,10,100);
 const out=applyBrushStrokes(f,[{dabs:[{x:0.5,y:0.5,r:0.5}],ev:1,temp:0,sat:0},{dabs:[{x:0.5,y:0.5,r:0.5}],ev:-1,temp:0,sat:0}]);
 const px=new Uint8Array(out.bytes);assert.ok(Math.abs(px[0]-100)<=1,'cancel out');
 const s=clampStroke({dabs:Array.from({length:MAX_BRUSH_TOTAL_DABS+5},()=>({x:0.5,y:0.5,r:9})),ev:9,temp:-999,sat:120});
 assert.equal(s.dabs.length,MAX_BRUSH_TOTAL_DABS);
 assert.equal(s.ev,1);assert.equal(s.temp,-100);assert.equal(s.sat,100);
 assert.ok(s.dabs.every(d=>d.r<=0.5));
});
test('validStroke and brushTotalDabs guard the persisted shape',()=>{
 assert.equal(validStroke(null),false);
 assert.equal(validStroke({dabs:[],ev:0,temp:0,sat:0}),false); // empty chain is not a stroke
 assert.equal(validStroke({dabs:[{x:0.5,y:0.5,r:0.1}],ev:0.5,temp:0,sat:0}),true);
 assert.equal(validStroke({dabs:[{x:0.5,y:0.5,r:0.1}],ev:Number.NaN,temp:0,sat:0}),false);
 assert.equal(brushTotalDabs([{dabs:[{x:0,y:0,r:0.1}],ev:0,temp:0,sat:0},{dabs:[{x:0,y:0,r:0.1},{x:1,y:1,r:0.1}],ev:0,temp:0,sat:0}]),3);
});
