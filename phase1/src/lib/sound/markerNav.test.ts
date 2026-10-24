import {test} from 'node:test';import assert from 'node:assert/strict';
import {emptyArrangement,newClip,newTrack,markerJump} from './arrangement';

function fixture(){const s=emptyArrangement();const source={id:'src',name:'tone.wav',frames:480,sampleRate:48000,channels:2 as const};s.sources.push(source);s.tracks.push({...newTrack('t','T'),clips:[{...newClip('c',source,0),length:480}]});s.markers.push({id:'b',name:'b',frame:240},{id:'a',name:'a',frame:120});return s;}

test('marker jump: nearest marker per direction, session boundaries as fallback',()=>{
 const s=fixture();
 assert.equal(markerJump(s,0,1),120,'forward to the first marker');
 assert.equal(markerJump(s,120,1),240,'strictly after the current frame');
 assert.equal(markerJump(s,240,1),480,'past the last marker: session end');
 assert.equal(markerJump(s,480,-1),240);
 assert.equal(markerJump(s,240,-1),120);
 assert.equal(markerJump(s,120,-1),0,'before the first marker: session start');
 assert.equal(markerJump(s,0,-1),0);
 assert.throws(()=>markerJump(s,1.5,1),/Invalid frame/);
 const empty=emptyArrangement();
 assert.equal(markerJump(empty,100,1),0,'no markers and no clips: end is 0');
});
