import {test} from 'node:test';import assert from 'node:assert/strict';
import {lineToPreviewTop,previewTopToLine,atBottom,type MapBlock} from './mdScrollMap';
// h1 line 0, paragraph lines 2-3, list lines 5-8 with nested item 6-7, code 10-14
const B:MapBlock[]=[{start:0,end:1,top:0,height:40},{start:2,end:4,top:60,height:60},{start:5,end:8,top:140,height:90},{start:6,end:7,top:170,height:30},{start:10,end:14,top:250,height:200}];
test('source line maps to a fractional position in its block',()=>{assert.equal(lineToPreviewTop(B,0),0);assert.equal(lineToPreviewTop(B,3),90);assert.equal(lineToPreviewTop(B,12),250+100);});
test('nested blocks win over their parent',()=>{assert.equal(lineToPreviewTop(B,6.5),185);assert.equal(lineToPreviewTop(B,5),140);});
test('blank lines map to the end of the previous block, an empty document to the start',()=>{assert.equal(lineToPreviewTop(B,1),40);assert.equal(lineToPreviewTop(B,9),230);assert.equal(lineToPreviewTop([],5),0);});
test('preview position maps back to a source line',()=>{assert.equal(previewTopToLine(B,0),0);assert.equal(previewTopToLine(B,90),3);assert.equal(previewTopToLine(B,185),6.5);assert.equal(previewTopToLine(B,350),12);});
test('round trip stays stable',()=>{for(const l of [0,2.5,5.2,6.4,11,13.9]){const back=previewTopToLine(B,lineToPreviewTop(B,l));assert.ok(Math.abs(back-l)<1e-9,`${l} -> ${back}`);}});
test('gaps between blocks resolve to the previous block end',()=>{assert.equal(previewTopToLine(B,45),1);});
test('bottom detection',()=>{assert.equal(atBottom(800,200,1000),true);assert.equal(atBottom(700,200,1000),false);assert.equal(atBottom(0,200,200),false);});
