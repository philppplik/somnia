import test from 'node:test';import assert from 'node:assert/strict';
import {smoothWeights,rigidWeights,segmentDist2,weightColor,SkinError,MAX_SKIN_VERTICES,MAX_INFLUENCES} from './skinning';
const chain=[{head:[0,0,0] as const,tail:[0,1,0] as const},{head:[0,1,0] as const,tail:[0,2,0] as const}];
test('segmentDist2 measures to the segment, not the line',()=>{
 assert.equal(segmentDist2(1,0.5,0,chain[0]),1);
 assert.equal(segmentDist2(0,3,0,chain[0]),4); // beyond the tail: clamped to the end point
 assert.equal(segmentDist2(0,0,0,{head:[0,0,0],tail:[0,0,0]}),0); // degenerate segment is a point
});
test('smooth weights are normalised and favour the nearest bone',()=>{
 const {indices,weights}=smoothWeights([0.1,0.2,0, 0.1,1.8,0],chain);
 for(let v=0;v<2;v++){let sum=0;for(let k=0;k<4;k++)sum+=weights[v*4+k];assert.ok(Math.abs(sum-1)<1e-5,'row sums to 1');}
 assert.equal(indices[0],0);assert.ok(weights[0]>0.9,'lower vertex belongs to the lower bone');
 assert.equal(indices[4],1);assert.ok(weights[4]>0.9,'upper vertex belongs to the upper bone');
 // A vertex exactly on the shared joint ties; the lower bone index is listed first, and both share the weight.
 const mid=smoothWeights([0,1,0],chain);assert.deepEqual(Array.from(mid.indices),[0,1,0,0]);assert.ok(Math.abs(mid.weights[0]-mid.weights[1])<1e-5);
});
test('smooth weights keep at most four influences and ties go to the lower bone index',()=>{
 const ring=Array.from({length:8},(_,i)=>({head:[Math.cos(i)*2,Math.sin(i)*2,0] as const,tail:[Math.cos(i)*2,Math.sin(i)*2,0] as const}));
 const {indices,weights}=smoothWeights([0,0,0],ring);
 assert.equal(indices.length,MAX_INFLUENCES,'one vertex takes exactly four slots');
 let sum=0;for(let k=0;k<MAX_INFLUENCES;k++)sum+=weights[k];assert.ok(Math.abs(sum-1)<1e-5);
 // Exactly equidistant joints: the lowest bone indices win, deterministically.
 const even=[{head:[2,0,0] as const,tail:[2,0,0] as const},{head:[0,2,0] as const,tail:[0,2,0] as const},{head:[-2,0,0] as const,tail:[-2,0,0] as const},{head:[0,-2,0] as const,tail:[0,-2,0] as const},{head:[3,0,0] as const,tail:[3,0,0] as const}];
 const tied=smoothWeights([0,0,0],even);
 assert.deepEqual(Array.from(tied.indices),[0,1,2,3]);
 assert.deepEqual(smoothWeights([0,0,0],even).indices,tied.indices);
});
test('rigid weights assign exactly one bone per vertex',()=>{
 const {indices,weights}=rigidWeights([0.1,0.2,0, 0.1,1.8,0],chain);
 assert.deepEqual(Array.from(indices),[0,0,0,0,1,0,0,0]);
 assert.deepEqual(Array.from(weights),[1,0,0,0,1,0,0,0]);
});
test('the bounds refuse empty or oversized work with readable errors',()=>{
 assert.throws(()=>smoothWeights([],chain),/no vertices/);
 assert.throws(()=>smoothWeights([0,0,0],[]),/no bones/);
 assert.throws(()=>smoothWeights(new Float32Array(MAX_SKIN_VERTICES*3+3),chain),/at most/);
 assert.throws(()=>smoothWeights(new Float32Array(3*2000),Array.from({length:5000},(_,i)=>({head:[i,0,0],tail:[i,1,0]}))),/too heavy|too many/);
});
test('the preview heat colour runs cold to hot and clamps',()=>{
 assert.deepEqual(weightColor(0),[0.15,0.25,1]);
 assert.deepEqual(weightColor(1),[1,0.15,0.1]);
 assert.deepEqual(weightColor(2),[1,0.15,0.1]);
 const mid=weightColor(0.5);assert.ok(mid[1]>0.8&&mid[0]<0.2,'mid is greenish');
});
