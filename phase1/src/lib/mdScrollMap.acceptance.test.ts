import test from 'node:test';
import assert from 'node:assert/strict';
import {lineToPreviewTop,previewTopToLine,atBottom,type MapBlock} from './mdScrollMap';

const blocks:MapBlock[]=[
 {start:2,end:3,top:20,height:45},
 {start:5,end:15,top:90,height:480},
 {start:5,end:7,top:90,height:60},
 {start:9,end:12,top:230,height:180},
 {start:17,end:21,top:600,height:40},
];

test('scroll mapping is independent of token / DOM traversal order',()=>{
 for(const reordered of [blocks,[...blocks].reverse(),[blocks[3],blocks[0],blocks[4],blocks[2],blocks[1]]]){
  for(const [line,top] of [[2.5,42.5],[5.5,105],[10.5,320],[19,620]]){
   assert.equal(lineToPreviewTop(reordered,line),top);
   assert.equal(previewTopToLine(reordered,top),line);
  }
 }
});
test('equal-start nested ranges choose the innermost source and preview block',()=>{
 assert.equal(lineToPreviewTop(blocks,6),120);
 assert.equal(previewTopToLine(blocks,120),6);
});
test('half-open block ends do not own the following block',()=>{
 const adjacent:MapBlock[]=[{start:0,end:2,top:0,height:80},{start:2,end:5,top:80,height:300}];
 assert.equal(lineToPreviewTop(adjacent,2),80);
 assert.equal(lineToPreviewTop(adjacent,3),180);
 assert.equal(previewTopToLine(adjacent,80),2);
 assert.equal(previewTopToLine(adjacent,180),3);
});
test('leading whitespace, inter-block gaps and trailing whitespace clamp to mapped anchors',()=>{
 assert.equal(lineToPreviewTop(blocks,0),20);
 assert.equal(lineToPreviewTop(blocks,4),65);
 assert.equal(lineToPreviewTop(blocks,16),570);
 assert.equal(lineToPreviewTop(blocks,1000),640);
 assert.equal(previewTopToLine(blocks,-100),2);
 assert.equal(previewTopToLine(blocks,70),3);
 assert.equal(previewTopToLine(blocks,590),15);
 assert.equal(previewTopToLine(blocks,10000),21);
});
test('recomputed geometry retains the source anchor rather than document percentage',()=>{
 const resized=blocks.map(b=>({...b,top:b.top*2+30,height:b.height*3}));
 assert.equal(lineToPreviewTop(resized,10.5),760);
 assert.equal(previewTopToLine(resized,760),10.5);
 assert.equal(lineToPreviewTop(blocks,10.5),320);
});
test('zero-height geometry and empty documents stay finite',()=>{
 const hidden=[{start:0,end:2,top:0,height:0}];
 assert.equal(lineToPreviewTop(hidden,1),0);
 assert.ok(Number.isFinite(previewTopToLine(hidden,0.5)));
 for(const value of [-100,0,10000]){
  assert.equal(lineToPreviewTop([],value),0);
  assert.equal(previewTopToLine([],value),0);
 }
});
test('bottom detection honors its exact two-pixel tolerance and non-scrollable panes',()=>{
 assert.equal(atBottom(797.99,200,1000),false);
 assert.equal(atBottom(798,200,1000),true);
 assert.equal(atBottom(800,200,1000),true);
 assert.equal(atBottom(0,200,199),false);
 assert.equal(atBottom(0,200,200),false);
});
