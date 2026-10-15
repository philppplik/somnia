import {test} from 'node:test';import assert from 'node:assert/strict';
import {emptyArrangement,newClip,newTrack,restorePaste,validateArrangement,type ClipBoardEntry} from './arrangement';

const source={id:'src',name:'tone.wav',frames:9600,sampleRate:48000,channels:2 as const};
function entry():ClipBoardEntry{const clip={...newClip('c',source,480),length:2400,name:'Hook',gainDb:-3};return{clip,trackId:'t1',source:{...source}};}
function target(){const s=emptyArrangement();s.tracks.push(newTrack('t1','A'),newTrack('t2','B'));return s;}

test('cross-session paste restores the source reference and lands the clip with its settings',()=>{
 const s=target();restorePaste(s,entry(),960,'new-id');
 assert.deepEqual(s.sources,[source],'source restored once');
 const clip=s.tracks[0].clips[0];
 assert.deepEqual([clip.id,clip.start,clip.name,clip.gainDb],['new-id',960,'Hook',-3]);
 assert.doesNotThrow(()=>validateArrangement(s));
 restorePaste(s,entry(),1200,'new-id-2');
 assert.equal(s.sources.length,1,'existing source is not duplicated');
 assert.equal(s.tracks[0].clips.length,2);
});
test('paste: explicit target track, missing track rejects before any change',()=>{
 const s=target();restorePaste(s,entry(),0,'x','t2');
 assert.equal(s.tracks[1].clips.length,1);
 assert.equal(s.tracks[0].clips.length,0);
 const before=JSON.stringify(s);
 assert.throws(()=>restorePaste(s,entry(),0,'y','missing-track'),/Target track/);
 assert.equal(JSON.stringify(s),before,'rejection is atomic');
});
