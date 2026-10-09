import test from 'node:test';import assert from 'node:assert/strict';
import {buildLines,snapBox,snapPoint} from './snap';
const doc={x:0,y:0,w:200,h:100};
test('edge snaps to another object edge within the threshold',()=>{
 const lines=buildLines([{x:100,y:10,w:20,h:20}],doc,[]);
 const r=snapBox({x:57,y:50,w:40,h:10},lines,5);// right edge 97 -> 100
 assert.equal(r.dx,3);assert.equal(r.dy,0);assert.ok(r.lines.some(l=>l.axis==='x'&&l.pos===100&&l.kind==='object'));});
test('centre snaps to the document centre',()=>{
 const r=snapBox({x:80,y:10,w:40,h:10},buildLines([],doc,[]),5);// centre 100 -> doc centre 100
 assert.equal(r.dx,0);assert.ok(r.lines.some(l=>l.axis==='x'&&l.pos===100&&l.kind==='doc'));});
test('nothing snaps outside the threshold',()=>{
 const r=snapBox({x:30,y:30,w:10,h:10},buildLines([{x:100,y:70,w:5,h:5}],null,[]),4);
 assert.deepEqual([r.dx,r.dy,r.lines.length],[0,0,0]);});
test('guides snap on their axis and win by distance',()=>{
 const lines=buildLines([],null,[{axis:'y',pos:50}]);
 const r=snapBox({x:0,y:46,w:10,h:2},lines,5);// bottom 48 -> 50
 assert.equal(r.dy,2);assert.equal(r.lines[0].kind,'guide');});
test('grid snaps when no line is close; lines take priority',()=>{
 assert.equal(snapBox({x:19,y:0,w:4,h:4},[],3,10).dx,1);
 const r=snapBox({x:19,y:0,w:4,h:4},buildLines([{x:22.5,y:50,w:1,h:1}],null,[]),3,10);
 assert.equal(r.lines[0].kind,'object');});
test('axes can be disabled and points snap',()=>{
 const lines=buildLines([{x:10,y:10,w:10,h:10}],null,[]);
 assert.equal(snapBox({x:11,y:11,w:2,h:2},lines,3,0,{x:false,y:true}).dx,0);
 const p=snapPoint({x:19,y:3},lines,2,0,{x:true,y:false});assert.deepEqual([p.x,p.y],[20,3]);});
