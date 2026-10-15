import {test} from 'node:test';import assert from 'node:assert/strict';
import {buildSeriesOp,fillBlockProblem,fillDragOp,parseAutoFillCommand,parseFillCommand,parseSeriesCommand} from './fillOps';
test('parseFillCommand accepts only the four directions',()=>{
 for(const dir of ['down','right','up','left'])assert.deepEqual(parseFillCommand({dir}),{dir});
 for(const bad of [{},{dir:'sideways'},{dir:1},{dir:'down',x:1},null,[],'down'])assert.throws(()=>parseFillCommand(bad),JSON.stringify(bad));
});
test('fillBlockProblem: single row needs a row above, up/left need two, size is bounded',()=>{
 assert.equal(fillBlockProblem(3,0,3,2,'down'),null);
 assert.equal(fillBlockProblem(3,0,1,2,'down'),null);
 assert.equal(fillBlockProblem(0,0,1,2,'down'),'edge');
 assert.equal(fillBlockProblem(3,0,1,2,'up'),'edge');
 assert.equal(fillBlockProblem(0,1,2,1,'right'),null);
 assert.equal(fillBlockProblem(0,0,2,1,'right'),'edge');
 assert.equal(fillBlockProblem(0,0,2_000_000,1,'down'),'large');
 assert.equal(fillBlockProblem(0,0,0,1,'down'),'small');
 assert.equal(fillBlockProblem(0.5,0,2,1,'down'),'small');
});
test('fill handle commands and drags stay bounded',()=>{
 assert.deepEqual(parseAutoFillCommand({dir:'down',count:5}),{dir:'down',count:5});
 assert.deepEqual(parseAutoFillCommand({dir:'left',count:2,mode:'copy'}),{dir:'left',count:2,mode:'copy'});
 assert.deepEqual(parseAutoFillCommand({dir:'up',count:2,mode:'formats'}),{dir:'up',count:2,mode:'formats'});
 assert.deepEqual(parseAutoFillCommand({dir:'right',count:2,mode:'series'}),{dir:'right',count:2});
 for(const bad of [null,[],{},{dir:'sideways',count:1},{dir:'down',count:0},{dir:'down',count:1.5},{dir:'down',count:100001},{dir:'down',count:'2'},{dir:'down',count:1,mode:'x'},{dir:'down',count:1,x:1}])assert.throws(()=>parseAutoFillCommand(bad),JSON.stringify(bad));
 const r={r0:2,c0:1,r1:3,c1:2};
 assert.deepEqual(fillDragOp(r,{row:8,col:2},1000,100,'series'),{dir:'down',count:5});
 assert.deepEqual(fillDragOp(r,{row:3,col:6},1000,100,'copy'),{dir:'right',count:4,mode:'copy'});
 assert.deepEqual(fillDragOp(r,{row:6,col:5},1000,100,'series'),{dir:'down',count:3},'the longer pull wins');
 assert.deepEqual(fillDragOp(r,{row:0,col:2},1000,100,'values'),{dir:'up',count:2,mode:'values'});
 assert.deepEqual(fillDragOp(r,{row:3,col:0},1000,100,'series'),{dir:'left',count:1});
 assert.deepEqual(fillDragOp(r,{row:0,col:0},1000,100,'series'),{dir:'up',count:2},'a tie prefers up over left');
 assert.equal(fillDragOp(r,{row:3,col:2},1000,100,'series'),null);assert.equal(fillDragOp(r,{row:2,col:1},1000,100,'series'),null);
 assert.deepEqual(fillDragOp(r,{row:5000,col:2},10,100,'series'),{dir:'down',count:6},'clamped to the sheet');
 assert.equal(fillDragOp({r0:0,c0:0,r1:0,c1:0},{row:0,col:0},10,10,'series'),null);
 assert.equal(fillDragOp({r0:0,c0:0,r1:0,c1:0},{row:0,col:5},10,10,'series')?.dir,'right');
});
test('series dialog input is bounded',()=>{
 assert.deepEqual(buildSeriesOp(5,1,'linear',2,10),{axis:'down',kind:'linear',step:2,stop:10});
 assert.deepEqual(buildSeriesOp(1,6,'month',1,null),{axis:'right',kind:'date',step:1,unit:'month'});
 assert.deepEqual(buildSeriesOp(3,3,'growth',2,null),{axis:'down',kind:'growth',step:2});
 assert.equal(buildSeriesOp(1,1,'linear',1,null),'small');assert.equal(buildSeriesOp(2000,1000,'linear',1,null),'large');
 assert.equal(buildSeriesOp(5,1,'linear',0,null),'step');assert.equal(buildSeriesOp(5,1,'linear',NaN,null),'step');
 assert.equal(buildSeriesOp(5,1,'month',1.5,null),'whole');assert.equal(buildSeriesOp(5,1,'growth',-2,null),'growth');
 assert.equal(buildSeriesOp(5,1,'growth',0.5,9),'stop');assert.equal(buildSeriesOp(5,1,'day',1,9),'stop');
 assert.deepEqual(parseSeriesCommand({axis:'right',kind:'date',step:2,unit:'weekday'}),{axis:'right',kind:'date',step:2,unit:'weekday'});
 for(const bad of [null,[],{},{axis:'up',kind:'linear',step:1},{axis:'down',kind:'x',step:1},{axis:'down',kind:'linear',step:0},{axis:'down',kind:'linear',step:'1'},{axis:'down',kind:'linear',step:1,unit:'day'},{axis:'down',kind:'date',step:1},{axis:'down',kind:'date',step:1.5,unit:'month'},{axis:'down',kind:'date',step:1,unit:'day',stop:3},{axis:'down',kind:'growth',step:1,stop:3},{axis:'down',kind:'linear',step:1,z:1}])assert.throws(()=>parseSeriesCommand(bad),JSON.stringify(bad));
});
