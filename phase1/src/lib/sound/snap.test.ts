import {test} from 'node:test';import assert from 'node:assert/strict';
import {emptyArrangement,newClip,newTrack} from './arrangement';
import {snapFrame,snapPoints} from './snap';

function fixture(){const s=emptyArrangement();const source={id:'src',name:'tone.wav',frames:48000,sampleRate:48000,channels:2 as const};s.sources.push(source);const a={...newTrack('a','A'),clips:[newClip('ca',source,4800)]},b={...newTrack('b','B'),clips:[{...newClip('cb',source,9600),length:4800}]};s.tracks.push(a,b);s.markers.push({id:'m',name:'Mark',frame:20000});return s;}

test('snap: points cover session bounds, other clips edges and markers, never the dragged clip',()=>{
 const points=snapPoints(fixture(),'ca').sort((a,b)=>a-b);
 assert.deepEqual(points,[0,9600,14400,20000,52800]);
 assert.ok(!snapPoints(fixture(),'cb').includes(14400),'dragged clip end excluded');
 assert.ok(snapPoints(fixture(),'ca').includes(9600),'other clip start included');
});

test('snap: a magnetic point within threshold beats the grid; otherwise the grid wins',()=>{
 const points=snapPoints(fixture(),'ca');
 assert.equal(snapFrame(9650,points,4800,200),9600,'clip start attracts within threshold');
 assert.equal(snapFrame(9950,points,4800,200),9600,'grid value 9600 also wins honestly');
 assert.equal(snapFrame(10100,points,4800,200),9600,'grid rounds to the nearest 0.1 s');
 assert.equal(snapFrame(20050,points,4800,200),20000,'marker attracts');
 assert.equal(snapFrame(17050,points,4800,200),19200,'no point near: plain grid rounds to the nearest 0.1 s');
 assert.equal(snapFrame(9650,points,4800,20),9600,'tight threshold still catches near points');
 assert.equal(snapFrame(9750,points,4800,100),9600,'within threshold');
 assert.equal(snapFrame(9751,points,1,100),9751,'grid 1 (snap off) keeps the raw frame');
 assert.equal(snapFrame(-50,points,4800,200),0,'never negative');
});
