import test from 'node:test';
import assert from 'node:assert/strict';
import {decodePeaks,decodeThumbs,type OpenSource} from './filmstrip-decode';

/** Minimal OpenSource stub: the guards under test only read track/input/sinks. */
const stub=(over:Partial<OpenSource>):OpenSource=>({input:null as never,sinks:new Map(),track:null,info:{duration:10,width:0,height:0},...over});

test('decodeThumbs: an audio-only source yields null thumbnails instead of throwing',async()=>{
 const out=await decodeThumbs(stub({track:null}),[0,1,2],160,90);
 assert.deepEqual(out,[null,null,null]);
});

test('decodePeaks: a source without an audio track reports silence (null)',async()=>{
 const input={getAudioTracks:async()=>[]} as never;
 const out=await decodePeaks(stub({input}),100);
 assert.equal(out,null);
});

test('decodePeaks: zero buckets or zero duration report silence',async()=>{
 const input={getAudioTracks:async()=>[{}]} as never;
 assert.equal(await decodePeaks(stub({input}),0),null);
 assert.equal(await decodePeaks(stub({input,info:{duration:0,width:0,height:0}}),100),null);
});
