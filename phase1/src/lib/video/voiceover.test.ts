import test from 'node:test';
import assert from 'node:assert/strict';
import {pickVoiceoverMime,voiceoverExtension,voiceoverFileName} from './voiceover';

test('voiceover mime: first supported candidate wins, empty means platform default',()=>{
 assert.equal(pickVoiceoverMime(t=>t==='audio/mp4'),'audio/mp4');
 assert.equal(pickVoiceoverMime(t=>t.startsWith('audio/webm')),'audio/webm;codecs=opus','opus beats plain webm');
 assert.equal(pickVoiceoverMime(()=>false),'');
});

test('voiceover extension follows the container',()=>{
 assert.equal(voiceoverExtension('audio/webm;codecs=opus'),'webm');
 assert.equal(voiceoverExtension('audio/mp4'),'m4a');
 assert.equal(voiceoverExtension('audio/aac'),'aac');
 assert.equal(voiceoverExtension(''),'webm');
});

test('voiceover names count up and ignore case',()=>{
 assert.equal(voiceoverFileName([],'webm'),'voiceover.webm');
 assert.equal(voiceoverFileName(['Voiceover.WEBM'],'webm'),'voiceover-2.webm','case-insensitive collision');
 assert.equal(voiceoverFileName(['voiceover.webm','voiceover-2.webm'],'m4a'),'voiceover.m4a','extensions are independent');
 assert.equal(voiceoverFileName(['voiceover.webm','voiceover-2.webm'],'webm'),'voiceover-3.webm');
});
