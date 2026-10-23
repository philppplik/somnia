import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pickTakeMime,takeFileName,TAKE_MAX_SECONDS,TAKE_MIME_CANDIDATES} from './recording';
import {ARRANGE_LIMITS} from './arrangement';

test('pickTakeMime prefers opus webm, then plain webm, then mp4, then aac',()=>{
 assert.equal(pickTakeMime(()=>true),'audio/webm;codecs=opus');
 assert.equal(pickTakeMime(m=>m==='audio/webm'),'audio/webm');
 assert.equal(pickTakeMime(m=>m==='audio/mp4'),'audio/mp4');
 assert.equal(pickTakeMime(m=>m==='audio/aac'),'audio/aac');
});

test('pickTakeMime returns empty string when nothing is supported (recorder default)',()=>{
 assert.equal(pickTakeMime(()=>false),'');
});

test('takeFileName numbers free take names case-insensitively',()=>{
 assert.equal(takeFileName([]),'take.wav');
 assert.equal(takeFileName(['take.wav']),'take-2.wav');
 assert.equal(takeFileName(['TAKE.WAV','take-2.wav']),'take-3.wav');
 assert.equal(takeFileName(['other.wav','take-2.wav']),'take.wav');
});

test('the take cap matches the arrangement length limit and the source memory budget',()=>{
 assert.equal(TAKE_MAX_SECONDS,ARRANGE_LIMITS.seconds);
 // 48 kHz stereo for the full cap must stay within encodeSessionWav's sourceFrames budget.
 assert.ok(TAKE_MAX_SECONDS*48000*2<=ARRANGE_LIMITS.sourceFrames);
});

test('mime candidate list stays non-empty and unique',()=>{
 assert.ok(TAKE_MIME_CANDIDATES.length>=2);
 assert.equal(new Set(TAKE_MIME_CANDIDATES).size,TAKE_MIME_CANDIDATES.length);
});
