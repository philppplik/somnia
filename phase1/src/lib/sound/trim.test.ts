import {test} from 'node:test';import assert from 'node:assert/strict';
import {trimStartPatch,trimEndPatch,type ArrangeClip} from './arrangement';

const clip=():ArrangeClip=>({id:'c1',sourceId:'s1',start:0,offset:4800,length:9600,gainDb:0,fadeIn:600,fadeOut:900,gainCurve:[{at:2400,db:-6}],muted:false,pan:0,panCurve:[],fadeShape:'linear',name:'',rate:1});

test('trim start: cut shifts start, offset and length; cut edge is clean like split',()=>{
 const p=trimStartPatch(clip(),1200);
 assert.deepEqual({start:p.start,offset:p.offset,length:p.length},{start:1200,offset:6000,length:8400});
 assert.equal(p.fadeIn,0,'the cut edge starts clean');
 assert.equal(p.fadeOut,900,'outer fade-out survives');
 assert.equal(trimStartPatch({...clip(),fadeOut:9900},1200).fadeOut,8400,'a fade-out beyond the new length clamps');
});
test('trim start: gain curve re-bases with the cut level at 0 (flat before the first point)',()=>{
 assert.deepEqual(trimStartPatch(clip(),1200).gainCurve,[{at:0,db:-6},{at:1200,db:-6}]);
 assert.deepEqual(trimStartPatch({...clip(),gainCurve:[]},1200).gainCurve,[],'a clip without a curve stays without one');
});
test('trim end: length shortens, cut edge ends clean, curve ends on the interpolated level',()=>{
 const p=trimEndPatch(clip(),8400);
 assert.equal(p.length,8400);
 assert.equal(p.fadeIn,600,'fade-in survives');
 assert.equal(p.fadeOut,0,'the cut edge ends clean');
 assert.deepEqual(p.gainCurve,[{at:2400,db:-6},{at:8400,db:-6}],'the level stays flat after the last point');
 assert.equal(trimEndPatch({...clip(),fadeIn:9900},3600).fadeIn,3600,'a fade-in beyond the new length clamps');
 assert.deepEqual(trimEndPatch({...clip(),gainCurve:[]},3600).gainCurve,[]);
});
test('trim: points outside or at the clip edges are rejected',()=>{
 for(const f of [0,9600,-1,9601,1200.5]){
  assert.throws(()=>trimStartPatch(clip(),f),/inside the clip/);
  assert.throws(()=>trimEndPatch(clip(),f),/inside the clip/);
 }
});
