import {test} from 'node:test';import assert from 'node:assert/strict';
import {isFillerOnly,parseSegments,segmentsToCutRanges,applySegmentRanges} from './segmentTranscript';
import {ArrangementHistory,arrangementEnd,emptyArrangement,newClip,newTrack} from './arrangement';

const SR=48000;
let n=0;const id=()=>`seg-${++n}`;
const seg=(fromMs:number,toMs:number,text:string,filler=false)=>({fromMs,toMs,fromFrame:Math.round(fromMs*48),toFrame:Math.round(toMs*48),text,fillerOnly:filler});

test('filler detection is conservative and language-aware',()=>{
 assert.equal(isFillerOnly('ähm','de'),true);
 assert.equal(isFillerOnly('Ähm.','de'),true);
 assert.equal(isFillerOnly('ähm äh hm','de'),true);
 assert.equal(isFillerOnly('ähm ja','de'),false,'any real word breaks the suggestion');
 assert.equal(isFillerOnly('um uh','en'),true);
 assert.equal(isFillerOnly('erm','en'),true);
 assert.equal(isFillerOnly('mhm','de'),false,'backchannel is not a filler');
 assert.equal(isFillerOnly('','de'),false);
 assert.equal(isFillerOnly('Hallo Welt','de'),false);
});

test('parseSegments validates the normalized helper output',()=>{
 const segs=parseSegments([{from_ms:0,to_ms:1240,text:' ähm '},{from_ms:1240,to_ms:2000,text:'Hallo'}],'de');
 assert.equal(segs.length,2);
 assert.equal(segs[0].fillerOnly,true);
 assert.equal(segs[1].fillerOnly,false);
 assert.equal(segs[0].toFrame,59520);
 assert.throws(()=>parseSegments(null),'non-array rejected');
 assert.throws(()=>parseSegments([]),'empty rejected');
 assert.throws(()=>parseSegments([{from_ms:-1,to_ms:5,text:'a'}]),'negative rejected');
 assert.throws(()=>parseSegments([{from_ms:9,to_ms:5,text:'a'}]),'to<from rejected');
 assert.throws(()=>parseSegments([{from_ms:0,to_ms:120001,text:'a'}]),'past 120 s rejected');
 assert.throws(()=>parseSegments([{from_ms:0,to_ms:5,text:'  '}]),'blank text rejected');
 assert.throws(()=>parseSegments([{from_ms:0,to_ms:5,text:'a\0b'}]),'NUL rejected');
 assert.throws(()=>parseSegments([{from_ms:0,to_ms:5,text:'x'.repeat(501)}]),'oversized text rejected');
});

test('segmentsToCutRanges sorts, merges overlaps and clamps to the session end',()=>{
 const segs=[seg(2000,3000,'b'),seg(1000,2200,'a'),seg(9000,9999,'c')];
 const ranges=segmentsToCutRanges(segs,[0,1,2],5*SR);
 assert.deepEqual(ranges,[{start:48000,end:144000}],'a and b overlap and merge; c clamps fully to the end and drops out');
 assert.deepEqual(segmentsToCutRanges(segs,[2],5*SR),[],'fully clamped range drops out');
 assert.throws(()=>segmentsToCutRanges(segs,[7],5*SR),'stale selection rejected');
});

test('applySegmentRanges cuts back to front as one undoable edit',()=>{
 const source={id:'src',name:'voice.wav',frames:10*SR,sampleRate:48000,channels:2 as const};
 const s=emptyArrangement();s.sources.push(source);const track=newTrack('t1','Voice');track.clips.push(newClip('c1',source,0));s.tracks.push(track);
 const ranges=[{start:1*SR,end:2*SR},{start:4*SR,end:5*SR}];
 const removed=applySegmentRanges(s,ranges,id);
 assert.equal(removed,2*SR);
 assert.equal(arrangementEnd(s),8*SR);
 assert.equal(s.tracks[0].clips.length,3);
 assert.throws(()=>applySegmentRanges(s,[{start:2,end:1}],id),'empty range rejected');
 assert.throws(()=>applySegmentRanges(s,[{start:1,end:3},{start:2,end:4}],id),'overlap rejected');
});

test('segment cut is exactly one undo step in history',()=>{
 const source={id:'src',name:'voice.wav',frames:6*SR,sampleRate:48000,channels:2 as const};
 const history=new ArrangementHistory(emptyArrangement());
 history.change(s=>{s.sources.push(source);const track=newTrack('t1','Voice');track.clips.push(newClip('c1',source,0));s.tracks.push(track);});
 const before=history.revision;
 history.change(s=>{applySegmentRanges(s,[{start:SR,end:2*SR},{start:3*SR,end:4*SR}],id);});
 assert.equal(history.revision,before+1,'one atomic edit');
 assert.equal(arrangementEnd(history.snapshot),4*SR);
 history.undo();
 assert.equal(arrangementEnd(history.snapshot),6*SR,'undo restores the full session');
 assert.equal(history.snapshot.tracks[0].clips.length,1);
});
