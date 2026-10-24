import {test} from 'node:test';import assert from 'node:assert/strict';
import {emptyArrangement,newClip,newTrack,validateArrangement,cutSessionRange,type Arrangement} from './arrangement';

let n=0;const id=()=>`gen-${++n}`;
const source={id:'src',name:'tone.wav',frames:96000,sampleRate:48000,channels:2 as const};
function base():Arrangement{const s=emptyArrangement();s.sources.push(source);
 s.tracks.push({...newTrack('t1','A'),clips:[
  {...newClip('before',source,0),length:1000},
  {...newClip('spanning',source,2000),length:6000,offset:100,fadeIn:200,fadeOut:300,gainCurve:[{at:3000,db:-6}]},
  {...newClip('after',source,9000),length:1000}]});
 s.markers.push({id:'m-in',name:'in',frame:4500},{id:'m-after',name:'after',frame:8000});
 s.loop={start:1000,end:3000};
 return s;}

test('cut range: boundary splits follow split rules, inside material goes, the tail shifts left',()=>{
 const s=base();cutSessionRange(s,4000,6000,id); // 2000 frames out of the spanning clip (local 2000..4000)
 const clips=[...s.tracks[0].clips].sort((a,b)=>a.start-b.start);
 assert.equal(clips.length,4);
 assert.deepEqual([clips[0].start,clips[0].length],[0,1000],'before untouched');
 const[left,right,after]=[clips[1],clips[2],clips[3]];
 assert.deepEqual([left.start,left.offset,left.length],[2000,100,2000],'left piece keeps its place');
 assert.deepEqual([right.start,right.offset,right.length],[4000,4100,2000],'right piece closes the gap, offset follows the source');
 assert.deepEqual([after.start,after.length],[7000,1000],'later clips shift by the cut');
 assert.equal(left.fadeIn,200);assert.equal(left.fadeOut,0,'cut edge clean');
 assert.equal(right.fadeIn,0,'cut edge clean');assert.equal(right.fadeOut,300);
 assert.deepEqual(left.gainCurve,[{at:2000,db:-6}],'curve boundary carries the flat-extrapolated level');
 assert.deepEqual(right.gainCurve,[{at:0,db:-6}]);
 assert.deepEqual(s.markers.map(m=>[m.id,m.frame]),[['m-after',6000]],'marker inside the cut removed, later marker shifts');
 assert.deepEqual(s.loop,{start:1000,end:3000},'loop before the cut untouched');
});

test('cut range: an intersecting loop is cleared and clips fully inside disappear',()=>{
 const s=base();s.loop={start:2500,end:7000};
 cutSessionRange(s,1000,3000,id); // cuts the head of 'spanning'; 'before' ends exactly at the cut start
 assert.deepEqual([...s.tracks[0].clips].sort((a,b)=>a.start-b.start).map(c=>[c.start,c.offset,c.length]),[[0,0,1000],[1000,1100,5000],[7000,0,1000]],'spanning starts at the cut, offset advanced');
 assert.equal(s.loop,null,'intersecting loop cleared');
 assert.deepEqual(s.markers.map(m=>m.frame),[2500,6000],'markers at and after the cut end shift left');
});

test('cut range: invalid ranges rejected, validated output',()=>{
 const s=base();
 for(const[a,b]of[[-1,100],[100,100],[200,100],[0,96001]]as const)assert.throws(()=>cutSessionRange(s,a,b,id),/Invalid cut range/);
 const ok=base();cutSessionRange(ok,0,10000,id);
 assert.deepEqual(ok.tracks[0].clips,[],'cutting everything leaves an empty track');
 assert.doesNotThrow(()=>validateArrangement(ok));
});
