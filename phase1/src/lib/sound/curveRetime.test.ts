import {test} from 'node:test';import assert from 'node:assert/strict';
import {retimeCurvePoint} from './arrangement';

test('retimeCurvePoint moves a point, clamps to the span and re-sorts',()=>{
 const pts=[{at:100,db:0},{at:200,db:-6},{at:300,db:-12}];
 assert.deepEqual(retimeCurvePoint(pts,2,150,480),[{at:100,db:0},{at:150,db:-12},{at:200,db:-6}],'moves and re-sorts');
 assert.deepEqual(retimeCurvePoint(pts,0,-50,480).map(p=>p.at),[0,200,300],'clamps to 0');
 assert.deepEqual(retimeCurvePoint(pts,2,9999,480).map(p=>p.at),[100,200,480],'clamps to the span');
 assert.deepEqual(retimeCurvePoint(pts,0,100.6,480).map(p=>p.at),[101,200,300],'rounds to frames');
});

test('retimeCurvePoint refuses duplicates and bad indices',()=>{
 const pts=[{at:100,pan:0},{at:200,pan:0.5}];
 assert.throws(()=>retimeCurvePoint(pts,0,200,480),/already exists/);
 assert.throws(()=>retimeCurvePoint(pts,5,100,480));
});
